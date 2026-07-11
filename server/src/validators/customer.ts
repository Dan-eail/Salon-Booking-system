import { z } from 'zod';
import { phone, pagination, uuid } from './common.js';

export const isoDate = z.string().datetime({ offset: true, message: 'Use an ISO date-time' }).transform((s) => new Date(s));

export const createBookingSchema = z
  .object({
    salonId: uuid,
    serviceId: uuid,
    staffId: uuid.nullish(),
    startAt: isoDate,
    guestName: z.string().trim().min(2, 'Enter your name').max(100),
    guestPhone: phone,
    guestEmail: z.string().trim().toLowerCase().email().max(200).nullish().or(z.literal('').transform(() => null)),
    notes: z.string().trim().max(500).nullish(),
  })
  .strict();

export const myAppointmentsQuery = pagination.extend({
  tab: z.enum(['upcoming', 'past', 'all']).default('all'),
});
export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();
export const rescheduleSchema = z.object({ startAt: isoDate, staffId: uuid.nullish() }).strict();
export const reviewSchema = z
  .object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(1000).nullish() })
  .strict();
export const salonIdParam = z.object({ salonId: uuid });
export const notificationsQuery = pagination.extend({
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).default('false'),
});
