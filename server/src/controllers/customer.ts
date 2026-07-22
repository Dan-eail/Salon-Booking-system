import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { fromCents, toCents } from '../../../shared/money.js';
import { db } from '../db/client.js';
import {
  appointmentStatusHistory, appointments, favoriteSalons, notifications, payments, reviews, salons, staffProfiles,
} from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';
import { created, ok, paginate } from '../lib/respond.js';
import { asyncHandler } from '../middleware/auth.js';
import { changeAppointmentStatus, createAppointment, createReview, rescheduleAppointment } from '../services/booking.js';
import { applyPaymentSuccess, initializeChapaPayment, onlinePaymentAvailable, verifyChapaPayment } from '../services/payments.js';

const MAX_ACTIVE_FUTURE = 10;

export const createBooking = asyncHandler(async (req, res) => {
  const b = req.body as {
    salonId: string; serviceId: string; staffId?: string | null; startAt: Date;
    guestName: string; guestPhone: string; guestEmail?: string | null; notes?: string | null;
  };
  const user = req.user!;
  if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
    throw unprocessable('Please use a customer account to book appointments.', 'NOT_A_CUSTOMER');
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(appointments)
    .where(and(eq(appointments.customerId, user.id), inArray(appointments.status, ['PENDING', 'CONFIRMED']), gt(appointments.startAt, new Date())));
  if (n >= MAX_ACTIVE_FUTURE) {
    throw unprocessable(`You can have up to ${MAX_ACTIVE_FUTURE} upcoming bookings at a time.`, 'TOO_MANY_BOOKINGS');
  }
  const [salon] = await db.select({ paymentMode: salons.paymentMode }).from(salons).where(eq(salons.id, b.salonId)).limit(1);
  if (salon && salon.paymentMode !== 'PAY_AT_SALON' && !onlinePaymentAvailable()) {
    throw unprocessable('This salon requires online payment, which is not available yet.', 'PAYMENT_UNAVAILABLE');
  }
  const appt = await createAppointment({ ...b, customerId: user.id, actorId: user.id });
  created(res, await bookingView(appt.id));
});

/** Shared detail shape for a customer's booking. */
async function bookingView(id: string) {
  const [row] = await db
    .select({
      a: appointments,
      salon: {
        id: salons.id,
        name: salons.name,
        slug: salons.slug,
        address: salons.address,
        neighborhood: salons.neighborhood,
        phone: salons.phone,
        mapUrl: salons.mapUrl,
        coverImage: salons.coverImage,
        cancellationHours: salons.cancellationHours,
        cancellationPolicy: salons.cancellationPolicy,
        paymentMode: salons.paymentMode,
        depositPercent: salons.depositPercent,
        bookingMode: salons.bookingMode,
      },
      staffName: staffProfiles.displayName,
    })
    .from(appointments)
    .innerJoin(salons, eq(salons.id, appointments.salonId))
    .innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId))
    .where(eq(appointments.id, id))
    .limit(1);
  if (!row) throw notFound('Appointment not found');
  const [history, paid, review] = await Promise.all([
    db.select({ fromStatus: appointmentStatusHistory.fromStatus, toStatus: appointmentStatusHistory.toStatus, note: appointmentStatusHistory.note, createdAt: appointmentStatusHistory.createdAt })
      .from(appointmentStatusHistory).where(eq(appointmentStatusHistory.appointmentId, id)).orderBy(asc(appointmentStatusHistory.createdAt)),
    db.select({ amountEtb: payments.amountEtb, provider: payments.provider, paidAt: payments.paidAt }).from(payments).where(and(eq(payments.appointmentId, id), eq(payments.status, 'PAID'))),
    db.select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment }).from(reviews).where(eq(reviews.appointmentId, id)).limit(1),
  ]);
  const { ownerNotes: _o, createdByOwner: _c, ...a } = row.a;
  void _o; void _c;
  const deadline = new Date(a.startAt.getTime() - row.salon.cancellationHours * 3600000);
  const active = a.status === 'PENDING' || a.status === 'CONFIRMED';
  return {
    ...a,
    salon: row.salon,
    staffName: row.staffName,
    history,
    payments: paid,
    review: review[0] ?? null,
    // PENDING requests can always be withdrawn; confirmed ones follow the salon's policy window.
    canCancel: active && (a.status === 'PENDING' || new Date() <= deadline),
    canReschedule: active && new Date() <= deadline,
    cancellationDeadline: deadline,
    canReview: a.status === 'COMPLETED' && !review.length,
  };
}

async function ownBooking(userId: string, id: string) {
  const [row] = await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.id, id), eq(appointments.customerId, userId))).limit(1);
  if (!row) throw notFound('Appointment not found');
  return bookingView(id);
}

