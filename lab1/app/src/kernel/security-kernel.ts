import type { Db } from '../db/connection.js';
import { AccessDeniedError, AppError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../domain/errors.js';
import { NAME_PATTERN, type EntityRecord, type ObjectKind, type Subject } from '../domain/types.js';
import type { CredentialRepository } from '../repositories/credential.repository.js';
import type { MatrixRepository } from '../repositories/matrix.repository.js';
import type { ObjectMutationRepository } from '../repositories/object-mutation.repository.js';
import type { ObjectRepository } from '../repositories/object.repository.js';
import type { AuditService } from '../services/audit.service.js';
import type { PasswordHash } from '../utils/password.js';
import {
  RIGHTS,
  SYSTEM_OBJECT,
  type Capability,
  type CommandDef,
  type CommandResult,
  type MatrixSnapshot,
  type PrimitiveOp,
  type Right,
} from './hru.types.js';
import { POLICY } from './policy.js';

const ADMIN_SUBJECT = 'admin';

/** Parameters bound for one command run: entity names by param, and ids once the entity exists. */
interface Binding {
  names: Map<string, string>;
  ids: Map<string, number>;
  kinds: Map<string, ObjectKind>;
  rights: Map<string, Right>;
}

function sortRights(rights: Iterable<Right>): Right[] {
  return [...rights].sort((a, b) => RIGHTS.indexOf(a) - RIGHTS.indexOf(b));
}

function isRight(value: string): value is Right {
  return (RIGHTS as readonly string[]).includes(value);
}

/**
 * The HRU security kernel. It is the single place that decides access and the single writer of the
 * access matrix and of entity creation/destruction. Every decision it makes is audited.
 */
export class SecurityKernel {
  constructor(
    private readonly db: Db,
    private readonly objectRepo: ObjectRepository,
    private readonly objectMutationRepo: ObjectMutationRepository,
    private readonly matrixRepo: MatrixRepository,
    private readonly credentialRepo: CredentialRepository,
    private readonly auditService: AuditService,
  ) {}

  /** Build the initial state Q0 (system, admin, control ∈ M[admin, system]). Idempotent. */
  initialize(adminPasswordHash: PasswordHash): void {
    if (this.objectRepo.findByName(SYSTEM_OBJECT)) return;
    this.db.transaction(() => {
      const systemId = this.objectMutationRepo.create(SYSTEM_OBJECT, 'system');
      const adminId = this.objectMutationRepo.create(ADMIN_SUBJECT, 'subject');
      this.credentialRepo.create(adminId, adminPasswordHash);
      this.matrixRepo.enter(adminId, systemId, 'control');
    })();
    this.auditService.record({
      actor: null,
      event: 'SYSTEM',
      action: 'initialize',
      args: { admin: ADMIN_SUBJECT },
      outcome: 'ALLOWED',
      reason: null,
    });
  }

  /**
   * Run an HRU command: bind params, then atomically check all conditions and apply the
   * body. `actor` is null only for internal commands (registration). Throws an AppError on denial.
   */
  execute(
    actor: Subject | null,
    commandName: string,
    args: Record<string, string>,
    opts: { allowInternal?: boolean } = {},
  ): CommandResult {
    // `caller` is always the authenticated subject; a client-supplied value is discarded.
    const effectiveArgs: Record<string, string> = Object.fromEntries(
      Object.entries(args).filter(([key]) => key !== 'caller'),
    );
    if (actor) effectiveArgs.caller = actor.name;
    const auditActor = actor?.name ?? effectiveArgs.s ?? null;

    let changes: string[];
    try {
      const cmd = POLICY.find((c) => c.name === commandName);
      // Internal commands are indistinguishable from unknown ones to API callers.
      if (!cmd || (cmd.internal && !opts.allowInternal)) throw new NotFoundError(`unknown command '${commandName}'`);
      if (!cmd.internal && !actor) throw new UnauthorizedError('authentication required');

      const binding = this.bind(cmd, actor, args);
      changes = this.db.transaction(() => {
        for (const c of cmd.conditions) {
          const s = this.idOf(binding, c.subject);
          const o = this.idOf(binding, c.object);
          if (!this.matrixRepo.rights(s, o).includes(c.right)) {
            throw new AccessDeniedError(
              `missing ${c.right} on M[${this.nameOf(binding, c.subject)}, ${this.nameOf(binding, c.object)}]`,
            );
          }
        }
        this.checkInvariants(cmd.body, binding, actor);
        return cmd.body.map((op) => this.apply(op, binding));
      })();
    } catch (err) {
      // Audit runs outside the transaction so the denial is recorded even though the command rolled back.
      this.auditService.record({
        actor: auditActor,
        event: 'COMMAND',
        action: commandName,
        args: effectiveArgs,
        outcome: 'DENIED',
        reason: err instanceof AppError ? err.message : 'internal error',
      });
      throw err;
    }

    this.auditService.record({
      actor: auditActor,
      event: 'COMMAND',
      action: commandName,
      args: { ...effectiveArgs, changes },
      outcome: 'ALLOWED',
      reason: null,
    });
    return { command: commandName, args: effectiveArgs, changes };
  }

  /**
   * Real-time check for operations that don't change the matrix (reading/writing content, admin views).
   * Throws NotFoundError / AccessDeniedError on deny. Returns the resolved object.
   */
  authorize(actor: Subject, right: Right, objectName: string, operation: string): EntityRecord {
    const audit = (outcome: 'ALLOWED' | 'DENIED', reason: string | null): void =>
      this.auditService.record({
        actor: actor.name,
        event: 'OPERATION',
        action: operation,
        args: { object: objectName, right },
        outcome,
        reason,
      });

    const object = this.objectRepo.findByName(objectName);
    if (!object) {
      const message = `object '${objectName}' not found`;
      audit('DENIED', message);
      throw new NotFoundError(message);
    }
    if (!this.matrixRepo.rights(actor.id, object.id).includes(right)) {
      const message = `missing ${right} on M[${actor.name}, ${object.name}]`;
      audit('DENIED', message);
      throw new AccessDeniedError(message);
    }
    audit('ALLOWED', null);
    return object;
  }

  /** M[s, o]. Not audited. */
  rightsOf(subjectId: number, objectId: number): Right[] {
    return sortRights(this.matrixRepo.rights(subjectId, objectId));
  }

  /** control ∈ M[s, system]. Not audited. */
  isAdmin(subjectId: number): boolean {
    const system = this.objectRepo.findByName(SYSTEM_OBJECT);
    return system !== undefined && this.matrixRepo.rights(subjectId, system.id).includes('control');
  }

  /** The subject's row of M, i.e. its capability list. Not audited. */
  capabilityList(subjectId: number): Capability[] {
    const byObject = new Map<string, { kind: ObjectKind; rights: Right[] }>();
    for (const entry of this.matrixRepo.rowOf(subjectId)) {
      const cell = byObject.get(entry.object) ?? { kind: entry.kind, rights: [] };
      cell.rights.push(entry.right);
      byObject.set(entry.object, cell);
    }
    return [...byObject].map(([object, { kind, rights }]) => ({ object, kind, rights: sortRights(rights) }));
  }

  /** Whole matrix: subjects as rows, all objects (subjects included, as in HRU) as columns. Not audited. */
  matrixSnapshot(): MatrixSnapshot {
    const entities = this.objectRepo.listAll();
    const subjects = entities.filter((e) => e.kind === 'subject').map((e) => e.name);
    const objects = entities.map((e) => e.name);
    const cells: Record<string, Record<string, Right[]>> = {};
    for (const { subject, object, right } of this.matrixRepo.all()) {
      const row = (cells[subject] ??= {});
      row[object] = sortRights([...(row[object] ?? []), right]);
    }
    return { subjects, objects, cells };
  }

  /** Commands available through the API (internal ones are hidden). */
  listCommands(): CommandDef[] {
    return POLICY.filter((c) => !c.internal);
  }

  /** Validate and resolve request args against the command's parameter types. Throws on failure. */
  private bind(cmd: CommandDef, actor: Subject | null, args: Record<string, string>): Binding {
    const binding: Binding = { names: new Map(), ids: new Map(), kinds: new Map(), rights: new Map() };
    const declared = new Set(cmd.params.map((p) => p.name));
    for (const key of Object.keys(args)) {
      if (key !== 'caller' && !declared.has(key)) throw new ValidationError(`unknown argument '${key}'`);
    }

    for (const param of cmd.params) {
      if (param.type === 'caller') {
        if (!actor) throw new UnauthorizedError('authentication required');
        binding.names.set(param.name, actor.name);
        binding.ids.set(param.name, actor.id);
        binding.kinds.set(param.name, 'subject');
        continue;
      }

      const value = args[param.name];
      if (value === undefined || value === '') throw new ValidationError(`missing argument '${param.name}'`);

      switch (param.type) {
        case 'right':
          if (!isRight(value)) throw new ValidationError(`'${value}' is not a right (expected ${RIGHTS.join(', ')})`);
          binding.rights.set(param.name, value);
          break;
        case 'newName':
          if (!NAME_PATTERN.test(value)) throw new ValidationError(`invalid name '${value}'`);
          if (this.objectRepo.findByName(value)) throw new ConflictError(`name '${value}' is already taken`);
          binding.names.set(param.name, value);
          break;
        case 'subject':
        case 'file':
        case 'object': {
          const entity = this.objectRepo.findByName(value);
          if (!entity) throw new NotFoundError(`object '${value}' not found`);
          if (param.type !== 'object' && entity.kind !== param.type) {
            throw new ValidationError(`'${value}' is not a ${param.type}`);
          }
          binding.names.set(param.name, entity.name);
          binding.ids.set(param.name, entity.id);
          binding.kinds.set(param.name, entity.kind);
          break;
        }
      }
    }
    return binding;
  }

  /** Kernel invariants (spec §3.5) checked after conditions and before the body is applied. */
  private checkInvariants(body: readonly PrimitiveOp[], binding: Binding, actor: Subject | null): void {
    for (const op of body) {
      if (op.op !== 'destroy_subject' && op.op !== 'destroy_object') continue;
      // 1. Without `system` nobody could ever hold `control` again.
      if (binding.kinds.get(op.target) === 'system') {
        throw new AccessDeniedError('the system object can never be destroyed');
      }
      // 2. Prevents an admin from locking the system out by deleting themselves.
      if (op.op === 'destroy_subject' && actor && binding.ids.get(op.target) === actor.id) {
        throw new AccessDeniedError('a subject cannot destroy itself');
      }
    }
  }

  /** Apply one HRU primitive operation and describe it. Runs inside the command transaction. */
  private apply(op: PrimitiveOp, binding: Binding): string {
    switch (op.op) {
      case 'create_subject':
      case 'create_object': {
        const kind: ObjectKind = op.op === 'create_subject' ? 'subject' : 'file';
        const name = this.nameOf(binding, op.target);
        binding.ids.set(op.target, this.objectMutationRepo.create(name, kind));
        binding.kinds.set(op.target, kind);
        return `create ${op.op === 'create_subject' ? 'subject' : 'object'} ${name}`;
      }
      case 'destroy_subject':
      case 'destroy_object': {
        // FK cascade removes the row/column of M and, for subjects, credentials and sessions (invariant 4).
        this.objectMutationRepo.destroy(this.idOf(binding, op.target));
        return `destroy ${op.op === 'destroy_subject' ? 'subject' : 'object'} ${this.nameOf(binding, op.target)}`;
      }
      case 'enter':
      case 'delete': {
        const right = typeof op.right === 'string' ? op.right : this.rightParam(binding, op.right.param);
        const s = this.idOf(binding, op.subject);
        const o = this.idOf(binding, op.object);
        const cell = `M[${this.nameOf(binding, op.subject)}, ${this.nameOf(binding, op.object)}]`;
        // Invariant 3: entering a present right or deleting a missing one is a no-op, not an error.
        if (op.op === 'enter') {
          const changed = this.matrixRepo.enter(s, o, right);
          return `enter ${right} into ${cell}${changed ? '' : ' (already present)'}`;
        }
        const changed = this.matrixRepo.delete(s, o, right);
        return `delete ${right} from ${cell}${changed ? '' : ' (was not present)'}`;
      }
    }
  }

  /** The reserved name `system` refers to the system object itself, resolved before params. */
  private idOf(binding: Binding, ref: string): number {
    if (ref === SYSTEM_OBJECT) {
      const system = this.objectRepo.findByName(SYSTEM_OBJECT);
      if (!system) throw new Error('kernel not initialized: system object missing');
      return system.id;
    }
    const id = binding.ids.get(ref);
    if (id === undefined) throw new Error(`policy error: '${ref}' is not bound to an existing entity`);
    return id;
  }

  private nameOf(binding: Binding, ref: string): string {
    if (ref === SYSTEM_OBJECT) return SYSTEM_OBJECT;
    const name = binding.names.get(ref);
    if (name === undefined) throw new Error(`policy error: '${ref}' is not a parameter`);
    return name;
  }

  private rightParam(binding: Binding, param: string): Right {
    const right = binding.rights.get(param);
    if (right === undefined) throw new Error(`policy error: '${param}' is not a right parameter`);
    return right;
  }
}
