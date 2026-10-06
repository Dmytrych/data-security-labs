import type { Request, Response } from 'express';
import { z } from 'zod';
import { getSubject } from '../middleware/authenticate.js';
import type { ObjectService } from '../services/object.service.js';

export const objectParamsSchema = z.object({ name: z.string().min(1).max(64) });

export const writeObjectSchema = z.object({ content: z.string().max(100_000) });

type ObjectParams = z.infer<typeof objectParamsSchema>;

export class ObjectController {
  constructor(private readonly objectService: ObjectService) {}

  list = (_req: Request, res: Response): void => {
    res.json(this.objectService.listForSubject(getSubject(res)));
  };

  read = (req: Request<ObjectParams>, res: Response): void => {
    res.json(this.objectService.read(getSubject(res), req.params.name));
  };

  write = (req: Request<ObjectParams, unknown, z.infer<typeof writeObjectSchema>>, res: Response): void => {
    res.json(this.objectService.write(getSubject(res), req.params.name, req.body.content));
  };
}
