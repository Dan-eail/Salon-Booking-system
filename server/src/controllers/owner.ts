import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  appointmentStatusHistory, appointments, businessHours, customerProfiles, payments, reviews, salonImages, salons, serviceCategories, services,
  staffBreaks, staffProfiles, staffSchedules, staffServices, staffTimeOff, users,
} from '../db/schema.js';
import type { Salon } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { toCsv } from '../lib/csv.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { created, ok, paginate } from '../lib/respond.js';
import { hashPassword } from '../lib/security.js';
import { addDaysStr, localToUtc, todayLocal } from '../lib/time.js';
import { removeImage, saveImage } from '../lib/uploads.js';
import { asyncHandler } from '../middleware/auth.js';
import {
  changeAppointmentStatus, createAppointment, recomputeSalonRating, recordCashPayment, rescheduleAppointment,
} from '../services/booking.js';
import { notify } from '../services/notifications.js';
import { onlinePaymentAvailable } from '../services/payments.js';
import { buildSummary } from '../services/reports.js';
import { toCents } from '../../../shared/money.js';

const salonOf = (req: { salonAccess?: { salon: Salon } }) => req.salonAccess!.salon;
const actorOf = (req: { user?: { id: string; role: 'CUSTOMER' | 'OWNER' | 'STAFF' | 'ADMIN' } }) => ({ id: req.user!.id, role: req.user!.role });

/** Lists the salons the signed-in user can manage (owner, staff member or admin). */
export const mySalons = asyncHandler(async (req, res) => {
  const u = req.user!;
  const cols = { id: salons.id, name: salons.name, slug: salons.slug, status: salons.status, isVerified: salons.isVerified, isDemo: salons.isDemo, coverImage: salons.coverImage };
  if (u.role === 'ADMIN') return ok(res, (await db.select(cols).from(salons).orderBy(asc(salons.name)).limit(100)).map((s) => ({ ...s, level: 'owner' })));
  const owned = await db.select(cols).from(salons).where(eq(salons.ownerId, u.id));
  const member = await db
    .select(cols)
    .from(staffProfiles)
    .innerJoin(salons, eq(salons.id, staffProfiles.salonId))
    .where(and(eq(staffProfiles.userId, u.id), eq(staffProfiles.isActive, true)));
  ok(res, [...owned.map((s) => ({ ...s, level: 'owner' })), ...member.map((s) => ({ ...s, level: 'staff' }))]);
});

/* ---------------------------------------------------------------- profile */

export const getProfile = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const [full] = await db.select().from(salons).where(eq(salons.id, salon.id)).limit(1);
  const [hours, images] = await Promise.all([
    db.select().from(businessHours).where(eq(businessHours.salonId, salon.id)).orderBy(asc(businessHours.dayOfWeek)),
    db.select().from(salonImages).where(eq(salonImages.salonId, salon.id)).orderBy(asc(salonImages.sortOrder)),
  ]);
  ok(res, { ...full, hours, images, onlinePaymentAvailable: onlinePaymentAvailable() });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const b = req.body as Record<string, unknown> & { paymentMode?: string; latitude?: number | null; longitude?: number | null };
  if (b.paymentMode && b.paymentMode !== 'PAY_AT_SALON' && !onlinePaymentAvailable()) {
    throw unprocessable('Online and deposit payments need a connected payment provider, which is not set up on this platform yet.', 'PAYMENT_UNAVAILABLE');
  }
  const { latitude, longitude, ...rest } = b;
  const patch: Record<string, unknown> = { ...rest };
  if (latitude !== undefined) patch.latitude = latitude === null ? null : String(latitude);
  if (longitude !== undefined) patch.longitude = longitude === null ? null : String(longitude);
  if (!Object.keys(patch).length) throw badRequest('Nothing to update.');
  const [row] = await db.update(salons).set(patch).where(eq(salons.id, salon.id)).returning();
  await audit(db, { actorId: req.user!.id, action: 'salon.update', entityType: 'salon', entityId: salon.id, metadata: { fields: Object.keys(patch) }, ip: req.ip });
  ok(res, row);
});

