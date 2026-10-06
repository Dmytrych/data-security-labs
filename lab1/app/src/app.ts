import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import type { Container } from './container.js';
import { NotFoundError } from './domain/errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { buildApiRouter } from './routes/index.js';

// Resolved from this file so it works both from src/ (tsx) and dist/src/ (node).
const PUBLIC_DIR =
  ['../public/', '../../public/']
    .map((rel) => fileURLToPath(new URL(rel, import.meta.url)))
    .find((dir) => existsSync(dir)) ?? fileURLToPath(new URL('../public/', import.meta.url));

export function createApp(container: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  // 100 000 chars of non-ASCII text can exceed the 100kb default.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(PUBLIC_DIR));
  app.use('/api', buildApiRouter(container.controllers, container.authenticate));
  app.use('/api', (req, _res, next) => {
    next(new NotFoundError(`no route ${req.method} /api${req.path}`));
  });
  app.use(errorHandler);
  return app;
}
