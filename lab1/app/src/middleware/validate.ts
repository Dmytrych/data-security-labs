import type { RequestHandler } from 'express';
import type { z } from 'zod';

/** Replace `req.body` with its parsed value; a ZodError goes to the error handler as a 400. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateParams(schema: z.ZodType<Record<string, string>>): RequestHandler {
  return (req, _res, next) => {
    req.params = schema.parse(req.params);
    next();
  };
}