export const updateHours = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const { hours } = req.body as { hours: { dayOfWeek: number; isClosed: boolean; openMinutes: number; closeMinutes: number }[] };
  await db.transaction(async (tx) => {
    for (const h of hours) {
      const open = h.isClosed ? 540 : h.openMinutes;
      const close = h.isClosed ? 1080 : h.closeMinutes;
      await tx
        .insert(businessHours)
        .values({ salonId: salon.id, dayOfWeek: h.dayOfWeek, openMinutes: open, closeMinutes: close, isClosed: h.isClosed })
        .onConflictDoUpdate({ target: [businessHours.salonId, businessHours.dayOfWeek], set: { openMinutes: open, closeMinutes: close, isClosed: h.isClosed } });
    }
    await audit(tx, { actorId: req.user!.id, action: 'salon.hours_update', entityType: 'salon', entityId: salon.id, ip: req.ip });
  });
  ok(res, await db.select().from(businessHours).where(eq(businessHours.salonId, salon.id)).orderBy(asc(businessHours.dayOfWeek)));
});

export const uploadImage = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  if (!req.file) throw badRequest('Choose an image to upload.');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(salonImages).where(eq(salonImages.salonId, salon.id));
  if (n >= 20) throw unprocessable('A salon can have up to 20 gallery images.', 'GALLERY_FULL');
  const url = await saveImage(req.file.buffer);
  const [img] = await db.insert(salonImages).values({ salonId: salon.id, url, alt: String((req.body as { alt?: string }).alt ?? '').slice(0, 160), sortOrder: n }).returning();
  created(res, img);
});

export const updateImage = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const [img] = await db.update(salonImages).set(req.body as { alt?: string; sortOrder?: number })
    .where(and(eq(salonImages.id, String(req.params.id)), eq(salonImages.salonId, salon.id))).returning();
  if (!img) throw notFound('Image not found');
  ok(res, img);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const [img] = await db.delete(salonImages).where(and(eq(salonImages.id, String(req.params.id)), eq(salonImages.salonId, salon.id))).returning();
  if (!img) throw notFound('Image not found');
  if (salon.coverImage === img.url) await db.update(salons).set({ coverImage: null }).where(eq(salons.id, salon.id));
  await removeImage(img.url);
  ok(res, { deleted: true });
});

/* --------------------------------------------------------------- services */

type ServiceBody = {
  name?: string; description?: string; categoryId?: string; priceEtb?: string; durationMinutes?: number; bufferMinutes?: number;
  promoPriceEtb?: string | null; promoStartsAt?: Date | null; promoEndsAt?: Date | null; imageUrl?: string | null; isActive?: boolean; staffIds?: string[];
};

async function assertStaffInSalon(salonId: string, staffIds: string[]) {
  if (!staffIds.length) return;
  const found = await db.select({ id: staffProfiles.id }).from(staffProfiles).where(and(eq(staffProfiles.salonId, salonId), inArray(staffProfiles.id, staffIds)));
  if (found.length !== new Set(staffIds).size) throw badRequest('One or more staff members do not belong to this salon.');
}
async function assertServicesInSalon(salonId: string, serviceIds: string[]) {
  if (!serviceIds.length) return;
  const found = await db.select({ id: services.id }).from(services).where(and(eq(services.salonId, salonId), inArray(services.id, serviceIds)));
  if (found.length !== new Set(serviceIds).size) throw badRequest('One or more services do not belong to this salon.');
}
function checkPromo(price: string, promo: string | null | undefined, from: Date | null | undefined, to: Date | null | undefined) {
  if (promo == null && !from && !to) return;
  if (promo == null || !from || !to) throw badRequest('A promotional price needs a price, a start and an end date.', { fields: [{ path: 'promoPriceEtb', message: 'Set price, start and end together' }] });
  if (to <= from) throw badRequest('Promotion must end after it starts.', { fields: [{ path: 'promoEndsAt', message: 'Must be after the start' }] });
  if (toCents(promo) >= toCents(price)) throw badRequest('Promotional price must be lower than the regular price.', { fields: [{ path: 'promoPriceEtb', message: 'Must be lower than the regular price' }] });
}

