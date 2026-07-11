import { z } from 'zod';
import { normalizePhone } from '../../../shared/phone.js';
import { isValidDateStr } from '../lib/time.js';

export const uuid = z.string().uuid('Invalid id');
export const idParam = z.object({ id: uuid });
export const salonIdParam = z.object({ salonId: uuid });

export const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 0911 234 567 or +251 911 234 567' });
      return z.NEVER;
    }
    return n;
  });

export const dateStr = z.string().refine(isValidDateStr, 'Use the format YYYY-MM-DD');
export const minutes = z.coerce.number().int().min(0).max(1440);
export const money = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v.trim()))
  .refine((v) => /^\d{1,8}(\.\d{1,2})?$/.test(v), 'Enter a valid amount in ETB')
  .transform((v) => Number(v).toFixed(2));

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/\d/, 'Password must include a number');
