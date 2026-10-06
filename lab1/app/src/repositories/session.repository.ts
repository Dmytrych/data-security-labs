import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/connection.js';
import type { Subject } from '../domain/types.js';

export class SessionRepository {
  private readonly insert: Statement<[string, number, string]>;
  private readonly valid: Statement<[string, string], Subject>;
  private readonly remove: Statement<[string]>;
  private readonly removeExpired: Statement<[string]>;

  constructor(db: Db) {
    this.insert = db.prepare('INSERT INTO sessions (token_hash, subject_id, expires_at) VALUES (?, ?, ?)');
    this.valid = db.prepare(
      `SELECT o.id AS id, o.name AS name
         FROM sessions s JOIN objects o ON o.id = s.subject_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND o.kind = 'subject'`,
    );
    this.remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
    this.removeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  }

  create(tokenHash: string, subjectId: number, expiresAt: string): void {
    this.insert.run(tokenHash, subjectId, expiresAt);
  }

  /** `now` is an ISO timestamp; ISO strings compare correctly as text. */
  findValid(tokenHash: string, now: string): Subject | undefined {
    return this.valid.get(tokenHash, now);
  }

  delete(tokenHash: string): void {
    this.remove.run(tokenHash);
  }

  deleteExpired(now: string): number {
    return this.removeExpired.run(now).changes;
  }
}