export const listServices = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const rows = await db
    .select({ s: services, category: { id: serviceCategories.id, name: serviceCategories.name, slug: serviceCategories.slug } })
    .from(services).innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(eq(services.salonId, salon.id)).orderBy(asc(serviceCategories.sortOrder), asc(services.name));
  const links = rows.length ? await db.select().from(staffServices).where(inArray(staffServices.serviceId, rows.map((r) => r.s.id))) : [];
  ok(res, rows.map(({ s, category }) => ({ ...s, category, staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId) })));
});

export const createService = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const b = req.body as Required<Pick<ServiceBody, 'name' | 'categoryId' | 'priceEtb' | 'durationMinutes' | 'bufferMinutes' | 'isActive' | 'description'>> & ServiceBody;
  const [cat] = await db.select({ id: serviceCategories.id }).from(serviceCategories).where(and(eq(serviceCategories.id, b.categoryId), eq(serviceCategories.isActive, true))).limit(1);
  if (!cat) throw badRequest('Choose a valid category.', { fields: [{ path: 'categoryId', message: 'Unknown category' }] });
  checkPromo(b.priceEtb, b.promoPriceEtb, b.promoStartsAt, b.promoEndsAt);
  await assertStaffInSalon(salon.id, b.staffIds ?? []);
  const row = await db.transaction(async (tx) => {
    const [svc] = await tx.insert(services).values({
      salonId: salon.id, categoryId: b.categoryId, name: b.name, description: b.description, priceEtb: b.priceEtb, durationMinutes: b.durationMinutes,
      bufferMinutes: b.bufferMinutes, promoPriceEtb: b.promoPriceEtb ?? null, promoStartsAt: b.promoStartsAt ?? null, promoEndsAt: b.promoEndsAt ?? null,
      imageUrl: b.imageUrl ?? null, isActive: b.isActive,
    }).returning();
    if (b.staffIds?.length) await tx.insert(staffServices).values([...new Set(b.staffIds)].map((staffId) => ({ staffId, serviceId: svc.id })));
    await audit(tx, { actorId: req.user!.id, action: 'service.create', entityType: 'service', entityId: svc.id, ip: req.ip });
    return svc;
  });
  created(res, { ...row, staffIds: b.staffIds ?? [] });
});

export const updateService = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const b = req.body as ServiceBody;
  const [cur] = await db.select().from(services).where(and(eq(services.id, String(req.params.id)), eq(services.salonId, salon.id))).limit(1);
  if (!cur) throw notFound('Service not found');
  if (b.categoryId) {
    const [cat] = await db.select({ id: serviceCategories.id }).from(serviceCategories).where(and(eq(serviceCategories.id, b.categoryId), eq(serviceCategories.isActive, true))).limit(1);
    if (!cat) throw badRequest('Choose a valid category.');
  }
  const price = b.priceEtb ?? cur.priceEtb;
  checkPromo(price, b.promoPriceEtb !== undefined ? b.promoPriceEtb : cur.promoPriceEtb,
    b.promoStartsAt !== undefined ? b.promoStartsAt : cur.promoStartsAt, b.promoEndsAt !== undefined ? b.promoEndsAt : cur.promoEndsAt);
  if (b.staffIds) await assertStaffInSalon(salon.id, b.staffIds);
  const { staffIds, ...fields } = b;
  const row = await db.transaction(async (tx) => {
    const [svc] = Object.keys(fields).length
      ? await tx.update(services).set(fields).where(eq(services.id, cur.id)).returning()
      : [cur];
    if (staffIds) {
      await tx.delete(staffServices).where(eq(staffServices.serviceId, cur.id));
      if (staffIds.length) await tx.insert(staffServices).values([...new Set(staffIds)].map((staffId) => ({ staffId, serviceId: cur.id })));
    }
    await audit(tx, { actorId: req.user!.id, action: 'service.update', entityType: 'service', entityId: cur.id, metadata: { fields: Object.keys(b) }, ip: req.ip });
    return svc;
  });
  ok(res, row);
});

