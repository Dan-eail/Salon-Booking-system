import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  appointments, auditLogs, platformSettings, promotions, refreshTokens, reviews, salons, serviceCategories, services, users,
} from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { created, ok, paginate } from '../lib/respond.js';
import { addDaysStr, localToUtc, tzLiteral } from '../lib/time.js';
import { asyncHandler } from '../middleware/auth.js';
import { recomputeSalonRating } from '../services/booking.js';
import { notify } from '../services/notifications.js';
import { SETTING_KEYS } from '../validators/admin.js';

type List = { page: number; pageSize: number; q?: string };
const like = (q: string) => `%${q.replace(/[%_\\]/g, '\\$&')}%`;
const actor = (req: { user?: { id: string } }) => req.user!.id;

export const overview = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const [usersByRole, salonsByStatus, apptByStatus, pendingSalons, recentAudit, totals] = await Promise.all([
    db.select({ role: users.role, n: sql<number>`count(*)::int` }).from(users).groupBy(users.role),
    db.select({ status: salons.status, n: sql<number>`count(*)::int` }).from(salons).groupBy(salons.status),
    db.select({ status: appointments.status, n: sql<number>`count(*)::int` }).from(appointments).where(gte(appointments.createdAt, since)).groupBy(appointments.status),
    db.select({ id: salons.id, name: salons.name, neighborhood: salons.neighborhood, createdAt: salons.createdAt }).from(salons).where(eq(salons.status, 'PENDING')).orderBy(asc(salons.createdAt)).limit(10),
    db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, createdAt: auditLogs.createdAt, actor: users.fullName })
      .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).orderBy(desc(auditLogs.createdAt)).limit(8),
    db.select({ reviews: sql<number>`(select count(*)::int from ${reviews})`, hidden: sql<number>`(select count(*)::int from ${reviews} where ${reviews.isHidden})` }).from(sql`(select 1) t`),
  ]);
  ok(res, { usersByRole, salonsByStatus, bookingsLast30Days: apptByStatus, pendingSalons, recentAudit, reviews: totals[0] });
});

/* ------------------------------------------------------------------ users */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, pageSize, q, role } = req.query as unknown as List & { role?: 'CUSTOMER' | 'OWNER' | 'STAFF' | 'ADMIN' };
  const where = and(role ? eq(users.role, role) : undefined, q ? or(ilike(users.email, like(q)), ilike(users.fullName, like(q)), ilike(users.phone, like(q))) : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where);
  const rows = await db.select({ id: users.id, email: users.email, phone: users.phone, fullName: users.fullName, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users).where(where).orderBy(desc(users.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});

export const patchUser = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const b = req.body as { role?: 'CUSTOMER' | 'OWNER' | 'STAFF' | 'ADMIN'; isActive?: boolean };
  if (!Object.keys(b).length) throw badRequest('Nothing to update.');
  if (id === actor(req) && (b.isActive === false || (b.role && b.role !== 'ADMIN'))) throw forbidden('You cannot demote or deactivate your own admin account.');
  const [cur] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!cur) throw notFound('User not found');
  if (b.role && b.role !== cur.role && cur.role === 'OWNER') {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(salons).where(eq(salons.ownerId, id));
    if (n > 0) throw conflict('This user owns salons. Suspend or transfer them before changing the role.', 'OWNS_SALONS');
  }
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx.update(users).set(b).where(eq(users.id, id)).returning();
    if (b.isActive === false || (b.role && b.role !== cur.role)) {
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
    }
    await audit(tx, { actorId: actor(req), action: 'admin.user_update', entityType: 'user', entityId: id, metadata: { before: { role: cur.role, isActive: cur.isActive }, after: b }, ip: req.ip });
    return updated;
  });
  ok(res, { id: row.id, email: row.email, role: row.role, isActive: row.isActive });
});

