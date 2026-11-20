import { HttpError } from '../http.mjs';
import { researchService } from '../research/service.mjs';

/**
 * The Details page: researching a business from the details typed in (or
 * read off a visiting card), reviewing what was found, and the two PDFs.
 * Here the runs live in the admin's own data file and run in the background
 * on this computer; the hosted backend serves the same routes from Postgres.
 */

/** The research API on any router, given a research service. Shared with the hosted backend. */
export function researchApi(router, research, { send }) {
  router.get('/api/research', () => research.state());
  router.post('/api/research', { auth: 'editor', limit: 64_000 }, async (ctx) => research.create(await ctx.body(), ctx.user));
  router.post('/api/research/example', { auth: 'editor' }, (ctx) => research.sample(ctx.user));
  router.post('/api/research/read-card', { auth: 'editor', limit: 9_000_000 }, async (ctx) => research.readCard(await ctx.body()));
  router.get('/api/research/settings', { auth: 'owner' }, () => research.settingsView());
  router.patch('/api/research/settings', { auth: 'owner', limit: 64_000 }, async (ctx) => research.updateSettings(await ctx.body(), ctx.user));
  router.post('/api/research/settings/test', { auth: 'owner' }, () => research.testKeys());
  router.get('/api/research/:id', (ctx) => research.get(ctx.params.id));
  router.post('/api/research/:id/cancel', { auth: 'editor' }, (ctx) => research.cancel(ctx.params.id, ctx.user));
  router.post('/api/research/:id/retry', { auth: 'editor' }, (ctx) => research.retry(ctx.params.id, ctx.user));
  router.patch('/api/research/:id/facts', { auth: 'editor', limit: 256_000 }, async (ctx) => research.updateFacts(ctx.params.id, await ctx.body(), ctx.user));
  router.patch('/api/research/:id/documents', { auth: 'editor', limit: 64_000 }, async (ctx) => research.updateDocuments(ctx.params.id, await ctx.body(), ctx.user));
  router.post('/api/research/:id/write', { auth: 'editor' }, (ctx) => research.write(ctx.params.id, ctx.user));
  router.delete('/api/research/:id', { auth: 'editor' }, (ctx) => research.remove(ctx.params.id, ctx.user));

  // The documents as a page for the preview frame: no scripts, nothing fetched, shown only inside the admin.
  router.get('/api/research/:id/preview/:kind', async (ctx) => {
    const html = await research.preview(ctx.params.id, ctx.params.kind, { print: ctx.query.print === '1' });
    return send.html(ctx, html, {
      'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'",
      'x-frame-options': 'SAMEORIGIN',
      'cache-control': 'no-store',
    });
  });

  router.get('/api/research/:id/pdf/:kind', async (ctx) => {
    if (!['summary', 'onepager'].includes(ctx.params.kind)) throw new HttpError(404, 'not_found', 'There’s no such document.');
    const file = await research.pdf(ctx.params.id, ctx.params.kind);
    return send.file(ctx, file.buffer, {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${file.filename}"`,
      'cache-control': 'no-store',
      'x-document-overflow': file.overflow ? '1' : '0',
    });
  });
}

export function researchRoutes(router, app) {
  const { db } = app;
  db.data.research ??= [];
  db.data.settings.research ??= {};
  const leases = new Set();
  const store = {
    list: () => [...db.data.research],
    get: (id) => db.data.research.find((run) => run.id === id) ?? null,
    put: (run) => {
      const index = db.data.research.findIndex((item) => item.id === run.id);
      if (index >= 0) db.data.research[index] = run;
      else db.data.research.push(run);
      db.save();
    },
    remove: (id) => {
      db.data.research = db.data.research.filter((run) => run.id !== id);
      db.save();
    },
    lease: (id) => {
      if (leases.has(id)) return false;
      leases.add(id);
      return true;
    },
    release: (id) => leases.delete(id),
  };
  const settings = {
    get: () => db.data.settings.research,
    set: (patch) => {
      db.data.settings.research = { ...db.data.settings.research, ...patch };
      db.save();
    },
  };
  // The services' addresses can be pointed at stand-ins (test/research-standin.mjs) for tests and demos only.
  const bases = { gemini: process.env.RESEARCH_GEMINI_BASE, tavily: process.env.RESEARCH_TAVILY_BASE, serpapi: process.env.RESEARCH_SERPAPI_BASE };
  const research = researchService({ store, settings, audit: app.audit, mode: 'local', bases, ...app.config.research });
  app.research = research;

  researchApi(router, research, {
    send: {
      html(ctx, html, headers) {
        ctx.res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
        ctx.res.end(ctx.req.method === 'HEAD' ? '' : html);
        return undefined;
      },
      file(ctx, buffer, headers) {
        ctx.res.writeHead(200, { ...headers, 'content-length': buffer.length });
        ctx.res.end(ctx.req.method === 'HEAD' ? undefined : buffer);
        return undefined;
      },
    },
  });
}