export const deleteService = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const [cur] = await db.select().from(services).where(and(eq(services.id, String(req.params.id)), eq(services.salonId, salon.id))).limit(1);
  if (!cur) throw notFound('Service not found');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(appointments).where(eq(appointments.serviceId, cur.id));
  if (n > 0) {
    // History must survive: unpublish instead of deleting.
    await db.update(services).set({ isActive: false }).where(eq(services.id, cur.id));
    await audit(db, { actorId: req.user!.id, action: 'service.deactivate', entityType: 'service', entityId: cur.id, ip: req.ip });
    return ok(res, { deleted: false, deactivated: true, message: 'This service has bookings, so it was unpublished instead of deleted.' });
  }
  await db.delete(services).where(eq(services.id, cur.id));
  await audit(db, { actorId: req.user!.id, action: 'service.delete', entityType: 'service', entityId: cur.id, ip: req.ip });
  ok(res, { deleted: true, deactivated: false });
});

/* ------------------------------------------------------------------ staff */

async function staffDetails(salonId: string, ids?: string[]) {
  const staff = await db.select().from(staffProfiles)
    .where(and(eq(staffProfiles.salonId, salonId), ids ? inArray(staffProfiles.id, ids) : undefined)).orderBy(asc(staffProfiles.displayName));
  if (!staff.length) return [];
  const sid = staff.map((s) => s.id);
  const [links, scheds, brks, offs, accounts] = await Promise.all([
    db.select().from(staffServices).where(inArray(staffServices.staffId, sid)),
    db.select().from(staffSchedules).where(inArray(staffSchedules.staffId, sid)).orderBy(asc(staffSchedules.dayOfWeek), asc(staffSchedules.startMinutes)),
    db.select().from(staffBreaks).where(inArray(staffBreaks.staffId, sid)).orderBy(asc(staffBreaks.dayOfWeek), asc(staffBreaks.startMinutes)),
    db.select().from(staffTimeOff).where(and(inArray(staffTimeOff.staffId, sid), gt(staffTimeOff.endAt, new Date()))).orderBy(asc(staffTimeOff.startAt)),
    db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, staff.map((s) => s.userId).filter((x): x is string => Boolean(x)).concat('00000000-0000-0000-0000-000000000000'))),
  ]);
  return staff.map((s) => ({
    ...s,
    loginEmail: accounts.find((a) => a.id === s.userId)?.email ?? null,
    serviceIds: links.filter((l) => l.staffId === s.id).map((l) => l.serviceId),
    schedules: scheds.filter((x) => x.staffId === s.id),
    breaks: brks.filter((x) => x.staffId === s.id),
    timeOff: offs.filter((x) => x.staffId === s.id),
  }));
}

export const listStaff = asyncHandler(async (req, res) => ok(res, await staffDetails(salonOf(req).id)));

export const createStaff = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const b = req.body as { displayName: string; title?: string | null; bio?: string | null; avatarUrl?: string | null; specialties: string[]; serviceIds: string[]; account?: { email: string; phone: string; password: string } };
  await assertServicesInSalon(salon.id, b.serviceIds);
  const passwordHash = b.account ? await hashPassword(b.account.password) : null;
  const id = await db.transaction(async (tx) => {
    let userId: string | null = null;
    if (b.account) {
      const dup = await tx.select({ id: users.id }).from(users).where(or(eq(users.email, b.account.email), eq(users.phone, b.account.phone))).limit(1);
      if (dup.length) throw conflict('That email or phone number already belongs to an account.', 'ACCOUNT_EXISTS');
      const [u] = await tx.insert(users).values({ email: b.account.email, phone: b.account.phone, fullName: b.displayName, passwordHash: passwordHash!, role: 'STAFF' }).returning();
      userId = u.id;
    }
    const [sp] = await tx.insert(staffProfiles).values({ salonId: salon.id, userId, displayName: b.displayName, title: b.title ?? null, bio: b.bio ?? null, avatarUrl: b.avatarUrl ?? null, specialties: b.specialties }).returning();
    if (b.serviceIds.length) await tx.insert(staffServices).values([...new Set(b.serviceIds)].map((serviceId) => ({ staffId: sp.id, serviceId })));
    // Sensible default: work the salon's opening hours on open days.
    const hours = await tx.select().from(businessHours).where(and(eq(businessHours.salonId, salon.id), eq(businessHours.isClosed, false)));
    if (hours.length) await tx.insert(staffSchedules).values(hours.map((h) => ({ staffId: sp.id, dayOfWeek: h.dayOfWeek, startMinutes: h.openMinutes, endMinutes: h.closeMinutes })));
    await audit(tx, { actorId: req.user!.id, action: 'staff.create', entityType: 'staff', entityId: sp.id, ip: req.ip });
    return sp.id;
  });
  created(res, (await staffDetails(salon.id, [id]))[0]);
});

