import type { AuditEntry, AuditFilters, NewAuditEntry } from '../domain/types.js';
import type { AuditRepository } from '../repositories/audit.repository.js';

export class AuditService {
  constructor(private readonly auditRepo: AuditRepository) {}

  /** Append an entry. Callers must never put passwords or tokens into `args`. */
  record(entry: NewAuditEntry): void {
    this.auditRepo.insert({
      ts: new Date().toISOString(),
      actor: entry.actor,
      event: entry.event,
      action: entry.action,
      args: entry.args === undefined || entry.args === null ? null : JSON.stringify(entry.args),
      outcome: entry.outcome,
      reason: entry.reason,
    });
  }

  /** Newest first. */
  list(filters: AuditFilters): AuditEntry[] {
    return this.auditRepo.list(filters);
  }
}
