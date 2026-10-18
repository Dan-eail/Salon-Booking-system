import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import * as s from '../src/db/schema.js';
import { addDaysStr, todayLocal } from '../src/lib/time.js';
import { closeDb, makeSalonFixture, makeUser } from './helpers.js';

afterAll(closeDb);
const app = createApp();
const api = () => request(app);

async function tokenFor(user: { email: string }) {
  const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Test@12345' });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function firstSlot(f: Awaited<ReturnType<typeof makeSalonFixture>>, daysAhead = 3) {
  const date = addDaysStr(todayLocal(), daysAhead);
  const res = await api().get(`/api/v1/salons/${f.salon.slug}/availability`).query({ serviceId: f.service.id, date });
  expect(res.status).toBe(200);
  expect(res.body.data.slots.length).toBeGreaterThan(0);
  return res.body.data.slots[0] as { startAt: string; staffIds: string[] };
}

describe('Ethiopian Payment Integration (Chapa, Telebirr, CBE Birr)', () => {
  it('reports Chapa and Telebirr as working payment providers on /meta', async () => {
    const res = await api().get('/api/v1/meta');
    expect(res.status).toBe(200);
    const providers = res.body.data.payments as { provider: string; status: string }[];
    const chapa = providers.find((p) => p.provider === 'CHAPA');
    const telebirr = providers.find((p) => p.provider === 'TELEBIRR');
    const cbe = providers.find((p) => p.provider === 'CBE_BIRR');

    expect(chapa).toBeDefined();
    expect(chapa?.status).toBe('working');
    expect(telebirr?.status).toBe('working');
    expect(cbe?.status).toBe('working');
  });

  it('initiates 50% deposit payment via Chapa and generates tx_ref', async () => {
    const f = await makeSalonFixture({ price: '600.00' });
    // Update salon to require deposit
    await db.update(s.salons).set({ paymentMode: 'DEPOSIT_REQUIRED', depositPercent: 50 }).where(eq(s.salons.id, f.salon.id));

    const customer = await makeUser('CUSTOMER');
    const custToken = await tokenFor(customer);
    const slot = await firstSlot(f);

    // 1. Create booking
    const bookRes = await api()
      .post('/api/v1/me/appointments')
      .set(auth(custToken))
      .send({
        salonId: f.salon.id,
        serviceId: f.service.id,
        staffId: slot.staffIds[0],
        startAt: slot.startAt,
        guestName: 'Selamawit T.',
        guestPhone: '+251911223344',
      });
    expect(bookRes.status).toBe(201);
    const apptId = bookRes.body.data.id as string;

    // 2. Initiate 50% deposit payment
    const payRes = await api()
      .post(`/api/v1/me/appointments/${apptId}/pay`)
      .set(auth(custToken))
      .send({});

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.depositEtb).toBe('300.00'); // 50% of 600.00
    expect(payRes.body.data.totalEtb).toBe('600.00');
    expect(payRes.body.data.remainingEtb).toBe('300.00');
    expect(payRes.body.data.depositPercent).toBe(50);
    expect(payRes.body.data.provider).toBe('CHAPA');
    expect(payRes.body.data.checkoutUrl).toBeDefined();
    expect(payRes.body.data.txRef).toMatch(/^belle-/);

    // Verify pending payment in db
    const [pmt] = await db
      .select()
      .from(s.payments)
      .where(eq(s.payments.appointmentId, apptId));
    expect(pmt).toBeDefined();
    expect(pmt.provider).toBe('CHAPA');
    expect(pmt.amountEtb).toBe('300.00');
    expect(pmt.status).toBe('PENDING');
  });

  it('completes 50% deposit via simulation or verification and marks appointment partially paid', async () => {
    const f = await makeSalonFixture({ price: '500.00' });
    const customer = await makeUser('CUSTOMER');
    const custToken = await tokenFor(customer);
    const slot = await firstSlot(f);

    const bookRes = await api()
      .post('/api/v1/me/appointments')
      .set(auth(custToken))
      .send({
        salonId: f.salon.id,
        serviceId: f.service.id,
        staffId: slot.staffIds[0],
        startAt: slot.startAt,
        guestName: 'Dawit K.',
        guestPhone: '+251911556677',
      });
    const apptId = bookRes.body.data.id as string;

    const payInit = await api()
      .post(`/api/v1/me/appointments/${apptId}/pay`)
      .set(auth(custToken))
      .send({});
    expect(payInit.status).toBe(200);
    const txRef = payInit.body.data.txRef as string;

    // Simulate completion with Telebirr
    const simRes = await api()
      .post('/api/v1/me/appointments/simulate-payment')
      .set(auth(custToken))
      .send({
        appointmentId: apptId,
        txRef,
        method: 'Telebirr',
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.data.appointment.paymentStatus).toBe('PENDING'); // partially paid (50% deposit received)
    expect(simRes.body.data.appointment.payments).toHaveLength(1);
    expect(simRes.body.data.appointment.payments[0].amountEtb).toBe('250.00');
    expect(simRes.body.data.appointment.payments[0].provider).toBe('CHAPA');

    // Check customer and owner alerts
    const alerts = await db
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.userId, customer.id));
    expect(alerts.some((n) => n.type === 'SYSTEM')).toBe(true);
  });

  it('verifies Chapa payment status on verify endpoint', async () => {
    const f = await makeSalonFixture({ price: '400.00' });
    const customer = await makeUser('CUSTOMER');
    const custToken = await tokenFor(customer);
    const slot = await firstSlot(f);

    const bookRes = await api()
      .post('/api/v1/me/appointments')
      .set(auth(custToken))
      .send({
        salonId: f.salon.id,
        serviceId: f.service.id,
        staffId: slot.staffIds[0],
        startAt: slot.startAt,
        guestName: 'Bethlehem A.',
        guestPhone: '+251911998877',
      });
    const apptId = bookRes.body.data.id as string;

    const payInit = await api()
      .post(`/api/v1/me/appointments/${apptId}/pay`)
      .set(auth(custToken))
      .send({});
    const txRef = payInit.body.data.txRef as string;

    // Call verify endpoint
    const verifyRes = await api()
      .get(`/api/v1/me/appointments/${apptId}/pay/verify`)
      .set(auth(custToken))
      .query({ tx_ref: txRef });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.payments.length).toBeGreaterThanOrEqual(1);
    expect(verifyRes.body.data.payments[0].amountEtb).toBe('200.00'); // 50% deposit
  });

  it('handles Chapa webhook notifications to confirm deposit payments', async () => {
    const f = await makeSalonFixture({ price: '700.00' });
    const customer = await makeUser('CUSTOMER');
    const custToken = await tokenFor(customer);
    const slot = await firstSlot(f);

    const bookRes = await api()
      .post('/api/v1/me/appointments')
      .set(auth(custToken))
      .send({
        salonId: f.salon.id,
        serviceId: f.service.id,
        staffId: slot.staffIds[0],
        startAt: slot.startAt,
        guestName: 'Yonas M.',
        guestPhone: '+251911443322',
      });
    const apptId = bookRes.body.data.id as string;

    const payInit = await api()
      .post(`/api/v1/me/appointments/${apptId}/pay`)
      .set(auth(custToken))
      .send({});
    const txRef = payInit.body.data.txRef as string;

    // Send webhook from Chapa
    const webhookRes = await api()
      .post('/api/v1/webhooks/chapa')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          status: 'success',
          event: 'charge.success',
          tx_ref: txRef,
          amount: '350.00',
          currency: 'ETB',
          method: 'telebirr',
        }),
      );

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.success).toBe(true);

    // Verify appointment was updated
    const [appt] = await db
      .select()
      .from(s.appointments)
      .where(eq(s.appointments.id, apptId));
    expect(appt.paymentStatus).toBe('PENDING'); // 50% deposit confirmed

    const [pmt] = await db
      .select()
      .from(s.payments)
      .where(eq(s.payments.externalRef, txRef));
    expect(pmt.status).toBe('PAID');
    expect(pmt.amountEtb).toBe('350.00');
  });

  it('refuses payment initiation for appointments that do not belong to the user', async () => {
    const f = await makeSalonFixture();
    const customer1 = await makeUser('CUSTOMER');
    const customer2 = await makeUser('CUSTOMER');
    const cust1Token = await tokenFor(customer1);
    const cust2Token = await tokenFor(customer2);
    const slot = await firstSlot(f);

    const bookRes = await api()
      .post('/api/v1/me/appointments')
      .set(auth(cust1Token))
      .send({
        salonId: f.salon.id,
        serviceId: f.service.id,
        staffId: slot.staffIds[0],
        startAt: slot.startAt,
        guestName: 'User 1',
        guestPhone: '+251911000001',
      });
    const apptId = bookRes.body.data.id as string;

    const payRes = await api()
      .post(`/api/v1/me/appointments/${apptId}/pay`)
      .set(auth(cust2Token))
      .send({});
    expect(payRes.status).toBe(404);
  });
});
