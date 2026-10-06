import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/connection.js';
import type { ObjectKind } from '../domain/types.js';

/** HRU create/destroy primitives on the objects table. Kernel-only (enforced by ESLint). */
export class ObjectMutationRepository {
  private readonly insert: Statement<[string, ObjectKind, string | null]>;
  private readonly remove: Statement<[number]>;

  constructor(db: Db) {
    this.insert = db.prepare('INSERT INTO objects (name, kind, content) VALUES (?, ?, ?)');
    this.remove = db.prepare('DELETE FROM objects WHERE id = ?');
  }

  /** Files start with empty content; subjects and system have none. Returns the new id. */
  create(name: string, kind: ObjectKind): number {
    const info = this.insert.run(name, kind, kind === 'file' ? '' : null);
    return Number(info.lastInsertRowid);
  }

  /** FK cascades remove the matrix row/column, credentials and sessions. */
  destroy(id: number): void {
    this.remove.run(id);
  }
}
