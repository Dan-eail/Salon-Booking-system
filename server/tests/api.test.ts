import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import * as s from '../src/db/schema.js';
import { addDaysStr, todayLocal } from '../src/lib/time.js';
import { sendDueReminders } from '../src/services/reminders.js';
import { closeDb, makeCategory, makeSalonFixture, makeUser } from './helpers.js';

afterAll(closeDb);
const app = createApp();
const api = () => request(app);

async function tokenFor(user: { email: string }) {
  const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Test@12345' });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** First bookable slot for the fixture service a few days out. */
async function firstSlot(f: Awaited<ReturnType<typeof makeSalonFixture>>, daysAhead = 3) {
  const date = addDaysStr(todayLocal(), daysAhead);
  const res = await api().get(`/api/v1/salons/${f.salon.slug}/availability`).query({ serviceId: f.service.id, date });
  expect(res.status).toBe(200);
  expect(res.body.data.slots.length).toBeGreaterThan(0);
  return res.body.data.slots[0] as { startAt: string; staffIds: string[] };
}

describe('authentication', () => {
  const email = `reg-${Date.now()}@test.local`;
  const rnd = () => String(Math.floor(1000000 + Math.random() * 8999999));
  const phone = `091${rnd()}`;
  it('registers a customer, normalises the phone and never exposes the hash', async () => {
    const res = await api().post('/api/v1/auth/register').send({ fullName: 'Hana Bekele', email, phone: `${phone.slice(0, 4)} ${phone.slice(4)}`, password: 'Secret123' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.phone).toBe(`+251${phone.slice(1)}`);
    expect(res.body.data.user.role).toBe('CUSTOMER');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/refresh_token=.*HttpOnly/i);
  });
  it('rejects duplicates, weak passwords, bad phones and privileged roles (mass assignment)', async () => {
    const dup = await api().post('/api/v1/auth/register').send({ fullName: 'Hana B', email, phone: `091${rnd()}`, password: 'Secret123' });
    expect(dup.status).toBe(409);
    const weak = await api().post('/api/v1/auth/register').send({ fullName: 'Hana B', email: 'x1@test.local', phone: `091${rnd()}`, password: 'short' });
    expect(weak.status).toBe(400);
    const badPhone = await api().post('/api/v1/auth/register').send({ fullName: 'Hana B', email: 'x2@test.local', phone: '12345', password: 'Secret123' });
    expect(badPhone.status).toBe(400);
    const admin = await api().post('/api/v1/auth/register').send({ fullName: 'Evil', email: 'x3@test.local', phone: `091${rnd()}`, password: 'Secret123', role: 'ADMIN' });
    expect(admin.status).toBe(400);
  });
  it('logs in with correct credentials only, and /me needs a token', async () => {
    expect((await api().post('/api/v1/auth/login').send({ email, password: 'wrong-pass1' })).status).toBe(401);
    const ok = await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' });
    expect(ok.status).toBe(200);
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(auth(ok.body.data.accessToken))).body.data.user.email).toBe(email);
  });
  it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email, password: 'Secret123' });
    const oldCookie = (await agent.post('/api/v1/auth/login').send({ email, password: 'Secret123' })).headers['set-cookie'] as unknown as string[];
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie).set('X-Requested-With', 'belle');
    expect(first.status).toBe(200);
    // Replaying the already-rotated cookie is treated as theft.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie).set('X-Requested-With', 'belle');
    expect(replay.status).toBe(401);
    // CSRF header is mandatory.
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status).toBe(400);
  });
  it('deactivated accounts lose access immediately', async () => {
    const u = await makeUser('CUSTOMER');
    const t = await tokenFor(u);
    await db.update(s.users).set({ isActive: false }).where(eq(s.users.id, u.id));
    expect((await api().get('/api/v1/auth/me').set(auth(t))).status).toBe(401);
  });
  it('password reset works once and is silent about unknown emails', async () => {
    const u = await makeUser('CUSTOMER');
    const unknown = await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.local' });
    const known = await api().post('/api/v1/auth/forgot-password').send({ email: u.email });
    expect(unknown.body.data.message).toBe(known.body.data.message);
    const token = known.body.data.devOnlyResetToken as string;
    expect(token).toBeTruthy();
    expect((await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'Brand2new' })).status).toBe(200);
    expect((await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'Another3pw' })).status).toBe(400);
    expect((await api().post('/api/v1/auth/login').send({ email: u.email, password: 'Brand2new' })).status).toBe(200);
  });
});

