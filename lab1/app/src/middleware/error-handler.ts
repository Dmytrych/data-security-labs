import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../domain/errors.js';

function send(res: Parameters<ErrorRequestHandler>[2], status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** body-parser errors (malformed JSON, too large) carry a 4xx `status`. */
function isClientHttpError(err: unknown): err is { status: number; message: string } {
  if (typeof err !== 'object' || err === null || !('status' in err)) return false;
  const { status } = err;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** The only place errors become HTTP responses. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    send(res, err.status, err.code, err.message);
  } else if (err instanceof ZodError) {
    const message = err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    send(res, 400, 'VALIDATION_ERROR', message);
  } else if (isClientHttpError(err)) {
    send(res, 400, 'VALIDATION_ERROR', err.message);
  } else {
    console.error('Unexpected error:', err);
    send(res, 500, 'INTERNAL', 'internal server error');
  }
};
