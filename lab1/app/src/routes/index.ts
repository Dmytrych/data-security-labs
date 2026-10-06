import { Router, type RequestHandler } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { AuthController, loginSchema, registerSchema } from '../controllers/auth.controller.js';
import { CommandController, runCommandSchema } from '../controllers/command.controller.js';
import { createFileSchema, FileController, fileParamsSchema, updateFileSchema } from '../controllers/file.controller.js';
import { ObjectController, objectParamsSchema, writeObjectSchema } from '../controllers/object.controller.js';
import { validateBody, validateParams } from '../middleware/validate.js';

export interface Controllers {
  auth: AuthController;
  objects: ObjectController;
  commands: CommandController;
  files: FileController;
  admin: AdminController;
}

export function buildApiRouter(c: Controllers, authenticate: RequestHandler): Router {
  const router = Router();

  router.post('/auth/register', validateBody(registerSchema), c.auth.register);
  router.post('/auth/login', validateBody(loginSchema), c.auth.login);
  router.post('/auth/logout', authenticate, c.auth.logout);
  router.get('/me', authenticate, c.auth.me);

  router.get('/objects', authenticate, c.objects.list);
  router.get('/objects/:name', authenticate, validateParams(objectParamsSchema), c.objects.read);
  router.put('/objects/:name', authenticate, validateParams(objectParamsSchema), validateBody(writeObjectSchema), c.objects.write);

  router.get('/commands', authenticate, c.commands.list);
  router.post('/commands', authenticate, validateBody(runCommandSchema), c.commands.run);

  // Example CRUD over mocked storage; only the kernel checks are real.
  router.get('/files', authenticate, c.files.list);
  router.post('/files', authenticate, validateBody(createFileSchema), c.files.create);
  router.get('/files/:name', authenticate, validateParams(fileParamsSchema), c.files.read);
  router.put('/files/:name', authenticate, validateParams(fileParamsSchema), validateBody(updateFileSchema), c.files.update);
  router.delete('/files/:name', authenticate, validateParams(fileParamsSchema), c.files.delete);

  router.get('/admin/matrix', authenticate, c.admin.matrix);
  router.get('/admin/audit', authenticate, c.admin.audit);

  return router;
}