describe('role-based access', () => {
  it('blocks customers from owner and admin routes, and anonymous users from everything private', async () => {
    const f = await makeSalonFixture();
    const customer = await tokenFor(await makeUser('CUSTOMER'));
    expect((await api().get('/api/v1/owner/salons')).status).toBe(401);
    expect((await api().get('/api/v1/owner/salons').set(auth(customer))).status).toBe(403);
    expect((await api().get(`/api/v1/owner/salons/${f.salon.id}/profile`).set(auth(customer))).status).toBe(403);
    expect((await api().get('/api/v1/admin/users').set(auth(customer))).status).toBe(403);
    expect((await api().get('/api/v1/me/appointments')).status).toBe(401);
  });
  it('blocks owners from admin routes', async () => {
    const f = await makeSalonFixture();
    expect((await api().get('/api/v1/admin/overview').set(auth(await tokenFor(f.owner)))).status).toBe(403);
  });
  it('lets an owner manage only their own salon (cross-salon access looks like 404)', async () => {
    const a = await makeSalonFixture();
    const b = await makeSalonFixture();
    const ta = await tokenFor(a.owner);
    expect((await api().get(`/api/v1/owner/salons/${a.salon.id}/profile`).set(auth(ta))).status).toBe(200);
    expect((await api().get(`/api/v1/owner/salons/${b.salon.id}/profile`).set(auth(ta))).status).toBe(404);
    expect((await api().patch(`/api/v1/owner/salons/${b.salon.id}/profile`).set(auth(ta)).send({ name: 'Hijacked' })).status).toBe(404);
    // A service id from another salon cannot be edited through my own salon path.
    const cross = await api().patch(`/api/v1/owner/salons/${a.salon.id}/services/${b.service.id}`).set(auth(ta)).send({ name: 'Hijacked' });
    expect(cross.status).toBe(404);
    const [still] = await db.select().from(s.services).where(eq(s.services.id, b.service.id));
    expect(still.name).toBe('Test Service');
  });
  it('limits staff to day-to-day work: no profile/service edits, only their own diary', async () => {
    const f = await makeSalonFixture({ staffCount: 2 });
    const staffUser = await makeUser('STAFF');
    await db.update(s.staffProfiles).set({ userId: staffUser.id }).where(eq(s.staffProfiles.id, f.staff[0].id));
    const t = await tokenFor(staffUser);
    expect((await api().get(`/api/v1/owner/salons/${f.salon.id}/overview`).set(auth(t))).status).toBe(200);
    expect((await api().patch(`/api/v1/owner/salons/${f.salon.id}/profile`).set(auth(t)).send({ name: 'x y z' })).status).toBe(403);
    expect((await api().post(`/api/v1/owner/salons/${f.salon.id}/services`).set(auth(t)).send({})).status).toBe(403);
    // Booking into a colleague's column is refused.
    const slot = await firstSlot(f);
    const other = await api().post(`/api/v1/owner/salons/${f.salon.id}/appointments`).set(auth(t))
      .send({ serviceId: f.service.id, staffId: f.staff[1].id, startAt: slot.startAt, guestName: 'Walk In', guestPhone: '0911000111' });
    expect(other.status).toBe(403);
  });
  it('prevents admins from demoting themselves and revokes sessions on deactivation', async () => {
    const admin = await makeUser('ADMIN');
    const ta = await tokenFor(admin);
    expect((await api().patch(`/api/v1/admin/users/${admin.id}`).set(auth(ta)).send({ role: 'CUSTOMER' })).status).toBe(403);
    const victim = await makeUser('CUSTOMER');
    const tv = await tokenFor(victim);
    expect((await api().patch(`/api/v1/admin/users/${victim.id}`).set(auth(ta)).send({ isActive: false })).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(auth(tv))).status).toBe(401);
    const log = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, victim.id));
    expect(log.some((l) => l.action === 'admin.user_update')).toBe(true);
  });
});

describe('service management', () => {
  it('creates, validates, updates, unpublishes and deletes services', async () => {
    const f = await makeSalonFixture();
    const t = await tokenFor(f.owner);
    const base = `/api/v1/owner/salons/${f.salon.id}/services`;
    const bad = await api().post(base).set(auth(t)).send({ name: 'A', categoryId: f.cat.id, priceEtb: '-5', durationMinutes: 2 });
    expect(bad.status).toBe(400);
    const mass = await api().post(base).set(auth(t)).send({ name: 'Gel Manicure', categoryId: f.cat.id, priceEtb: 800, durationMinutes: 45, salonId: 'x' });
    expect(mass.status).toBe(400); // strict schemas reject unknown fields
    const created = await api().post(base).set(auth(t)).send({ name: 'Gel Manicure', categoryId: f.cat.id, priceEtb: 800, durationMinutes: 45, staffIds: [f.staff[0].id] });
    expect(created.status).toBe(201);
    expect(created.body.data.priceEtb).toBe('800.00');
    const id = created.body.data.id as string;
    const promoBad = await api().patch(`${base}/${id}`).set(auth(t)).send({ promoPriceEtb: '900', promoStartsAt: '2030-01-01T00:00:00Z', promoEndsAt: '2030-02-01T00:00:00Z' });
    expect(promoBad.status).toBe(400);
    const promoOk = await api().patch(`${base}/${id}`).set(auth(t)).send({ promoPriceEtb: '600', promoStartsAt: '2030-01-01T00:00:00Z', promoEndsAt: '2030-02-01T00:00:00Z' });
    expect(promoOk.status).toBe(200);
    expect((await api().patch(`${base}/${id}`).set(auth(t)).send({ isActive: false })).body.data.isActive).toBe(false);
    const detail = await api().get(`/api/v1/salons/${f.salon.slug}`);
    expect(detail.body.data.services.some((x: { id: string }) => x.id === id)).toBe(false); // unpublished => hidden
    const del = await api().delete(`${base}/${id}`).set(auth(t));
    expect(del.body.data.deleted).toBe(true);
  });
  it('unpublishes instead of deleting a service that has bookings', async () => {
    const f = await makeSalonFixture();
    const customer = await makeUser('CUSTOMER');
    const slot = await firstSlot(f);
    const book = await api().post('/api/v1/me/appointments').set(auth(await tokenFor(customer)))
      .send({ salonId: f.salon.id, serviceId: f.service.id, staffId: null, startAt: slot.startAt, guestName: 'Meron A', guestPhone: '0922334455' });
    expect(book.status).toBe(201);
    const del = await api().delete(`/api/v1/owner/salons/${f.salon.id}/services/${f.service.id}`).set(auth(await tokenFor(f.owner)));
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ deleted: false, deactivated: true });
  });
  it('allows online/deposit payment modes when a real provider (Chapa) is connected', async () => {
    const f = await makeSalonFixture();
    const res = await api().patch(`/api/v1/owner/salons/${f.salon.id}/profile`).set(auth(await tokenFor(f.owner))).send({ paymentMode: 'DEPOSIT_REQUIRED' });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentMode).toBe('DEPOSIT_REQUIRED');
  });
});