export const myAppointments = asyncHandler(async (req, res) => {
  const { tab, page, pageSize } = req.query as unknown as { tab: 'upcoming' | 'past' | 'all'; page: number; pageSize: number };
  const now = new Date();
  const base = eq(appointments.customerId, req.user!.id);
  const where =
    tab === 'upcoming' ? and(base, inArray(appointments.status, ['PENDING', 'CONFIRMED']), gt(appointments.endAt, now))
    : tab === 'past' ? and(base, sql`(${appointments.status} not in ('PENDING','CONFIRMED') or ${appointments.endAt} <= ${now})`)
    : base;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(appointments).where(where);
  const rows = await db
    .select({
      id: appointments.id, reference: appointments.reference, status: appointments.status, startAt: appointments.startAt, endAt: appointments.endAt,
      serviceName: appointments.serviceName, priceEtb: appointments.priceEtb, durationMinutes: appointments.durationMinutes, paymentStatus: appointments.paymentStatus,
      salonName: salons.name, salonSlug: salons.slug, neighborhood: salons.neighborhood, coverImage: salons.coverImage, staffName: staffProfiles.displayName,
      reviewed: sql<boolean>`exists(select 1 from ${reviews} where ${reviews.appointmentId} = ${appointments.id})`,
    })
    .from(appointments)
    .innerJoin(salons, eq(salons.id, appointments.salonId))
    .innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId))
    .where(where)
    .orderBy(tab === 'upcoming' ? asc(appointments.startAt) : desc(appointments.startAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});

export const getBooking = asyncHandler(async (req, res) => ok(res, await ownBooking(req.user!.id, String(req.params.id))));

export const cancelBooking = asyncHandler(async (req, res) => {
  await ownBooking(req.user!.id, String(req.params.id)); // 404 for anyone else's booking
  await changeAppointmentStatus({ id: req.user!.id, role: req.user!.role }, String(req.params.id), 'CANCELLED', {
    note: (req.body as { reason?: string }).reason, ip: req.ip,
  });
  ok(res, await bookingView(String(req.params.id)));
});

export const rescheduleBooking = asyncHandler(async (req, res) => {
  await ownBooking(req.user!.id, String(req.params.id));
  const b = req.body as { startAt: Date; staffId?: string | null };
  await rescheduleAppointment({ id: req.user!.id, role: req.user!.role }, String(req.params.id), b);
  ok(res, await bookingView(String(req.params.id)));
});

export const reviewBooking = asyncHandler(async (req, res) => {
  const b = req.body as { rating: number; comment?: string | null };
  const review = await createReview(req.user!.id, String(req.params.id), b.rating, b.comment);
  created(res, review);
});

/* ------------------------------------------------------------- favorites */

export const listFavorites = asyncHandler(async (req, res) => {
  const rows = await db
    .select({
      id: salons.id, slug: salons.slug, name: salons.name, city: salons.city, neighborhood: salons.neighborhood, coverImage: salons.coverImage,
      avgRating: salons.avgRating, reviewCount: salons.reviewCount, priceLevel: salons.priceLevel, isVerified: salons.isVerified, isDemo: salons.isDemo,
    })
    .from(favoriteSalons)
    .innerJoin(salons, eq(salons.id, favoriteSalons.salonId))
    .where(and(eq(favoriteSalons.userId, req.user!.id), eq(salons.status, 'ACTIVE')))
    .orderBy(desc(favoriteSalons.createdAt));
  ok(res, rows);
});

export const addFavorite = asyncHandler(async (req, res) => {
  const salonId = String(req.params.salonId);
  const [s] = await db.select({ id: salons.id }).from(salons).where(and(eq(salons.id, salonId), eq(salons.status, 'ACTIVE'))).limit(1);
  if (!s) throw notFound('Salon not found');
  await db.insert(favoriteSalons).values({ userId: req.user!.id, salonId }).onConflictDoNothing();
  ok(res, { salonId, isFavorite: true });
});

export const removeFavorite = asyncHandler(async (req, res) => {
  await db.delete(favoriteSalons).where(and(eq(favoriteSalons.userId, req.user!.id), eq(favoriteSalons.salonId, String(req.params.salonId))));
  ok(res, { salonId: String(req.params.salonId), isFavorite: false });
});

/* --------------------------------------------------------- notifications */

export const listNotifications = asyncHandler(async (req, res) => {
  const { page, pageSize, unread } = req.query as unknown as { page: number; pageSize: number; unread: 'true' | 'false' };
  const base = eq(notifications.userId, req.user!.id);
  const where = unread === 'true' ? and(base, sql`${notifications.readAt} is null`) : base;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where);
  const [{ unreadCount }] = await db.select({ unreadCount: sql<number>`count(*)::int` }).from(notifications).where(and(base, sql`${notifications.readAt} is null`));
  const rows = await db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, { ...paginate(total, page, pageSize), unreadCount });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const rows = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, String(req.params.id)), eq(notifications.userId, req.user!.id), sql`${notifications.readAt} is null`)).returning({ id: notifications.id });
  ok(res, { updated: rows.length });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const rows = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, req.user!.id), sql`${notifications.readAt} is null`)).returning({ id: notifications.id });
  ok(res, { updated: rows.length });
});

