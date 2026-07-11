import { z } from 'zod';
import { dateStr, pagination, uuid } from './common.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

export const salonSearchQuery = pagination.extend({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(60).optional(),
  neighborhood: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  date: dateStr.optional(),
  timeFrom: hhmm.optional(),
  timeTo: hhmm.optional(),
  sort: z.enum(['relevance', 'rating', 'price_asc', 'price_desc', 'popularity']).default('relevance'),
});

export const slugParam = z.object({ slug: z.string().trim().min(1).max(80) });
export const availabilityQuery = z.object({ serviceId: uuid, date: dateStr, staffId: uuid.optional() });
export const availabilityRangeQuery = z.object({
  serviceId: uuid,
  from: dateStr,
  days: z.coerce.number().int().min(1).max(31).default(14),
  staffId: uuid.optional(),
});
export const reviewsQuery = pagination.extend({ pageSize: z.coerce.number().int().min(1).max(30).default(10) });
