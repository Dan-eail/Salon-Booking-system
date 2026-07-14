import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { Db, Tx } from '../db/client.js';
import { notifications, users } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export type NotificationInput = {
  type: (typeof notifications.$inferInsert)['type'];
  title: string;
  body: string;
  link?: string;
};

interface ExternalChannel {
  name: string;
  isConfigured(): boolean;
  send(to: { email: string; phone: string | null }, msg: NotificationInput): Promise<void>;
}

const emailChannel: ExternalChannel = {
  name: 'email',
  isConfigured: () => Boolean(env.SMTP_HOST && env.SMTP_FROM),
  async send(to, msg) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: env.SMTP_FROM, to: to.email, subject: msg.title, text: msg.body });
  },
};

// No SMS provider is implemented yet; this channel is intentionally always "not configured"
// so the platform never pretends to send SMS. Implement `send` for a real provider to enable it.
const smsChannel: ExternalChannel = {
  name: 'sms',
  isConfigured: () => false,
  async send() {
    throw new Error('No SMS provider implemented');
  },
};

const externalChannels = [emailChannel, smsChannel];

export function channelStatus() {
  return [
    { channel: 'in_app', status: 'working' as const },
    ...externalChannels.map((c) => ({
      channel: c.name,
      status: c.isConfigured() ? ('configured' as const) : ('not_configured' as const),
    })),
  ];
}

/** Always writes an in-app notification (inside the caller's transaction); external channels run best-effort. */
export async function notify(ex: Db | Tx, userId: string, msg: NotificationInput) {
  await ex.insert(notifications).values({ userId, ...msg });
  const active = externalChannels.filter((c) => c.isConfigured());
  if (!active.length) return;
  // Fire-and-forget after the row is written; failures never break bookings.
  void (async () => {
    const [u] = await ex.select({ email: users.email, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return;
    for (const c of active) {
      try {
        await c.send(u, msg);
      } catch (err) {
        logger.warn({ channel: c.name, err: (err as Error).message }, 'external notification failed');
      }
    }
  })();
}
