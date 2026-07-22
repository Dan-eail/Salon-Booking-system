import { and, asc, desc, eq, exists, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businessHours, favoriteSalons, locations, platformSettings, promotions, reviews, salonImages, salons, serviceCategories, services, staffProfiles, staffServices, users } from '../db/schema.js';
import { env } from '../config/env.js';
import { notFound } from '../lib/errors.js';
import { ok, paginate } from '../lib/respond.js';
import { addDaysStr, todayLocal } from '../lib/time.js';
import { asyncHandler } from '../middleware/auth.js';
import { getAvailability } from '../services/availability.js';
import { effectivePrice } from '../services/booking.js';
import { channelStatus } from '../services/notifications.js';
import { paymentProviderStatus } from '../services/payments.js';

/** SQL for the price a customer would pay for a service right now (honours valid promos). */
const effPrice = sql<string>`case when ${services.promoPriceEtb} is not null and now() between ${services.promoStartsAt} and ${services.promoEndsAt} and ${services.promoPriceEtb} < ${services.priceEtb} then ${services.promoPriceEtb} else ${services.priceEtb} end`;

export const meta = asyncHandler(async (_req, res) => {
  const [cats, locs, settings] = await Promise.all([
    db.select().from(serviceCategories).where(eq(serviceCategories.isActive, true)).orderBy(asc(serviceCategories.sortOrder)),
    db.select().from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.neighborhood)),
    db.select().from(platformSettings),
  ]);
  const pub = (k: string) => (settings.find((x) => x.key === k)?.value as string | undefined) || '';
  ok(res, {
    brandName: env.BRAND_NAME,
    currency: env.APP_CURRENCY,
    timezone: env.APP_TIMEZONE,
    categories: cats,
    locations: locs,
    notificationChannels: channelStatus(),
    payments: paymentProviderStatus(),
    contact: { phone: pub('supportPhone'), email: pub('supportEmail'), announcement: pub('announcement') },
  });
});

export const popularServices = asyncHandler(async (_req, res) => {
  const rows = await db
    .select({
      id: services.id, name: services.name, durationMinutes: services.durationMinutes, priceEtb: effPrice,
      bookingCount: services.bookingCount, salonName: salons.name, salonSlug: salons.slug, neighborhood: salons.neighborhood, categorySlug: serviceCategories.slug,
      imageUrl: services.imageUrl,
    })
    .from(services)
    .innerJoin(salons, eq(salons.id, services.salonId))
    .innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(and(eq(salons.status, 'ACTIVE'), eq(services.isActive, true)))
    .orderBy(desc(services.bookingCount), desc(salons.avgRating))
    .limit(8);
  ok(res, rows);
});

export const activePromotions = asyncHandler(async (_req, res) => {
  const rows = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.isActive, true), lte(promotions.startsAt, new Date()), gte(promotions.endsAt, new Date())))
    .orderBy(desc(promotions.isFeatured), asc(promotions.endsAt))
    .limit(10);
  ok(res, rows);
});

/** Only genuine, visible, written reviews. Returns an empty list when there are none (the UI hides the section). */
export const testimonials = asyncHandler(async (_req, res) => {
  const rows = await db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, reviewer: users.fullName, salonName: salons.name, salonSlug: salons.slug })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .innerJoin(salons, eq(salons.id, reviews.salonId))
    .where(and(eq(reviews.isHidden, false), gte(reviews.rating, 4), sql`length(coalesce(${reviews.comment}, '')) >= 20`, eq(salons.status, 'ACTIVE')))
    .orderBy(desc(reviews.createdAt))
    .limit(6);
  ok(res, rows.map((r) => ({ ...r, reviewer: shortName(r.reviewer) })));
});

const shortName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

type Q = {
  q?: string; city?: string; neighborhood?: string; category?: string; minPrice?: number; maxPrice?: number; minRating?: number;
  date?: string; timeFrom?: string; timeTo?: string; sort: 'relevance' | 'rating' | 'price_asc' | 'price_desc' | 'popularity';
  page: number; pageSize: number;
};