/* ----------------------------------------------------------------- salons */
export const listSalons = asyncHandler(async (req, res) => {
  const { page, pageSize, q, status } = req.query as unknown as List & { status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' };
  const where = and(status ? eq(salons.status, status) : undefined, q ? or(ilike(salons.name, like(q)), ilike(salons.neighborhood, like(q))) : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(salons).where(where);
  const rows = await db.select({
    id: salons.id, name: salons.name, slug: salons.slug, neighborhood: salons.neighborhood, status: salons.status, isVerified: salons.isVerified, isDemo: salons.isDemo,
    avgRating: salons.avgRating, reviewCount: salons.reviewCount, bookingCount: salons.bookingCount, createdAt: salons.createdAt, ownerName: users.fullName, ownerEmail: users.email,
    serviceCount: sql<number>`(select count(*)::int from ${services} where ${services.salonId} = ${salons.id} and ${services.isActive})`,
  }).from(salons).innerJoin(users, eq(users.id, salons.ownerId)).where(where).orderBy(desc(salons.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});

export const setSalonStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { status, note } = req.body as { status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; note?: string };
  const [cur] = await db.select().from(salons).where(eq(salons.id, id)).limit(1);
  if (!cur) throw notFound('Salon not found');
  if (status === 'ACTIVE') {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(services).where(and(eq(services.salonId, id), eq(services.isActive, true)));
    if (n === 0) throw unprocessable('Add at least one active service before publishing this salon.', 'NOT_READY');
  }
  await db.transaction(async (tx) => {
    await tx.update(salons).set({ status }).where(eq(salons.id, id));
    await audit(tx, { actorId: actor(req), action: `admin.salon_${status.toLowerCase()}`, entityType: 'salon', entityId: id, metadata: { from: cur.status, note }, ip: req.ip });
    await notify(tx, cur.ownerId, {
      type: 'SYSTEM',
      title: status === 'ACTIVE' ? 'Your salon is live' : status === 'SUSPENDED' ? 'Your salon was suspended' : 'Your salon is under review',
      body: `${cur.name}: ${status === 'ACTIVE' ? 'customers can now find and book you.' : status === 'SUSPENDED' ? 'it is hidden from customers.' : 'it is awaiting review.'}${note ? ` Note: ${note}` : ''}`,
      link: '/salon/profile',
    });
  });
  ok(res, { id, status });
});

export const setSalonVerified = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { isVerified } = req.body as { isVerified: boolean };
  const [cur] = await db.select().from(salons).where(eq(salons.id, id)).limit(1);
  if (!cur) throw notFound('Salon not found');
  if (isVerified && cur.isDemo) throw unprocessable('Demo salons cannot be marked as verified businesses.', 'DEMO_SALON');
  await db.update(salons).set({ isVerified }).where(eq(salons.id, id));
  await audit(db, { actorId: actor(req), action: isVerified ? 'admin.salon_verify' : 'admin.salon_unverify', entityType: 'salon', entityId: id, ip: req.ip });
  ok(res, { id, isVerified });
});

/* ------------------------------------------------------------- categories */
export const listCategories = asyncHandler(async (_req, res) => {
  ok(res, await db.select({ c: serviceCategories, serviceCount: sql<number>`(select count(*)::int from ${services} where ${services.categoryId} = ${serviceCategories.id})` })
    .from(serviceCategories).orderBy(asc(serviceCategories.sortOrder)).then((r) => r.map((x) => ({ ...x.c, serviceCount: x.serviceCount }))));
});
export const createCategory = asyncHandler(async (req, res) => {
  const b = req.body as typeof serviceCategories.$inferInsert;
  const dup = await db.select({ id: serviceCategories.id }).from(serviceCategories).where(eq(serviceCategories.slug, b.slug)).limit(1);
  if (dup.length) throw conflict('A category with that slug already exists.', 'SLUG_TAKEN');
  const [row] = await db.insert(serviceCategories).values(b).returning();
  await audit(db, { actorId: actor(req), action: 'admin.category_create', entityType: 'category', entityId: row.id, ip: req.ip });
  created(res, row);
});
export const updateCategory = asyncHandler(async (req, res) => {
  const [row] = await db.update(serviceCategories).set(req.body as object).where(eq(serviceCategories.id, String(req.params.id))).returning();
  if (!row) throw notFound('Category not found');
  await audit(db, { actorId: actor(req), action: 'admin.category_update', entityType: 'category', entityId: row.id, ip: req.ip });
  ok(res, row);
});
export const deleteCategory = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(services).where(eq(services.categoryId, id));
  if (n > 0) throw conflict(`${n} service${n === 1 ? ' uses' : 's use'} this category. Deactivate it instead.`, 'CATEGORY_IN_USE');
  const rows = await db.delete(serviceCategories).where(eq(serviceCategories.id, id)).returning();
  if (!rows.length) throw notFound('Category not found');
  await audit(db, { actorId: actor(req), action: 'admin.category_delete', entityType: 'category', entityId: id, ip: req.ip });
  ok(res, { deleted: true });
});