describe('search and filtering (real data)', () => {
  it('filters by neighborhood, category, price range, rating and text; sorts by price', async () => {
    const cat = await makeCategory();
    const mk = async (hood: string, price: string, name: string, rating: string, reviews: number) => {
      const f = await makeSalonFixture({ price });
      await db.update(s.salons).set({ neighborhood: hood, name, avgRating: rating, reviewCount: reviews }).where(eq(s.salons.id, f.salon.id));
      await db.update(s.services).set({ categoryId: cat.id }).where(eq(s.services.id, f.service.id));
      return f;
    };
    const cheap = await mk('Kazanchis', '300.00', 'Qa Cheap Studio', '3.5', 4);
    const mid = await mk('Kazanchis', '700.00', 'Qa Mid Studio', '4.6', 9);
    const dear = await mk('Piassa', '1500.00', 'Qa Dear Studio', '4.9', 20);
    const q = (p: Record<string, string>) => api().get('/api/v1/salons').query({ category: cat.slug, ...p });

    const all = await q({});
    expect(all.body.meta.total).toBe(3);
    expect(Object.fromEntries(all.body.data.map((x: { id: string; minPriceEtb: string }) => [x.id, x.minPriceEtb]))).toEqual({ [cheap.salon.id]: '300.00', [mid.salon.id]: '700.00', [dear.salon.id]: '1500.00' });
    expect((await q({ neighborhood: 'Kazanchis' })).body.data.map((x: { id: string }) => x.id).sort()).toEqual([cheap.salon.id, mid.salon.id].sort());
    expect((await q({ minPrice: '500', maxPrice: '1000' })).body.data.map((x: { id: string }) => x.id)).toEqual([mid.salon.id]);
    expect((await q({ minRating: '4.5' })).body.meta.total).toBe(2);
    expect((await q({ q: 'dear' })).body.data.map((x: { id: string }) => x.id)).toEqual([dear.salon.id]);
    expect((await q({ sort: 'price_asc' })).body.data.map((x: { id: string }) => x.id)).toEqual([cheap.salon.id, mid.salon.id, dear.salon.id]);
    expect((await q({ sort: 'price_desc' })).body.data[0].id).toBe(dear.salon.id);
    expect((await q({ sort: 'rating' })).body.data[0].id).toBe(dear.salon.id);
    expect((await q({ pageSize: '2' })).body.data).toHaveLength(2);
    expect((await q({ page: '2', pageSize: '2' })).body.data).toHaveLength(1);
    expect((await q({ q: 'zzzz-no-match' })).body.data).toHaveLength(0);
    expect((await q({ maxPrice: 'abc' })).status).toBe(400);
  });
  it('hides pending and suspended salons, and filters by real availability on a date', async () => {
    const open = await makeSalonFixture();
    const hidden = await makeSalonFixture();
    await db.update(s.salons).set({ status: 'SUSPENDED' }).where(eq(s.salons.id, hidden.salon.id));
    expect((await api().get(`/api/v1/salons/${hidden.salon.slug}`)).status).toBe(404);
    const date = addDaysStr(todayLocal(), 4);
    const found = await api().get('/api/v1/salons').query({ date, timeFrom: '09:00', timeTo: '10:00', q: open.salon.slug });
    expect(found.body.data.map((x: { id: string }) => x.id)).toContain(open.salon.id);
    const late = await api().get('/api/v1/salons').query({ date, timeFrom: '22:00', timeTo: '23:00', q: open.salon.slug });
    expect(late.body.data).toHaveLength(0);
  });
});