/* -------------------------------------------------------------- payments */

/**
 * Initiates online payment for a booking (50% deposit required by default).
 * Leverages Chapa to support Telebirr, CBE Birr, Awash Birr, and Visa/Mastercard.
 */
export const initiatePayment = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.customerId, req.user!.id)))
    .limit(1);
  if (!appt) throw notFound('Appointment not found');

  if (appt.paymentStatus === 'PAID') {
    throw conflict('This appointment is already fully paid.', 'ALREADY_PAID');
  }
  if (['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(appt.status)) {
    throw conflict(`Cannot pay for an appointment that is ${appt.status.toLowerCase()}.`, 'INVALID_APPOINTMENT_STATE');
  }

  const [salon] = await db
    .select({ depositPercent: salons.depositPercent, name: salons.name })
    .from(salons)
    .where(eq(salons.id, appt.salonId))
    .limit(1);

  // 50% deposit default
  const pct = salon?.depositPercent && salon.depositPercent > 0 ? salon.depositPercent : 50;
  const totalCents = toCents(appt.priceEtb);
  const depositCents = Math.round(totalCents * (pct / 100));
  const depositEtb = fromCents(depositCents);

  const txRef = `belle-${appt.id.replace(/-/g, '').slice(0, 8)}-${Date.now()}`;

  // Record pending payment
  await db.insert(payments).values({
    appointmentId: appt.id,
    provider: 'CHAPA',
    status: 'PENDING',
    amountEtb: depositEtb,
    externalRef: txRef,
  });

  const chapaRes = await initializeChapaPayment({
    appointmentId: appt.id,
    amountEtb: depositEtb,
    email: appt.guestEmail || req.user!.email,
    customerName: appt.guestName,
    phone: appt.guestPhone,
    txRef,
    title: `50% Deposit: ${appt.serviceName}`,
    description: `50% deposit for ${appt.serviceName} at ${salon?.name || 'salon'}`,
  });

  ok(res, {
    checkoutUrl: chapaRes.checkoutUrl,
    txRef,
    depositEtb,
    totalEtb: appt.priceEtb,
    remainingEtb: fromCents(totalCents - depositCents),
    depositPercent: pct,
    isSimulation: chapaRes.isSimulation,
    provider: 'CHAPA',
    methods: ['telebirr', 'cbe_birr', 'card'],
  });
});

/**
 * Verifies Chapa transaction status and applies payment confirmation.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const txRef = String(req.query.tx_ref || '');
  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.customerId, req.user!.id)))
    .limit(1);
  if (!appt) throw notFound('Appointment not found');

  let paymentRef = txRef;
  if (!paymentRef) {
    const [p] = await db
      .select({ externalRef: payments.externalRef })
      .from(payments)
      .where(eq(payments.appointmentId, id))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (p?.externalRef) paymentRef = p.externalRef;
  }

  if (!paymentRef) {
    throw notFound('No payment transaction reference found.');
  }

  const verification = await verifyChapaPayment(paymentRef);
  if (verification.success && (verification.status === 'PAID' || verification.status === 'PENDING')) {
    const totalCents = toCents(appt.priceEtb);
    const depositCents = Math.round(totalCents * 0.5);
    const amount = verification.amountEtb && verification.amountEtb !== '0.00' ? verification.amountEtb : fromCents(depositCents);

    await applyPaymentSuccess({
      appointmentId: id,
      txRef: paymentRef,
      amountEtb: amount,
      actorId: req.user!.id,
      methodName: verification.method || 'Telebirr',
    });
  }

  ok(res, await bookingView(id));
});

/**
 * Dev/test simulation endpoint to complete payment instantly with Telebirr or CBE Birr.
 */
export const simulatePayment = asyncHandler(async (req, res) => {
  const { appointmentId, txRef, method } = req.body as { appointmentId: string; txRef?: string; method?: string };
  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.customerId, req.user!.id)))
    .limit(1);
  if (!appt) throw notFound('Appointment not found');

  const totalCents = toCents(appt.priceEtb);
  const depositCents = Math.round(totalCents * 0.5);
  const depositEtb = fromCents(depositCents);
  const ref = txRef || `belle-${appt.id.replace(/-/g, '').slice(0, 8)}-${Date.now()}`;

  const result = await applyPaymentSuccess({
    appointmentId: appt.id,
    txRef: ref,
    amountEtb: depositEtb,
    actorId: req.user!.id,
    methodName: method || 'Telebirr',
  });

  ok(res, { success: true, payment: result.payment, appointment: await bookingView(appt.id) });
});

void lte; void audit;
