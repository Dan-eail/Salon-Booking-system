import { and, asc, eq, sql } from 'drizzle-orm';
import { fromCents, toCents } from '../../../shared/money.js';
import { db, type Tx } from '../db/client.js';
import {
  appointmentStatusHistory,
  appointments,
  payments,
  reviews,
  salons,
  services,
  staffProfiles,
  staffServices,
  type Appointment,
  type AppointmentStatus,
  type Role,
} from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { bookingReference } from '../lib/security.js';
import { formatLocalTime, utcToLocalDate, utcToLocalMinutes } from '../lib/time.js';
import { loadAvailabilityContext, slotsFromContext } from './availability.js';
import { notify } from './notifications.js';

export type Actor = { id: string; role: Role };

const ACTIVE: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];

export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

/** Effective price right now, honouring a valid promotional price. */
export function effectivePrice(
  svc: { priceEtb: string; promoPriceEtb: string | null; promoStartsAt: Date | null; promoEndsAt: Date | null },
  at = new Date(),
): string {
  if (
    svc.promoPriceEtb &&
    svc.promoStartsAt &&
    svc.promoEndsAt &&
    svc.promoStartsAt <= at &&
    at <= svc.promoEndsAt &&
    toCents(svc.promoPriceEtb) < toCents(svc.priceEtb)
  ) {
    return svc.promoPriceEtb;
  }
  return svc.priceEtb;
}

function isExclusionViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23P01' || e?.cause?.code === '23P01';
}

const slotTaken = () => conflict('That time was just booked by someone else. Please choose another time.', 'SLOT_UNAVAILABLE');

/** Row-lock the staff members that could take this booking so concurrent bookings serialize. */
async function lockStaff(tx: Tx, salonId: string, serviceId: string, staffId?: string | null) {
  const rows = await tx
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .innerJoin(staffServices, eq(staffServices.staffId, staffProfiles.id))
    .where(
      and(
        eq(staffProfiles.salonId, salonId),
        eq(staffProfiles.isActive, true),
        eq(staffServices.serviceId, serviceId),
        staffId ? eq(staffProfiles.id, staffId) : undefined,
      ),
    )
    .orderBy(asc(staffProfiles.id))
    .for('update', { of: staffProfiles });
  return rows.map((r) => r.id);
}

export type CreateAppointmentInput = {
  salonId: string;
  serviceId: string;
  staffId?: string | null;
  startAt: Date;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  notes?: string | null;
  customerId?: string | null;
  createdByOwner?: boolean;
  actorId?: string | null;
  now?: Date;
};

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  const now = input.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const lockedIds = await lockStaff(tx, input.salonId, input.serviceId, input.staffId);
      if (!lockedIds.length) throw unprocessable('No available professional offers this service.', 'NO_STAFF');

      const date = utcToLocalDate(input.startAt);
      const minutes = utcToLocalMinutes(input.startAt);

      // Re-validate availability inside the transaction with fresh data.
      const ctx = await loadAvailabilityContext(tx, {
        salonId: input.salonId,
        serviceId: input.serviceId,
        date,
        staffId: input.staffId,
        now,
        ignoreBookingWindow: input.createdByOwner,
      });
      if (!ctx) throw notFound('Salon or service not available for booking');

      const slot = slotsFromContext(ctx).find((s) => s.minutes === minutes);
      if (!slot) throw slotTaken();

      let staffId = input.staffId ?? null;
      if (staffId) {
        if (!slot.staffIds.includes(staffId)) throw slotTaken();
      } else {
        // "Any available professional": pick the least busy eligible person that day.
        const load = (id: string) => ctx.staff.find((s) => s.id === id)?.input.busy.length ?? 0;
        staffId = [...slot.staffIds].sort((a, b) => load(a) - load(b) || a.localeCompare(b))[0];
      }

      const { salon, service } = ctx;
      const endAt = new Date(input.startAt.getTime() + service.durationMinutes * 60000);
      const blockedUntil = new Date(endAt.getTime() + ctx.params.totalBufferMinutes * 60000);
      const status: AppointmentStatus =
        input.createdByOwner || salon.bookingMode === 'INSTANT' ? 'CONFIRMED' : 'PENDING';

      const [appt] = await tx
        .insert(appointments)
        .values({
          reference: bookingReference(),
          salonId: salon.id,
          serviceId: service.id,
          staffId: staffId!,
          customerId: input.customerId ?? null,
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          guestEmail: input.guestEmail ?? null,
          startAt: input.startAt,
          endAt,
          blockedUntil,
          status,
          priceEtb: effectivePrice(service, now),
          durationMinutes: service.durationMinutes,
          serviceName: service.name,
          notes: input.notes ?? null,
          createdByOwner: Boolean(input.createdByOwner),
        })
        .returning();

      await tx.insert(appointmentStatusHistory).values({
        appointmentId: appt.id,
        fromStatus: null,
        toStatus: status,
        changedById: input.actorId ?? input.customerId ?? null,
        note: input.createdByOwner ? 'Created by salon' : 'Booked online',
      });
      await tx.update(services).set({ bookingCount: sql`${services.bookingCount} + 1` }).where(eq(services.id, service.id));
      await tx.update(salons).set({ bookingCount: sql`${salons.bookingCount} + 1` }).where(eq(salons.id, salon.id));

      const when = `${date} ${formatLocalTime(input.startAt)}`;
      if (input.customerId) {
        await notify(tx, input.customerId, {
          type: status === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : 'BOOKING_CREATED',
          title: status === 'CONFIRMED' ? 'Booking confirmed' : 'Booking request sent',
          body:
            status === 'CONFIRMED'
              ? `${service.name} at ${salon.name} on ${when}. Ref ${appt.reference}.`
              : `${service.name} at ${salon.name} on ${when} is awaiting salon approval. Ref ${appt.reference}.`,
          link: `/dashboard/bookings/${appt.id}`,
        });
      }
      if (!input.createdByOwner) {
        await notify(tx, salon.ownerId, {
          type: 'NEW_BOOKING_ALERT',
          title: status === 'PENDING' ? 'New booking request' : 'New booking',
          body: `${input.guestName} booked ${service.name} on ${when} (${appt.reference}).`,
          link: `/salon/appointments`,
        });
      }
      return appt;
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw slotTaken();
    throw err;
  }
}