describe('booking journey over HTTP', () => {
  it('books, shows the booking, blocks the taken slot, cancels, and frees the slot', async () => {
    const f = await makeSalonFixture();
    const customer = await makeUser('CUSTOMER');
    const t = await tokenFor(customer);
    const slot = await firstSlot(f);
    const payload = { salonId: f.salon.id, serviceId: f.service.id, staffId: null, startAt: slot.startAt, guestName: 'Meron A', guestPhone: '0922334455' };

    expect((await api().post('/api/v1/me/appointments').send(payload)).status).toBe(401);
    const booked = await api().post('/api/v1/me/appointments').set(auth(t)).send(payload);
    expect(booked.status).toBe(201);
    expect(booked.body.data.reference).toMatch(/^BE-[A-Z2-9]{8}$/);
    expect(booked.body.data.status).toBe('CONFIRMED');
    expect(booked.body.data.guestPhone).toBe('+251922334455');
    expect(booked.body.data.ownerNotes).toBeUndefined(); // private owner fields never reach customers

    // Same time, another customer: refused. (Only one staff member.)
    const other = await tokenFor(await makeUser('CUSTOMER'));
    const clash = await api().post('/api/v1/me/appointments').set(auth(other)).send(payload);
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SLOT_UNAVAILABLE');
    // The slot disappeared from public availability.
    const date = slot.startAt.slice(0, 10);
    void date;
    const avail = await api().get(`/api/v1/salons/${f.salon.slug}/availability`).query({ serviceId: f.service.id, date: addDaysStr(todayLocal(), 3) });
    expect(avail.body.data.slots.some((x: { startAt: string }) => x.startAt === slot.startAt)).toBe(false);

    // Strangers can't read or cancel it.
    const id = booked.body.data.id as string;
    expect((await api().get(`/api/v1/me/appointments/${id}`).set(auth(other))).status).toBe(404);
    expect((await api().post(`/api/v1/me/appointments/${id}/cancel`).set(auth(other)).send({})).status).toBe(404);

    const list = await api().get('/api/v1/me/appointments').query({ tab: 'upcoming' }).set(auth(t));
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(id);

    const cancel = await api().post(`/api/v1/me/appointments/${id}/cancel`).set(auth(t)).send({ reason: 'Plans changed' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect((await api().post('/api/v1/me/appointments').set(auth(other)).send(payload)).status).toBe(201); // freed

    // Owner got notified about the booking and the cancellation.
    const alerts = await db.select().from(s.notifications).where(eq(s.notifications.userId, f.owner.id));
    expect(alerts.map((a) => a.type)).toEqual(expect.arrayContaining(['NEW_BOOKING_ALERT', 'BOOKING_CANCELLED']));
  });
  it('enforces the cancellation window over HTTP', async () => {
    const f = await makeSalonFixture({ cancellationHours: 24 * 30 });
    const t = await tokenFor(await makeUser('CUSTOMER'));
    const slot = await firstSlot(f);
    const b = await api().post('/api/v1/me/appointments').set(auth(t)).send({ salonId: f.salon.id, serviceId: f.service.id, startAt: slot.startAt, guestName: 'Meron A', guestPhone: '0922334455' });
    expect(b.body.data.canCancel).toBe(false);
    const res = await api().post(`/api/v1/me/appointments/${b.body.data.id}/cancel`).set(auth(t)).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CANCELLATION_WINDOW_PASSED');
  });
  it('validates booking input and refuses off-grid times', async () => {
    const f = await makeSalonFixture();
    const t = await tokenFor(await makeUser('CUSTOMER'));
    const slot = await firstSlot(f);
    const post = (over: Record<string, unknown>) => api().post('/api/v1/me/appointments').set(auth(t))
      .send({ salonId: f.salon.id, serviceId: f.service.id, startAt: slot.startAt, guestName: 'Meron A', guestPhone: '0922334455', ...over });
    expect((await post({ guestPhone: 'abc' })).status).toBe(400);
    expect((await post({ startAt: 'tomorrow' })).status).toBe(400);
    expect((await post({ salonId: 'nope' })).status).toBe(400);
    expect((await post({ startAt: new Date(Date.parse(slot.startAt) + 7 * 60000).toISOString() })).status).toBe(409);
    expect((await post({ customerId: 'x' })).status).toBe(400);
  });
  it('approval-mode salons create pending bookings that the owner confirms, then completes and the customer reviews once', async () => {
    const f = await makeSalonFixture({ bookingMode: 'APPROVAL' });
    const ct = await tokenFor(await makeUser('CUSTOMER'));
    const ot = await tokenFor(f.owner);
    const slot = await firstSlot(f);
    const b = await api().post('/api/v1/me/appointments').set(auth(ct)).send({ salonId: f.salon.id, serviceId: f.service.id, startAt: slot.startAt, guestName: 'Meron A', guestPhone: '0922334455' });
    expect(b.body.data.status).toBe('PENDING');
    const id = b.body.data.id as string;
    const base = `/api/v1/owner/salons/${f.salon.id}/appointments/${id}`;

    expect((await api().patch(`${base}/status`).set(auth(ct)).send({ status: 'CONFIRMED' })).status).toBe(403); // customers hit the owner area
    expect((await api().patch(`${base}/status`).set(auth(ot)).send({ status: 'CONFIRMED' })).body.data.status).toBe('CONFIRMED');
    // Cannot complete a future appointment.
    expect((await api().patch(`${base}/status`).set(auth(ot)).send({ status: 'COMPLETED' })).status).toBe(422);
    // Can't review before completion.
    expect((await api().post(`/api/v1/me/appointments/${id}/review`).set(auth(ct)).send({ rating: 5 })).status).toBe(422);

    // Fast-forward the appointment into the past to complete it (test-only data change).
    await db.update(s.appointments).set({ startAt: new Date(Date.now() - 3 * 3600000), endAt: new Date(Date.now() - 2 * 3600000), blockedUntil: new Date(Date.now() - 2 * 3600000) }).where(eq(s.appointments.id, id));
    expect((await api().patch(`${base}/status`).set(auth(ot)).send({ status: 'COMPLETED' })).status).toBe(200);

    // Cash payments: partial, then overpayment rejected.
    expect((await api().post(`${base}/payments`).set(auth(ot)).send({ amountEtb: '200' })).status).toBe(201);
    const over = await api().post(`${base}/payments`).set(auth(ot)).send({ amountEtb: '400' });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('OVERPAYMENT');
    expect((await api().get(base).set(auth(ot))).body.data.outstandingEtb).toBe('300.00');

    const review = await api().post(`/api/v1/me/appointments/${id}/review`).set(auth(ct)).send({ rating: 5, comment: 'Lovely service, thank you!' });
    expect(review.status).toBe(201);
    expect((await api().post(`/api/v1/me/appointments/${id}/review`).set(auth(ct)).send({ rating: 1 })).status).toBe(409); // no duplicates
    expect((await api().post(`/api/v1/me/appointments/${id}/review`).set(auth(await tokenFor(await makeUser('CUSTOMER')))).send({ rating: 1 })).status).toBe(404);
    const [salon] = await db.select().from(s.salons).where(eq(s.salons.id, f.salon.id));
    expect(salon.reviewCount).toBe(1);
    expect(Number(salon.avgRating)).toBe(5);

    // History trail is complete.
    const detail = await api().get(base).set(auth(ot));
    expect(detail.body.data.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'CONFIRMED', 'COMPLETED']);
  });
  it('lets owners create manual appointments without double-booking', async () => {
    const f = await makeSalonFixture();
    const ot = await tokenFor(f.owner);
    const slot = await firstSlot(f);
    const body = { serviceId: f.service.id, startAt: slot.startAt, guestName: 'Walk In', guestPhone: '0911000111' };
    const url = `/api/v1/owner/salons/${f.salon.id}/appointments`;
    const first = await api().post(url).set(auth(ot)).send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.createdByOwner).toBe(true);
    expect((await api().post(url).set(auth(ot)).send(body)).status).toBe(409);
    const list = await api().get(url).set(auth(ot)).query({ from: addDaysStr(todayLocal(), 3), to: addDaysStr(todayLocal(), 3) });
    expect(list.body.data).toHaveLength(1);
  });
});

