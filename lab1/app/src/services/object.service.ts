import { ValidationError } from '../domain/errors.js';
import type { ObjectKind, Subject } from '../domain/types.js';
import type { Right } from '../kernel/hru.types.js';
import type { SecurityKernel } from '../kernel/security-kernel.js';
import type { ObjectRepository } from '../repositories/object.repository.js';

export interface ObjectListItem {
  name: string;
  kind: ObjectKind;
  myRights: Right[];
}

/** Operations of subjects over file content. Each one passes the kernel's real-time check first. */
export class ObjectService {
  constructor(
    private readonly kernel: SecurityKernel,
    private readonly objectRepo: ObjectRepository,
  ) {}

  /** All objects: identity is public, access is not. */
  listForSubject(subject: Subject): ObjectListItem[] {
    return this.objectRepo.listAll().map((o) => ({
      name: o.name,
      kind: o.kind,
      myRights: this.kernel.rightsOf(subject.id, o.id),
    }));
  }

  read(subject: Subject, name: string): { name: string; content: string } {
    this.requireFileIfExists(name);
    const file = this.kernel.authorize(subject, 'read', name, 'read');
    return { name: file.name, content: file.content ?? '' };
  }

  /** Content update is a data operation, not a matrix change, so it is done here after `authorize`. */
  write(subject: Subject, name: string, content: string): { name: string } {
    this.requireFileIfExists(name);
    const file = this.kernel.authorize(subject, 'write', name, 'write');
    this.objectRepo.updateContent(file.id, content);
    return { name: file.name };
  }

  /** Missing objects are left to `authorize`, which audits them as denied. */
  private requireFileIfExists(name: string): void {
    const entity = this.objectRepo.findByName(name);
    if (entity && entity.kind !== 'file') throw new ValidationError(`'${name}' is a ${entity.kind}, not a file`);
  }
}