/* --------------------------------------------------------------- bookings */
export const listBookings = asyncHandler(async (req, res) => {
  const { page, pageSize, q, status, salonId } = req.query as unknown as List & { status?: 'PENDING'; salonId?: string };
  const where = and(status ? eq(appointments.status, status) : undefined, salonId ? eq(appointments.salonId, salonId) : undefined,
    q ? or(ilike(appointments.reference, like(q)), ilike(appointments.guestName, like(q)), ilike(appointments.guestPhone, like(q))) : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(appointments).where(where);
  const rows = await db.select({
    id: appointments.id, reference: appointments.reference, status: appointments.status, startAt: appointments.startAt, serviceName: appointments.serviceName, priceEtb: appointments.priceEtb,
    guestName: appointments.guestName, guestPhone: appointments.guestPhone, paymentStatus: appointments.paymentStatus, salonName: salons.name, salonId: salons.id,
  }).from(appointments).innerJoin(salons, eq(salons.id, appointments.salonId)).where(where).orderBy(desc(appointments.startAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});

/* ---------------------------------------------------------------- reviews */
export const listReviews = asyncHandler(async (req, res) => {
  const { page, pageSize, q, hidden } = req.query as unknown as List & { hidden?: 'true' | 'false' };
  const where = and(hidden ? eq(reviews.isHidden, hidden === 'true') : undefined, q ? or(ilike(reviews.comment, like(q)), ilike(salons.name, like(q))) : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(reviews).innerJoin(salons, eq(salons.id, reviews.salonId)).where(where);
  const rows = await db.select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, isHidden: reviews.isHidden, createdAt: reviews.createdAt, salonName: salons.name, reviewer: users.fullName })
    .from(reviews).innerJoin(salons, eq(salons.id, reviews.salonId)).innerJoin(users, eq(users.id, reviews.userId)).where(where).orderBy(desc(reviews.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});
export const moderateReview = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { isHidden } = req.body as { isHidden: boolean };
  await db.transaction(async (tx) => {
    const [row] = await tx.update(reviews).set({ isHidden }).where(eq(reviews.id, id)).returning();
    if (!row) throw notFound('Review not found');
    await recomputeSalonRating(tx, row.salonId);
    await audit(tx, { actorId: actor(req), action: isHidden ? 'admin.review_hide' : 'admin.review_show', entityType: 'review', entityId: id, ip: req.ip });
  });
  ok(res, { id, isHidden });
});

/* ------------------------------------------------------------ promotions */
export const listPromotions = asyncHandler(async (_req, res) => {
  ok(res, await db.select({ p: promotions, salonName: salons.name }).from(promotions).leftJoin(salons, eq(salons.id, promotions.salonId)).orderBy(desc(promotions.startsAt)).then((r) => r.map((x) => ({ ...x.p, salonName: x.salonName }))));
});
export const createPromotion = asyncHandler(async (req, res) => {
  const b = req.body as typeof promotions.$inferInsert;
  if (b.salonId) {
    const [s] = await db.select({ id: salons.id }).from(salons).where(eq(salons.id, b.salonId)).limit(1);
    if (!s) throw badRequest('Unknown salon.');
  }
  const [row] = await db.insert(promotions).values(b).returning();
  await audit(db, { actorId: actor(req), action: 'admin.promotion_create', entityType: 'promotion', entityId: row.id, ip: req.ip });
  created(res, row);
});
export const updatePromotion = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const [cur] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!cur) throw notFound('Promotion not found');
  const b = req.body as { startsAt?: Date; endsAt?: Date };
  if ((b.endsAt ?? cur.endsAt) <= (b.startsAt ?? cur.startsAt)) throw badRequest('Promotion must end after it starts.');
  const [row] = await db.update(promotions).set(req.body as object).where(eq(promotions.id, id)).returning();
  await audit(db, { actorId: actor(req), action: 'admin.promotion_update', entityType: 'promotion', entityId: id, ip: req.ip });
  ok(res, row);
});
export const deletePromotion = asyncHandler(async (req, res) => {
  const rows = await db.delete(promotions).where(eq(promotions.id, String(req.params.id))).returning();
  if (!rows.length) throw notFound('Promotion not found');
  await audit(db, { actorId: actor(req), action: 'admin.promotion_delete', entityType: 'promotion', entityId: String(req.params.id), ip: req.ip });
  ok(res, { deleted: true });
});