describe('favorites, notifications and reminders', () => {
  it('toggles favorites and reflects them in search', async () => {
    const f = await makeSalonFixture();
    const t = await tokenFor(await makeUser('CUSTOMER'));
    expect((await api().put(`/api/v1/me/favorites/${f.salon.id}`).set(auth(t))).status).toBe(200);
    expect((await api().put(`/api/v1/me/favorites/${f.salon.id}`).set(auth(t))).status).toBe(200); // idempotent
    expect((await api().get('/api/v1/me/favorites').set(auth(t))).body.data).toHaveLength(1);
    expect((await api().get(`/api/v1/salons/${f.salon.slug}`).set(auth(t))).body.data.isFavorite).toBe(true);
    await api().delete(`/api/v1/me/favorites/${f.salon.id}`).set(auth(t));
    expect((await api().get('/api/v1/me/favorites').set(auth(t))).body.data).toHaveLength(0);
  });
  it('marks only my own notifications read', async () => {
    const a = await makeUser('CUSTOMER'), b = await makeUser('CUSTOMER');
    const [n] = await db.insert(s.notifications).values({ userId: a.id, type: 'SYSTEM', title: 't', body: 'b' }).returning();
    const tb = await tokenFor(b);
    expect((await api().post(`/api/v1/me/notifications/${n.id}/read`).set(auth(tb))).body.data.updated).toBe(0);
    const ta = await tokenFor(a);
    const list = await api().get('/api/v1/me/notifications').set(auth(ta));
    expect(list.body.meta.unreadCount).toBe(1);
    await api().post('/api/v1/me/notifications/read-all').set(auth(ta));
    expect((await api().get('/api/v1/me/notifications').set(auth(ta))).body.meta.unreadCount).toBe(0);
  });
  it('sends each due reminder exactly once', async () => {
    const f = await makeSalonFixture();
    const c = await makeUser('CUSTOMER');
    const [a] = await db.insert(s.appointments).values({
      reference: `BE-REM${Math.floor(Math.random() * 1e5)}`, salonId: f.salon.id, serviceId: f.service.id, staffId: f.staff[0].id, customerId: c.id, guestName: 'G', guestPhone: '+251911111111',
      startAt: new Date(Date.now() + 5 * 3600000), endAt: new Date(Date.now() + 6 * 3600000), blockedUntil: new Date(Date.now() + 6 * 3600000), status: 'CONFIRMED', priceEtb: '500.00', durationMinutes: 60, serviceName: 'Test Service',
    }).returning();
    expect(await sendDueReminders()).toBeGreaterThanOrEqual(1);
    expect(await sendDueReminders()).toBe(0);
    const n = await db.select().from(s.notifications).where(eq(s.notifications.userId, c.id));
    expect(n.filter((x) => x.type === 'BOOKING_REMINDER')).toHaveLength(1);
    void a;
  });
});

