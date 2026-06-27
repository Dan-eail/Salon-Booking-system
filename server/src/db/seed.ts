/**
 * Demo seed. Everything created here is DEMO DATA (salons have is_demo = true,
 * none are marked verified, and no reviews are fabricated).
 * Refuses to run in production.
 */
import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { env } from '../config/env.js';
import * as s from './schema.js';
import { hashPassword } from '../lib/security.js';
import { bookingReference } from '../lib/security.js';
import { addDaysStr, localToUtc, todayLocal } from '../lib/time.js';
import { DEFAULT_NEIGHBORHOODS } from '../../../shared/constants.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

export const DEMO_PASSWORD = 'Demo@12345';
const H = (h: number, m = 0) => h * 60 + m;

const categories = [
  { slug: 'haircuts-styling', name: 'Haircuts & Styling', nameAm: 'የፀጉር ቁረጣ እና ስታይሊንግ', group: 'hair' },
  { slug: 'braiding', name: 'Hair Braiding', nameAm: 'ሹሩባ', group: 'hair' },
  { slug: 'natural-hair-care', name: 'Natural Hair Care', nameAm: 'የተፈጥሮ ፀጉር እንክብካቤ', group: 'hair' },
  { slug: 'color-treatments', name: 'Coloring & Treatments', nameAm: 'ቀለም እና ህክምና', group: 'hair' },
  { slug: 'manicure', name: 'Manicure', nameAm: 'ማኒኩር', group: 'nails' },
  { slug: 'pedicure', name: 'Pedicure', nameAm: 'ፔዲኩር', group: 'nails' },
  { slug: 'acrylic-gel', name: 'Acrylic & Gel Nails', nameAm: 'አክሪሊክ እና ጄል ጥፍር', group: 'nails' },
  { slug: 'nail-art', name: 'Nail Art', nameAm: 'የጥፍር ጥበብ', group: 'nails' },
  { slug: 'bridal', name: 'Bridal Packages', nameAm: 'የሙሽራ ፓኬጆች', group: 'bridal' },
];

type SvcDef = { cat: string; name: string; desc: string; price: number; mins: number; buffer?: number; imageUrl?: string };
type SalonDef = {
  slug: string;
  name: string;
  hood: string;
  address: string;
  phone: string;
  description: string;
  priceLevel: number;
  mode: 'INSTANT' | 'APPROVAL';
  coverImage: string;
  gallery?: string[];
  hours: Record<number, [number, number] | null>;
  staff: { name: string; title: string; specialties: string[]; cats: string[]; avatarUrl?: string; off?: number[] }[];
  services: SvcDef[];
};

const weekHours = (open: number, close: number, sunday: [number, number] | null = null) => ({
  0: sunday, 1: [open, close], 2: [open, close], 3: [open, close], 4: [open, close], 5: [open, close], 6: [open, close],
}) as Record<number, [number, number] | null>;

