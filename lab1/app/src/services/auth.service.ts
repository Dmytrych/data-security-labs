import type { Db } from '../db/connection.js';
import { UnauthorizedError } from '../domain/errors.js';
import type { Subject } from '../domain/types.js';
import type { Capability } from '../kernel/hru.types.js';
import type { SecurityKernel } from '../kernel/security-kernel.js';
import type { CredentialRepository } from '../repositories/credential.repository.js';
import type { ObjectRepository } from '../repositories/object.repository.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import { hashPassword, verifyPassword, type PasswordHash } from '../utils/password.js';
import { generateToken, hashToken } from '../utils/token.js';
import type { AuditService } from './audit.service.js';

export interface LoginResult {
  token: string;
  subject: { name: string };
  isAdmin: boolean;
  expiresAt: string;
}

export interface Session {
  subject: Subject;
  tokenHash: string;
}

const INVALID_CREDENTIALS = 'invalid credentials';

export class AuthService {
  /** Verified against when the subject doesn't exist, so unknown names cost the same time as wrong passwords. */
  private readonly dummyHash: Promise<PasswordHash>;

  constructor(
    private readonly db: Db,
    private readonly kernel: SecurityKernel,
    private readonly objectRepo: ObjectRepository,
    private readonly credentialRepo: CredentialRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly auditService: AuditService,
    private readonly tokenTtlHours: number,
  ) {
    this.dummyHash = hashPassword('dummy-password-for-timing');
  }

  /** Create a subject through the kernel (HRU `create subject`) and store its credentials atomically. */
  async register(name: string, password: string): Promise<{ subject: { name: string } }> {
    const passwordHash = await hashPassword(password);

    // The kernel audits its own denial after rolling back its savepoint. If the outer transaction rolled
    // back too, that audit entry would be lost, so the denial is returned (committing only the audit) and
    // rethrown afterwards.
    const failure = this.db.transaction((): Error | null => {
      try {
        this.kernel.execute(null, 'register_subject', { s: name }, { allowInternal: true });
      } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
      }
      const subject = this.objectRepo.findByName(name);
      if (!subject) throw new Error('registered subject not found');
      this.credentialRepo.create(subject.id, passwordHash);
      return null;
    })();

    if (failure !== null) {
      this.auditService.record({
        actor: name,
        event: 'REGISTER',
        action: 'register',
        args: { name },
        outcome: 'DENIED',
        reason: failure.message,
      });
      throw failure;
    }
    this.auditService.record({
      actor: name,
      event: 'REGISTER',
      action: 'register',
      args: { name },
      outcome: 'ALLOWED',
      reason: null,
    });
    return { subject: { name } };
  }

  /** Unknown subject and wrong password give the same response, so names can't be probed. */
  async login(name: string, password: string): Promise<LoginResult> {
    const now = new Date();
    this.sessionRepo.deleteExpired(now.toISOString());

    const entity = this.objectRepo.findByName(name);
    const stored = entity?.kind === 'subject' ? this.credentialRepo.findBySubjectId(entity.id) : undefined;
    const valid = await verifyPassword(password, stored ?? (await this.dummyHash));

    if (!entity || !stored || !valid) {
      this.auditService.record({
        actor: name,
        event: 'LOGIN',
        action: 'login',
        args: { name },
        outcome: 'DENIED',
        reason: stored ? 'wrong password' : 'unknown subject',
      });
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const token = generateToken();
    const expiresAt = new Date(now.getTime() + this.tokenTtlHours * 3_600_000).toISOString();
    this.sessionRepo.create(hashToken(token), entity.id, expiresAt);
    this.auditService.record({
      actor: name,
      event: 'LOGIN',
      action: 'login',
      args: { name },
      outcome: 'ALLOWED',
      reason: null,
    });
    return { token, subject: { name: entity.name }, isAdmin: this.kernel.isAdmin(entity.id), expiresAt };
  }

  logout(session: Session): void {
    this.sessionRepo.delete(session.tokenHash);
    this.auditService.record({
      actor: session.subject.name,
      event: 'LOGOUT',
      action: 'logout',
      args: null,
      outcome: 'ALLOWED',
      reason: null,
    });
  }

  /** Resolve a bearer token to its session. Only failures are audited; the action itself gets logged. */
  authenticate(token: string | undefined): Session {
    if (!token) {
      this.denyAuth('missing token');
    }
    const tokenHash = hashToken(token);
    const subject = this.sessionRepo.findValid(tokenHash, new Date().toISOString());
    if (!subject) {
      this.denyAuth('invalid or expired token');
    }
    return { subject, tokenHash };
  }

  /** The caller's profile and capability list (their row of M). */
  me(subject: Subject): { subject: { name: string }; isAdmin: boolean; capabilities: Capability[] } {
    return {
      subject: { name: subject.name },
      isAdmin: this.kernel.isAdmin(subject.id),
      capabilities: this.kernel.capabilityList(subject.id),
    };
  }

  private denyAuth(reason: string): never {
    this.auditService.record({ actor: null, event: 'AUTH', action: 'authenticate', args: null, outcome: 'DENIED', reason });
    throw new UnauthorizedError(reason);
  }
}
