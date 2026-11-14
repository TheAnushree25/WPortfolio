import crypto from 'node:crypto';
import { iso } from './db/index.mjs';
import { randomToken, sha256 } from './shared.mjs';

/**
 * Every query the backend makes, table by table, and the mapping between
 * database rows and the records the admin's pages already know (camelCase,
 * ISO dates, notes inside their enquiry), so the pages work unchanged against
 * either server.
 */

const json = (value) => JSON.stringify(value ?? null);

/** UPDATE … SET only the given fields, mapped to their columns. Returns the row. */
async function patchRow(db, table, id, fields, columns) {
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(fields)) {
    const column = columns[key];
    if (!column || value === undefined) continue;
    params.push(column.json ? json(value) : value);
    sets.push(`${column.name ?? column} = $${params.length}`);
  }
  if (!sets.length) return db.one(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  params.push(id);
  return db.one(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
}

/* ---------------------------------------- Users ---------------------------------------- */

export const toUser = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: iso(row.created_at),
    lastLoginAt: iso(row.last_login_at),
    disabled: Boolean(row.disabled),
    mustChangePassword: Boolean(row.must_change_password),
    enquiriesSeenAt: iso(row.enquiries_seen_at),
    totpSecret: row.totp_secret,
    totpPending: row.totp_pending,
    totpEnabledAt: iso(row.totp_enabled_at),
    totpLastStep: row.totp_last_step ?? 0,
    recoveryCodes: row.recovery_codes ?? [],
  };

/** What the admin's pages may know about an account: never its password or keys. */
export const publicUser = (user) =>
  user && {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    disabled: user.disabled,
    mustChangePassword: user.mustChangePassword,
    twoFactor: Boolean(user.totpEnabledAt),
  };

const USER_COLUMNS = {
  name: 'name',
  email: 'email',
  role: 'role',
  passwordHash: 'password_hash',
  lastLoginAt: 'last_login_at',
  disabled: 'disabled',
  mustChangePassword: 'must_change_password',
  enquiriesSeenAt: 'enquiries_seen_at',
  totpSecret: 'totp_secret',
  totpPending: 'totp_pending',
  totpEnabledAt: 'totp_enabled_at',
  totpLastStep: 'totp_last_step',
  recoveryCodes: { name: 'recovery_codes', json: true },
};

export const users = {
  count: async (db) => (await db.one('SELECT count(*)::int AS n FROM users')).n,
  list: async (db) => (await db.query('SELECT * FROM users ORDER BY created_at')).map(toUser),
  byId: async (db, id) => toUser(await db.one('SELECT * FROM users WHERE id = $1', [id])),
  byEmail: async (db, email) => toUser(await db.one('SELECT * FROM users WHERE email = $1', [String(email ?? '').toLowerCase()])),
  activeOwners: async (db) => (await db.one(`SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND NOT disabled`)).n,
  async insert(db, user) {
    const row = await db.one(
      `INSERT INTO users (id, name, email, role, password_hash, created_at, last_login_at, must_change_password)
       VALUES ($1, $2, $3, $4, $5, now(), $6, $7) RETURNING *`,
      [user.id ?? crypto.randomUUID(), user.name, user.email, user.role, user.passwordHash, user.lastLoginAt ?? null, Boolean(user.mustChangePassword)],
    );
    return toUser(row);
  },
  update: async (db, id, fields) => toUser(await patchRow(db, 'users', id, fields, USER_COLUMNS)),
  remove: (db, id) => db.query('DELETE FROM users WHERE id = $1', [id]),
  /** Records the time step of an accepted code, refusing one at or before the last (a replayed code). */
  claimStep: async (db, id, step) => (await db.query('UPDATE users SET totp_last_step = $2 WHERE id = $1 AND totp_last_step < $2 RETURNING id', [id, step])).length > 0,
  /** Crosses a recovery code off; false if it wasn't there (or was just used). */
  useRecovery: async (db, id, hash) => (await db.query('UPDATE users SET recovery_codes = recovery_codes - $2::text WHERE id = $1 AND recovery_codes ? $2::text RETURNING id', [id, hash])).length > 0,
};

