import { Router } from 'express';
import * as c from '../controllers/public.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { availabilityQuery, availabilityRangeQuery, reviewsQuery, salonSearchQuery, slugParam } from '../validators/public.js';

const r = Router();
r.get('/meta', c.meta);
r.get('/popular-services', c.popularServices);
r.get('/promotions', c.activePromotions);
r.get('/testimonials', c.testimonials);
r.get('/salons', optionalAuth, validate({ query: salonSearchQuery }), c.searchSalons);
r.get('/salons/:slug', optionalAuth, validate({ params: slugParam }), c.salonDetail);
r.get('/salons/:slug/reviews', validate({ params: slugParam, query: reviewsQuery }), c.salonReviews);
r.get('/salons/:slug/availability', validate({ params: slugParam, query: availabilityQuery }), c.salonAvailability);
r.get('/salons/:slug/availability-range', validate({ params: slugParam, query: availabilityRangeQuery }), c.salonAvailabilityRange);
export default r;