/* ------------------------------------------------------- status changes */

async function loadForUpdate(tx: Tx, id: string) {
  const rows = await tx.select().from(appointments).where(eq(appointments.id, id)).for('update');
  return rows[0];
}

async function canManage(tx: Tx, actor: Actor, appt: Appointment): Promise<'admin' | 'owner' | 'staff' | 'customer' | null> {
  if (actor.role === 'ADMIN') return 'admin';
  if (appt.customerId && appt.customerId === actor.id) return 'customer';
  const [salon] = await tx.select({ ownerId: salons.ownerId }).from(salons).where(eq(salons.id, appt.salonId)).limit(1);
  if (salon?.ownerId === actor.id) return 'owner';
  if (actor.role === 'STAFF') {
    const [sp] = await tx
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(and(eq(staffProfiles.userId, actor.id), eq(staffProfiles.salonId, appt.salonId), eq(staffProfiles.isActive, true)))
      .limit(1);
    if (sp) return 'staff';
  }
  return null;
}

export async function changeAppointmentStatus(
  actor: Actor,
  appointmentId: string,
  to: AppointmentStatus,
  opts: { note?: string; now?: Date; ip?: string } = {},
): Promise<Appointment> {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const appt = await loadForUpdate(tx, appointmentId);
    // Same response for "missing" and "not yours" to avoid ID enumeration (IDOR).
    if (!appt) throw notFound('Appointment not found');
    const relation = await canManage(tx, actor, appt);
    if (!relation) throw notFound('Appointment not found');

    if (!TRANSITIONS[appt.status].includes(to)) {
      throw unprocessable(`Cannot change a ${appt.status.toLowerCase()} appointment to ${to.toLowerCase()}.`, 'INVALID_TRANSITION');
    }

    if (relation === 'customer') {
      if (to !== 'CANCELLED') throw forbidden('Customers can only cancel their own bookings.');
      if (appt.status === 'CONFIRMED') {
        const [salon] = await tx.select().from(salons).where(eq(salons.id, appt.salonId)).limit(1);
        const deadline = new Date(appt.startAt.getTime() - salon.cancellationHours * 3600000);
        if (now > deadline) {
          throw unprocessable(
            `This salon requires ${salon.cancellationHours} hours notice to cancel. Please contact the salon.`,
            'CANCELLATION_WINDOW_PASSED',
          );
        }
      }
    }
    if (relation === 'staff' && to === 'REJECTED') throw forbidden('Only the salon owner can reject bookings.');
    if ((to === 'COMPLETED' || to === 'NO_SHOW') && appt.startAt > now) {
      throw unprocessable('An appointment can only be completed or marked no-show after it starts.', 'TOO_EARLY');
    }

    const [updated] = await tx
      .update(appointments)
      .set({ status: to, cancelledReason: to === 'CANCELLED' || to === 'REJECTED' ? opts.note ?? null : appt.cancelledReason })
      .where(eq(appointments.id, appt.id))
      .returning();

    await tx.insert(appointmentStatusHistory).values({
      appointmentId: appt.id,
      fromStatus: appt.status,
      toStatus: to,
      changedById: actor.id,
      note: opts.note ?? null,
    });
    await audit(tx, {
      actorId: actor.id,
      action: `appointment.${to.toLowerCase()}`,
      entityType: 'appointment',
      entityId: appt.id,
      metadata: { from: appt.status, reference: appt.reference },
      ip: opts.ip,
    });

    // Notifications
    const [salon] = await tx.select({ name: salons.name, ownerId: salons.ownerId }).from(salons).where(eq(salons.id, appt.salonId)).limit(1);
    const when = `${utcToLocalDate(appt.startAt)} ${formatLocalTime(appt.startAt)}`;
    const typeMap: Partial<Record<AppointmentStatus, { type: Parameters<typeof notify>[2]['type']; title: string }>> = {
      CONFIRMED: { type: 'BOOKING_CONFIRMED', title: 'Booking confirmed' },
      REJECTED: { type: 'BOOKING_REJECTED', title: 'Booking declined' },
      CANCELLED: { type: 'BOOKING_CANCELLED', title: 'Booking cancelled' },
    };
    const meta = typeMap[to];
    if (meta) {
      const body = `${appt.serviceName} at ${salon.name} on ${when} (${appt.reference}).${opts.note ? ` Note: ${opts.note}` : ''}`;
      // Tell the other party.
      if (relation === 'customer') {
        await notify(tx, salon.ownerId, { ...meta, body, link: '/salon/appointments' });
      } else if (appt.customerId) {
        await notify(tx, appt.customerId, { ...meta, body, link: `/dashboard/bookings/${appt.id}` });
      }
    }
    return updated;
  });
}

