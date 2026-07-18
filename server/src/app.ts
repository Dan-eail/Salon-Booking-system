import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { buildOpenApi } from './lib/openapi.js';
import { UPLOAD_DIR } from './lib/uploads.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import api from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Swagger UI needs inline scripts, so it gets its own relaxed CSP; everything else keeps Helmet's defaults.
  const spec = buildOpenApi();
  app.get('/api/openapi.json', (_req, res) => res.json(spec));
  app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(spec));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  );
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test', serializers: { req: (r) => ({ method: r.method, url: r.url }), res: (r) => ({ statusCode: r.statusCode }) } }));
  // Payment webhooks need the raw body for signature verification.
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '256kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api/v1', apiLimiter, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
