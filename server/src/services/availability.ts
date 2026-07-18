import { and, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { SLOT_STEP_MINUTES } from '../../../shared/constants.js';
import type { Db, Tx } from '../db/client.js';
import {
  appointments,
  businessHours,
  salons,
  services,
  staffBreaks,
  staffProfiles,
  staffSchedules,
  staffServices,
  staffTimeOff,
} from '../db/schema.js';
import { addDaysStr, dayOfWeek, formatLocalTime, localToUtc, todayLocal } from '../lib/time.js';

type Executor = Db | Tx;
export type Interval = { start: number; end: number };

export type StaffDayInput = {
  schedules: Interval[];
  breaks: Interval[];
  timeOff: { startAt: Date; endAt: Date }[];
  /** Active appointments, using blockedUntil (service end + buffer) as end. */
  busy: { startAt: Date; endAt: Date }[];
};

export type SlotParams = {
  date: string; // YYYY-MM-DD in salon-local time
  now: Date;
  hours: Interval | null; // null => closed
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  durationMinutes: number;
  totalBufferMinutes: number;
  step?: number;
};

function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Remove `cut` from every interval in `windows`. */
export function subtractInterval(windows: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const w of windows) {
    if (cut.end <= w.start || cut.start >= w.end) {
      out.push(w);
      continue;
    }
    if (cut.start > w.start) out.push({ start: w.start, end: cut.start });
    if (cut.end < w.end) out.push({ start: cut.end, end: w.end });
  }
  return out;
}

/**
 * Pure availability calculation for ONE staff member on ONE local date.
 * Returns the list of valid slot start times (minutes since local midnight).
 */