async function ownStaff(salonId: string, id: string) {
  const [s] = await db.select().from(staffProfiles).where(and(eq(staffProfiles.id, id), eq(staffProfiles.salonId, salonId))).limit(1);
  if (!s) throw notFound('Staff member not found');
  return s;
}

export const updateStaff = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const cur = await ownStaff(salon.id, String(req.params.id));
  const { serviceIds, ...fields } = req.body as { serviceIds?: string[]; isActive?: boolean } & Record<string, unknown>;
  if (serviceIds) await assertServicesInSalon(salon.id, serviceIds);
  if (fields.isActive === false && cur.isActive) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(appointments)
      .where(and(eq(appointments.staffId, cur.id), inArray(appointments.status, ['PENDING', 'CONFIRMED']), gt(appointments.startAt, new Date())));
    if (n > 0) throw conflict(`${cur.displayName} has ${n} upcoming booking${n === 1 ? '' : 's'}. Reassign or cancel them first.`, 'STAFF_HAS_BOOKINGS');
  }
  await db.transaction(async (tx) => {
    if (Object.keys(fields).length) await tx.update(staffProfiles).set(fields).where(eq(staffProfiles.id, cur.id));
    if (serviceIds) {
      await tx.delete(staffServices).where(eq(staffServices.staffId, cur.id));
      if (serviceIds.length) await tx.insert(staffServices).values([...new Set(serviceIds)].map((serviceId) => ({ staffId: cur.id, serviceId })));
    }
    if (fields.isActive === false && cur.userId) {
      // A deactivated staff account must not keep working either.
      await tx.update(users).set({ isActive: false }).where(and(eq(users.id, cur.userId), eq(users.role, 'STAFF')));
    }
    if (fields.isActive === true && cur.userId) await tx.update(users).set({ isActive: true }).where(and(eq(users.id, cur.userId), eq(users.role, 'STAFF')));
    await audit(tx, { actorId: req.user!.id, action: 'staff.update', entityType: 'staff', entityId: cur.id, metadata: { fields: Object.keys(req.body) }, ip: req.ip });
  });
  ok(res, (await staffDetails(salon.id, [cur.id]))[0]);
});

export const setStaffSchedule = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const cur = await ownStaff(salon.id, String(req.params.id));
  const b = req.body as { schedules: { dayOfWeek: number; startMinutes: number; endMinutes: number }[]; breaks: { dayOfWeek: number; startMinutes: number; endMinutes: number; label: string }[] };
  await db.transaction(async (tx) => {
    await tx.delete(staffSchedules).where(eq(staffSchedules.staffId, cur.id));
    await tx.delete(staffBreaks).where(eq(staffBreaks.staffId, cur.id));
    if (b.schedules.length) await tx.insert(staffSchedules).values(b.schedules.map((s) => ({ ...s, staffId: cur.id })));
    if (b.breaks.length) await tx.insert(staffBreaks).values(b.breaks.map((s) => ({ ...s, staffId: cur.id })));
    await audit(tx, { actorId: req.user!.id, action: 'staff.schedule_update', entityType: 'staff', entityId: cur.id, ip: req.ip });
  });
  ok(res, (await staffDetails(salon.id, [cur.id]))[0]);
});

