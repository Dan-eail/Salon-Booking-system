import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { salons, staffProfiles, type Salon } from '../db/schema.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';
import { asyncHandler } from './auth.js';

export type SalonAccess = { salon: Salon; level: 'owner' | 'staff'; staffId?: string; isAdmin: boolean };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      salonAccess?: SalonAccess;
    }
  }
}

/**
 * Resolves `:salonId` and decides what the signed-in user may do in that salon.
 * Strangers get 404 (not 403) so salon ids cannot be enumerated. Admins act with owner rights.
 * Must run after requireAuth.
 */
export const salonAccess = (min: 'staff' | 'owner') =>
  asyncHandler(async (req, _res, next) => {
    const user = req.user;
    if (!user) throw unauthorized();
    const salonId = String(req.params.salonId);
    const [salon] = await db.select().from(salons).where(eq(salons.id, salonId)).limit(1);
    if (!salon) throw notFound('Salon not found');

    let access: SalonAccess | null = null;
    if (user.role === 'ADMIN') access = { salon, level: 'owner', isAdmin: true };
    else if (salon.ownerId === user.id) access = { salon, level: 'owner', isAdmin: false };
    else if (user.role === 'STAFF') {
      const [sp] = await db
        .select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(and(eq(staffProfiles.salonId, salon.id), eq(staffProfiles.userId, user.id), eq(staffProfiles.isActive, true)))
        .limit(1);
      if (sp) access = { salon, level: 'staff', staffId: sp.id, isAdmin: false };
    }
    if (!access) throw notFound('Salon not found');
    if (min === 'owner' && access.level !== 'owner') throw forbidden('Only the salon owner can do that.');
    req.salonAccess = access;
    next();
  });