describe('payments with Chapa integration', () => {
  it('initiates 50% deposit payment via Chapa and refuses unconfigured provider webhooks', async () => {
    const f = await makeSalonFixture();
    const c = await makeUser('CUSTOMER');
    const t = await tokenFor(c);
    const slot = await firstSlot(f);
    const b = await api().post('/api/v1/me/appointments').set(auth(t)).send({ salonId: f.salon.id, serviceId: f.service.id, startAt: slot.startAt, guestName: 'Meron A', guestPhone: '0922334455' });
    const pay = await api().post(`/api/v1/me/appointments/${b.body.data.id}/pay`).set(auth(t));
    expect(pay.status).toBe(200);
    expect(pay.body.data.provider).toBe('CHAPA');
    expect(pay.body.data.depositPercent).toBe(50);
    // Unconfigured provider refuses with 501
    const hook = await api().post('/api/v1/webhooks/unsupported-bank').set('Content-Type', 'application/json').send('{"status":"PAID"}');
    expect(hook.status).toBe(501);
    const meta = await api().get('/api/v1/meta');
    const providers = meta.body.data.payments as { provider: string; status: string }[];
    expect(providers.find((p) => p.provider === 'CHAPA')?.status).toBe('working');
    expect(meta.body.data.notificationChannels.find((c2: { channel: string }) => c2.channel === 'sms').status).toBe('not_configured');
  });
});

