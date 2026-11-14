import crypto from 'node:crypto';
import fs from 'node:fs';
import { MIGRATIONS } from './migrations.mjs';

/**
 * One small interface over two Postgres engines:
 *
 *  - a real server (DATABASE_URL: Neon, Supabase, RDS, a container…) through
 *    `pg`, which is what a hosted admin uses;
 *  - PGlite, Postgres compiled to WebAssembly, running inside this process
 *    with its files in ADMIN_DATA_DIR, for local work, tests and single-server
 *    deployments, so nothing has to be installed to start.
 *
 * Both speak the same SQL, so every query below is written once.
 *
 *   db.query(sql, params) → rows      db.one(sql, params) → row | null
 *   db.tx(async (t) => …)             everything inside commits or none of it
 *   db.withLock(name, fn)             one at a time across every instance
 */

const lockKey = (name) => crypto.createHash('sha256').update(name).digest().readInt32BE(0);

function wrap(run, extra) {
  const api = {
    async query(sql, params = []) {
      return (await run(sql, params)).rows;
    },
    async one(sql, params = []) {
      return (await run(sql, params)).rows[0] ?? null;
    },
    ...extra,
  };
  return api;
}

async function openPg(url, { serverless }) {
  const { default: pg } = await import('pg');
  // Counts and sums come back as numbers, not strings (they stay far below 2^53 here).
  pg.types.setTypeParser(20, (value) => Number(value));
  pg.types.setTypeParser(1700, (value) => Number(value));
  const pool = new pg.Pool({
    connectionString: url,
    max: serverless ? 4 : 10,
    idleTimeoutMillis: serverless ? 5_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    // Hosted databases need TLS; a local server (localhost) usually doesn't have it.
    ssl: /sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1|db|postgres)(:\d+)?\//.test(url) ? false : { rejectUnauthorized: !/sslmode=no-verify/.test(url) },
  });
  pool.on('error', (error) => console.error('[db] idle connection error:', error.message));

  const db = wrap((sql, params) => pool.query(sql, params), {
    kind: 'postgres',
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap((sql, params) => client.query(sql, params), { exec: (sql) => client.query(sql) }));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    // A transaction-scoped advisory lock: it works through poolers in transaction mode (Neon's), and is let go if the process dies.
    async withLock(name, fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey(name)]);
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
  return db;
}

async function openPglite(dir) {
  // Kept out of the bundler's sight: a serverless deployment uses DATABASE_URL and never loads PGlite.
  const name = '@electric-sql/pglite';
  const { PGlite } = await import(name);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const pglite = await PGlite.create(dir || undefined);
  const locks = new Map();
  const db = wrap((sql, params) => pglite.query(sql, params), {
    kind: 'pglite',
    async exec(sql) {
      await pglite.exec(sql);
    },
    tx: (fn) => pglite.transaction((t) => fn(wrap((sql, params) => t.query(sql, params), { exec: (sql) => t.exec(sql) }))),
    // One process holds a PGlite database, so a queue per name is enough.
    async withLock(name, fn) {
      const before = locks.get(name) ?? Promise.resolve();
      let release;
      const mine = new Promise((resolve) => (release = resolve));
      locks.set(name, before.then(() => mine));
      await before;
      try {
        return await fn();
      } finally {
        release();
        if (locks.get(name) === mine) locks.delete(name);
      }
    },
    close: () => pglite.close(),
  });
  return db;
}

/** Opens the database and brings its shape up to date. `memory: true` keeps a PGlite database in memory (tests). */
export async function openDatabase({ databaseUrl, dataDir, serverless = false, memory = false }) {
  const db = databaseUrl ? await openPg(databaseUrl, { serverless }) : await openPglite(memory ? null : dataDir);
  await migrate(db);
  return db;
}

export async function migrate(db) {
  // Several instances can start at once on a fresh database; the lock lets one of them do the work.
  await db.withLock('schema_migrations', async () => {
    await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await db.query('SELECT version FROM schema_migrations')).map((row) => row.version));
    for (const migration of MIGRATIONS) {
      if (done.has(migration.version)) continue;
      await db.tx(async (t) => {
        await t.exec(migration.sql);
        await t.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
      });
    }
  });
}

/** A bytea column's value as a Buffer, whichever driver read it. */
export const bytes = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value ?? []));
/** A timestamptz column's value as an ISO string (or null). */
export const iso = (value) => (value ? new Date(value).toISOString() : null);
