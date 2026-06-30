import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { APP_TIMEZONE } from '../../../shared/constants.js';

export const TZ = APP_TIMEZONE;

/** 'YYYY-MM-DD' + minutes-since-local-midnight -> UTC Date */
export function localToUtc(dateStr: string, minutes: number): Date {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, TZ);
}

export function utcToLocalDate(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM-dd');
}

export function utcToLocalMinutes(d: Date): number {
  const z = toZonedTime(d, TZ);
  return z.getHours() * 60 + z.getMinutes();
}

export function formatLocalTime(d: Date): string {
  return formatInTimeZone(d, TZ, 'HH:mm');
}

export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function todayLocal(now = new Date()): string {
  return utcToLocalDate(now);
}

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** TZ as an inline SQL literal. Parameterised `AT TIME ZONE $1` breaks GROUP BY matching; TZ is a code constant, never user input. */
import { sql } from 'drizzle-orm';
export const tzLiteral = sql.raw(`'${TZ.replace(/[^A-Za-z_/]/g, '')}'`);
