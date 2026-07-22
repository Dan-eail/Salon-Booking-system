import type { CookieOptions, Request, Response } from 'express';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { businessHours, customerProfiles, passwordResetTokens, refreshTokens, salons, staffProfiles, users, type User } from '../db/schema.js';
import { env, isProd } from '../config/env.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { created, ok } from '../lib/respond.js';
import { hashPassword, randomToken, sha256, signAccessToken, verifyPassword } from '../lib/security.js';
import { slugify } from '../lib/slug.js';
import { channelStatus } from '../services/notifications.js';
import { asyncHandler } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';

const COOKIE = 'refresh_token';
const cookieOpts = (maxAgeMs: number): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: maxAgeMs,
});

// Used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

export const publicUser = (u: User) => ({
  id: u.id, email: u.email, phone: u.phone, fullName: u.fullName, role: u.role, locale: u.locale, createdAt: u.createdAt,
});

async function issueSession(req: Request, res: Response, user: User, familyId: string = crypto.randomUUID()) {
  const token = randomToken();
  const ttlMs = env.REFRESH_TOKEN_TTL_DAYS * 86400000;
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    familyId,
    expiresAt: new Date(Date.now() + ttlMs),
    userAgent: req.headers['user-agent']?.slice(0, 200),
  });
  res.cookie(COOKIE, token, cookieOpts(ttlMs));
  return signAccessToken({ sub: user.id, role: user.role });
}

/** Cookie-based endpoints need a custom header so a cross-site form post cannot trigger them (CSRF defence in depth). */
function requireCsrfHeader(req: Request) {
  if (req.headers['x-requested-with'] !== 'belle') throw badRequest('Missing X-Requested-With header');
}

export const register = asyncHandler(async (req, res) => {
  const b = req.body as {
    fullName: string; email: string; phone: string; password: string; role: 'CUSTOMER' | 'OWNER';
    salonName?: string; neighborhood?: string; address?: string;
  };
  const passwordHash = await hashPassword(b.password);

  const user = await db.transaction(async (tx) => {
    const dup = await tx.select({ email: users.email, phone: users.phone }).from(users).where(eq(users.email, b.email)).limit(1);
    if (dup.length) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
    const dupPhone = await tx.select({ id: users.id }).from(users).where(eq(users.phone, b.phone)).limit(1);
    if (dupPhone.length) throw conflict('An account with this phone number already exists.', 'PHONE_TAKEN');

    // NOTE: role is limited to CUSTOMER|OWNER by the validator; STAFF and ADMIN can never self-register.
    const [u] = await tx.insert(users).values({ email: b.email, phone: b.phone, fullName: b.fullName, passwordHash, role: b.role }).returning();
    if (b.role === 'CUSTOMER') await tx.insert(customerProfiles).values({ userId: u.id });
    if (b.role === 'OWNER') {
      let slug = slugify(b.salonName!);
      const taken = await tx.select({ id: salons.id }).from(salons).where(eq(salons.slug, slug)).limit(1);
      if (taken.length) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
      const [salon] = await tx
        .insert(salons)
        .values({ slug, ownerId: u.id, name: b.salonName!, description: 'Welcome to our salon.', neighborhood: b.neighborhood!, address: b.address!, phone: b.phone, status: 'PENDING' })
        .returning();
      await tx.insert(businessHours).values(
        Array.from({ length: 7 }, (_, dow) => ({ salonId: salon.id, dayOfWeek: dow, openMinutes: 540, closeMinutes: 1080, isClosed: dow === 0 })),
      );
      await notify(tx, u.id, {
        type: 'SYSTEM', title: 'Your salon is awaiting approval',
        body: 'Complete your profile, services and staff. We will review and publish your salon shortly.', link: '/salon/profile',
      });
    }
    await audit(tx, { actorId: u.id, action: 'user.register', entityType: 'user', entityId: u.id, ip: req.ip });
    return u;
  });

  const accessToken = await issueSession(req, res, user);
  created(res, { user: publicUser(user), accessToken });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !valid || !user.isActive) throw unauthorized('Invalid email or password.');
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const accessToken = await issueSession(req, res, user);
  ok(res, { user: publicUser(user), accessToken });
});

