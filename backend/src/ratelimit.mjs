/**
 * Rate limits that hold across every instance of the backend (a serverless
 * platform runs many, each with its own memory), counted in the database as a
 * sliding window of hits per key. Used where it matters: sign-in, the
 * two-step code, password-reset emails and the public enquiry form. The visit
 * counter, which only needs a rough brake, uses the in-memory limiter.
 */

export function dbLimiter(db, { name, windowMs, max }) {
  const key = (raw) => `${name}:${raw}`;
  const seconds = Math.ceil(windowMs / 1000);
  const state = async (raw) => {
    const row = await db.one(`SELECT count(*)::int AS hits, min(at) AS first FROM rate_hits WHERE key = $1 AND at > now() - make_interval(secs => $2)`, [key(raw), seconds]);
    const wait = row.first ? Math.max(1, Math.ceil((new Date(row.first).getTime() + windowMs - Date.now()) / 1000)) : 0;
    return { hits: row.hits, wait };
  };
  return {
    /** Seconds until another try is allowed, or 0. */
    async blocked(raw) {
      const { hits, wait } = await state(raw);
      return hits >= max ? wait : 0;
    },
    async hit(raw) {
      await db.query('INSERT INTO rate_hits (key) VALUES ($1)', [key(raw)]);
      const { hits, wait } = await state(raw);
      return { limited: hits > max, retryAfter: wait };
    },
    async reset(raw) {
      await db.query('DELETE FROM rate_hits WHERE key = $1', [key(raw)]);
    },
  };
}
