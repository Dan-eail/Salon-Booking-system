import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appointments, salons } from '../db/schema.js';
import { formatLocalTime, utcToLocalDate } from '../lib/time.js';
import { notify } from './notifications.js';

/**
 * Sends a reminder for confirmed appointments starting within `hoursAhead`.
 * The UPDATE ... RETURNING claims each row exactly once, so overlapping runs never double-send.
 */
export async function sendDueReminders(now = new Date(), hoursAhead = 24): Promise<number> {
  const until = new Date(now.getTime() + hoursAhead * 3600000);
  const claimed = await db
    .update(appointments)
    .set({ reminderSentAt: now })
    .where(
      and(
        eq(appointments.status, 'CONFIRMED'),
        isNull(appointments.reminderSentAt),
        gt(appointments.startAt, now),
        lte(appointments.startAt, until),
        sql`${appointments.customerId} is not null`,
      ),
    )
    .returning();
  for (const a of claimed) {
    const [salon] = await db.select({ name: salons.name }).from(salons).where(eq(salons.id, a.salonId)).limit(1);
    await notify(db, a.customerId!, {
      type: 'BOOKING_REMINDER',
      title: 'Appointment reminder',
      body: `${a.serviceName} at ${salon?.name ?? 'the salon'} on ${utcToLocalDate(a.startAt)} at ${formatLocalTime(a.startAt)} (${a.reference}).`,
      link: `/dashboard/bookings/${a.id}`,
    });
  }
  return claimed.length;
}

export function startReminderJob(intervalMs = 10 * 60_000) {
  const timer = setInterval(() => void sendDueReminders().catch(() => undefined), intervalMs);
  timer.unref();
  return timer;
}
