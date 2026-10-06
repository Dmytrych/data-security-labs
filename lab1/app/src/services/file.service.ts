import { ValidationError } from '../domain/errors.js';
import type { Subject } from '../domain/types.js';
import type { Right } from '../kernel/hru.types.js';
import type { SecurityKernel } from '../kernel/security-kernel.js';
import type { FileRepository, MockFile } from '../repositories/file.repository.js';
import type { ObjectRepository } from '../repositories/object.repository.js';

export interface FileListItem {
  name: string;
  myRights: Right[];
}

/**
 * Example CRUD over files with mocked storage. Every step that matters goes through the kernel:
 * create/delete are HRU commands (they change M), read/update are real-time `authorize` checks.
 */
export class FileService {
  constructor(
    private readonly kernel: SecurityKernel,
    private readonly objectRepo: ObjectRepository,
    private readonly fileRepo: FileRepository,
  ) {}

  /** All file objects with the caller's rights. Identity is public, so this isn't a kernel decision. */
  list(subject: Subject): FileListItem[] {
    return this.objectRepo
      .listAll()
      .filter((o) => o.kind === 'file')
      .map((o) => ({ name: o.name, myRights: this.kernel.rightsOf(subject.id, o.id) }));
  }

  /** HRU `create_file`: creates the object and enters own, read, write into M[caller, f]. */
  create(subject: Subject, name: string, content: string): MockFile {
    this.kernel.execute(subject, 'create_file', { f: name });
    return this.fileRepo.create(name, content);
  }

  /** Requires read ∈ M[caller, f]. */
  read(subject: Subject, name: string): MockFile {
    this.requireFileIfExists(name);
    this.kernel.authorize(subject, 'read', name, 'file_read');
    return this.fileRepo.find(name);
  }

  /** Requires write ∈ M[caller, f]. Content is data, not protection state, so M is unchanged. */
  update(subject: Subject, name: string, content: string): MockFile {
    this.requireFileIfExists(name);
    this.kernel.authorize(subject, 'write', name, 'file_update');
    return this.fileRepo.update(name, content);
  }

  /** HRU `remove_file`: requires own ∈ M[caller, f]; destroying the object drops its column of M. */
  delete(subject: Subject, name: string): void {
    this.kernel.execute(subject, 'remove_file', { f: name });
    this.fileRepo.delete(name);
  }

  /** Missing objects are left to the kernel, which audits them as denied. */
  private requireFileIfExists(name: string): void {
    const entity = this.objectRepo.findByName(name);
    if (entity && entity.kind !== 'file') throw new ValidationError(`'${name}' is a ${entity.kind}, not a file`);
  }
}
