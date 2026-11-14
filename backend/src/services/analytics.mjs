import { Analytics, BOT, blankDay, dayKey, device, randomToken, referrerHost, sha256 } from '../shared.mjs';
import { meta } from '../data.mjs';

/**
 * The visit counter, with the local admin's privacy rules, kept in the
 * database: only daily totals (views, visitors, pages, referring sites,
 * devices, countries, named events). A visitor is told apart by a hash of
 * their address and browser salted afresh each day; yesterday's salt and
 * hashes are deleted, so nobody can be followed from one day to the next.
 *
 * Every count is one upsert, so any number of instances can count at once.
 * The report is the local admin's own, fed from these rows.
 */

const DIMS = { views: null, visitors: null, path: 'paths', ref: 'refs', device: 'devices', country: 'countries', event: 'events' };

export class DbAnalytics {
  constructor({ db, timeZone }) {
    this.db = db;
    this.timeZone = timeZone;
    this.salt = null;
    this.lastHitWrite = 0;
  }

  async #saltFor(day) {
    if (this.salt?.day === day) return this.salt.value;
    const stored = await meta.get(this.db, 'analytics_salt');
    if (stored?.day === day) {
      this.salt = { day, value: stored.value };
      return stored.value;
    }
    // A new day: a new salt, and the old day's visitor hashes are let go.
    const value = randomToken(16);
    await this.db.query(
      `INSERT INTO meta (key, value) VALUES ('analytics_salt', $1)
       ON CONFLICT (key) DO UPDATE SET value = CASE WHEN meta.value->>'day' = $2 THEN meta.value ELSE EXCLUDED.value END`,
      [JSON.stringify({ day, value }), day],
    );
    await this.db.query('DELETE FROM analytics_visitors WHERE day < $1', [day]);
    const settled = await meta.get(this.db, 'analytics_salt');
    this.salt = { day, value: settled.value };
    return settled.value;
  }

  async #bump(day, pairs) {
    const params = [day];
    const values = pairs.map(([dim, key], index) => {
      params.push(dim, String(key ?? '').slice(0, 160));
      return `($1, $${index * 2 + 2}, $${index * 2 + 3}, 1)`;
    });
    await this.db.query(`INSERT INTO analytics_daily (day, dim, key, count) VALUES ${values.join(', ')} ON CONFLICT (day, dim, key) DO UPDATE SET count = analytics_daily.count + EXCLUDED.count`, params);
  }

  /** Records one page view (or a named event). Returns false when it isn't counted. */
  async record({ path, referrer, width, ua = '', ip = '', country = '', event = '', ownHosts = [] }) {
    if (BOT.test(ua)) return false;
    const day = dayKey(new Date(), this.timeZone);
    if (event) {
      await this.#bump(day, [['event', String(event).slice(0, 40)]]);
      return true;
    }
    const clean = typeof path === 'string' && path.startsWith('/') ? path.split(/[?#]/)[0].slice(0, 160) : null;
    if (!clean) return false;
    const salt = await this.#saltFor(day);
    const visitor = sha256(`${salt}|${ip}|${ua}`).slice(0, 20);
    const fresh = await this.db.query('INSERT INTO analytics_visitors (day, hash) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING hash', [day, visitor]);
    const pairs = [
      ['views', ''],
      ['path', clean],
      ['device', device(Number(width) || 0, ua)],
    ];
    const from = referrerHost(referrer, ownHosts);
    if (from) pairs.push(['ref', from]);
    if (fresh.length) pairs.push(['visitors', '']);
    if (/^[A-Z]{2}$/.test(country) && country !== 'XX') pairs.push(['country', country]);
    await this.#bump(day, pairs);
    if (Date.now() - this.lastHitWrite > 60_000) {
      this.lastHitWrite = Date.now();
      await meta.set(this.db, 'analytics_last_hit', new Date().toISOString());
    }
    return true;
  }

  /** Days as the local admin keeps them: { 'YYYY-MM-DD': { views, visitors, paths, refs, devices, countries, events } }. */
  async days(since) {
    const rows = await this.db.query('SELECT day, dim, key, count FROM analytics_daily WHERE day >= $1', [since]);
    const days = {};
    for (const row of rows) {
      const day = (days[row.day] ??= blankDay());
      const bucket = DIMS[row.dim];
      if (bucket === undefined) continue;
      if (bucket === null) day[row.dim] += row.count;
      else day[bucket][row.key] = (day[bucket][row.key] ?? 0) + row.count;
    }
    return days;
  }

  /** Totals, a daily series and the top lists for the last `span` days, with the span before it for comparison. */
  async report(span = 30) {
    const since = dayKey(new Date(Date.now() - (span * 2 + 1) * 86_400_000), this.timeZone);
    const [days, lastHitAt, any] = await Promise.all([this.days(since), meta.get(this.db, 'analytics_last_hit'), this.db.one('SELECT 1 AS one FROM analytics_daily LIMIT 1')]);
    const report = new Analytics({ db: { data: { analytics: { days, lastHitAt } } }, timeZone: this.timeZone }).report(span);
    return { ...report, hasData: Boolean(any) };
  }

  /** Stores days built elsewhere (the sample data, an import), leaving days that already have counts alone. Returns the days written. */
  async importDays(days) {
    const written = [];
    for (const [day, counts] of Object.entries(days ?? {})) {
      if (!/^\d{4}-\d\d-\d\d$/.test(day)) continue;
      if (await this.db.one('SELECT 1 AS one FROM analytics_daily WHERE day = $1 LIMIT 1', [day])) continue;
      const rows = [];
      if (counts.views) rows.push(['views', '', counts.views]);
      if (counts.visitors) rows.push(['visitors', '', counts.visitors]);
      for (const [dim, bucket] of Object.entries(DIMS)) {
        if (!bucket) continue;
        for (const [key, count] of Object.entries(counts[bucket] ?? {})) if (Number(count) > 0) rows.push([dim, key.slice(0, 160), Math.round(Number(count))]);
      }
      if (!rows.length) continue;
      const params = [day];
      const values = rows.map(([dim, key, count], index) => {
        params.push(dim, key, count);
        return `($1, $${index * 3 + 2}, $${index * 3 + 3}, $${index * 3 + 4})`;
      });
      await this.db.query(`INSERT INTO analytics_daily (day, dim, key, count) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`, params);
      written.push(day);
    }
    return written;
  }
}