/* --------------------------------------------------------------- settings */
export async function readSettings() {
  const rows = await db.select().from(platformSettings);
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) out[k] = rows.find((r) => r.key === k)?.value ?? '';
  return out;
}
export const getSettings = asyncHandler(async (_req, res) => ok(res, await readSettings()));
export const updateSettings = asyncHandler(async (req, res) => {
  const b = req.body as Record<string, string>;
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(b)) {
      await tx.insert(platformSettings).values({ key, value }).onConflictDoUpdate({ target: platformSettings.key, set: { value } });
    }
    await audit(tx, { actorId: actor(req), action: 'admin.settings_update', entityType: 'settings', metadata: { keys: Object.keys(b) }, ip: req.ip });
  });
  ok(res, await readSettings());
});

/* ------------------------------------------------------------ audit & stats */
export const listAudit = asyncHandler(async (req, res) => {
  const { page, pageSize, entityType, action } = req.query as unknown as List & { entityType?: string; action?: string };
  const where = and(entityType ? eq(auditLogs.entityType, entityType) : undefined, action ? ilike(auditLogs.action, `${action}%`) : undefined);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
  const rows = await db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.fullName, actorEmail: users.email })
    .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows, paginate(total, page, pageSize));
});

export const reports = asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from: string; to: string };
  if (Date.parse(to) - Date.parse(from) > 366 * 86400000) throw badRequest('Choose a range of up to one year.');
  const start = localToUtc(from, 0), end = localToUtc(addDaysStr(to, 1), 0);
  const day = (col: unknown) => sql<string>`to_char(${col as never} at time zone ${tzLiteral}, 'YYYY-MM-DD')`;
  const apptDay = day(appointments.startAt), userDay = day(users.createdAt);
  const [bookings, newUsers, topSalons, topCategories] = await Promise.all([
    db.select({ date: apptDay, n: sql<number>`count(*)::int` }).from(appointments).where(and(gte(appointments.startAt, start), lt(appointments.startAt, end))).groupBy(apptDay).orderBy(apptDay),
    db.select({ date: userDay, n: sql<number>`count(*)::int` }).from(users).where(and(gte(users.createdAt, start), lt(users.createdAt, end))).groupBy(userDay).orderBy(userDay),
    db.select({ id: salons.id, name: salons.name, bookings: sql<number>`count(*)::int` }).from(appointments).innerJoin(salons, eq(salons.id, appointments.salonId))
      .where(and(gte(appointments.startAt, start), lt(appointments.startAt, end), sql`${appointments.status} in ('CONFIRMED','COMPLETED')`)).groupBy(salons.id, salons.name).orderBy(sql`count(*) desc`).limit(10),
    db.select({ name: serviceCategories.name, bookings: sql<number>`count(*)::int` }).from(appointments).innerJoin(services, eq(services.id, appointments.serviceId)).innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
      .where(and(gte(appointments.startAt, start), lt(appointments.startAt, end), sql`${appointments.status} in ('CONFIRMED','COMPLETED')`)).groupBy(serviceCategories.name).orderBy(sql`count(*) desc`).limit(10),
  ]);
  ok(res, { range: { from, to }, bookingsByDay: bookings, newUsersByDay: newUsers, topSalons, topCategories });
});
