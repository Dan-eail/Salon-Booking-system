import { z } from 'zod';
import { password, phone } from './common.js';

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(100),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    phone,
    password,
    role: z.enum(['CUSTOMER', 'OWNER']).default('CUSTOMER'),
    // Only for salon owners
    salonName: z.string().trim().min(2).max(100).optional(),
    neighborhood: z.string().trim().min(2).max(60).optional(),
    address: z.string().trim().min(3).max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.role === 'OWNER') {
      for (const k of ['salonName', 'neighborhood', 'address'] as const) {
        if (!v[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'Required for salon owners' });
      }
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(20).max(200), newPassword: password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    phone: phone.optional(),
    locale: z.enum(['en', 'am']).optional(),
    city: z.string().trim().max(60).optional(),
  })
  .strict();