describe('admin workflows', () => {
  it('approves salons (needs a service), verifies real ones only, hides reviews and recomputes ratings', async () => {
    const admin = await tokenFor(await makeUser('ADMIN'));
    const f = await makeSalonFixture();
    await db.update(s.salons).set({ status: 'PENDING', isDemo: false }).where(eq(s.salons.id, f.salon.id));
    expect((await api().patch(`/api/v1/admin/salons/${f.salon.id}/status`).set(auth(admin)).send({ status: 'ACTIVE' })).status).toBe(200);
    expect((await api().patch(`/api/v1/admin/salons/${f.salon.id}/verify`).set(auth(admin)).send({ isVerified: true })).status).toBe(200);
    const demo = await makeSalonFixture();
    const dv = await api().patch(`/api/v1/admin/salons/${demo.salon.id}/verify`).set(auth(admin)).send({ isVerified: true });
    expect(dv.status).toBe(422);

    const empty = await makeSalonFixture();
    await db.update(s.services).set({ isActive: false }).where(eq(s.services.salonId, empty.salon.id));
    expect((await api().patch(`/api/v1/admin/salons/${empty.salon.id}/status`).set(auth(admin)).send({ status: 'ACTIVE' })).status).toBe(422);

    // Moderation
    const c = await makeUser('CUSTOMER');
    const [a] = await db.insert(s.appointments).values({
      reference: `BE-MOD${Math.floor(Math.random() * 1e5)}`, salonId: f.salon.id, serviceId: f.service.id, staffId: f.staff[0].id, customerId: c.id, guestName: 'G', guestPhone: '+251911111111',
      startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000), blockedUntil: new Date(Date.now() - 3600000), status: 'COMPLETED', priceEtb: '500.00', durationMinutes: 60, serviceName: 'Test Service',
    }).returning();
    const ct = await tokenFor(c);
    const rv = await api().post(`/api/v1/me/appointments/${a.id}/review`).set(auth(ct)).send({ rating: 2, comment: 'Not great at all, honestly.' });
    expect((await db.select().from(s.salons).where(eq(s.salons.id, f.salon.id)))[0].reviewCount).toBe(1);
    await api().patch(`/api/v1/admin/reviews/${rv.body.data.id}`).set(auth(admin)).send({ isHidden: true });
    const [after] = await db.select().from(s.salons).where(eq(s.salons.id, f.salon.id));
    expect(after.reviewCount).toBe(0);
    expect(Number(after.avgRating)).toBe(0);
  });
  it('manages categories (in-use ones cannot be deleted) and promotions', async () => {
    const admin = await tokenFor(await makeUser('ADMIN'));
    const slug = `qa-${Math.random().toString(36).slice(2, 8)}`;
    const cat = await api().post('/api/v1/admin/categories').set(auth(admin)).send({ slug, name: 'QA Category' });
    expect(cat.status).toBe(201);
    expect((await api().post('/api/v1/admin/categories').set(auth(admin)).send({ slug, name: 'Again' })).status).toBe(409);
    expect((await api().post('/api/v1/admin/categories').set(auth(admin)).send({ slug: 'Bad Slug', name: 'x y' })).status).toBe(400);
    const f = await makeSalonFixture();
    await db.update(s.services).set({ categoryId: cat.body.data.id }).where(eq(s.services.id, f.service.id));
    expect((await api().delete(`/api/v1/admin/categories/${cat.body.data.id}`).set(auth(admin))).status).toBe(409);

    const promo = await api().post('/api/v1/admin/promotions').set(auth(admin)).send({ title: 'Timkat Glow', type: 'PERCENT', value: '15', startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-20T00:00:00Z' });
    expect(promo.status).toBe(201);
    expect((await api().post('/api/v1/admin/promotions').set(auth(admin)).send({ title: 'Too much', type: 'PERCENT', value: '150', startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-20T00:00:00Z' })).status).toBe(400);
    expect((await api().post('/api/v1/admin/promotions').set(auth(admin)).send({ title: 'Backwards', type: 'FIXED', value: '50', startsAt: '2030-02-01T00:00:00Z', endsAt: '2030-01-20T00:00:00Z' })).status).toBe(400);
    expect((await api().get('/api/v1/admin/audit').set(auth(admin)).query({ action: 'admin.category' })).body.data.length).toBeGreaterThan(0);
    expect((await api().get('/api/v1/admin/overview').set(auth(admin))).status).toBe(200);
  });
});

describe('reports', () => {
  it('separates booking value from recorded revenue and protects CSVs against formula injection', async () => {
    const f = await makeSalonFixture();
    const ot = await tokenFor(f.owner);
    const day = addDaysStr(todayLocal(), -2);
    const mk = (n: number, status: s.AppointmentStatus, price: string, name = 'Guest') => db.insert(s.appointments).values({
      reference: `BE-RPT${n}${Math.floor(Math.random() * 1e4)}`, salonId: f.salon.id, serviceId: f.service.id, staffId: f.staff[0].id, guestName: name, guestPhone: '+251911111111',
      startAt: new Date(`${day}T08:00:00Z`.replace('08', String(8 + n).padStart(2, '0'))), endAt: new Date(`${day}T09:00:00Z`.replace('09', String(9 + n).padStart(2, '0'))),
      blockedUntil: new Date(`${day}T09:00:00Z`.replace('09', String(9 + n).padStart(2, '0'))), status, priceEtb: price, durationMinutes: 60, serviceName: 'Test Service',
    }).returning();
    const [done] = await mk(0, 'COMPLETED', '500.00', '=HYPERLINK("http://evil")');
    await mk(1, 'CONFIRMED', '300.00');
    await mk(2, 'CANCELLED', '999.00');
    await db.insert(s.payments).values({ appointmentId: done.id, provider: 'CASH_AT_SALON', status: 'PAID', amountEtb: '200.00', paidAt: new Date(`${day}T10:00:00Z`) });

    const res = await api().get(`/api/v1/owner/salons/${f.salon.id}/reports/summary`).set(auth(ot)).query({ from: day, to: day });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.totals).toMatchObject({ total: 3, completed: 1, confirmed: 1, cancelled: 1 });
    expect(d.bookingValueEtb).toBe('800.00'); // confirmed + completed only
    expect(d.recordedRevenueEtb).toBe('200.00'); // actual payments only
    expect(d.rates.cancellationPct).toBeCloseTo(33.3, 1);
    expect(d.staffUtilization[0].bookedHours).toBe(2);
    expect(d.byDay[0].count).toBe(2);

    const csv = await api().get(`/api/v1/owner/salons/${f.salon.id}/reports/export.csv`).set(auth(ot)).query({ from: day, to: day });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain("'=HYPERLINK"); // neutralised
    expect(csv.text).not.toMatch(/,=HYPERLINK/);
    expect((await api().get(`/api/v1/owner/salons/${f.salon.id}/reports/summary`).set(auth(ot)).query({ from: day, to: '2000-01-01' })).status).toBe(400);
  });
});

describe('platform hygiene', () => {
  it('serves OpenAPI docs, returns JSON 404s and rejects malformed JSON', async () => {
    const spec = await api().get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(Object.keys(spec.body.paths).length).toBeGreaterThan(50);
    expect((await api().get('/api/docs/')).status).toBe(200);
    const nf = await api().get('/api/v1/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.success).toBe(false);
    expect((await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad')).status).toBe(400);
    expect((await api().get('/api/v1/health')).headers['x-powered-by']).toBeUndefined();
    expect((await api().get('/api/v1/health')).headers['x-content-type-options']).toBe('nosniff');
  });
  it('accepts only real images on upload and strips them to webp', async () => {
    const f = await makeSalonFixture();
    const t = await tokenFor(f.owner);
    const url = `/api/v1/owner/salons/${f.salon.id}/images`;
    const fake = await api().post(url).set(auth(t)).attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const gif = await api().post(url).set(auth(t)).attach('image', Buffer.from('GIF89a'), { filename: 'x.gif', contentType: 'image/gif' });
    expect(gif.status).toBe(400);
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#7a2e4a' } }).png().toBuffer();
    const good = await api().post(url).set(auth(t)).attach('image', png, { filename: 'salon.png', contentType: 'image/png' });
    expect(good.status).toBe(201);
    expect(good.body.data.url).toMatch(/^\/uploads\/.+\.webp$/);
    const served = await api().get(good.body.data.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect((await api().delete(`${url}/${good.body.data.id}`).set(auth(t))).status).toBe(200);
  });
});

describe('media and professional selection', () => {
  it('serves salon imagery, service thumbnails and staff avatars in public endpoints', async () => {
    const f = await makeSalonFixture({ staffCount: 2 });
    // Update salon cover, service image, and staff avatar
    await db.update(s.salons).set({ coverImage: '/images/salons/test.jpg' }).where(eq(s.salons.id, f.salon.id));
    await db.update(s.services).set({ imageUrl: '/images/services/test.jpg' }).where(eq(s.services.id, f.service.id));
    await db.update(s.staffProfiles).set({ avatarUrl: '/images/staff/test.jpg', title: 'Lead Stylist', specialties: ['Hair', 'Nails'] }).where(eq(s.staffProfiles.id, f.staff[0].id));

    // List endpoint
    const list = await api().get('/api/v1/salons').query({ q: f.salon.name });
    expect(list.status).toBe(200);
    const found = list.body.data.find((x: { id: string }) => x.id === f.salon.id);
    expect(found).toBeDefined();
    expect(found.image).toBe('/images/salons/test.jpg');

    // Detail endpoint
    const detail = await api().get(`/api/v1/salons/${f.salon.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.coverImage).toBe('/images/salons/test.jpg');
    const svc = detail.body.data.services.find((x: { id: string }) => x.id === f.service.id);
    expect(svc).toBeDefined();
    expect(svc.imageUrl).toBe('/images/services/test.jpg');

    const stf = detail.body.data.staff.find((x: { id: string }) => x.id === f.staff[0].id);
    expect(stf).toBeDefined();
    expect(stf.avatarUrl).toBe('/images/staff/test.jpg');
    expect(stf.title).toBe('Lead Stylist');
    expect(stf.specialties).toEqual(['Hair', 'Nails']);

    // Popular services endpoint includes imageUrl
    const pop = await api().get('/api/v1/popular-services');
    expect(pop.status).toBe(200);
    expect(Array.isArray(pop.body.data)).toBe(true);
  });

  it('allows clients to filter open times by a specific professional and book with them', async () => {
    const f = await makeSalonFixture({ staffCount: 2 });
    const customer = await makeUser('CUSTOMER');
    const t = await tokenFor(customer);

    const date = addDaysStr(todayLocal(), 4);
    const staff0Id = f.staff[0].id;
    const staff1Id = f.staff[1].id;

    // Check availability specifically for staff 0
    const availStaff0 = await api().get(`/api/v1/salons/${f.salon.slug}/availability`).query({ serviceId: f.service.id, date, staffId: staff0Id });
    expect(availStaff0.status).toBe(200);
    expect(availStaff0.body.data.slots.length).toBeGreaterThan(0);
    const slot0 = availStaff0.body.data.slots[0];
    expect(slot0.staffIds).toContain(staff0Id);

    // Book specifically with staff 0
    const res0 = await api().post('/api/v1/me/appointments').set(auth(t)).send({
      salonId: f.salon.id,
      serviceId: f.service.id,
      staffId: staff0Id,
      startAt: slot0.startAt,
      guestName: 'Sara K',
      guestPhone: '0911223344',
    });
    expect(res0.status).toBe(201);
    expect(res0.body.data.staffName).toBe(f.staff[0].displayName);

    // At the same time slot, booking specifically with staff 1 still succeeds because staff 1 is free
    const res1 = await api().post('/api/v1/me/appointments').set(auth(t)).send({
      salonId: f.salon.id,
      serviceId: f.service.id,
      staffId: staff1Id,
      startAt: slot0.startAt,
      guestName: 'Lensa M',
      guestPhone: '0922334455',
    });
    expect(res1.status).toBe(201);
    expect(res1.body.data.staffName).toBe(f.staff[1].displayName);

    // A third booking at the same time with staff 0 must fail (already booked)
    const resFail = await api().post('/api/v1/me/appointments').set(auth(t)).send({
      salonId: f.salon.id,
      serviceId: f.service.id,
      staffId: staff0Id,
      startAt: slot0.startAt,
      guestName: 'Tigist B',
      guestPhone: '0933445566',
    });
    expect(resFail.status).toBe(409);
    expect(resFail.body.error.code).toBe('SLOT_UNAVAILABLE');
  });
});

