import type { RequestHandler } from 'express';
import type { Config } from './config.js';
import { AdminController } from './controllers/admin.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { CommandController } from './controllers/command.controller.js';
import { FileController } from './controllers/file.controller.js';
import { ObjectController } from './controllers/object.controller.js';
import { openDatabase, type Db } from './db/connection.js';
import { SecurityKernel } from './kernel/security-kernel.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { CredentialRepository } from './repositories/credential.repository.js';
import { FileRepository } from './repositories/file.repository.js';
import { MatrixRepository } from './repositories/matrix.repository.js';
import { ObjectMutationRepository } from './repositories/object-mutation.repository.js';
import { ObjectRepository } from './repositories/object.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import type { Controllers } from './routes/index.js';
import { AdminService } from './services/admin.service.js';
import { AuditService } from './services/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { CommandService } from './services/command.service.js';
import { FileService } from './services/file.service.js';
import { ObjectService } from './services/object.service.js';
import { hashPassword } from './utils/password.js';

export interface Container {
  db: Db;
  kernel: SecurityKernel;
  services: {
    audit: AuditService;
    auth: AuthService;
    objects: ObjectService;
    commands: CommandService;
    files: FileService;
    admin: AdminService;
  };
  controllers: Controllers;
  authenticate: RequestHandler;
}

/**
 * Manual DI. The kernel-only repositories (matrix, object-mutation) are created here and handed
 * straight to the kernel; no other component receives them.
 */
export function createContainer(config: Config): Container {
  const db = openDatabase(config.dbPath);

  const objectRepo = new ObjectRepository(db);
  const credentialRepo = new CredentialRepository(db);
  const sessionRepo = new SessionRepository(db);
  const audit = new AuditService(new AuditRepository(db));

  const kernel = new SecurityKernel(
    db,
    objectRepo,
    new ObjectMutationRepository(db),
    new MatrixRepository(db),
    credentialRepo,
    audit,
  );

  const services = {
    audit,
    auth: new AuthService(db, kernel, objectRepo, credentialRepo, sessionRepo, audit, config.tokenTtlHours),
    objects: new ObjectService(kernel, objectRepo),
    commands: new CommandService(kernel),
    files: new FileService(kernel, objectRepo, new FileRepository()),
    admin: new AdminService(kernel, audit),
  };

  return {
    db,
    kernel,
    services,
    controllers: {
      auth: new AuthController(services.auth),
      objects: new ObjectController(services.objects),
      commands: new CommandController(services.commands),
      files: new FileController(services.files),
      admin: new AdminController(services.admin),
    },
    authenticate: createAuthenticate(services.auth),
  };
}

/** Run kernel.initialize with the configured admin password (spec §3.2). */
export async function initializeKernel(container: Container, config: Config): Promise<void> {
  if (config.adminPasswordIsDefault) {
    console.warn("WARNING: ADMIN_PASSWORD is not set; using the default password 'admin'.");
  }
  container.kernel.initialize(await hashPassword(config.adminPassword));
}
