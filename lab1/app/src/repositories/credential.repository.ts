import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/connection.js';
import type { PasswordHash } from '../utils/password.js';

export class CredentialRepository {
  private readonly insert: Statement<[number, string, string]>;
  private readonly bySubject: Statement<[number], { password_hash: string; salt: string }>;

  constructor(db: Db) {
    this.insert = db.prepare('INSERT INTO credentials (subject_id, password_hash, salt) VALUES (?, ?, ?)');
    this.bySubject = db.prepare('SELECT password_hash, salt FROM credentials WHERE subject_id = ?');
  }

  create(subjectId: number, password: PasswordHash): void {
    this.insert.run(subjectId, password.hash, password.salt);
  }

  findBySubjectId(subjectId: number): PasswordHash | undefined {
    const row = this.bySubject.get(subjectId);
    return row && { hash: row.password_hash, salt: row.salt };
  }
}