const salonDefs: SalonDef[] = [
  {
    slug: 'zewditu-hair-studio', name: 'Zewditu Hair Studio', hood: 'Bole', address: 'Bole Road, near Edna Mall',
    phone: '+251911000101', priceLevel: 3, mode: 'INSTANT', hours: weekHours(H(8, 30), H(19), [H(10), H(16)]),
    description: 'DEMO SALON. Modern cuts, silk press and colour work in a calm, light-filled studio.',
    coverImage: '/images/salons/zewditu.jpg',
    gallery: ['/images/salons/zewditu.jpg', '/images/salons/sar-bet.jpg', '/images/services/silk-press.jpg'],
    staff: [
      { name: 'Selam T.', title: 'Senior Stylist', specialties: ['Silk press', 'Colour'], cats: ['haircuts-styling', 'color-treatments', 'natural-hair-care'], avatarUrl: '/images/staff/staff-selam.jpg', off: [0] },
      { name: 'Hana B.', title: 'Stylist', specialties: ['Cuts', 'Blow-dry'], cats: ['haircuts-styling', 'natural-hair-care'], avatarUrl: '/images/staff/staff-hana.jpg', off: [0, 1] },
      { name: 'Rediet M.', title: 'Colourist', specialties: ['Balayage', 'Toning'], cats: ['color-treatments'], avatarUrl: '/images/staff/staff-rediet.jpg', off: [0, 2] },
    ],
    services: [
      { cat: 'haircuts-styling', name: 'Women’s Cut & Blow-dry', desc: 'Consultation, wash, precision cut and blow-dry.', price: 800, mins: 60, imageUrl: '/images/services/haircut.jpg' },
      { cat: 'haircuts-styling', name: 'Silk Press', desc: 'Smooth, glossy straightened finish for natural hair.', price: 1500, mins: 90, buffer: 10, imageUrl: '/images/services/silk-press.jpg' },
      { cat: 'natural-hair-care', name: 'Deep Conditioning Treatment', desc: 'Moisture-rich treatment with scalp massage.', price: 900, mins: 45, imageUrl: '/images/services/deep-conditioning.jpg' },
      { cat: 'color-treatments', name: 'Full Colour', desc: 'Single-process colour, root to tip.', price: 2500, mins: 120, buffer: 15, imageUrl: '/images/services/colour.jpg' },
      { cat: 'color-treatments', name: 'Balayage', desc: 'Hand-painted highlights for a natural lift.', price: 4500, mins: 180, buffer: 15, imageUrl: '/images/services/colour.jpg' },
    ],
  },
  {
    slug: 'meskel-nails-spa', name: 'Meskel Nails & Spa', hood: 'Kazanchis', address: 'Kazanchis, behind the UNECA compound',
    phone: '+251911000102', priceLevel: 2, mode: 'APPROVAL', hours: weekHours(H(9), H(20), [H(11), H(17)]),
    description: 'DEMO SALON. Manicures, pedicures and nail art with hospital-grade hygiene.',
    coverImage: '/images/salons/meskel.jpg',
    gallery: ['/images/salons/meskel.jpg', '/images/services/manicure.jpg', '/images/services/acrylic-gel.jpg'],
    staff: [
      { name: 'Betty A.', title: 'Nail Technician', specialties: ['Gel', 'Nail art'], cats: ['manicure', 'pedicure', 'acrylic-gel', 'nail-art'], avatarUrl: '/images/staff/staff-betty.jpg', off: [0] },
      { name: 'Mahlet S.', title: 'Nail Technician', specialties: ['Acrylic', 'Extensions'], cats: ['manicure', 'acrylic-gel', 'nail-art'], avatarUrl: '/images/staff/staff-mahlet.jpg', off: [0, 3] },
    ],
    services: [
      { cat: 'manicure', name: 'Classic Manicure', desc: 'Shape, cuticle care, massage and polish.', price: 350, mins: 45, imageUrl: '/images/services/manicure.jpg' },
      { cat: 'pedicure', name: 'Spa Pedicure', desc: 'Soak, scrub, massage and polish.', price: 500, mins: 60, imageUrl: '/images/services/pedicure.jpg' },
      { cat: 'acrylic-gel', name: 'Gel Extensions', desc: 'Full set of gel extensions with polish.', price: 1400, mins: 105, buffer: 10, imageUrl: '/images/services/acrylic-gel.jpg' },
      { cat: 'acrylic-gel', name: 'Acrylic Full Set', desc: 'Durable acrylic set in your chosen shape.', price: 1600, mins: 120, buffer: 10, imageUrl: '/images/services/acrylic-gel.jpg' },
      { cat: 'nail-art', name: 'Nail Art (per hand)', desc: 'Hand-painted designs, priced per hand.', price: 300, mins: 40, imageUrl: '/images/services/nail-art.jpg' },
    ],
  },
  {
    slug: 'piassa-braids-house', name: 'Piassa Braids House', hood: 'Piassa', address: 'Churchill Avenue, Piassa',
    phone: '+251911000103', priceLevel: 1, mode: 'INSTANT', hours: weekHours(H(8), H(19), [H(9), H(15)]),
    description: 'DEMO SALON. Traditional shuruba and modern braiding by experienced braiders.',
    coverImage: '/images/salons/piassa.jpg',
    gallery: ['/images/salons/piassa.jpg', '/images/services/braiding.jpg', '/images/services/deep-conditioning.jpg'],
    staff: [
      { name: 'Tigist G.', title: 'Master Braider', specialties: ['Shuruba', 'Cornrows'], cats: ['braiding', 'natural-hair-care'], avatarUrl: '/images/staff/staff-tigist.jpg', off: [] },
      { name: 'Almaz D.', title: 'Braider', specialties: ['Box braids', 'Twists'], cats: ['braiding'], avatarUrl: '/images/staff/staff-almaz.jpg', off: [0] },
      { name: 'Yeshi K.', title: 'Braider', specialties: ['Kids styles'], cats: ['braiding'], avatarUrl: '/images/staff/staff-yeshi.jpg', off: [0, 4] },
    ],
    services: [
      { cat: 'braiding', name: 'Traditional Shuruba', desc: 'Classic Ethiopian cornrow-style braiding.', price: 600, mins: 120, imageUrl: '/images/services/braiding.jpg' },
      { cat: 'braiding', name: 'Box Braids', desc: 'Medium box braids, hair included on request.', price: 1800, mins: 240, buffer: 15, imageUrl: '/images/services/braiding.jpg' },
      { cat: 'braiding', name: 'Kids Braids', desc: 'Gentle braiding for children under 12.', price: 400, mins: 75, imageUrl: '/images/services/braiding.jpg' },
      { cat: 'natural-hair-care', name: 'Wash & Twist-out', desc: 'Cleanse, condition and defined twist-out.', price: 700, mins: 90, imageUrl: '/images/services/deep-conditioning.jpg' },
    ],
  },
  {
    slug: 'sar-bet-beauty-lounge', name: 'Sar Bet Beauty Lounge', hood: 'Sar Bet', address: 'Sar Bet, Jomo Kenyatta Avenue',
    phone: '+251911000104', priceLevel: 2, mode: 'INSTANT', hours: weekHours(H(9), H(19)),
    description: 'DEMO SALON. Hair and nails under one roof — cuts, colour, manicure and pedicure.',
    coverImage: '/images/salons/sar-bet.jpg',
    gallery: ['/images/salons/sar-bet.jpg', '/images/services/haircut.jpg', '/images/services/pedicure.jpg'],
    staff: [
      { name: 'Frehiwot L.', title: 'Stylist', specialties: ['Cuts', 'Colour'], cats: ['haircuts-styling', 'color-treatments'], avatarUrl: '/images/staff/staff-frehiwot.jpg', off: [0] },
      { name: 'Eden W.', title: 'Nail Technician', specialties: ['Manicure', 'Pedicure'], cats: ['manicure', 'pedicure', 'nail-art'], avatarUrl: '/images/staff/staff-eden.jpg', off: [0, 2] },
    ],
    services: [
      { cat: 'haircuts-styling', name: 'Trim & Style', desc: 'Light trim with wash and style.', price: 500, mins: 45, imageUrl: '/images/services/haircut.jpg' },
      { cat: 'color-treatments', name: 'Highlights', desc: 'Foil highlights with toner.', price: 2800, mins: 150, buffer: 15, imageUrl: '/images/services/colour.jpg' },
      { cat: 'manicure', name: 'Gel Manicure', desc: 'Long-wear gel polish manicure.', price: 650, mins: 60, imageUrl: '/images/services/manicure.jpg' },
      { cat: 'pedicure', name: 'Classic Pedicure', desc: 'Soak, file, cuticle care and polish.', price: 450, mins: 50, imageUrl: '/images/services/pedicure.jpg' },
    ],
  },
  {
    slug: 'gerji-glow-salon', name: 'Gerji Glow Salon', hood: 'Gerji', address: 'Gerji, close to the Mebrat Hail junction',
    phone: '+251911000105', priceLevel: 1, mode: 'APPROVAL', hours: weekHours(H(8, 30), H(18, 30)),
    description: 'DEMO SALON. Friendly neighbourhood salon with affordable cuts and treatments.',
    coverImage: '/images/salons/gerji-glow.jpg',
    gallery: ['/images/salons/gerji-glow.jpg', '/images/services/haircut.jpg', '/images/services/braiding.jpg'],
    staff: [
      { name: 'Meron H.', title: 'Stylist', specialties: ['Cuts', 'Treatments'], cats: ['haircuts-styling', 'natural-hair-care', 'braiding'], avatarUrl: '/images/staff/staff-meron.jpg', off: [0] },
      { name: 'Saron Y.', title: 'Stylist', specialties: ['Braids', 'Updos'], cats: ['haircuts-styling', 'braiding'], avatarUrl: '/images/staff/staff-saron.jpg', off: [0, 5] },
    ],
    services: [
      { cat: 'haircuts-styling', name: 'Cut & Wash', desc: 'Wash, cut and finish.', price: 350, mins: 40, imageUrl: '/images/services/haircut.jpg' },
      { cat: 'natural-hair-care', name: 'Protein Treatment', desc: 'Strengthening treatment for damaged hair.', price: 600, mins: 60, imageUrl: '/images/services/deep-conditioning.jpg' },
      { cat: 'braiding', name: 'Cornrows', desc: 'Neat cornrows in your chosen pattern.', price: 450, mins: 90, imageUrl: '/images/services/braiding.jpg' },
    ],
  },
  {
    slug: 'old-airport-bridal-atelier', name: 'Old Airport Bridal Atelier', hood: 'Old Airport', address: 'Old Airport, near the Lem Hotel road',
    phone: '+251911000106', priceLevel: 4, mode: 'APPROVAL', hours: weekHours(H(8), H(18), [H(8), H(14)]),
    description: 'DEMO SALON. Bridal hair, makeup-ready skin prep and wedding-party packages by appointment.',
    coverImage: '/images/salons/bridal-atelier.jpg',
    gallery: ['/images/salons/bridal-atelier.jpg', '/images/services/bridal.jpg', '/images/services/manicure.jpg'],
    staff: [
      { name: 'Liya F.', title: 'Bridal Stylist', specialties: ['Bridal updos', 'Traditional styling'], cats: ['bridal', 'haircuts-styling'], avatarUrl: '/images/staff/staff-liya.jpg', off: [] },
      { name: 'Nardos E.', title: 'Bridal Nail & Beauty', specialties: ['Bridal nails'], cats: ['bridal', 'manicure', 'nail-art'], avatarUrl: '/images/staff/staff-nardos.jpg', off: [0, 1] },
    ],
    services: [
      { cat: 'bridal', name: 'Bridal Hair & Nails Package', desc: 'Hair styling, trial notes and bridal manicure.', price: 7500, mins: 240, buffer: 30, imageUrl: '/images/services/bridal.jpg' },
      { cat: 'bridal', name: 'Bridesmaid Styling', desc: 'Hair styling for one bridesmaid.', price: 1800, mins: 75, imageUrl: '/images/services/haircut.jpg' },
      { cat: 'manicure', name: 'Bridal Manicure', desc: 'Gel manicure with finishing touches.', price: 900, mins: 60, imageUrl: '/images/services/manicure.jpg' },
    ],
  },
];

