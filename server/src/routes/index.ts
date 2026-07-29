import { Router } from 'express';
import admin from './admin.js';
import auth from './auth.js';
import customer from './customer.js';
import owner from './owner.js';
import publicRoutes from './public.js';
import webhooks from './webhooks.js';

const r = Router();
r.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
r.use('/auth', auth);
r.use('/me', customer);
r.use('/owner', owner);
r.use('/admin', admin);
r.use('/webhooks', webhooks);
r.use('/', publicRoutes);
export default r;