export const addTimeOff = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const cur = await ownStaff(salon.id, String(req.params.id));
  const b = req.body as { startAt: Date; endAt: Date; reason?: string | null };
  const [row] = await db.insert(staffTimeOff).values({ staffId: cur.id, startAt: b.startAt, endAt: b.endAt, reason: b.reason ?? null }).returning();
  // Surface (don't silently cancel) bookings that fall inside the new leave.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(appointments)
    .where(and(eq(appointments.staffId, cur.id), inArray(appointments.status, ['PENDING', 'CONFIRMED']), lt(appointments.startAt, b.endAt), gt(appointments.endAt, b.startAt)));
  await audit(db, { actorId: req.user!.id, action: 'staff.time_off', entityType: 'staff', entityId: cur.id, ip: req.ip });
  created(res, { ...row, conflictingAppointments: n });
});

export const removeTimeOff = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const cur = await ownStaff(salon.id, String(req.params.id));
  const rows = await db.delete(staffTimeOff).where(and(eq(staffTimeOff.id, String(req.params.offId)), eq(staffTimeOff.staffId, cur.id))).returning();
  if (!rows.length) throw notFound('Time off not found');
  ok(res, { deleted: true });
});

/* ----------------------------------------------------------- appointments */

export const listAppointments = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const q = req.query as unknown as { page: number; pageSize: number; from?: string; to?: string; status?: string; staffId?: string; q?: string };
  const where = and(
    eq(appointments.salonId, salon.id),
    // Staff members only see their own column of the diary.
    req.salonAccess!.level === 'staff' ? eq(appointments.staffId, req.salonAccess!.staffId!) : undefined,
    q.from ? gte(appointments.startAt, localToUtc(q.from, 0)) : undefined,
    q.to ? lt(appointments.startAt, localToUtc(addDaysStr(q.to, 1), 0)) : undefined,
    q.status ? eq(appointments.status, q.status as 'PENDING') : undefined,
    q.staffId ? eq(appointments.staffId, q.staffId) : undefined,
    q.q ? or(ilike(appointments.guestName, `%${q.q.replace(/[%_]/g, '\\$&')}%`), ilike(appointments.reference, `%${q.q}%`), ilike(appointments.guestPhone, `%${q.q}%`)) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(appointments).where(where);
  const rows = await db
    .select({
      id: appointments.id, reference: appointments.reference, status: appointments.status, startAt: appointments.startAt, endAt: appointments.endAt,
      serviceName: appointments.serviceName, priceEtb: appointments.priceEtb, durationMinutes: appointments.durationMinutes, paymentStatus: appointments.paymentStatus,
      guestName: appointments.guestName, guestPhone: appointments.guestPhone, notes: appointments.notes, ownerNotes: appointments.ownerNotes,
      createdByOwner: appointments.createdByOwner, staffId: appointments.staffId, staffName: staffProfiles.displayName,
    })
    .from(appointments).innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId))
    .where(where).orderBy(asc(appointments.startAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  ok(res, rows, paginate(total, q.page, q.pageSize));
});

async function salonAppointment(req: Parameters<typeof salonOf>[0] & { params: Record<string, unknown>; salonAccess?: { level: string; staffId?: string } }, salonId: string) {
  const id = String(req.params.id);
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.salonId, salonId))).limit(1);
  if (!a) throw notFound('Appointment not found');
  if (req.salonAccess?.level === 'staff' && a.staffId !== req.salonAccess.staffId) throw notFound('Appointment not found');
  return a;
}

