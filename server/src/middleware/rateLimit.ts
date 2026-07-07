import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit: env.NODE_ENV === 'test' ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message } },
  });

export const authLimiter = make(15 * 60_000, 20, 'Too many attempts. Please wait a few minutes and try again.');
export const passwordResetLimiter = make(60 * 60_000, 5, 'Too many reset requests. Please try again later.');
export const bookingLimiter = make(60_000, 15, 'Too many booking attempts. Please slow down.');
export const apiLimiter = make(60_000, 300, 'Too many requests. Please slow down.');
