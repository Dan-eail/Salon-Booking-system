import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, type Role } from '../db/schema.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/security.js';

export type AuthUser = { id: string; role: Role; email: string; fullName: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

async function resolveUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw unauthorized('Session expired. Please sign in again.');
  }
  // Re-check the account on every request so deactivation / role changes take effect immediately
  // and a token can never carry stale privileges.
  const [u] = await db
    .select({ id: users.id, role: users.role, email: users.email, fullName: users.fullName, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  if (!u || !u.isActive) throw unauthorized('Account is not active.');
  return { id: u.id, role: u.role, email: u.email, fullName: u.fullName };
}

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = (await resolveUser(req)) ?? undefined;
  next();
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const u = await resolveUser(req);
  if (!u) throw unauthorized();
  req.user = u;
  next();
});

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
