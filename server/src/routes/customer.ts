import { Router } from 'express';
import * as c from '../controllers/customer.js';
import { requireAuth } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { cancelSchema, createBookingSchema, myAppointmentsQuery, notificationsQuery, rescheduleSchema, reviewSchema, salonIdParam } from '../validators/customer.js';

const r = Router();
r.use(requireAuth);

r.post('/appointments', bookingLimiter, validate({ body: createBookingSchema }), c.createBooking);
r.get('/appointments', validate({ query: myAppointmentsQuery }), c.myAppointments);
r.get('/appointments/:id', validate({ params: idParam }), c.getBooking);
r.post('/appointments/:id/cancel', validate({ params: idParam, body: cancelSchema }), c.cancelBooking);
r.post('/appointments/:id/reschedule', bookingLimiter, validate({ params: idParam, body: rescheduleSchema }), c.rescheduleBooking);
r.post('/appointments/:id/review', validate({ params: idParam, body: reviewSchema }), c.reviewBooking);
r.post('/appointments/:id/pay', validate({ params: idParam }), c.initiatePayment);
r.get('/appointments/:id/pay/verify', validate({ params: idParam }), c.verifyPayment);
r.post('/appointments/:id/pay/verify', validate({ params: idParam }), c.verifyPayment);
r.post('/appointments/simulate-payment', c.simulatePayment);

r.get('/favorites', c.listFavorites);
r.put('/favorites/:salonId', validate({ params: salonIdParam }), c.addFavorite);
r.delete('/favorites/:salonId', validate({ params: salonIdParam }), c.removeFavorite);

r.get('/notifications', validate({ query: notificationsQuery }), c.listNotifications);
r.post('/notifications/read-all', c.markAllNotificationsRead);
r.post('/notifications/:id/read', validate({ params: idParam }), c.markNotificationRead);
export default r;
