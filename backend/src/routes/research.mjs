import { HttpError, researchApi, researchService } from '../shared.mjs';
import { meta } from '../data.mjs';

/**
 * The Details page on the hosted admin: the same research as the local
 * admin (Admin/server/research), with the runs in Postgres and the free
 * services' keys sealed in the meta table. A serverless function can't keep
 * working after it answers, so each look at a run's page moves it one short
 * step on (the service's hosted mode). PDFs are printed by the Chromium built
 * for serverless functions (@sparticuz/chromium) on Vercel, or by Edge or
 * Chrome when the backend runs on a computer that has one.
 */

const KEY_FIELDS = ['geminiKey', 'tavilyKey', 'serpapiKey', 'pagespeedKey'];
const SUMMARY = `SELECT id, created_at, status, sample, data->'input' AS input, data->>'stage' AS stage, data->'createdBy'->>'name' AS created_by,
  COALESCE(jsonb_array_length(data->'facts'), 0) AS facts, (data->'documents'->'summary') IS NOT NULL AS ready
  FROM research_runs ORDER BY created_at DESC LIMIT 200`;

export function researchRoutes(router, app) {
  const { db, sealer, config } = app;

  const store = {
    async list() {
      return (await db.query('SELECT data FROM research_runs ORDER BY created_at DESC LIMIT 200')).map((row) => row.data);
    },
    async summaries() {
      return (await db.query(SUMMARY)).map((row) => ({
        id: row.id,
        sample: row.sample,
        business: row.input?.business ?? '',
        city: row.input?.city ?? '',
        person: row.input?.person ?? '',
        status: row.status,
        stage: row.stage,
        createdAt: new Date(row.created_at).toISOString(),
        createdBy: row.created_by ?? '',
        facts: Number(row.facts) || 0,
        ready: Boolean(row.ready),
      }));
    },
    async countSince(iso) {
      return Number((await db.one('SELECT count(*) AS n FROM research_runs WHERE created_at > $1 AND NOT sample', [iso]))?.n ?? 0);
    },
    async sweep(iso) {
      return (await db.query(`DELETE FROM research_runs WHERE created_at < $1 AND status NOT IN ('running', 'waiting', 'writing') RETURNING id`, [iso])).length;
    },
    async get(id) {
      return (await db.one('SELECT data FROM research_runs WHERE id = $1', [id]))?.data ?? null;
    },
    async put(run) {
      await db.query(
        `INSERT INTO research_runs (id, created_at, updated_at, status, sample, business, data) VALUES ($1, $2, now(), $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET updated_at = now(), status = EXCLUDED.status, business = EXCLUDED.business, data = EXCLUDED.data`,
        [run.id, run.createdAt, run.status, Boolean(run.sample), run.input?.business ?? '', JSON.stringify(run)],
      );
    },
    async remove(id) {
      await db.query('DELETE FROM research_runs WHERE id = $1', [id]);
    },
    // A step takes under a minute; the lease outlives it a little, and is given back when the step ends.
    async lease(id) {
      return Boolean(await db.one(`UPDATE research_runs SET lease_until = now() + interval '70 seconds' WHERE id = $1 AND (lease_until IS NULL OR lease_until < now()) RETURNING id`, [id]));
    },
    async release(id) {
      await db.query('UPDATE research_runs SET lease_until = NULL WHERE id = $1', [id]);
    },
  };

  // Keys are sealed (AES-256-GCM under ADMIN_SECRET) before they reach the database.
  const settings = {
    async get() {
      const raw = (await meta.get(db, 'research', {})) ?? {};
      const out = { ...raw };
      for (const field of KEY_FIELDS) {
        try {
          out[field] = raw[field] ? sealer.open(raw[field]) : '';
        } catch {
          out[field] = '';
        }
      }
      return out;
    },
    async set(patch) {
      const next = { ...((await meta.get(db, 'research', {})) ?? {}) };
      for (const [key, value] of Object.entries(patch)) next[key] = KEY_FIELDS.includes(key) ? sealer.seal(value) : value;
      await meta.set(db, 'research', next);
    },
  };

  const research = researchService({
    store,
    settings,
    audit: (user, action, summary, extra) => app.audit(user, action, summary, extra),
    mode: 'hosted',
    pdfLaunch: () => serverlessChromium(config),
    bases: { gemini: process.env.RESEARCH_GEMINI_BASE, tavily: process.env.RESEARCH_TAVILY_BASE, serpapi: process.env.RESEARCH_SERPAPI_BASE },
  });
  app.research = research;

  researchApi(router, research, {
    send: {
      html: (ctx, html, headers) => new Response(ctx.request.method === 'HEAD' ? null : html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } }),
      file: (ctx, buffer, headers) => new Response(ctx.request.method === 'HEAD' ? null : buffer, { status: 200, headers: { ...headers, 'content-length': String(buffer.length) } }),
    },
  });
}

/**
 * On a serverless host (Vercel), the Chromium made for it, unpacked into /tmp
 * on first use, once the @sparticuz/chromium package is added to this
 * folder. Until then the Details page offers the browser's own “Save as
 * PDF” (same pages, same layout). Elsewhere null: the printer looks for
 * Edge or Chrome on the machine (or PDF_BROWSER).
 */
async function serverlessChromium(config) {
  if (!config.serverless) return null;
  let chromium;
  try {
    ({ default: chromium } = await import(/* webpackIgnore: true */ ['@sparticuz', 'chromium'].join('/')));
  } catch {
    throw new HttpError(503, 'no_printer', 'The live admin can’t print PDFs by itself yet. Open each document and save it with the browser’s “Save as PDF”.');
  }
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}
