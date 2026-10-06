import type { Request, Response } from 'express';
import { z } from 'zod';
import { NAME_PATTERN } from '../domain/types.js';
import { getSession, getSubject } from '../middleware/authenticate.js';
import type { AuthService } from '../services/auth.service.js';

export const registerSchema = z.object({
  name: z.string().regex(NAME_PATTERN, 'name must match ^[A-Za-z0-9._-]{1,64}$'),
  password: z.string().min(4).max(128),
});

export const loginSchema = z.object({
  name: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

type Credentials = z.infer<typeof loginSchema>;

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request<object, unknown, Credentials>, res: Response): Promise<void> => {
    res.status(201).json(await this.authService.register(req.body.name, req.body.password));
  };

  login = async (req: Request<object, unknown, Credentials>, res: Response): Promise<void> => {
    res.json(await this.authService.login(req.body.name, req.body.password));
  };

  logout = (_req: Request, res: Response): void => {
    this.authService.logout(getSession(res));
    res.status(204).end();
  };

  me = (_req: Request, res: Response): void => {
    res.json(this.authService.me(getSubject(res)));
  };
}