export const getAppointment = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const a = await salonAppointment(req, salon.id);
  const [history, paid, staff, customer] = await Promise.all([
    db.select({ fromStatus: appointmentStatusHistory.fromStatus, toStatus: appointmentStatusHistory.toStatus, note: appointmentStatusHistory.note, createdAt: appointmentStatusHistory.createdAt, changedBy: users.fullName })
      .from(appointmentStatusHistory).leftJoin(users, eq(users.id, appointmentStatusHistory.changedById)).where(eq(appointmentStatusHistory.appointmentId, a.id)).orderBy(asc(appointmentStatusHistory.createdAt)),
    db.select().from(payments).where(eq(payments.appointmentId, a.id)).orderBy(asc(payments.createdAt)),
    db.select({ displayName: staffProfiles.displayName }).from(staffProfiles).where(eq(staffProfiles.id, a.staffId)).limit(1),
    a.customerId ? db.select({ email: users.email, city: customerProfiles.city }).from(users).leftJoin(customerProfiles, eq(customerProfiles.userId, users.id)).where(eq(users.id, a.customerId)).limit(1) : Promise.resolve([]),
  ]);
  const paidCents = paid.filter((p) => p.status === 'PAID').reduce((s, p) => s + toCents(p.amountEtb), 0);
  ok(res, { ...a, staffName: staff[0]?.displayName, history, payments: paid, customerEmail: customer[0]?.email ?? a.guestEmail, outstandingEtb: ((toCents(a.priceEtb) - paidCents) / 100).toFixed(2) });
});

export const createManualAppointment = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const b = req.body as { serviceId: string; staffId?: string | null; startAt: Date; guestName: string; guestPhone: string; guestEmail?: string | null; notes?: string | null };
  if (req.salonAccess!.level === 'staff' && b.staffId && b.staffId !== req.salonAccess!.staffId) throw forbidden('You can only add bookings to your own diary.');
  const staffId = req.salonAccess!.level === 'staff' ? req.salonAccess!.staffId : b.staffId;
  const appt = await createAppointment({ ...b, staffId, salonId: salon.id, createdByOwner: true, actorId: req.user!.id });
  created(res, appt);
});

export const setStatus = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  await salonAppointment(req, salon.id);
  const b = req.body as { status: 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'; note?: string };
  ok(res, await changeAppointmentStatus(actorOf(req), String(req.params.id), b.status, { note: b.note, ip: req.ip }));
});

export const reschedule = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  await salonAppointment(req, salon.id);
  ok(res, await rescheduleAppointment(actorOf(req), String(req.params.id), req.body as { startAt: Date; staffId?: string | null }));
});

export const setOwnerNotes = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  await salonAppointment(req, salon.id);
  const [row] = await db.update(appointments).set({ ownerNotes: (req.body as { ownerNotes: string | null }).ownerNotes }).where(eq(appointments.id, String(req.params.id))).returning();
  ok(res, row);
});

export const recordPayment = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  await salonAppointment(req, salon.id);
  created(res, await recordCashPayment(actorOf(req), String(req.params.id), (req.body as { amountEtb: string }).amountEtb));
});

/* ---------------------------------------------------------------- insight */

export const overview = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const today = todayLocal();
  const staffOnly = req.salonAccess!.level === 'staff' ? eq(appointments.staffId, req.salonAccess!.staffId!) : undefined;
  const base = and(eq(appointments.salonId, salon.id), staffOnly);
  const dayStart = localToUtc(today, 0), dayEnd = localToUtc(addDaysStr(today, 1), 0), weekEnd = localToUtc(addDaysStr(today, 8), 0);
  const cols = {
    id: appointments.id, reference: appointments.reference, status: appointments.status, startAt: appointments.startAt, endAt: appointments.endAt,
    serviceName: appointments.serviceName, guestName: appointments.guestName, priceEtb: appointments.priceEtb, staffName: staffProfiles.displayName,
  };
  const [todays, upcoming, recent, pending] = await Promise.all([
    db.select(cols).from(appointments).innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId))
      .where(and(base, gte(appointments.startAt, dayStart), lt(appointments.startAt, dayEnd), inArray(appointments.status, ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW']))).orderBy(asc(appointments.startAt)),
    db.select(cols).from(appointments).innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId))
      .where(and(base, gte(appointments.startAt, dayEnd), lt(appointments.startAt, weekEnd), inArray(appointments.status, ['PENDING', 'CONFIRMED']))).orderBy(asc(appointments.startAt)).limit(10),
    db.select(cols).from(appointments).innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId)).where(base).orderBy(desc(appointments.createdAt)).limit(8),
    db.select({ n: sql<number>`count(*)::int` }).from(appointments).where(and(base, eq(appointments.status, 'PENDING'), gt(appointments.startAt, new Date()))),
  ]);
  const summary = await buildSummary(salon.id, addDaysStr(today, -29), today, req.salonAccess!.level === 'staff' ? req.salonAccess!.staffId : undefined);
  ok(res, { today, todays, upcoming, recent, pendingApprovals: pending[0].n, last30Days: summary });
});

