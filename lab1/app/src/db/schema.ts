export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS objects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('subject', 'file', 'system')),
  content    TEXT,                               -- only for kind = 'file'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Access matrix M, stored sparse: one row per right present in a cell.
-- ON DELETE CASCADE implements HRU "destroy" removing the subject's row and the object's column.
CREATE TABLE IF NOT EXISTS matrix (
  subject_id INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  object_id  INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  "right"    TEXT    NOT NULL CHECK ("right" IN ('own', 'read', 'write', 'control')),
  PRIMARY KEY (subject_id, object_id, "right")
);

CREATE TABLE IF NOT EXISTS credentials (
  subject_id    INTEGER PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,                   -- hex
  salt          TEXT NOT NULL                    -- hex
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                   -- sha256(token); the raw token is never stored
  subject_id INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  actor   TEXT,                                  -- subject name (kept even after the subject is destroyed)
  event   TEXT NOT NULL CHECK (event IN ('SYSTEM','REGISTER','LOGIN','LOGOUT','AUTH','COMMAND','OPERATION')),
  action  TEXT NOT NULL,                         -- command name or operation ('read', 'write', 'view_matrix', ...)
  args    TEXT,                                  -- JSON, never contains passwords or tokens
  outcome TEXT NOT NULL CHECK (outcome IN ('ALLOWED','DENIED')),
  reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
`;
