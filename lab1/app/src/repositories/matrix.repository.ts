import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/connection.js';
import type { ObjectKind } from '../domain/types.js';
import type { Right } from '../kernel/hru.types.js';

export interface MatrixRowEntry {
  object: string;
  kind: ObjectKind;
  right: Right;
}

export interface MatrixCellEntry {
  subject: string;
  object: string;
  right: Right;
}

/** The access matrix M (sparse). Kernel-only (enforced by ESLint). */
export class MatrixRepository {
  private readonly cell: Statement<[number, number], { right: Right }>;
  private readonly insert: Statement<[number, number, Right]>;
  private readonly remove: Statement<[number, number, Right]>;
  private readonly row: Statement<[number], MatrixRowEntry>;
  private readonly everything: Statement<[], MatrixCellEntry>;

  constructor(db: Db) {
    this.cell = db.prepare('SELECT "right" AS "right" FROM matrix WHERE subject_id = ? AND object_id = ?');
    // OR IGNORE makes "enter" idempotent (kernel invariant 3).
    this.insert = db.prepare('INSERT OR IGNORE INTO matrix (subject_id, object_id, "right") VALUES (?, ?, ?)');
    this.remove = db.prepare('DELETE FROM matrix WHERE subject_id = ? AND object_id = ? AND "right" = ?');
    this.row = db.prepare(
      `SELECT o.name AS object, o.kind AS kind, m."right" AS "right"
         FROM matrix m JOIN objects o ON o.id = m.object_id
        WHERE m.subject_id = ?
        ORDER BY o.kind, o.name`,
    );
    this.everything = db.prepare(
      `SELECT s.name AS subject, o.name AS object, m."right" AS "right"
         FROM matrix m
         JOIN objects s ON s.id = m.subject_id
         JOIN objects o ON o.id = m.object_id`,
    );
  }

  rights(subjectId: number, objectId: number): Right[] {
    return this.cell.all(subjectId, objectId).map((r) => r.right);
  }

  /** Returns true if the right was not present before. */
  enter(subjectId: number, objectId: number, right: Right): boolean {
    return this.insert.run(subjectId, objectId, right).changes > 0;
  }

  /** Returns true if the right was present before. */
  delete(subjectId: number, objectId: number, right: Right): boolean {
    return this.remove.run(subjectId, objectId, right).changes > 0;
  }

  rowOf(subjectId: number): MatrixRowEntry[] {
    return this.row.all(subjectId);
  }

  all(): MatrixCellEntry[] {
    return this.everything.all();
  }
}