export const refresh = asyncHandler(async (req, res) => {
  requireCsrfHeader(req);
  const raw = req.cookies?.[COOKIE] as string | undefined;
  if (!raw) throw unauthorized('No session');
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw))).limit(1);
  if (!row) throw unauthorized('Invalid session');
  if (row.revokedAt) {
    // A rotated token was presented again: assume theft and kill the whole family.
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
    res.clearCookie(COOKIE, { path: '/api/v1/auth' });
    throw unauthorized('Session revoked. Please sign in again.');
  }
  if (row.expiresAt < new Date()) throw unauthorized('Session expired');
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || !user.isActive) throw unauthorized('Account is not active.');
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  const accessToken = await issueSession(req, res, user, row.familyId);
  ok(res, { user: publicUser(user), accessToken });
});

export const logout = asyncHandler(async (req, res) => {
  requireCsrfHeader(req);
  const raw = req.cookies?.[COOKIE] as string | undefined;
  if (raw) await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(raw)));
  res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  ok(res, { loggedOut: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as { email: string };
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let devToken: string | undefined;
  if (user && user.isActive) {
    const token = randomToken(32);
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
    const emailEnabled = channelStatus().find((c) => c.channel === 'email')?.status === 'configured';
    if (emailEnabled) {
      await notify(db, user.id, {
        type: 'SYSTEM', title: 'Reset your password',
        body: `Use this link to reset your password (valid for 1 hour): ${env.CLIENT_ORIGIN}/reset-password?token=${token}`,
      });
    } else if (!isProd) {
      // Development convenience ONLY; never returned in production and clearly labelled.
      devToken = token;
    }
  }
  // Same response whether or not the account exists (prevents account enumeration).
  ok(res, {
    message: 'If an account exists for that email, a reset link has been sent.',
    ...(devToken ? { devOnlyResetToken: devToken, note: 'Email is not configured; token shown for local development only.' } : {}),
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) throw badRequest('This reset link is invalid or has expired.');
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
    await audit(tx, { actorId: row.userId, action: 'user.password_reset', entityType: 'user', entityId: row.userId, ip: req.ip });
  });
  ok(res, { message: 'Password updated. You can now sign in.' });
});

export const me = asyncHandler(async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  const [profile] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, u.id)).limit(1);
  const ownedSalons = u.role === 'OWNER' ? await db.select({ id: salons.id, name: salons.name, slug: salons.slug, status: salons.status }).from(salons).where(eq(salons.ownerId, u.id)) : [];
  const staffSalons =
    u.role === 'STAFF'
      ? await db
          .select({ id: salons.id, name: salons.name, slug: salons.slug, status: salons.status })
          .from(staffProfiles)
          .innerJoin(salons, eq(salons.id, staffProfiles.salonId))
          .where(and(eq(staffProfiles.userId, u.id), eq(staffProfiles.isActive, true)))
      : [];
  ok(res, { user: publicUser(u), city: profile?.city ?? null, salons: [...ownedSalons, ...staffSalons] });
});

export const updateMe = asyncHandler(async (req, res) => {
  const b = req.body as { fullName?: string; phone?: string; locale?: 'en' | 'am'; city?: string };
  if (b.phone) {
    const dup = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, b.phone), ne(users.id, req.user!.id))).limit(1);
    if (dup.length) throw conflict('That phone number is used by another account.', 'PHONE_TAKEN');
  }
  const { city, ...userFields } = b;
  if (Object.keys(userFields).length) await db.update(users).set(userFields).where(eq(users.id, req.user!.id));
  if (city !== undefined) {
    await db.insert(customerProfiles).values({ userId: req.user!.id, city }).onConflictDoUpdate({ target: customerProfiles.userId, set: { city } });
  }
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  ok(res, { user: publicUser(u) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  if (!(await verifyPassword(u.passwordHash, currentPassword))) throw badRequest('Your current password is incorrect.');
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, u.id));
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
  res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  ok(res, { message: 'Password changed. Please sign in again.' });
});
