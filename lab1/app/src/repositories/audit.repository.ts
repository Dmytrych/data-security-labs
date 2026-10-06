import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/connection.js';
import type { AuditEntry, AuditEvent, AuditFilters, AuditOutcome } from '../domain/types.js';

interface AuditRow {
  id: number;
  ts: string;
  actor: string | null;
  event: AuditEvent;
  action: string;
  args: string | null;
  outcome: AuditOutcome;
  reason: string | null;
}

export interface AuditInsert {
  ts: string;
  actor: string | null;
  event: AuditEvent;
  action: string;
  args: string | null;
  outcome: AuditOutcome;
  reason: string | null;
}

function parseArgs(json: string | null): unknown {
  if (json === null) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

export class AuditRepository {
  private readonly insertStmt: Statement<[AuditInsert]>;
  private readonly listStmt: Statement<
    { outcome: AuditOutcome | null; actor: string | null; limit: number },
    AuditRow
  >;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO audit_log (ts, actor, event, action, args, outcome, reason)
       VALUES (@ts, @actor, @event, @action, @args, @outcome, @reason)`,
    );
    // NULL filter values mean "no filter", so one prepared statement covers every combination.
    this.listStmt = db.prepare(
      `SELECT * FROM audit_log
        WHERE (@outcome IS NULL OR outcome = @outcome)
          AND (@actor IS NULL OR actor = @actor)
        ORDER BY id DESC
        LIMIT @limit`,
    );
  }

  insert(entry: AuditInsert): void {
    this.insertStmt.run(entry);
  }

  list(filters: AuditFilters): AuditEntry[] {
    return this.listStmt
      .all({ outcome: filters.outcome ?? null, actor: filters.actor ?? null, limit: filters.limit })
      .map((row) => ({ ...row, args: parseArgs(row.args) }));
  }
}