/* --------------------------------------- Sessions --------------------------------------- */

const toSession = (row) =>
  row && {
    id: row.id,
    userId: row.user_id,
    csrf: row.csrf,
    createdAt: iso(row.created_at),
    lastSeenAt: iso(row.last_seen_at),
    expiresAt: iso(row.expires_at),
    ip: row.ip,
    agent: row.agent,
  };

export const sessions = {
  /** Creates a session; returns { raw, session } (only the raw token's hash is stored). */
  async create(db, { userId, hours, ip, agent }) {
    const raw = randomToken(32);
    const row = await db.one(
      `INSERT INTO sessions (id, user_id, csrf, expires_at, ip, agent) VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5, $6) RETURNING *`,
      [sha256(raw), userId, randomToken(24), hours, ip ?? '', String(agent ?? '').slice(0, 240)],
    );
    return { raw, session: toSession(row) };
  },
  /** The live session and its (enabled) account for a raw cookie token. */
  async find(db, raw) {
    if (!raw) return null;
    const row = await db.one(
      `SELECT s.id AS s_id, s.user_id, s.csrf, s.created_at AS s_created, s.last_seen_at, s.expires_at, s.ip, s.agent, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.expires_at > now() AND NOT u.disabled`,
      [sha256(raw)],
    );
    if (!row) return null;
    return {
      session: toSession({ id: row.s_id, user_id: row.user_id, csrf: row.csrf, created_at: row.s_created, last_seen_at: row.last_seen_at, expires_at: row.expires_at, ip: row.ip, agent: row.agent }),
      user: toUser(row),
    };
  },
  touch: (db, id) => db.query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'`, [id]),
  remove: (db, id) => db.query('DELETE FROM sessions WHERE id = $1', [id]),
  /** Signs a person out everywhere, except (optionally) one session. Returns how many ended. */
  async removeForUser(db, userId, exceptId = null) {
    const rows = await db.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id', [userId, exceptId ?? '']);
    return rows.length;
  },
  listForUser: async (db, userId) => (await db.query('SELECT * FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC', [userId])).map(toSession),
  sweep: (db) => db.query('DELETE FROM sessions WHERE expires_at <= now()'),
};

/* -------------------------- One-time tokens (resets, invitations) -------------------------- */

