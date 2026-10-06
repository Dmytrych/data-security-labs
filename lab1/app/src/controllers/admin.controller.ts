import type { Request, Response } from 'express';
import { z } from 'zod';
import { AUDIT_OUTCOMES } from '../domain/types.js';
import { getSubject } from '../middleware/authenticate.js';
import type { AdminService } from '../services/admin.service.js';

// Express 5 makes req.query read-only, so the query is parsed here rather than by middleware.
const auditQuerySchema = z.object({
  outcome: z.enum(AUDIT_OUTCOMES).optional(),
  actor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  matrix = (_req: Request, res: Response): void => {
    res.json(this.adminService.matrix(getSubject(res)));
  };

  audit = (req: Request, res: Response): void => {
    res.json(this.adminService.audit(getSubject(res), auditQuerySchema.parse(req.query)));
  };
}