export const reportSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from: string; to: string };
  if (Date.parse(to) - Date.parse(from) > 366 * 86400000) throw badRequest('Choose a range of up to one year.');
  ok(res, await buildSummary(salonOf(req).id, from, to));
});

export const reportCsv = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const { from, to, type } = req.query as { from: string; to: string; type: 'appointments' | 'summary' };
  if (Date.parse(to) - Date.parse(from) > 366 * 86400000) throw badRequest('Choose a range of up to one year.');
  let csv: string;
  if (type === 'summary') {
    const s = await buildSummary(salon.id, from, to);
    csv = toCsv(['Metric', 'Value'], [
      ['Period', `${from} to ${to}`], ['Total appointments', s.totals.total], ['Completed', s.totals.completed], ['Cancelled', s.totals.cancelled], ['No-show', s.totals.noShow],
      ['Completion rate %', s.rates.completionPct], ['Cancellation rate %', s.rates.cancellationPct],
      ['Booking value ETB (confirmed + completed, NOT collected)', s.bookingValueEtb], ['Recorded payments ETB (collected)', s.recordedRevenueEtb],
      [], ['Service', 'Bookings', 'Booking value ETB'], ...s.popularServices.map((p) => [p.name, p.bookings, p.valueEtb]),
      [], ['Staff', 'Booked hours', 'Available hours', 'Utilization %'], ...s.staffUtilization.map((u) => [u.name, u.bookedHours, u.availableHours, u.utilizationPct]),
    ]);
  } else {
    const rows = await db
      .select({ reference: appointments.reference, startAt: appointments.startAt, status: appointments.status, service: appointments.serviceName, staff: staffProfiles.displayName, guest: appointments.guestName, phone: appointments.guestPhone, price: appointments.priceEtb, payment: appointments.paymentStatus })
      .from(appointments).innerJoin(staffProfiles, eq(staffProfiles.id, appointments.staffId))
      .where(and(eq(appointments.salonId, salon.id), gte(appointments.startAt, localToUtc(from, 0)), lt(appointments.startAt, localToUtc(addDaysStr(to, 1), 0)))).orderBy(asc(appointments.startAt));
    csv = toCsv(['Reference', 'Start (UTC)', 'Status', 'Service', 'Staff', 'Customer', 'Phone', 'Price ETB', 'Payment status'],
      rows.map((r) => [r.reference, r.startAt, r.status, r.service, r.staff, r.guest, r.phone, r.price, r.payment]));
  }
  await audit(db, { actorId: req.user!.id, action: 'report.export', entityType: 'salon', entityId: salon.id, metadata: { type, from, to }, ip: req.ip });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="belle-${type}-${from}_${to}.csv"`);
  res.send(csv);
});

/* ---------------------------------------------------------------- reviews */

export const listReviews = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  const where = eq(reviews.salonId, salon.id);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(reviews).where(where);
  const rows = await db.select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, ownerReply: reviews.ownerReply, isHidden: reviews.isHidden, createdAt: reviews.createdAt, reviewer: users.fullName })
    .from(reviews).innerJoin(users, eq(users.id, reviews.userId)).where(where).orderBy(desc(reviews.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});

export const replyToReview = asyncHandler(async (req, res) => {
  const salon = salonOf(req);
  const [row] = await db.update(reviews).set({ ownerReply: (req.body as { reply: string | null }).reply })
    .where(and(eq(reviews.id, String(req.params.id)), eq(reviews.salonId, salon.id))).returning();
  if (!row) throw notFound('Review not found');
  ok(res, row);
});

void lte; void ne; void recomputeSalonRating; void notify;