export const tokens = {
  /** A single-use token for `kind`, valid for `minutes`. Returns the raw token (only its hash is kept). */
  async create(db, { kind, userId, minutes }) {
    const raw = randomToken(32);
    if (kind !== 'login') await db.query('DELETE FROM auth_tokens WHERE user_id = $1 AND kind = $2', [userId, kind]);
    await db.query(`INSERT INTO auth_tokens (id, kind, user_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`, [sha256(raw), kind, userId, minutes]);
    return raw;
  },
  /** The token's row if it's this kind, unused and in date (it isn't used up by looking). */
  async peek(db, raw, kind) {
    if (typeof raw !== 'string' || raw.length < 20 || raw.length > 100) return null;
    return db.one(`SELECT * FROM auth_tokens WHERE id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()`, [sha256(raw), kind]);
  },
  /** Uses the token up; false if it was already used (two requests racing with one link). */
  use: async (db, id) => (await db.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id', [id])).length > 0,
  async attempt(db, id) {
    return (await db.one('UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [id]))?.attempts ?? 99;
  },
  sweep: (db) => db.query(`DELETE FROM auth_tokens WHERE expires_at < now() - interval '1 day'`),
};

/* -------------------------------------- Enquiries -------------------------------------- */

const toNote = (row) => ({ id: row.id, at: iso(row.at), by: row.author, kind: row.kind, text: row.text });

export const toEnquiry = (row, notes = []) =>
  row && {
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    website: row.website,
    service: row.service,
    budget: row.budget,
    source: row.source,
    message: row.message,
    value: Number(row.value) || 0,
    followUpAt: iso(row.follow_up_at),
    tags: row.tags ?? [],
    status: row.status,
    notes,
    archived: Boolean(row.archived),
    ...(row.sample ? { sample: true } : {}),
  };

const ENQUIRY_COLUMNS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  website: 'website',
  service: 'service',
  budget: 'budget',
  source: 'source',
  message: 'message',
  value: 'value',
  followUpAt: 'follow_up_at',
  tags: { name: 'tags', json: true },
  status: 'status',
  archived: 'archived',
  updatedAt: 'updated_at',
};

async function withNotes(db, rows) {
  if (!rows.length) return [];
  const notes = await db.query('SELECT * FROM enquiry_notes WHERE enquiry_id = ANY($1) ORDER BY at', [rows.map((row) => row.id)]);
  const byEnquiry = new Map();
  for (const note of notes) {
    if (!byEnquiry.has(note.enquiry_id)) byEnquiry.set(note.enquiry_id, []);
    byEnquiry.get(note.enquiry_id).push(toNote(note));
  }
  return rows.map((row) => toEnquiry(row, byEnquiry.get(row.id) ?? []));
}

export const enquiries = {
  all: async (db, { archived = null } = {}) =>
    withNotes(db, await db.query(`SELECT * FROM enquiries ${archived === null ? '' : 'WHERE archived = $1'} ORDER BY created_at DESC`, archived === null ? [] : [archived])),
  async byId(db, id) {
    const row = await db.one('SELECT * FROM enquiries WHERE id = $1', [id]);
    return row ? (await withNotes(db, [row]))[0] : null;
  },
  async byEmail(db, email) {
    if (!email) return null;
    const row = await db.one('SELECT * FROM enquiries WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1', [email]);
    return row ? (await withNotes(db, [row]))[0] : null;
  },
  async insert(db, enquiry) {
    const row = await db.one(
      `INSERT INTO enquiries (id, created_at, updated_at, name, email, phone, company, website, service, budget, source, message, value, follow_up_at, tags, status, archived, sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [
        enquiry.id ?? crypto.randomUUID(),
        enquiry.createdAt ?? new Date().toISOString(),
        enquiry.updatedAt ?? enquiry.createdAt ?? new Date().toISOString(),
        enquiry.name,
        enquiry.email ?? '',
        enquiry.phone ?? '',
        enquiry.company ?? '',
        enquiry.website ?? '',
        enquiry.service ?? 'Other',
        enquiry.budget ?? 'Not sure',
        enquiry.source ?? 'other',
        enquiry.message ?? '',
        Number(enquiry.value) || 0,
        enquiry.followUpAt ?? null,
        json(enquiry.tags ?? []),
        enquiry.status ?? 'new',
        Boolean(enquiry.archived),
        Boolean(enquiry.sample),
      ],
    );
    if (!row) return null;
    for (const note of enquiry.notes ?? []) await enquiries.addNote(db, row.id, note);
    return enquiries.byId(db, row.id);
  },
  async update(db, id, fields) {
    await patchRow(db, 'enquiries', id, { ...fields, updatedAt: new Date().toISOString() }, ENQUIRY_COLUMNS);
    return enquiries.byId(db, id);
  },
  remove: (db, id) => db.query('DELETE FROM enquiries WHERE id = $1', [id]),
  addNote: (db, enquiryId, { id, at, by, kind = 'note', text }) =>
    db.query('INSERT INTO enquiry_notes (id, enquiry_id, at, author, kind, text) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING', [id ?? crypto.randomUUID(), enquiryId, at ?? new Date().toISOString(), by ?? '', kind, text]),
  note: async (db, enquiryId, noteId) => {
    const row = await db.one('SELECT * FROM enquiry_notes WHERE id = $1 AND enquiry_id = $2', [noteId, enquiryId]);
    return row && toNote(row);
  },
  removeNote: (db, noteId) => db.query('DELETE FROM enquiry_notes WHERE id = $1', [noteId]),
  newSince: async (db, since) => (await db.one(`SELECT count(*)::int AS n FROM enquiries WHERE NOT archived AND status = 'new' AND created_at > $1`, [since ?? '1970-01-01'])).n,
};

/* --------------------------------------- Meetings --------------------------------------- */

export const toMeeting = (row) =>
  row && {
    id: row.id,
    source: row.source,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    title: row.title,
    start: iso(row.start_at),
    end: iso(row.end_at),
    attendeeName: row.attendee_name,
    attendeeEmail: row.attendee_email,
    location: row.location,
    joinUrl: row.join_url,
    status: row.status,
    enquiryId: row.enquiry_id,
    notes: row.notes,
    ...(row.sample ? { sample: true } : {}),
  };

const MEETING_COLUMNS = {
  title: 'title',
  start: 'start_at',
  end: 'end_at',
  attendeeName: 'attendee_name',
  attendeeEmail: 'attendee_email',
  location: 'location',
  joinUrl: 'join_url',
  status: 'status',
  enquiryId: 'enquiry_id',
  notes: 'notes',
  source: 'source',
};

export const meetings = {
  async list(db, { from = null, to = null } = {}) {
    const rows = await db.query('SELECT * FROM meetings WHERE ($1::timestamptz IS NULL OR start_at >= $1) AND ($2::timestamptz IS NULL OR start_at <= $2) ORDER BY start_at', [from, to]);
    return rows.map(toMeeting);
  },
  byId: async (db, id) => toMeeting(await db.one('SELECT * FROM meetings WHERE id = $1', [id])),
  byExternalId: async (db, externalId) => toMeeting(await db.one('SELECT * FROM meetings WHERE external_id = $1', [externalId])),
  forEnquiry: async (db, enquiry) =>
    (await db.query(`SELECT * FROM meetings WHERE enquiry_id = $1 OR ($2 <> '' AND lower(attendee_email) = lower($2)) ORDER BY start_at DESC`, [enquiry.id, enquiry.email ?? ''])).map(toMeeting),
  async insert(db, meeting) {
    const row = await db.one(
      `INSERT INTO meetings (id, source, external_id, title, start_at, end_at, attendee_name, attendee_email, location, join_url, status, enquiry_id, notes, sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO NOTHING RETURNING *`,
      [
        meeting.id ?? crypto.randomUUID(),
        meeting.source ?? 'manual',
        meeting.externalId ?? null,
        meeting.title ?? 'Discussion Meeting',
        meeting.start,
        meeting.end,
        meeting.attendeeName ?? '',
        meeting.attendeeEmail ?? '',
        meeting.location ?? '',
        meeting.joinUrl ?? '',
        meeting.status ?? 'scheduled',
        meeting.enquiryId ?? null,
        meeting.notes ?? '',
        Boolean(meeting.sample),
      ],
    );
    return toMeeting(row);
  },
  update: async (db, id, fields) => toMeeting(await patchRow(db, 'meetings', id, fields, MEETING_COLUMNS)),
  remove: (db, id) => db.query('DELETE FROM meetings WHERE id = $1', [id]),
  todayCount: async (db, start, end) => (await db.one(`SELECT count(*)::int AS n FROM meetings WHERE status = 'scheduled' AND start_at >= $1 AND start_at < $2`, [start, end])).n,
};

/* --------------------------------------- Activity --------------------------------------- */

const toActivity = (row) => ({ id: row.id, at: iso(row.at), userId: row.user_id, userName: row.user_name, action: row.action, target: row.target, summary: row.summary, meta: row.meta ?? null });

export const activity = {
  add: (db, { user = null, action, summary, target = null, meta = null }) =>
    db.query('INSERT INTO activity (id, user_id, user_name, action, target, summary, meta) VALUES ($1, $2, $3, $4, $5, $6, $7)', [crypto.randomUUID(), user?.id ?? null, user?.name ?? 'System', action, target, summary, meta === null ? null : json(meta)]),
  async list(db, { limit = 50, category = '', before = '' } = {}) {
    const rows = await db.query(
      `SELECT * FROM activity WHERE ($1 = '' OR action LIKE $1 || '.%') AND ($2 = '' OR at < NULLIF($2, '')::timestamptz) ORDER BY at DESC LIMIT $3`,
      [category, before, limit + 1],
    );
    return { items: rows.slice(0, limit).map(toActivity), more: rows.length > limit };
  },
  count: async (db) => (await db.one('SELECT count(*)::int AS n FROM activity')).n,
  prune: (db, keep = 5000) => db.query('DELETE FROM activity WHERE id IN (SELECT id FROM activity ORDER BY at DESC OFFSET $1)', [keep]),
};

/* ---------------------------------- Settings and flags ---------------------------------- */

export const meta = {
  async get(db, key, fallback = null) {
    const row = await db.one('SELECT value FROM meta WHERE key = $1', [key]);
    return row ? row.value : fallback;
  },
  set: (db, key, value) => db.query('INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, json(value)]),
};

export const DEFAULT_SETTINGS = { siteUrl: '', siteOrigins: [], notifyEmail: '', calendlyToken: '', calendlyUser: null, calendlyLastSync: null };

export const settings = {
  get: async (db) => ({ ...DEFAULT_SETTINGS, ...((await meta.get(db, 'settings')) ?? {}) }),
  async patch(db, changes) {
    const next = { ...(await settings.get(db)), ...changes };
    await meta.set(db, 'settings', next);
    return next;
  },
};

/* --------------------------------- Archived project cards --------------------------------- */

const toArchived = (row) => ({ card: row.card, position: row.position_index, archivedAt: iso(row.archived_at), by: row.archived_by });

export const archive = {
  list: async (db) => (await db.query('SELECT * FROM archived_projects ORDER BY archived_at DESC')).map(toArchived),
  async bySlug(db, slug) {
    const row = await db.one('SELECT * FROM archived_projects WHERE slug = $1', [slug]);
    return row && toArchived(row);
  },
  put: (db, { card, position, by }) =>
    db.query(
      `INSERT INTO archived_projects (slug, card, position_index, archived_at, archived_by) VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (slug) DO UPDATE SET card = EXCLUDED.card, position_index = EXCLUDED.position_index, archived_at = now(), archived_by = EXCLUDED.archived_by`,
      [card.slug, json(card), position, by],
    ),
  remove: (db, slug) => db.query('DELETE FROM archived_projects WHERE slug = $1', [slug]),
};

/* --------------------------------------- Media trash --------------------------------------- */

const toTrash = (row) => ({ id: row.id, path: row.path, reason: row.reason, at: iso(row.at), bytes: row.bytes, sha: row.blob_sha, mode: row.mode, by: row.removed_by });

export const trash = {
  list: async (db) => (await db.query('SELECT * FROM media_trash ORDER BY at DESC LIMIT 500')).map(toTrash),
  byId: async (db, id) => {
    const row = await db.one('SELECT * FROM media_trash WHERE id = $1', [id]);
    return row && toTrash(row);
  },
  async add(db, { path, sha, mode = '100644', reason, bytes, by }) {
    const row = await db.one('INSERT INTO media_trash (id, path, blob_sha, mode, reason, bytes, removed_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [crypto.randomUUID(), path, sha, mode, reason, bytes ?? 0, by ?? '']);
    return toTrash(row);
  },
  remove: (db, id) => db.query('DELETE FROM media_trash WHERE id = $1', [id]),
};
