import { z } from 'zod';
import { dateStr, money, pagination, password, phone, uuid } from './common.js';
import { isoDate } from './customer.js';

const mins = z.coerce.number().int().min(0).max(1440);
const imageRef = z
  .string()
  .max(500)
  .refine((u) => u.startsWith('https://') || u.startsWith('/uploads/'), 'Image must be an https URL or an uploaded image');
const dow = z.coerce.number().int().min(0).max(6);

export const salonScope = z.object({ salonId: uuid });
export const salonChild = z.object({ salonId: uuid, id: uuid });

export const salonProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10, 'Tell customers a bit about your salon').max(2000),
    city: z.string().trim().min(2).max(60),
    neighborhood: z.string().trim().min(2).max(60),
    address: z.string().trim().min(3).max(200),
    mapUrl: z.string().url().max(500).startsWith('https://').nullable(),
    latitude: z.coerce.number().min(-90).max(90).nullable(),
    longitude: z.coerce.number().min(-180).max(180).nullable(),
    phone,
    email: z.string().trim().toLowerCase().email().nullable(),
    instagram: z.string().trim().max(60).nullable(),
    coverImage: imageRef.nullable(),
    bookingMode: z.enum(['INSTANT', 'APPROVAL']),
    paymentMode: z.enum(['PAY_AT_SALON', 'DEPOSIT_REQUIRED', 'ONLINE_PAYMENT']),
    depositPercent: z.coerce.number().int().min(0).max(100),
    cancellationHours: z.coerce.number().int().min(0).max(720),
    cancellationPolicy: z.string().trim().min(5).max(500),
    bookingBufferMinutes: z.coerce.number().int().min(0).max(120),
    minNoticeMinutes: z.coerce.number().int().min(0).max(10080),
    maxAdvanceDays: z.coerce.number().int().min(1).max(365),
    priceLevel: z.coerce.number().int().min(1).max(4),
  })
  .partial()
  .strict();

export const hoursSchema = z
  .object({
    hours: z
      .array(
        z.object({ dayOfWeek: dow, isClosed: z.boolean(), openMinutes: mins, closeMinutes: mins }).refine((h) => h.isClosed || h.closeMinutes > h.openMinutes, {
          message: 'Closing time must be after opening time',
        }),
      )
      .length(7)
      .refine((h) => new Set(h.map((x) => x.dayOfWeek)).size === 7, 'Provide each day of the week once'),
  })
  .strict();

export const imagePatchSchema = z.object({ alt: z.string().trim().max(160).optional(), sortOrder: z.coerce.number().int().min(0).max(100).optional() }).strict();

const serviceFields = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(600).default(''),
  categoryId: uuid,
  priceEtb: money,
  durationMinutes: z.coerce.number().int().min(5).max(720),
  bufferMinutes: z.coerce.number().int().min(0).max(240).default(0),
  promoPriceEtb: money.nullish(),
  promoStartsAt: isoDate.nullish(),
  promoEndsAt: isoDate.nullish(),
  imageUrl: imageRef.nullish(),
  isActive: z.boolean().default(true),
};
export const serviceCreateSchema = z.object({ ...serviceFields, staffIds: z.array(uuid).max(50).default([]) }).strict();
export const serviceUpdateSchema = z
  .object({
    name: serviceFields.name,
    description: z.string().trim().max(600),
    categoryId: uuid,
    priceEtb: money,
    durationMinutes: serviceFields.durationMinutes,
    bufferMinutes: serviceFields.bufferMinutes,
    promoPriceEtb: money.nullable(),
    promoStartsAt: isoDate.nullable(),
    promoEndsAt: isoDate.nullable(),
    imageUrl: imageRef.nullable(),
    isActive: z.boolean(),
    staffIds: z.array(uuid).max(50),
  })
  .partial()
  .strict();

export const staffCreateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    title: z.string().trim().max(80).nullish(),
    bio: z.string().trim().max(500).nullish(),
    avatarUrl: imageRef.nullish(),
    specialties: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    serviceIds: z.array(uuid).max(100).default([]),
    account: z
      .object({
        email: z.string().trim().toLowerCase().email(),
        phone,
        password,
      })
      .strict()
      .optional(),
  })
  .strict();
export const staffUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    title: z.string().trim().max(80).nullable(),
    bio: z.string().trim().max(500).nullable(),
    avatarUrl: imageRef.nullable(),
    specialties: z.array(z.string().trim().min(1).max(40)).max(10),
    serviceIds: z.array(uuid).max(100),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

const window = z.object({ dayOfWeek: dow, startMinutes: mins, endMinutes: mins }).refine((w) => w.endMinutes > w.startMinutes, 'End must be after start');
export const staffScheduleSchema = z
  .object({
    schedules: z.array(window).max(28),
    breaks: z.array(z.object({ dayOfWeek: dow, startMinutes: mins, endMinutes: mins, label: z.string().trim().max(40).default('Break') }).refine((w) => w.endMinutes > w.startMinutes, 'End must be after start')).max(28),
  })
  .strict()
  .superRefine((v, ctx) => {
    const byDay = new Map<number, { s: number; e: number }[]>();
    for (const w of v.schedules) byDay.set(w.dayOfWeek, [...(byDay.get(w.dayOfWeek) ?? []), { s: w.startMinutes, e: w.endMinutes }]);
    for (const [d, list] of byDay) {
      const sorted = [...list].sort((a, b) => a.s - b.s);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].s < sorted[i - 1].e) ctx.addIssue({ code: 'custom', path: ['schedules'], message: `Shifts overlap on day ${d}` });
      }
    }
  });
export const timeOffSchema = z
  .object({ startAt: isoDate, endAt: isoDate, reason: z.string().trim().max(200).nullish() })
  .strict()
  .refine((v) => v.endAt > v.startAt, { message: 'End must be after start', path: ['endAt'] });

export const ownerAppointmentsQuery = pagination.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  from: dateStr.optional(),
  to: dateStr.optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  staffId: uuid.optional(),
  q: z.string().trim().max(80).optional(),
});
export const manualAppointmentSchema = z
  .object({
    serviceId: uuid,
    staffId: uuid.nullish(),
    startAt: isoDate,
    guestName: z.string().trim().min(2).max(100),
    guestPhone: phone,
    guestEmail: z.string().trim().toLowerCase().email().nullish().or(z.literal('').transform(() => null)),
    notes: z.string().trim().max(500).nullish(),
  })
  .strict();
export const statusSchema = z
  .object({ status: z.enum(['CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']), note: z.string().trim().max(300).optional() })
  .strict();
export const ownerRescheduleSchema = z.object({ startAt: isoDate, staffId: uuid.nullish() }).strict();
export const ownerNotesSchema = z.object({ ownerNotes: z.string().trim().max(1000).nullable() }).strict();
export const cashPaymentSchema = z.object({ amountEtb: money }).strict();

export const rangeQuery = z.object({ from: dateStr, to: dateStr }).refine((v) => v.to >= v.from, { message: '"to" must not be before "from"', path: ['to'] });
export const exportQuery = z.object({ from: dateStr, to: dateStr, type: z.enum(['appointments', 'summary']).default('appointments') });
export const replySchema = z.object({ reply: z.string().trim().min(1).max(500).nullable() }).strict();
export const ownerReviewsQuery = pagination.extend({ pageSize: z.coerce.number().int().min(1).max(50).default(20) });