export const searchSalons = asyncHandler(async (req, res) => {
  const q = req.query as unknown as Q;
  const where: SQL[] = [eq(salons.status, 'ACTIVE')];

  if (q.city) where.push(ilike(salons.city, q.city));
  if (q.neighborhood) where.push(ilike(salons.neighborhood, q.neighborhood));
  if (q.minRating) where.push(and(gte(salons.avgRating, String(q.minRating)), sql`${salons.reviewCount} > 0`)!);

  // Service-level filters apply to ONE matching service (category + price must hold for the same service).
  const svcBase: SQL[] = [eq(services.isActive, true)];
  let svcFiltered = false;
  if (q.category) {
    svcBase.push(inArray(services.categoryId, db.select({ id: serviceCategories.id }).from(serviceCategories).where(eq(serviceCategories.slug, q.category))));
    svcFiltered = true;
  }
  if (q.minPrice !== undefined) { svcBase.push(sql`${effPrice} >= ${q.minPrice}`); svcFiltered = true; }
  if (q.maxPrice !== undefined) { svcBase.push(sql`${effPrice} <= ${q.maxPrice}`); svcFiltered = true; }
  // Correlated to the outer salon row; the per-salon availability loop below reuses svcBase without the correlation.
  const svcConds: SQL[] = [eq(services.salonId, salons.id), ...svcBase];
  if (svcFiltered) where.push(exists(db.select({ one: sql`1` }).from(services).where(and(...svcConds))));

  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '\\$&')}%`;
    where.push(
      or(
        ilike(salons.name, like), ilike(salons.neighborhood, like), ilike(salons.address, like),
        exists(db.select({ one: sql`1` }).from(services).where(and(eq(services.salonId, salons.id), eq(services.isActive, true), ilike(services.name, like)))),
        exists(
          db.select({ one: sql`1` }).from(services).innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
            .where(and(eq(services.salonId, salons.id), eq(services.isActive, true), ilike(serviceCategories.name, like))),
        ),
      )!,
    );
  }

  // Raw aliases on purpose: drizzle drops table qualifiers inside select-list subqueries, which made this resolve to the wrong column.
  const allMinPrice = sql<string | null>`(select min(case when s.promo_price_etb is not null and now() between s.promo_starts_at and s.promo_ends_at and s.promo_price_etb < s.price_etb then s.promo_price_etb else s.price_etb end) from services s where s.salon_id = "salons"."id" and s.is_active = true)`;
  const relevance = q.q
    ? sql`(case when ${salons.name} ilike ${q.q + '%'} then 2 when ${salons.name} ilike ${'%' + q.q + '%'} then 1 else 0 end) desc, `
    : sql``;
  const orderBy =
    q.sort === 'rating' ? [desc(salons.avgRating), desc(salons.reviewCount)]
    : q.sort === 'popularity' ? [desc(salons.bookingCount), desc(salons.avgRating)]
    : q.sort === 'price_asc' ? [sql`${allMinPrice} asc nulls last`]
    : q.sort === 'price_desc' ? [sql`${allMinPrice} desc nulls last`]
    : [sql`${relevance} (${salons.avgRating} * 2 + ln(1 + ${salons.bookingCount})) desc`];

  const needsAvailability = Boolean(q.date);
  const cap = needsAvailability ? 80 : undefined;
  let rows = await db
    .select({
      id: salons.id, slug: salons.slug, name: salons.name, city: salons.city, neighborhood: salons.neighborhood, address: salons.address,
      coverImage: salons.coverImage, avgRating: salons.avgRating, reviewCount: salons.reviewCount, priceLevel: salons.priceLevel,
      isVerified: salons.isVerified, isDemo: salons.isDemo, bookingMode: salons.bookingMode, bookingCount: salons.bookingCount,
      minPriceEtb: sql<string | null>`${allMinPrice}::text`,
    })
    .from(salons)
    .where(and(...where))
    .orderBy(...orderBy, asc(salons.id))
    .limit(cap ?? 1000);

  // Real availability filter: keep only salons with at least one bookable slot that day (and in the time window).
  if (needsAvailability) {
    const from = q.timeFrom ? toMin(q.timeFrom) : 0;
    const to = q.timeTo ? toMin(q.timeTo) : 1440;
    const kept: typeof rows = [];
    for (const s of rows) {
      const svcs = await db.select({ id: services.id }).from(services).where(and(...svcBase, eq(services.salonId, s.id))).limit(8);
      let match = false;
      for (const svc of svcs) {
        const slots = await getAvailability(db, { salonId: s.id, serviceId: svc.id, date: q.date! });
        if (slots.some((sl) => sl.minutes >= from && sl.minutes <= to)) { match = true; break; }
      }
      if (match) kept.push(s);
    }
    rows = kept;
  }

  const total = rows.length;
  const pageRows = rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const ids = pageRows.map((r) => r.id);

  const [imgs, cats, favs] = ids.length
    ? await Promise.all([
        db.select().from(salonImages).where(inArray(salonImages.salonId, ids)).orderBy(asc(salonImages.sortOrder)),
        db
          .selectDistinct({ salonId: services.salonId, slug: serviceCategories.slug, name: serviceCategories.name })
          .from(services).innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
          .where(and(inArray(services.salonId, ids), eq(services.isActive, true))),
        req.user ? db.select().from(favoriteSalons).where(and(eq(favoriteSalons.userId, req.user.id), inArray(favoriteSalons.salonId, ids))) : Promise.resolve([]),
      ])
    : [[], [], []];

  ok(
    res,
    pageRows.map((r) => ({
      ...r,
      image: r.coverImage ?? imgs.find((i) => i.salonId === r.id)?.url ?? null,
      categories: cats.filter((c) => c.salonId === r.id).map(({ slug, name }) => ({ slug, name })),
      isFavorite: favs.some((f) => f.salonId === r.id),
    })),
    paginate(total, q.page, q.pageSize),
  );
});

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function salonBySlug(slug: string) {
  const [salon] = await db.select().from(salons).where(and(eq(salons.slug, slug), eq(salons.status, 'ACTIVE'))).limit(1);
  if (!salon) throw notFound('Salon not found');
  return salon;
}

export const salonDetail = asyncHandler(async (req, res) => {
  const salon = await salonBySlug(String(req.params.slug));
  const [imgs, hours, svcs, staff, links, revs, fav] = await Promise.all([
    db.select().from(salonImages).where(eq(salonImages.salonId, salon.id)).orderBy(asc(salonImages.sortOrder)),
    db.select().from(businessHours).where(eq(businessHours.salonId, salon.id)).orderBy(asc(businessHours.dayOfWeek)),
    db
      .select({ s: services, category: { slug: serviceCategories.slug, name: serviceCategories.name } })
      .from(services).innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
      .where(and(eq(services.salonId, salon.id), eq(services.isActive, true))).orderBy(asc(serviceCategories.sortOrder), asc(services.name)),
    db.select().from(staffProfiles).where(and(eq(staffProfiles.salonId, salon.id), eq(staffProfiles.isActive, true))).orderBy(asc(staffProfiles.displayName)),
    db.select().from(staffServices),
    db
      .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, ownerReply: reviews.ownerReply, createdAt: reviews.createdAt, reviewer: users.fullName })
      .from(reviews).innerJoin(users, eq(users.id, reviews.userId))
      .where(and(eq(reviews.salonId, salon.id), eq(reviews.isHidden, false))).orderBy(desc(reviews.createdAt)).limit(5),
    req.user ? db.select().from(favoriteSalons).where(and(eq(favoriteSalons.userId, req.user.id), eq(favoriteSalons.salonId, salon.id))).limit(1) : Promise.resolve([]),
  ]);
  const staffIds = new Set(staff.map((s) => s.id));
  const { ownerId: _owner, ...publicSalon } = salon;
  void _owner;
  ok(res, {
    ...publicSalon,
    images: imgs,
    hours,
    services: svcs.map(({ s, category }) => {
      const price = effectivePrice(s);
      return {
        id: s.id, name: s.name, description: s.description, durationMinutes: s.durationMinutes, imageUrl: s.imageUrl, category,
        priceEtb: price, originalPriceEtb: price !== s.priceEtb ? s.priceEtb : null,
      };
    }),
    staff: staff.map((p) => ({
      id: p.id, displayName: p.displayName, title: p.title, bio: p.bio, avatarUrl: p.avatarUrl, specialties: p.specialties,
      serviceIds: links.filter((l) => l.staffId === p.id && staffIds.has(l.staffId)).map((l) => l.serviceId),
    })),
    reviews: revs.map((r) => ({ ...r, reviewer: shortName(r.reviewer) })),
    isFavorite: fav.length > 0,
  });
});

export const salonReviews = asyncHandler(async (req, res) => {
  const salon = await salonBySlug(String(req.params.slug));
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(reviews).where(and(eq(reviews.salonId, salon.id), eq(reviews.isHidden, false)));
  const rows = await db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, ownerReply: reviews.ownerReply, createdAt: reviews.createdAt, reviewer: users.fullName })
    .from(reviews).innerJoin(users, eq(users.id, reviews.userId))
    .where(and(eq(reviews.salonId, salon.id), eq(reviews.isHidden, false))).orderBy(desc(reviews.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  ok(res, rows.map((r) => ({ ...r, reviewer: shortName(r.reviewer) })), paginate(count, page, pageSize));
});

export const salonAvailability = asyncHandler(async (req, res) => {
  const salon = await salonBySlug(String(req.params.slug));
  const { serviceId, date, staffId } = req.query as { serviceId: string; date: string; staffId?: string };
  const slots = await getAvailability(db, { salonId: salon.id, serviceId, date, staffId });
  ok(res, { date, slots: slots.map(({ time, startAt, staffIds }) => ({ time, startAt, staffIds })) });
});

/** Per-day slot counts so the date picker can grey out full/closed days. */
export const salonAvailabilityRange = asyncHandler(async (req, res) => {
  const salon = await salonBySlug(String(req.params.slug));
  const { serviceId, from, days, staffId } = req.query as unknown as { serviceId: string; from: string; days: number; staffId?: string };
  const start = from < todayLocal() ? todayLocal() : from;
  const out: { date: string; slots: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysStr(start, i);
    out.push({ date, slots: (await getAvailability(db, { salonId: salon.id, serviceId, date, staffId })).length });
  }
  ok(res, out);
});