/* ----------------------------------------------------------- reschedule */

export async function rescheduleAppointment(
  actor: Actor,
  appointmentId: string,
  input: { startAt: Date; staffId?: string | null; now?: Date },
): Promise<Appointment> {
  const now = input.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const appt = await loadForUpdate(tx, appointmentId);
      if (!appt) throw notFound('Appointment not found');
      const relation = await canManage(tx, actor, appt);
      if (!relation) throw notFound('Appointment not found');
      if (!ACTIVE.includes(appt.status)) throw unprocessable('Only pending or confirmed bookings can be rescheduled.', 'INVALID_TRANSITION');

      const [salon] = await tx.select().from(salons).where(eq(salons.id, appt.salonId)).limit(1);
      if (relation === 'customer') {
        const deadline = new Date(appt.startAt.getTime() - salon.cancellationHours * 3600000);
        if (now > deadline) {
          throw unprocessable(`Changes require ${salon.cancellationHours} hours notice. Please contact the salon.`, 'CANCELLATION_WINDOW_PASSED');
        }
      }

      const staffWanted = input.staffId ?? appt.staffId;
      await lockStaff(tx, appt.salonId, appt.serviceId, staffWanted);
      const date = utcToLocalDate(input.startAt);
      const minutes = utcToLocalMinutes(input.startAt);
      const ctx = await loadAvailabilityContext(tx, {
        salonId: appt.salonId,
        serviceId: appt.serviceId,
        date,
        staffId: staffWanted,
        now,
        excludeAppointmentId: appt.id,
        ignoreBookingWindow: relation !== 'customer',
      });
      if (!ctx) throw notFound('Service no longer available');
      const slot = slotsFromContext(ctx).find((s) => s.minutes === minutes);
      if (!slot || !slot.staffIds.includes(staffWanted)) throw slotTaken();

      const endAt = new Date(input.startAt.getTime() + appt.durationMinutes * 60000);
      const blockedUntil = new Date(endAt.getTime() + ctx.params.totalBufferMinutes * 60000);
      // A customer-initiated change on an approval-mode salon needs re-approval.
      const nextStatus: AppointmentStatus = relation === 'customer' && salon.bookingMode === 'APPROVAL' ? 'PENDING' : appt.status;

      const [updated] = await tx
        .update(appointments)
        .set({ startAt: input.startAt, endAt, blockedUntil, staffId: staffWanted, status: nextStatus })
        .where(eq(appointments.id, appt.id))
        .returning();
      await tx.insert(appointmentStatusHistory).values({
        appointmentId: appt.id,
        fromStatus: appt.status,
        toStatus: nextStatus,
        changedById: actor.id,
        note: `Rescheduled to ${date} ${formatLocalTime(input.startAt)}`,
      });
      await audit(tx, { actorId: actor.id, action: 'appointment.reschedule', entityType: 'appointment', entityId: appt.id });

      const body = `${appt.serviceName} at ${salon.name} moved to ${date} ${formatLocalTime(input.startAt)} (${appt.reference}).`;
      if (relation === 'customer') {
        await notify(tx, salon.ownerId, { type: 'BOOKING_RESCHEDULED', title: 'Booking rescheduled', body, link: '/salon/appointments' });
      } else if (appt.customerId) {
        await notify(tx, appt.customerId, { type: 'BOOKING_RESCHEDULED', title: 'Booking rescheduled', body, link: `/dashboard/bookings/${appt.id}` });
      }
      return updated;
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw slotTaken();
    throw err;
  }
}