async function main() {
  console.log('Seeding demo data…');
  // Reset (dev only) — children first.
  await pool.query(`TRUNCATE TABLE audit_logs, notifications, payments, reviews, appointment_status_history,
    appointments, favorite_salons, promotions, staff_services, staff_time_off, staff_breaks, staff_schedules,
    staff_profiles, services, service_categories, business_hours, salon_images, salons, locations,
    refresh_tokens, password_reset_tokens, customer_profiles, users, platform_settings RESTART IDENTITY CASCADE`);

  const pw = await hashPassword(DEMO_PASSWORD);
  const mkUser = async (email: string, fullName: string, role: s.Role, phone?: string) => {
    const [u] = await db.insert(s.users).values({ email, fullName, role, passwordHash: pw, phone }).returning();
    if (role === 'CUSTOMER') await db.insert(s.customerProfiles).values({ userId: u.id, city: 'Addis Ababa' });
    return u;
  };

  await mkUser('admin@demo.belle.et', 'Demo Admin', 'ADMIN');
  const customers = [
    await mkUser('customer1@demo.belle.et', 'Demo Customer One', 'CUSTOMER', '+251911200001'),
    await mkUser('customer2@demo.belle.et', 'Demo Customer Two', 'CUSTOMER', '+251911200002'),
    await mkUser('customer3@demo.belle.et', 'Demo Customer Three', 'CUSTOMER', '+251911200003'),
  ];

  await db.insert(s.locations).values(DEFAULT_NEIGHBORHOODS.map((neighborhood) => ({ city: 'Addis Ababa', neighborhood })));
  await db.insert(s.platformSettings).values([
    { key: 'currency', value: 'ETB' },
    { key: 'timezone', value: 'Africa/Addis_Ababa' },
    { key: 'brandName', value: 'Belle Ethiopia' },
    { key: 'supportEmail', value: 'support@example.com' },
  ]);

  const cats = await db
    .insert(s.serviceCategories)
    .values(categories.map((c, i) => ({ ...c, sortOrder: i })))
    .returning();
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  const today = todayLocal();
  let ownerIdx = 1;
  const created: { salonId: string; staffIds: string[]; serviceIds: string[]; ownerId: string }[] = [];

  for (const def of salonDefs) {
    const owner = await mkUser(`owner${ownerIdx}@demo.belle.et`, `${def.name} Owner`, 'OWNER', `+2519112000${ownerIdx}0`);
    ownerIdx++;
    const [salon] = await db
      .insert(s.salons)
      .values({
        slug: def.slug, ownerId: owner.id, name: def.name, description: def.description, neighborhood: def.hood,
        address: def.address, phone: def.phone, status: 'ACTIVE', isVerified: false, isDemo: true,
        bookingMode: def.mode, priceLevel: def.priceLevel, cancellationHours: 24,
        paymentMode: 'DEPOSIT_REQUIRED', depositPercent: 50,
        coverImage: def.coverImage,
        mapUrl: `https://www.google.com/maps/search/${encodeURIComponent(def.name + ' ' + def.hood + ' Addis Ababa')}`,
      })
      .returning();

    if (def.gallery?.length) {
      await db.insert(s.salonImages).values(
        def.gallery.map((url, sortOrder) => ({
          salonId: salon.id,
          url,
          alt: `${def.name} photo`,
          sortOrder,
        })),
      );
    }

    for (let dow = 0; dow < 7; dow++) {
      const h = def.hours[dow];
      await db.insert(s.businessHours).values({ salonId: salon.id, dayOfWeek: dow, openMinutes: h?.[0] ?? 0, closeMinutes: h?.[1] ?? 60, isClosed: !h });
    }

    const svcRows = await db
      .insert(s.services)
      .values(def.services.map((x) => ({
        salonId: salon.id, categoryId: catId[x.cat], name: x.name, description: x.desc,
        priceEtb: x.price.toFixed(2), durationMinutes: x.mins, bufferMinutes: x.buffer ?? 0,
        imageUrl: x.imageUrl ?? null,
      })))
      .returning();

    const staffIds: string[] = [];
    for (const [i, st] of def.staff.entries()) {
      let userId: string | null = null;
      if (def.slug === 'zewditu-hair-studio' && i === 0) {
        userId = (await mkUser('staff@demo.belle.et', st.name, 'STAFF', '+251911300001')).id;
      }
      const [sp] = await db
        .insert(s.staffProfiles)
        .values({
          salonId: salon.id, userId, displayName: st.name, title: st.title, specialties: st.specialties,
          avatarUrl: st.avatarUrl ?? null,
        })
        .returning();
      staffIds.push(sp.id);
      const doable = svcRows.filter((r) => st.cats.includes(cats.find((c) => c.id === r.categoryId)!.slug));
      if (doable.length) await db.insert(s.staffServices).values(doable.map((r) => ({ staffId: sp.id, serviceId: r.id })));
      for (let dow = 0; dow < 7; dow++) {
        const h = def.hours[dow];
        if (!h || st.off?.includes(dow)) continue;
        await db.insert(s.staffSchedules).values({ staffId: sp.id, dayOfWeek: dow, startMinutes: h[0], endMinutes: h[1] });
        if (h[1] - h[0] >= H(6)) await db.insert(s.staffBreaks).values({ staffId: sp.id, dayOfWeek: dow, startMinutes: H(13), endMinutes: H(14), label: 'Lunch' });
      }
    }
    created.push({ salonId: salon.id, staffIds, serviceIds: svcRows.map((r) => r.id), ownerId: owner.id });
  }

  // Demo appointments (direct inserts; times chosen to avoid overlaps).
  const first = created[0];
  const [svcA, svcB] = await db.select().from(s.services).where(eq(s.services.salonId, first.salonId)).limit(2);
  const mk = async (dayOffset: number, startMin: number, svc: typeof svcA, status: s.AppointmentStatus, cust: (typeof customers)[number], staffId: string) => {
    const date = addDaysStr(today, dayOffset);
    const startAt = localToUtc(date, startMin);
    const endAt = new Date(startAt.getTime() + svc.durationMinutes * 60000);
    const [a] = await db
      .insert(s.appointments)
      .values({
        reference: bookingReference(), salonId: svc.salonId, serviceId: svc.id, staffId, customerId: cust.id,
        guestName: cust.fullName, guestPhone: cust.phone!, startAt, endAt,
        blockedUntil: new Date(endAt.getTime() + svc.bufferMinutes * 60000), status, priceEtb: svc.priceEtb,
        durationMinutes: svc.durationMinutes, serviceName: svc.name,
      })
      .returning();
    await db.insert(s.appointmentStatusHistory).values({ appointmentId: a.id, toStatus: status, note: 'Demo data' });
    return a;
  };
  await mk(-7, H(10), svcA, 'COMPLETED', customers[0], first.staffIds[0]);
  await mk(-3, H(11), svcB, 'COMPLETED', customers[1], first.staffIds[1]);
  await mk(-1, H(15), svcA, 'CANCELLED', customers[2], first.staffIds[0]);
  await mk(2, H(10), svcA, 'CONFIRMED', customers[0], first.staffIds[0]);
  await mk(3, H(15), svcB, 'CONFIRMED', customers[1], first.staffIds[1]);

  await db.insert(s.promotions).values([
    { title: 'Demo: Meskel season glow', description: 'DEMO promotion — 15% off selected hair treatments.', type: 'PERCENT', value: '15', startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400000), isFeatured: true },
    { title: 'Demo: Bridal season packages', description: 'DEMO promotion — book bridal packages early.', type: 'PERCENT', value: '10', startsAt: new Date(), endsAt: new Date(Date.now() + 60 * 86400000), isFeatured: true },
  ]);

  console.log('Seed complete.');
  console.log(`Demo password for all demo accounts: ${DEMO_PASSWORD}`);
  console.log('Accounts: admin@demo.belle.et, owner1..6@demo.belle.et, staff@demo.belle.et, customer1..3@demo.belle.et');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
