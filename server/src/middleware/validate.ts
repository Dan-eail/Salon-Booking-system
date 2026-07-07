import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { badRequest } from '../lib/errors.js';

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/** Validates and REPLACES req.body/query/params with parsed (stripped, coerced) values — this is what prevents mass assignment. */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(
          badRequest('Please check the highlighted fields.', {
            fields: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          }),
        );
      }
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
export type Infer<T extends ZodTypeAny> = z.infer<T>;
