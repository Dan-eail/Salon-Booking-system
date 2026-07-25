import { Router } from 'express';
import * as c from '../controllers/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, forgotSchema, loginSchema, profileSchema, registerSchema, resetSchema } from '../validators/auth.js';

const r = Router();
r.post('/register', authLimiter, validate({ body: registerSchema }), c.register);
r.post('/login', authLimiter, validate({ body: loginSchema }), c.login);
r.post('/refresh', c.refresh);
r.post('/logout', c.logout);
r.post('/forgot-password', passwordResetLimiter, validate({ body: forgotSchema }), c.forgotPassword);
r.post('/reset-password', passwordResetLimiter, validate({ body: resetSchema }), c.resetPassword);
r.get('/me', requireAuth, c.me);
r.patch('/me', requireAuth, validate({ body: profileSchema }), c.updateMe);
r.post('/change-password', requireAuth, authLimiter, validate({ body: changePasswordSchema }), c.changePassword);
export default r;
