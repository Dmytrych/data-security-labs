import type { RequestHandler, Response } from 'express';
import type { Subject } from '../domain/types.js';
import type { AuthService, Session } from '../services/auth.service.js';

interface AuthLocals {
  session?: Session;
}

/** Bearer token → `res.locals.session`; anything else is a 401. */
export function createAuthenticate(authService: AuthService): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization');
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    (res.locals as AuthLocals).session = authService.authenticate(match?.[1]);
    next();
  };
}

export function getSession(res: Response): Session {
  const session = (res.locals as AuthLocals).session;
  // Only reachable if a protected route was mounted without the authenticate middleware.
  if (!session) throw new Error('authenticate middleware did not run');
  return session;
}

export function getSubject(res: Response): Subject {
  return getSession(res).subject;
}
