import { Router } from 'express';
import * as c from '../controllers/admin.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import {
  adminBookingsQuery, adminListQuery, adminRange, adminReviewPatch, adminReviewsQuery, adminSalonStatus, adminSalonsQuery, adminUserPatch, adminUsersQuery,
  adminVerify, auditQuery, categoryCreate, categoryUpdate, promotionSchema, promotionUpdate, settingsSchema,
} from '../validators/admin.js';

// Every admin route is enforced here, on the server — hiding buttons in the UI is not the control.
const r = Router();
r.use(requireAuth, requireRole('ADMIN'));

r.get('/overview', c.overview);
r.get('/users', validate({ query: adminUsersQuery }), c.listUsers);
r.patch('/users/:id', validate({ params: idParam, body: adminUserPatch }), c.patchUser);
r.get('/salons', validate({ query: adminSalonsQuery }), c.listSalons);
r.patch('/salons/:id/status', validate({ params: idParam, body: adminSalonStatus }), c.setSalonStatus);
r.patch('/salons/:id/verify', validate({ params: idParam, body: adminVerify }), c.setSalonVerified);
r.get('/categories', c.listCategories);
r.post('/categories', validate({ body: categoryCreate }), c.createCategory);
r.patch('/categories/:id', validate({ params: idParam, body: categoryUpdate }), c.updateCategory);
r.delete('/categories/:id', validate({ params: idParam }), c.deleteCategory);
r.get('/bookings', validate({ query: adminBookingsQuery }), c.listBookings);
r.get('/reviews', validate({ query: adminReviewsQuery }), c.listReviews);
r.patch('/reviews/:id', validate({ params: idParam, body: adminReviewPatch }), c.moderateReview);
r.get('/promotions', c.listPromotions);
r.post('/promotions', validate({ body: promotionSchema }), c.createPromotion);
r.patch('/promotions/:id', validate({ params: idParam, body: promotionUpdate }), c.updatePromotion);
r.delete('/promotions/:id', validate({ params: idParam }), c.deletePromotion);
r.get('/settings', c.getSettings);
r.put('/settings', validate({ body: settingsSchema }), c.updateSettings);
r.get('/audit', validate({ query: auditQuery }), c.listAudit);
r.get('/reports', validate({ query: adminRange }), c.reports);
void adminListQuery;
export default r;
