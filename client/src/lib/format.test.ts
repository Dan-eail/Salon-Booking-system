import { describe, expect, it } from 'vitest';
import { addDays, dayName, duration, fmtTime, fromLocalInput, inputToMinutes, localDate, minutesToInput, money, toLocalInput } from './format';
import { weekStart, monthStart, monthEnd } from '@/pages/owner/util';

describe('format', () => {
  it('formats ETB with exact decimals', () => {
    expect(money('1500.00')).toContain('1,500');
    expect(money('1500.50')).toContain('1,500.50');
  });
  it('shows times in Addis Ababa (UTC+3)', () => {
    expect(fmtTime('2026-10-20T06:00:00Z')).toBe('9:00 AM');
  });
  it('treats a local input value as Addis time', () => {
    expect(fromLocalInput('2026-10-20T09:00')).toBe('2026-10-20T06:00:00.000Z');
    expect(toLocalInput('2026-10-20T06:00:00.000Z')).toBe('2026-10-20T09:00');
  });
  it('uses the Addis calendar day around midnight', () => {
    expect(localDate('2026-10-19T21:30:00Z')).toBe('2026-10-20');
  });
  it('does date math without timezone drift', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('converts minutes <-> HH:mm', () => {
    expect(minutesToInput(545)).toBe('09:05');
    expect(inputToMinutes('09:05')).toBe(545);
  });
  it('labels durations and days', () => {
    expect(duration(45)).toBe('45 min');
    expect(duration(90)).toBe('1 h 30 min');
    expect(dayName(0)).toBe('Sunday');
  });
  it('finds week and month boundaries (Monday-first)', () => {
    expect(weekStart('2026-10-20')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(monthStart('2026-10-20')).toBe('2026-10-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
  });
});
