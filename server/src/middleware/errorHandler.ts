import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  const e = err as { type?: string; code?: string; status?: number; cause?: { code?: string; constraint?: string } };
  if (e.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
  }
  if (e.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
  }
  if (e.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File is too large (max 6 MB)' } });
  }
  // Unique violations surface as friendly conflicts
  const pgCode = e.code ?? e.cause?.code;
  if (pgCode === '23505') {
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'That value is already in use.' } });
  }
  if (pgCode === '23P01') {
    return res.status(409).json({ success: false, error: { code: 'SLOT_UNAVAILABLE', message: 'That time is no longer available.' } });
  }
  logger.error({ err: { message: (err as Error).message, stack: (err as Error).stack }, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