export function computeStaffSlots(p: SlotParams, staff: StaffDayInput): number[] {
  if (!p.hours) return [];
  const step = p.step ?? SLOT_STEP_MINUTES;

  // 1. Working windows = staff shifts ∩ salon opening hours
  let windows: Interval[] = [];
  for (const s of staff.schedules) {
    const w = intersect(s, p.hours);
    if (w) windows.push(w);
  }
  if (!windows.length) return [];

  // 2. Subtract breaks
  for (const b of staff.breaks) windows = subtractInterval(windows, b);

  // 3. Subtract time off / leave (converted to local minutes of this date)
  const dayStart = localToUtc(p.date, 0);
  const dayEnd = localToUtc(addDaysStr(p.date, 1), 0);
  for (const t of staff.timeOff) {
    if (t.endAt <= dayStart || t.startAt >= dayEnd) continue;
    const startMin = Math.max(0, Math.round((t.startAt.getTime() - dayStart.getTime()) / 60000));
    const endMin = Math.min(1440, Math.round((t.endAt.getTime() - dayStart.getTime()) / 60000));
    windows = subtractInterval(windows, { start: startMin, end: endMin });
  }

  const earliest = new Date(p.now.getTime() + p.minNoticeMinutes * 60000);
  const latest = new Date(p.now.getTime() + p.maxAdvanceDays * 86400000);
  const slots: number[] = [];

  for (const w of windows) {
    const first = Math.ceil(w.start / step) * step;
    for (let s = first; s + p.durationMinutes <= w.end; s += step) {
      const startUtc = localToUtc(p.date, s);
      if (startUtc < earliest || startUtc > latest) continue;
      const blockedEnd = new Date(startUtc.getTime() + (p.durationMinutes + p.totalBufferMinutes) * 60000);
      const clash = staff.busy.some((b) => startUtc < b.endAt && blockedEnd > b.startAt);
      if (!clash) slots.push(s);
    }
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

/* ------------------------------------------------------------ DB loading */

export type AvailabilityContext = {
  salon: typeof salons.$inferSelect;
  service: typeof services.$inferSelect;
  params: SlotParams;
  staff: { id: string; displayName: string; input: StaffDayInput }[];
};

export async function loadAvailabilityContext(
  ex: Executor,
  opts: {
    salonId: string;
    serviceId: string;
    date: string;
    staffId?: string | null;
    now?: Date;
    /** Ignore this appointment's own blocked window (used when rescheduling). */
    excludeAppointmentId?: string;
    /** Skip minimum-notice / max-advance rules (owner-created bookings). */
    ignoreBookingWindow?: boolean;
  },
): Promise<AvailabilityContext | null> {
  const now = opts.now ?? new Date();
  const [salon] = await ex.select().from(salons).where(eq(salons.id, opts.salonId)).limit(1);
  if (!salon || salon.status !== 'ACTIVE') return null;
  const [service] = await ex
    .select()
    .from(services)
    .where(and(eq(services.id, opts.serviceId), eq(services.salonId, salon.id), eq(services.isActive, true)))
    .limit(1);
  if (!service) return null;

  const dow = dayOfWeek(opts.date);
  const [hoursRow] = await ex
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.salonId, salon.id), eq(businessHours.dayOfWeek, dow)))
    .limit(1);
  const hours: Interval | null =
    hoursRow && !hoursRow.isClosed ? { start: hoursRow.openMinutes, end: hoursRow.closeMinutes } : null;

  // Eligible staff: active, assigned to this service, in this salon (and the requested one if any)
  const eligible = await ex
    .select({ id: staffProfiles.id, displayName: staffProfiles.displayName })
    .from(staffProfiles)
    .innerJoin(staffServices, eq(staffServices.staffId, staffProfiles.id))
    .where(
      and(
        eq(staffProfiles.salonId, salon.id),
        eq(staffProfiles.isActive, true),
        eq(staffServices.serviceId, service.id),
        opts.staffId ? eq(staffProfiles.id, opts.staffId) : undefined,
      ),
    );

  const params: SlotParams = {
    date: opts.date,
    now,
    hours,
    minNoticeMinutes: opts.ignoreBookingWindow ? 0 : salon.minNoticeMinutes,
    maxAdvanceDays: opts.ignoreBookingWindow ? 3650 : salon.maxAdvanceDays,
    durationMinutes: service.durationMinutes,
    totalBufferMinutes: service.bufferMinutes + salon.bookingBufferMinutes,
  };
  if (!eligible.length || !hours) return { salon, service, params, staff: [] };

  const ids = eligible.map((e) => e.id);
  const dayStart = localToUtc(opts.date, 0);
  const dayEnd = localToUtc(addDaysStr(opts.date, 1), 0);

  // Sequential on purpose: a transaction owns a single connection and must not receive concurrent queries.
  const scheds = await ex
    .select()
    .from(staffSchedules)
    .where(and(inArray(staffSchedules.staffId, ids), eq(staffSchedules.dayOfWeek, dow)));
  const brks = await ex
    .select()
    .from(staffBreaks)
    .where(and(inArray(staffBreaks.staffId, ids), eq(staffBreaks.dayOfWeek, dow)));
  const offs = await ex
    .select()
    .from(staffTimeOff)
    .where(and(inArray(staffTimeOff.staffId, ids), lt(staffTimeOff.startAt, dayEnd), gt(staffTimeOff.endAt, dayStart)));
  const busy = await ex
    .select({ staffId: appointments.staffId, startAt: appointments.startAt, blockedUntil: appointments.blockedUntil })
    .from(appointments)
    .where(
      and(
        inArray(appointments.staffId, ids),
        inArray(appointments.status, ['PENDING', 'CONFIRMED']),
        lt(appointments.startAt, dayEnd),
        gt(appointments.blockedUntil, dayStart),
        opts.excludeAppointmentId ? ne(appointments.id, opts.excludeAppointmentId) : undefined,
      ),
    );
  return {
    salon,
    service,
    params,
    staff: eligible.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      input: {
        schedules: scheds.filter((s) => s.staffId === e.id).map((s) => ({ start: s.startMinutes, end: s.endMinutes })),
        breaks: brks.filter((s) => s.staffId === e.id).map((s) => ({ start: s.startMinutes, end: s.endMinutes })),
        timeOff: offs.filter((s) => s.staffId === e.id).map((s) => ({ startAt: s.startAt, endAt: s.endAt })),
        busy: busy.filter((s) => s.staffId === e.id).map((s) => ({ startAt: s.startAt, endAt: s.blockedUntil })),
      },
    })),
  };
}

export type Slot = { time: string; startAt: string; minutes: number; staffIds: string[] };

export function slotsFromContext(ctx: AvailabilityContext): Slot[] {
  const byMinute = new Map<number, string[]>();
  for (const s of ctx.staff) {
    for (const m of computeStaffSlots(ctx.params, s.input)) {
      const arr = byMinute.get(m) ?? [];
      arr.push(s.id);
      byMinute.set(m, arr);
    }
  }
  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, staffIds]) => {
      const start = localToUtc(ctx.params.date, minutes);
      return { time: formatLocalTime(start), startAt: start.toISOString(), minutes, staffIds };
    });
}

export async function getAvailability(
  ex: Executor,
  opts: { salonId: string; serviceId: string; date: string; staffId?: string | null; now?: Date },
): Promise<Slot[]> {
  const ctx = await loadAvailabilityContext(ex, opts);
  return ctx ? slotsFromContext(ctx) : [];
}

/** Does the salon have at least one open slot for this service within `days` days from today? */
export async function firstAvailableDate(
  ex: Executor,
  opts: { salonId: string; serviceId: string; days?: number },
): Promise<string | null> {
  const start = todayLocal();
  for (let i = 0; i < (opts.days ?? 14); i++) {
    const date = addDaysStr(start, i);
    const slots = await getAvailability(ex, { salonId: opts.salonId, serviceId: opts.serviceId, date });
    if (slots.length) return date;
  }
  return null;
}
