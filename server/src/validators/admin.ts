import { z } from 'zod';
import { dateStr, money, pagination, uuid } from './common.js';
import { isoDate } from './customer.js';

export const adminListQuery = pagination.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
});
export const adminUsersQuery = adminListQuery.extend({ role: z.enum(['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN']).optional() });
export const adminUserPatch = z.object({ role: z.enum(['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN']).optional(), isActive: z.boolean().optional() }).strict();
export const adminSalonsQuery = adminListQuery.extend({ status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional() });
export const adminSalonStatus = z.object({ status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']), note: z.string().trim().max(300).optional() }).strict();
export const adminVerify = z.object({ isVerified: z.boolean() }).strict();
export const adminBookingsQuery = adminListQuery.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  salonId: uuid.optional(),
});
export const adminReviewsQuery = adminListQuery.extend({ hidden: z.enum(['true', 'false']).optional() });
export const adminReviewPatch = z.object({ isHidden: z.boolean() }).strict();

export const categoryCreate = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes').max(60),
    name: z.string().trim().min(2).max(80),
    nameAm: z.string().trim().max(80).nullish(),
    group: z.enum(['hair', 'nails', 'bridal', 'other']).default('hair'),
    imageUrl: z.string().max(500).nullish(),
    sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();
export const categoryUpdate = categoryCreate.omit({ slug: true }).partial().strict();

export const promotionSchema = z
  .object({
    salonId: uuid.nullish(),
    title: z.string().trim().min(2).max(100),
    description: z.string().trim().max(400).default(''),
    type: z.enum(['PERCENT', 'FIXED']),
    value: money,
    imageUrl: z.string().max(500).nullish(),
    startsAt: isoDate,
    endsAt: isoDate,
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { message: 'End must be after start', path: ['endsAt'] })
  .refine((v) => v.type !== 'PERCENT' || Number(v.value) <= 100, { message: 'A percentage cannot exceed 100', path: ['value'] });
export const promotionUpdate = z
  .object({
    title: z.string().trim().min(2).max(100),
    description: z.string().trim().max(400),
    value: money,
    imageUrl: z.string().max(500).nullable(),
    startsAt: isoDate,
    endsAt: isoDate,
    isActive: z.boolean(),
    isFeatured: z.boolean(),
  })
  .partial()
  .strict();

export const SETTING_KEYS = ['supportPhone', 'supportEmail', 'announcement', 'defaultCity'] as const;
export const settingsSchema = z
  .object({
    supportPhone: z.string().trim().max(30),
    supportEmail: z.string().trim().email().max(120).or(z.literal('')),
    announcement: z.string().trim().max(200),
    defaultCity: z.string().trim().max(60),
  })
  .partial()
  .strict();
export const auditQuery = adminListQuery.extend({ entityType: z.string().trim().max(40).optional(), action: z.string().trim().max(60).optional() });
export const adminRange = z.object({ from: dateStr, to: dateStr }).refine((v) => v.to >= v.from, 'Invalid range');
