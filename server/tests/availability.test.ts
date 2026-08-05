import { describe, expect, it } from 'vitest';
import { computeStaffSlots, type SlotParams, type StaffDayInput } from '../src/services/availability.js';
import { DATE, NOW, at } from './helpers.js';

const base: SlotParams = {
  date: DATE, now: NOW, hours: { start: 9 * 60, end: 12 * 60 },
  minNoticeMinutes: 60, maxAdvanceDays: 60, durationMinutes: 60, totalBufferMinutes: 0,
};
const staff = (over: Partial<StaffDayInput> = {}): StaffDayInput => ({
  schedules: [{ start: 9 * 60, end: 12 * 60 }], breaks: [], timeOff: [], busy: [], ...over,
});
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

describe('computeStaffSlots', () => {
  it('offers 15-minute starts and never lets a service run past closing', () => {
    const slots = computeStaffSlots(base, staff());
    expect(hm(slots[0])).toBe('09:00');
    expect(hm(slots.at(-1)!)).toBe('11:00');
    expect(slots).toHaveLength(9);
  });

  it('returns nothing when the salon is closed', () => {
    expect(computeStaffSlots({ ...base, hours: null }, staff())).toEqual([]);
  });

  it('intersects staff shift with salon hours', () => {
    const slots = computeStaffSlots(base, staff({ schedules: [{ start: 10 * 60, end: 15 * 60 }] }));
    expect(hm(slots[0])).toBe('10:00');
    expect(hm(slots.at(-1)!)).toBe('11:00');
  });

  it('removes breaks', () => {
    const slots = computeStaffSlots(base, staff({ breaks: [{ start: 10 * 60, end: 10 * 60 + 30 }] }));
    // 09:00 slot would run into the break; 10:30 is the first start after it
    expect(slots).not.toContain(9 * 60 + 15);
    expect(slots).not.toContain(10 * 60);
    expect(slots).toContain(10 * 60 + 30);
    expect(slots).toContain(9 * 60 - 0);
  });

  it('removes time off that overlaps the day', () => {
    const slots = computeStaffSlots(base, staff({ timeOff: [{ startAt: at(9 * 60), endAt: at(11 * 60) }] }));
    expect(hm(slots[0])).toBe('11:00');
  });

  it('removes a whole day of leave', () => {
    const slots = computeStaffSlots(base, staff({ timeOff: [{ startAt: at(0), endAt: at(0, '2030-01-08') }] }));
    expect(slots).toEqual([]);
  });

  it('blocks slots that overlap an existing appointment, including its buffer', () => {
    const busy = [{ startAt: at(10 * 60), endAt: at(11 * 60 + 15) }]; // 10:00–11:00 + 15 buffer
    const slots = computeStaffSlots(base, staff({ busy }));
    expect(slots).toContain(9 * 60);
    expect(slots).not.toContain(9 * 60 + 15);
    expect(slots).not.toContain(10 * 60);
    expect(slots).not.toContain(11 * 60);
  });

  it('applies the new booking’s own buffer when checking what follows', () => {
    const busy = [{ startAt: at(10 * 60), endAt: at(11 * 60) }];
    const noBuf = computeStaffSlots(base, staff({ busy }));
    const buf = computeStaffSlots({ ...base, totalBufferMinutes: 15 }, staff({ busy }));
    expect(noBuf).toContain(9 * 60); // ends exactly when the next starts
    expect(buf).not.toContain(9 * 60); // 09:00–10:00 + 15 min buffer collides with 10:00
  });

  it('enforces minimum notice', () => {
    const now = new Date(at(9 * 60).getTime() - 30 * 60000); // 30 minutes before opening
    const slots = computeStaffSlots({ ...base, now }, staff());
    // now = 08:30, 60 minutes notice => earliest bookable start is 09:30
    expect(hm(slots[0])).toBe('09:30');
  });

  it('enforces the max advance window', () => {
    expect(computeStaffSlots({ ...base, maxAdvanceDays: 1 }, staff())).toEqual([]);
  });
});
