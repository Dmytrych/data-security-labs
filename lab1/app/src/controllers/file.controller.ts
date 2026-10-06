import type { Request, Response } from 'express';
import { z } from 'zod';
import { NAME_PATTERN } from '../domain/types.js';
import { getSubject } from '../middleware/authenticate.js';
import type { FileService } from '../services/file.service.js';

export const fileParamsSchema = z.object({ name: z.string().min(1).max(64) });

export const createFileSchema = z.object({
  name: z.string().regex(NAME_PATTERN, 'name must match ^[A-Za-z0-9._-]{1,64}$'),
  content: z.string().max(100_000).default(''),
});

export const updateFileSchema = z.object({ content: z.string().max(100_000) });

type FileParams = z.infer<typeof fileParamsSchema>;

/** Example CRUD controller over mocked file storage, protected by the security kernel. */
export class FileController {
  constructor(private readonly fileService: FileService) {}

  list = (_req: Request, res: Response): void => {
    res.json(this.fileService.list(getSubject(res)));
  };

  create = (req: Request<object, unknown, z.infer<typeof createFileSchema>>, res: Response): void => {
    res.status(201).json(this.fileService.create(getSubject(res), req.body.name, req.body.content));
  };

  read = (req: Request<FileParams>, res: Response): void => {
    res.json(this.fileService.read(getSubject(res), req.params.name));
  };

  update = (req: Request<FileParams, unknown, z.infer<typeof updateFileSchema>>, res: Response): void => {
    res.json(this.fileService.update(getSubject(res), req.params.name, req.body.content));
  };

  delete = (req: Request<FileParams>, res: Response): void => {
    this.fileService.delete(getSubject(res), req.params.name);
    res.status(204).end();
  };
}
