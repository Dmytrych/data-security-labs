import type { Request, Response } from 'express';
import { z } from 'zod';
import { getSubject } from '../middleware/authenticate.js';
import type { CommandService } from '../services/command.service.js';

export const runCommandSchema = z.object({
  command: z.string().min(1).max(64),
  args: z.record(z.string(), z.string().max(64)).default({}),
});

export class CommandController {
  constructor(private readonly commandService: CommandService) {}

  list = (_req: Request, res: Response): void => {
    res.json(this.commandService.list());
  };

  run = (req: Request<object, unknown, z.infer<typeof runCommandSchema>>, res: Response): void => {
    res.json(this.commandService.run(getSubject(res), req.body.command, req.body.args));
  };
}
