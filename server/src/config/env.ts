import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  APP_TIMEZONE: z.string().default('Africa/Addis_Ababa'),
  APP_CURRENCY: z.string().default('ETB'),
  BRAND_NAME: z.string().default('Belle Ethiopia'),
  /** Override the refresh-cookie Secure flag (defaults to true in production). Set false only for plain-HTTP trials. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  SMS_PROVIDER: z.string().optional().default(''),
  SMS_API_KEY: z.string().optional().default(''),
  TELEBIRR_APP_ID: z.string().optional().default(''),
  TELEBIRR_APP_KEY: z.string().optional().default(''),
  TELEBIRR_WEBHOOK_SECRET: z.string().optional().default(''),
  CBE_BIRR_MERCHANT_ID: z.string().optional().default(''),
  CBE_BIRR_API_KEY: z.string().optional().default(''),
  CHAPA_SECRET_KEY: z.string().optional().default('CHASECK_TEST-belle-ethiopia-dev-key'),
  CHAPA_PUBLIC_KEY: z.string().optional().default('CHAPUBK_TEST-belle-ethiopia-dev-key'),
  CHAPA_WEBHOOK_SECRET: z.string().optional().default('chapa-webhook-secret-belle-dev'),
  CHAPA_BASE_URL: z.string().optional().default('https://api.chapa.co/v1'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
