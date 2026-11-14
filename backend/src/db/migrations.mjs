/**
 * The database's shape, one migration at a time. Each runs once, in order,
 * inside a transaction, and is recorded in schema_migrations. They are kept
 * here as strings (not .sql files) so a serverless bundle always carries them.
 *
 * Ids are text (random UUIDs, but records imported from the local admin keep
 * theirs), times are timestamptz, and analytics days are 'YYYY-MM-DD' text in
 * the studio's time zone, never a date the driver could shift.
 */

export const MIGRATIONS = [
  {
    version: '001_init',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'owner')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  disabled BOOLEAN NOT NULL DEFAULT false,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  enquiries_seen_at TIMESTAMPTZ,
  totp_secret TEXT,
  totp_pending TEXT,
  totp_enabled_at TIMESTAMPTZ,
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  recovery_codes JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('reset', 'invite', 'login')),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id);

CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT 'Other',
  budget TEXT NOT NULL DEFAULT 'Not sure',
  source TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL DEFAULT '',
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  follow_up_at TIMESTAMPTZ,
  tags JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  archived BOOLEAN NOT NULL DEFAULT false,
  sample BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX enquiries_created_idx ON enquiries (created_at DESC);
CREATE INDEX enquiries_email_idx ON enquiries (lower(email));

CREATE TABLE enquiry_notes (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'note',
  text TEXT NOT NULL
);
CREATE INDEX enquiry_notes_enquiry_idx ON enquiry_notes (enquiry_id, at);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT 'Discussion Meeting',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  attendee_name TEXT NOT NULL DEFAULT '',
  attendee_email TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  join_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  enquiry_id TEXT REFERENCES enquiries(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  sample BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX meetings_start_idx ON meetings (start_at);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT 'System',
  action TEXT NOT NULL,
  target TEXT,
  summary TEXT NOT NULL,
  meta JSONB
);
CREATE INDEX activity_at_idx ON activity (at DESC);

CREATE TABLE analytics_daily (
  day TEXT NOT NULL,
  dim TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dim, key)
);

CREATE TABLE analytics_visitors (
  day TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);

CREATE TABLE archived_projects (
  slug TEXT PRIMARY KEY,
  card JSONB NOT NULL,
  position_index INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE media_trash (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  blob_sha TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '100644',
  reason TEXT NOT NULL DEFAULT 'removed',
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bytes INTEGER NOT NULL DEFAULT 0,
  removed_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX media_trash_at_idx ON media_trash (at DESC);

CREATE TABLE media_dims (
  sha TEXT PRIMARY KEY,
  width INTEGER,
  height INTEGER
);

CREATE TABLE blob_text (
  sha TEXT PRIMARY KEY,
  text TEXT NOT NULL
);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  replace_existing BOOLEAN NOT NULL DEFAULT false,
  chunks INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE upload_chunks (
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY (upload_id, idx)
);

CREATE TABLE rate_hits (
  key TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rate_hits_key_idx ON rate_hits (key, at);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`,
  },
];
