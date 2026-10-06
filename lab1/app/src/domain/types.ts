export const OBJECT_KINDS = ['subject', 'file', 'system'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** An authenticated (or acting) subject. */
export interface Subject {
  id: number;
  name: string;
}

export interface EntityRecord {
  id: number;
  name: string;
  kind: ObjectKind;
  content: string | null;
  createdAt: string;
}

export const AUDIT_EVENTS = ['SYSTEM', 'REGISTER', 'LOGIN', 'LOGOUT', 'AUTH', 'COMMAND', 'OPERATION'] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const AUDIT_OUTCOMES = ['ALLOWED', 'DENIED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string | null;
  event: AuditEvent;
  action: string;
  args: unknown;
  outcome: AuditOutcome;
  reason: string | null;
}

export type NewAuditEntry = Omit<AuditEntry, 'id' | 'ts'>;

export interface AuditFilters {
  outcome?: AuditOutcome;
  actor?: string;
  limit: number;
}

/** Names of subjects and objects (spec §3.1). */
export const NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
