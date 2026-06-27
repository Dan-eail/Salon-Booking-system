import type { Response } from 'express';

export type Meta = { page: number; pageSize: number; total: number; totalPages: number };

export function ok<T>(res: Response, data: T, meta?: Meta | Record<string, unknown>) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}
export function created<T>(res: Response, data: T) {
  return res.status(201).json({ success: true, data });
}
export function paginate(total: number, page: number, pageSize: number): Meta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
