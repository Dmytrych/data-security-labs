import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/connection.js';
import type { EntityRecord, ObjectKind } from '../domain/types.js';

interface ObjectRow {
  id: number;
  name: string;
  kind: ObjectKind;
  content: string | null;
  created_at: string;
}

export function toEntity(row: ObjectRow): EntityRecord {
  return { id: row.id, name: row.name, kind: row.kind, content: row.content, createdAt: row.created_at };
}

/** Read access to entities plus file-content updates. Creating/destroying entities is kernel-only. */
export class ObjectRepository {
  private readonly byName: Statement<[string], ObjectRow>;
  private readonly byId: Statement<[number], ObjectRow>;
  private readonly all: Statement<[], ObjectRow>;
  private readonly setContent: Statement<[string, number]>;

  constructor(db: Db) {
    this.byName = db.prepare('SELECT * FROM objects WHERE name = ?');
    this.byId = db.prepare('SELECT * FROM objects WHERE id = ?');
    this.all = db.prepare('SELECT * FROM objects ORDER BY kind, name');
    this.setContent = db.prepare("UPDATE objects SET content = ? WHERE id = ? AND kind = 'file'");
  }

  findByName(name: string): EntityRecord | undefined {
    const row = this.byName.get(name);
    return row && toEntity(row);
  }

  findById(id: number): EntityRecord | undefined {
    const row = this.byId.get(id);
    return row && toEntity(row);
  }

  listAll(): EntityRecord[] {
    return this.all.all().map(toEntity);
  }

  updateContent(id: number, content: string): void {
    this.setContent.run(content, id);
  }
}
