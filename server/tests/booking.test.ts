import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import * as s from '../src/db/schema.js';
import { getAvailability } from '../src/services/availability.js';
import {
  changeAppointmentStatus, createAppointment, createReview, recordCashPayment, rescheduleAppointment,
} from '../src/services/booking.js';
import { DATE, NOW, at, closeDb, makeSalonFixture, makeUser } from './helpers.js';

afterAll(closeDb);

const book = (f: Awaited<ReturnType<typeof makeSalonFixture>>, minutes: number, over: Record<string, unknown> = {}) =>
  createAppointment({
    salonId: f.salon.id, serviceId: f.service.id, staffId: f.staff[0].id, startAt: at(minutes),
    guestName: 'Guest', guestPhone: '+251911111111', now: NOW, ...over,
  });

describe('booking creation', () => {
  it('confirms immediately on instant-booking salons and records history + owner alert', async () => {
    const f = await makeSalonFixture();
    const customer = await makeUser();
    const a = await book(f, 10 * 60, { customerId: customer.id });
    expect(a.status).toBe('CONFIRMED');
    expect(a.reference).toMatch(/^BE-[A-Z0-9]{8}$/);
    expect(a.priceEtb).toBe('500.00');
    const hist = await db.select().from(s.appointmentStatusHistory).where(eq(s.appointmentStatusHistory.appointmentId, a.id));
    expect(hist).toHaveLength(1);
    const alerts = await db.select().from(s.notifications).where(eq(s.notifications.userId, f.owner.id));
    expect(alerts.some((n) => n.type === 'NEW_BOOKING_ALERT')).toBe(true);
  });

  it('creates PENDING bookings on approval-mode salons', async () => {
    const f = await makeSalonFixture({ bookingMode: 'APPROVAL' });
    const a = await book(f, 10 * 60);
    expect(a.status).toBe('PENDING');
  });

  it('rejects a slot outside opening hours or off the availability grid', async () => {
    const f = await makeSalonFixture();
    await expect(book(f, 8 * 60)).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE', status: 409 });
    await expect(book(f, 16 * 60 + 30)).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' }); // would end 17:30
  });

  it('prevents double-booking the same staff member (overlap and exact)', async () => {
    const f = await makeSalonFixture();
    await book(f, 10 * 60);
    await expect(book(f, 10 * 60)).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    await expect(book(f, 10 * 60 + 30)).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    await expect(book(f, 9 * 60 + 30)).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    await expect(book(f, 11 * 60)).resolves.toBeTruthy(); // back-to-back is fine
  });

  it('respects service + salon buffers', async () => {
    const f = await makeSalonFixture({ bufferMinutes: 15, salonBuffer: 15 });
    await book(f, 10 * 60); // blocks until 11:30
    await expect(book(f, 11 * 60)).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    await expect(book(f, 11 * 60 + 30)).resolves.toBeTruthy();
  });

  it('assigns "any available professional" and fails only when everyone is busy', async () => {
    const f = await makeSalonFixture({ staffCount: 2 });
    const a = await book(f, 10 * 60, { staffId: null });
    const b = await book(f, 10 * 60, { staffId: null });
    expect(new Set([a.staffId, b.staffId]).size).toBe(2);
    await expect(book(f, 10 * 60, { staffId: null })).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });

  it('frees the slot again after a cancellation', async () => {
    const f = await makeSalonFixture();
    const a = await book(f, 10 * 60);
    await changeAppointmentStatus({ id: f.owner.id, role: 'OWNER' }, a.id, 'CANCELLED', { now: NOW });
    const slots = await getAvailability(db, { salonId: f.salon.id, serviceId: f.service.id, date: DATE, now: NOW });
    expect(slots.map((x) => x.time)).toContain('10:00');
    await expect(book(f, 10 * 60)).resolves.toBeTruthy();
  });

  it('survives concurrent attempts: exactly one of many simultaneous bookings wins', async () => {
    const f = await makeSalonFixture();
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => book(f, 13 * 60)));
    const wins = results.filter((r) => r.status === 'fulfilled');
    const losses = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(11);
    expect(losses.every((l) => l.reason.code === 'SLOT_UNAVAILABLE')).toBe(true);
    const rows = await db.select().from(s.appointments).where(eq(s.appointments.salonId, f.salon.id));
    expect(rows).toHaveLength(1);
  });

  it('survives concurrent "any professional" attempts without overbooking', async () => {
    const f = await makeSalonFixture({ staffCount: 2 });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => book(f, 14 * 60, { staffId: null })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('enforces the overlap rule at the database level even if the service layer is bypassed', async () => {
    const f = await makeSalonFixture();
    await book(f, 10 * 60);
    const raw = db.insert(s.appointments).values({
      reference: 'BE-RAWINSRT', salonId: f.salon.id, serviceId: f.service.id, staffId: f.staff[0].id,
      guestName: 'x', guestPhone: '+251911111111', startAt: at(10 * 60 + 15), endAt: at(11 * 60 + 15),
      blockedUntil: at(11 * 60 + 15), priceEtb: '1.00', durationMinutes: 60, serviceName: 'x',
    });
    const err = (await raw.then(() => null, (e) => e)) as { code?: string; cause?: { code?: string } } | null;
    expect(err).not.toBeNull();
    expect(err?.code ?? err?.cause?.code).toBe('23P01');
  });

  it('uses a valid promotional price and ignores an expired one', async () => {
    const f = await makeSalonFixture();
    await db.update(s.services).set({ promoPriceEtb: '400.00', promoStartsAt: new Date('2029-12-01'), promoEndsAt: new Date('2030-02-01') }).where(eq(s.services.id, f.service.id));
    expect((await book(f, 10 * 60)).priceEtb).toBe('400.00');
    await db.update(s.services).set({ promoEndsAt: new Date('2029-12-15') }).where(eq(s.services.id, f.service.id));
    expect((await book(f, 11 * 60)).priceEtb).toBe('500.00');
  });
});

