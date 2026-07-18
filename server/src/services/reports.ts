import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { fromCents, toCents } from '../../../shared/money.js';
import { db } from '../db/client.js';
import { appointments, payments, staffBreaks, staffProfiles, staffSchedules } from '../db/schema.js';
import { tzLiteral, addDaysStr, dayOfWeek, localToUtc } from '../lib/time.js';

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/** All figures for one salon between two local dates (inclusive). Money is exact (integer cents). */
export async function buildSummary(salonId: string, from: string, to: string, onlyStaffId?: string) {
  const start = localToUtc(from, 0);
  const end = localToUtc(addDaysStr(to, 1), 0);
  const scope = and(eq(appointments.salonId, salonId), onlyStaffId ? eq(appointments.staffId, onlyStaffId) : undefined, gte(appointments.startAt, start), lt(appointments.startAt, end));

  const statusRows = await db
    .select({ status: appointments.status, n: sql<number>`count(*)::int`, cents: sql<string>`coalesce(sum(${appointments.priceEtb}), 0)::text` })
    .from(appointments).where(scope).groupBy(appointments.status);
  const count = (s: string) => statusRows.find((r) => r.status === s)?.n ?? 0;
  const totals = {
    total: statusRows.reduce((a, r) => a + r.n, 0), pending: count('PENDING'), confirmed: count('CONFIRMED'), completed: count('COMPLETED'),
    cancelled: count('CANCELLED'), rejected: count('REJECTED'), noShow: count('NO_SHOW'),
  };
  // "Booking value" is what bookings are worth on paper — it is NOT money collected.
  const bookingValueCents = statusRows.filter((r) => r.status === 'CONFIRMED' || r.status === 'COMPLETED').reduce((a, r) => a + toCents(r.cents), 0);

  const [paid] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amountEtb}), 0)::text` })
    .from(payments).innerJoin(appointments, eq(appointments.id, payments.appointmentId))
    .where(and(eq(appointments.salonId, salonId), onlyStaffId ? eq(appointments.staffId, onlyStaffId) : undefined, eq(payments.status, 'PAID'), gte(payments.paidAt, start), lt(payments.paidAt, end)));

  const dayExpr = sql<string>`to_char(${appointments.startAt} at time zone ${tzLiteral}, 'YYYY-MM-DD')`;
  const dayRows = await db.select({ date: dayExpr, n: sql<number>`count(*)::int` }).from(appointments)
    .where(and(scope, inArray(appointments.status, ['PENDING', 'CONFIRMED', 'COMPLETED']))).groupBy(dayExpr);
  const byDay: { date: string; count: number }[] = [];
  for (let d = from; d <= to; d = addDaysStr(d, 1)) byDay.push({ date: d, count: dayRows.find((r) => r.date === d)?.n ?? 0 });

  const popular = await db
    .select({ name: appointments.serviceName, bookings: sql<number>`count(*)::int`, cents: sql<string>`coalesce(sum(${appointments.priceEtb}), 0)::text` })
    .from(appointments).where(and(scope, inArray(appointments.status, ['CONFIRMED', 'COMPLETED']))).groupBy(appointments.serviceName)
    .orderBy(sql`count(*) desc`, appointments.serviceName).limit(8);

  // Utilization = booked minutes / scheduled working minutes (minus breaks). Time off is not subtracted.
  const staff = await db.select({ id: staffProfiles.id, name: staffProfiles.displayName }).from(staffProfiles)
    .where(and(eq(staffProfiles.salonId, salonId), onlyStaffId ? eq(staffProfiles.id, onlyStaffId) : undefined, eq(staffProfiles.isActive, true))).orderBy(asc(staffProfiles.displayName));
  const ids = staff.map((s) => s.id);
  const [scheds, brks, booked] = ids.length
    ? await Promise.all([
        db.select().from(staffSchedules).where(inArray(staffSchedules.staffId, ids)),
        db.select().from(staffBreaks).where(inArray(staffBreaks.staffId, ids)),
        db.select({ staffId: appointments.staffId, mins: sql<number>`coalesce(sum(${appointments.durationMinutes}), 0)::int` }).from(appointments)
          .where(and(scope, inArray(appointments.staffId, ids), inArray(appointments.status, ['CONFIRMED', 'COMPLETED']))).groupBy(appointments.staffId),
      ])
    : [[], [], []];
  const perDow = (rows: { staffId: string; dayOfWeek: number; startMinutes: number; endMinutes: number }[], id: string) => {
    const out = new Array(7).fill(0);
    for (const r of rows) if (r.staffId === id) out[r.dayOfWeek] += r.endMinutes - r.startMinutes;
    return out as number[];
  };
  const dowCount = new Array(7).fill(0) as number[];
  for (let d = from; d <= to; d = addDaysStr(d, 1)) dowCount[dayOfWeek(d)]++;
  const staffUtilization = staff.map((s) => {
    const work = perDow(scheds, s.id), br = perDow(brks, s.id);
    const availMin = dowCount.reduce((a, c, dow) => a + c * Math.max(0, work[dow] - br[dow]), 0);
    const bookedMin = booked.find((b) => b.staffId === s.id)?.mins ?? 0;
    return { id: s.id, name: s.name, bookedHours: Math.round((bookedMin / 60) * 10) / 10, availableHours: Math.round((availMin / 60) * 10) / 10, utilizationPct: Math.min(100, pct(bookedMin, availMin)) };
  });

  return {
    range: { from, to },
    totals,
    // Rates are shares of ALL appointments scheduled in the range.
    rates: { completionPct: pct(totals.completed, totals.total), cancellationPct: pct(totals.cancelled + totals.rejected, totals.total) },
    bookingValueEtb: fromCents(bookingValueCents),
    recordedRevenueEtb: fromCents(toCents(paid.total)),
    byDay,
    popularServices: popular.map((p) => ({ name: p.name, bookings: p.bookings, valueEtb: fromCents(toCents(p.cents)) })),
    staffUtilization,
    notes: {
      bookingValue: 'Booking value is the listed price of confirmed and completed bookings. It is not money collected.',
      recordedRevenue: 'Recorded revenue is the sum of payments marked as paid within the period.',
    },
  };
}
