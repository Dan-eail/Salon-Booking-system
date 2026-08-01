import { randomUUID } from 'node:crypto';
import { db, pool } from '../src/db/client.js';
import * as s from '../src/db/schema.js';
import { hashPassword } from '../src/lib/security.js';
import { localToUtc } from '../src/lib/time.js';

/** Monday. All tests run against a fixed "now" so results are deterministic. */
export const DATE = '2030-01-07';
export const NOW = new Date('2030-01-05T06:00:00Z');
export const at = (minutes: number, date = DATE) => localToUtc(date, minutes);

let cachedHash: string | undefined;
export async function makeUser(role: s.Role = 'CUSTOMER', suffix = randomUUID().slice(0, 8)) {
  cachedHash ??= await hashPassword('Test@12345');
  const [u] = await db
    .insert(s.users)
    .values({ email: `${role.toLowerCase()}-${suffix}@test.local`, fullName: `Test ${role} ${suffix}`, role, passwordHash: cachedHash, phone: `+25191${Math.floor(1000000 + Math.random() * 8999999)}` })
    .returning();
  return u;
}

export async function makeCategory() {
  const slug = `cat-${randomUUID().slice(0, 8)}`;
  const [c] = await db.insert(s.serviceCategories).values({ slug, name: slug }).returning();
  return c;
}

export type FixtureOpts = {
  bookingMode?: 'INSTANT' | 'APPROVAL';
  staffCount?: number;
  open?: number;
  close?: number;
  durationMinutes?: number;
  bufferMinutes?: number;
  salonBuffer?: number;
  cancellationHours?: number;
  price?: string;
};

/** Creates owner + active salon + hours for every day + service + N staff working all week. */
export async function makeSalonFixture(o: FixtureOpts = {}) {
  const owner = await makeUser('OWNER');
  const cat = await makeCategory();
  const slug = `salon-${randomUUID().slice(0, 8)}`;
  const [salon] = await db
    .insert(s.salons)
    .values({
      slug, ownerId: owner.id, name: slug, description: 'test', neighborhood: 'Bole', address: 'x', phone: '+251911000000',
      status: 'ACTIVE', isDemo: true, bookingMode: o.bookingMode ?? 'INSTANT', cancellationHours: o.cancellationHours ?? 24,
      bookingBufferMinutes: o.salonBuffer ?? 0, minNoticeMinutes: 60, maxAdvanceDays: 90,
    })
    .returning();
  for (let dow = 0; dow < 7; dow++) {
    await db.insert(s.businessHours).values({ salonId: salon.id, dayOfWeek: dow, openMinutes: o.open ?? 9 * 60, closeMinutes: o.close ?? 17 * 60 });
  }
  const [service] = await db
    .insert(s.services)
    .values({ salonId: salon.id, categoryId: cat.id, name: 'Test Service', priceEtb: o.price ?? '500.00', durationMinutes: o.durationMinutes ?? 60, bufferMinutes: o.bufferMinutes ?? 0 })
    .returning();
  const staff: s.StaffProfile[] = [];
  for (let i = 0; i < (o.staffCount ?? 1); i++) {
    const [sp] = await db.insert(s.staffProfiles).values({ salonId: salon.id, displayName: `Staff ${i + 1}` }).returning();
    await db.insert(s.staffServices).values({ staffId: sp.id, serviceId: service.id });
    for (let dow = 0; dow < 7; dow++) {
      await db.insert(s.staffSchedules).values({ staffId: sp.id, dayOfWeek: dow, startMinutes: o.open ?? 9 * 60, endMinutes: o.close ?? 17 * 60 });
    }
    staff.push(sp);
  }
  return { owner, salon, service, staff, cat };
}

export async function closeDb() {
  await pool.end();
}