describe('status changes & cancellation policy', () => {
  it('lets customers cancel outside the policy window but not inside it', async () => {
    const f = await makeSalonFixture({ cancellationHours: 24 });
    const c = await makeUser();
    const a = await book(f, 10 * 60, { customerId: c.id });
    const inside = new Date(at(10 * 60).getTime() - 3 * 3600000);
    await expect(changeAppointmentStatus({ id: c.id, role: 'CUSTOMER' }, a.id, 'CANCELLED', { now: inside })).rejects.toMatchObject({ code: 'CANCELLATION_WINDOW_PASSED' });
    const outside = new Date(at(10 * 60).getTime() - 48 * 3600000);
    const res = await changeAppointmentStatus({ id: c.id, role: 'CUSTOMER' }, a.id, 'CANCELLED', { now: outside, note: 'Plans changed' });
    expect(res.status).toBe('CANCELLED');
    expect(res.cancelledReason).toBe('Plans changed');
  });

  it('lets the owner cancel at any time and notifies the customer', async () => {
    const f = await makeSalonFixture();
    const c = await makeUser();
    const a = await book(f, 10 * 60, { customerId: c.id });
    await changeAppointmentStatus({ id: f.owner.id, role: 'OWNER' }, a.id, 'CANCELLED', { now: new Date(at(10 * 60).getTime() - 600000) });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, c.id));
    expect(notes.some((n) => n.type === 'BOOKING_CANCELLED')).toBe(true);
  });

  it('hides other users’ appointments (no IDOR) and blocks customers from owner actions', async () => {
    const f = await makeSalonFixture({ bookingMode: 'APPROVAL' });
    const mine = await makeUser();
    const stranger = await makeUser();
    const otherOwner = await makeUser('OWNER');
    const a = await book(f, 10 * 60, { customerId: mine.id });
    await expect(changeAppointmentStatus({ id: stranger.id, role: 'CUSTOMER' }, a.id, 'CANCELLED', { now: NOW })).rejects.toMatchObject({ status: 404 });
    await expect(changeAppointmentStatus({ id: otherOwner.id, role: 'OWNER' }, a.id, 'CONFIRMED', { now: NOW })).rejects.toMatchObject({ status: 404 });
    await expect(changeAppointmentStatus({ id: mine.id, role: 'CUSTOMER' }, a.id, 'CONFIRMED', { now: NOW })).rejects.toMatchObject({ status: 403 });
  });

  it('follows the state machine and cannot complete future appointments', async () => {
    const f = await makeSalonFixture({ bookingMode: 'APPROVAL' });
    const owner = { id: f.owner.id, role: 'OWNER' as const };
    const a = await book(f, 10 * 60);
    await expect(changeAppointmentStatus(owner, a.id, 'COMPLETED', { now: NOW })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await changeAppointmentStatus(owner, a.id, 'CONFIRMED', { now: NOW });
    await expect(changeAppointmentStatus(owner, a.id, 'COMPLETED', { now: NOW })).rejects.toMatchObject({ code: 'TOO_EARLY' });
    const after = new Date(at(12 * 60).getTime());
    await expect(changeAppointmentStatus(owner, a.id, 'COMPLETED', { now: after })).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(changeAppointmentStatus(owner, a.id, 'CANCELLED', { now: after })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('writes a status history trail', async () => {
    const f = await makeSalonFixture({ bookingMode: 'APPROVAL' });
    const owner = { id: f.owner.id, role: 'OWNER' as const };
    const a = await book(f, 10 * 60);
    await changeAppointmentStatus(owner, a.id, 'REJECTED', { now: NOW, note: 'Fully booked' });
    const hist = await db.select().from(s.appointmentStatusHistory).where(eq(s.appointmentStatusHistory.appointmentId, a.id));
    expect(hist.map((h) => h.toStatus).sort()).toEqual(['PENDING', 'REJECTED']);
  });
});

describe('rescheduling', () => {
  it('moves a booking, excluding its own old window, and rejects occupied times', async () => {
    const f = await makeSalonFixture();
    const owner = { id: f.owner.id, role: 'OWNER' as const };
    const a = await book(f, 10 * 60);
    await book(f, 12 * 60);
    const moved = await rescheduleAppointment(owner, a.id, { startAt: at(10 * 60 + 30), now: NOW }); // overlaps its own old window
    expect(moved.startAt.getTime()).toBe(at(10 * 60 + 30).getTime());
    await expect(rescheduleAppointment(owner, a.id, { startAt: at(12 * 60), now: NOW })).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });
});

describe('reviews', () => {
  it('only lets the booking’s customer review a completed appointment, once', async () => {
    const f = await makeSalonFixture();
    const c = await makeUser();
    const other = await makeUser();
    const a = await book(f, 10 * 60, { customerId: c.id });
    await expect(createReview(c.id, a.id, 5, 'Great')).rejects.toMatchObject({ code: 'NOT_REVIEWABLE' });
    await changeAppointmentStatus({ id: f.owner.id, role: 'OWNER' }, a.id, 'COMPLETED', { now: at(12 * 60) });
    await expect(createReview(other.id, a.id, 5)).rejects.toMatchObject({ status: 404 });
    await createReview(c.id, a.id, 4, 'Lovely');
    await expect(createReview(c.id, a.id, 5)).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
    const [salon] = await db.select().from(s.salons).where(eq(s.salons.id, f.salon.id));
    expect(salon.reviewCount).toBe(1);
    expect(Number(salon.avgRating)).toBe(4);
  });

  it('rejects out-of-range ratings at the database level', async () => {
    const f = await makeSalonFixture();
    const c = await makeUser();
    const a = await book(f, 10 * 60, { customerId: c.id });
    await expect(db.insert(s.reviews).values({ appointmentId: a.id, salonId: f.salon.id, userId: c.id, rating: 9 })).rejects.toThrow();
  });
});

describe('payments', () => {
  it('records partial then full cash payments and rejects overpayment', async () => {
    const f = await makeSalonFixture({ price: '500.00' });
    const owner = { id: f.owner.id, role: 'OWNER' as const };
    const a = await book(f, 10 * 60);
    await recordCashPayment(owner, a.id, '200.00');
    let [row] = await db.select().from(s.appointments).where(eq(s.appointments.id, a.id));
    expect(row.paymentStatus).toBe('PENDING');
    await expect(recordCashPayment(owner, a.id, '400.00')).rejects.toMatchObject({ code: 'OVERPAYMENT' });
    await recordCashPayment(owner, a.id, '300.00');
    [row] = await db.select().from(s.appointments).where(eq(s.appointments.id, a.id));
    expect(row.paymentStatus).toBe('PAID');
  });

  it('refuses payments on cancelled/unconfirmed appointments, bad amounts and foreign owners', async () => {
    const f = await makeSalonFixture({ bookingMode: 'APPROVAL' });
    const owner = { id: f.owner.id, role: 'OWNER' as const };
    const a = await book(f, 10 * 60);
    await expect(recordCashPayment(owner, a.id, '100.00')).rejects.toMatchObject({ code: 'INVALID_PAYMENT_STATE' });
    await changeAppointmentStatus(owner, a.id, 'CONFIRMED', { now: NOW });
    await expect(recordCashPayment(owner, a.id, '0')).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    const stranger = await makeUser('OWNER');
    await expect(recordCashPayment({ id: stranger.id, role: 'OWNER' }, a.id, '100.00')).rejects.toMatchObject({ status: 404 });
  });
});