/* --------------------------------------------------------------- reviews */

export async function createReview(userId: string, appointmentId: string, rating: number, comment?: string | null) {
  return db.transaction(async (tx) => {
    const appt = await loadForUpdate(tx, appointmentId);
    if (!appt || appt.customerId !== userId) throw notFound('Appointment not found');
    if (appt.status !== 'COMPLETED') throw unprocessable('You can review an appointment once it is completed.', 'NOT_REVIEWABLE');
    const existing = await tx.select({ id: reviews.id }).from(reviews).where(eq(reviews.appointmentId, appt.id)).limit(1);
    if (existing.length) throw conflict('You have already reviewed this appointment.', 'ALREADY_REVIEWED');

    const [review] = await tx
      .insert(reviews)
      .values({ appointmentId: appt.id, salonId: appt.salonId, userId, rating, comment: comment ?? null })
      .returning();
    await recomputeSalonRating(tx, appt.salonId);
    const [salon] = await tx.select({ ownerId: salons.ownerId, name: salons.name }).from(salons).where(eq(salons.id, appt.salonId)).limit(1);
    await notify(tx, salon.ownerId, {
      type: 'REVIEW_RECEIVED',
      title: 'New review',
      body: `A customer left a ${rating}-star review for ${appt.serviceName}.`,
      link: '/salon/reviews',
    });
    return review;
  });
}

export async function recomputeSalonRating(tx: Tx, salonId: string) {
  const [agg] = await tx
    .select({
      avg: sql<string>`coalesce(round(avg(${reviews.rating})::numeric, 2), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.salonId, salonId), eq(reviews.isHidden, false)));
  await tx.update(salons).set({ avgRating: agg.avg, reviewCount: agg.count }).where(eq(salons.id, salonId));
}

/* -------------------------------------------------------------- payments */

export async function recordCashPayment(actor: Actor, appointmentId: string, amountEtb: string) {
  return db.transaction(async (tx) => {
    const appt = await loadForUpdate(tx, appointmentId);
    if (!appt) throw notFound('Appointment not found');
    const relation = await canManage(tx, actor, appt);
    if (relation !== 'owner' && relation !== 'admin' && relation !== 'staff') throw notFound('Appointment not found');
    if (!['CONFIRMED', 'COMPLETED'].includes(appt.status)) {
      throw unprocessable('Payments can only be recorded for confirmed or completed appointments.', 'INVALID_PAYMENT_STATE');
    }
    const amount = toCents(amountEtb);
    if (amount <= 0) throw unprocessable('Amount must be greater than zero.', 'INVALID_AMOUNT');

    const paidRows = await tx
      .select({ amount: payments.amountEtb })
      .from(payments)
      .where(and(eq(payments.appointmentId, appt.id), eq(payments.status, 'PAID')));
    const alreadyPaid = paidRows.reduce((sum, r) => sum + toCents(r.amount), 0);
    const price = toCents(appt.priceEtb);
    if (alreadyPaid + amount > price) {
      throw unprocessable(`Payment exceeds the amount due. Outstanding: ETB ${fromCents(price - alreadyPaid)}.`, 'OVERPAYMENT');
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        appointmentId: appt.id,
        provider: 'CASH_AT_SALON',
        status: 'PAID',
        amountEtb: fromCents(amount),
        recordedById: actor.id,
        paidAt: new Date(),
      })
      .returning();
    const fullyPaid = alreadyPaid + amount === price;
    await tx.update(appointments).set({ paymentStatus: fullyPaid ? 'PAID' : 'PENDING' }).where(eq(appointments.id, appt.id));
    await audit(tx, { actorId: actor.id, action: 'payment.recorded', entityType: 'payment', entityId: payment.id, metadata: { appointmentId: appt.id, amount: fromCents(amount) } });
    return payment;
  });
}

