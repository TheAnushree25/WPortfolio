import fs from 'node:fs';
import path from 'node:path';
import { HttpError, badRequest, forbidden } from '../http.mjs';
import { atLeast } from '../security.mjs';
import { recipe } from '../jobs.mjs';
import { text } from '../validate.mjs';

/**
 * Publishing and the site's numbers: what has changed since the last commit
 * and each change's diff, discarding or keeping changes, the checks, builds,
 * deploys and local preview as streamed jobs, and the visit counts.
 */
export function siteRoutes(router, app) {
  const { git, jobs, db, config, analytics } = app;

  router.get('/api/publish', async () => {
    const info = await git.info();
    const status = info.available ? await git.status() : [];
    let calendly = '';
    try {
      calendly = /^\s*NEXT_PUBLIC_CALENDLY_URL\s*=\s*(\S+)/m.exec(fs.readFileSync(path.join(config.siteRoot, '.env.local'), 'utf8'))?.[1] ?? '';
    } catch {
      /* none */
    }
    return {
      git: info,
      changes: status.filter((entry) => entry.managed),
      otherChanges: status.filter((entry) => !entry.managed).length,
      site: {
        ...jobs.siteReady(),
        root: config.siteRoot,
        previewPort: config.previewPort,
        calendly,
        hosting: fs.existsSync(path.join(config.siteRoot, 'wrangler.jsonc')) ? 'Cloudflare Workers' : 'Unknown',
        mounted: Boolean(config.mounted),
      },
      preview: jobs.preview() ? jobs.summary(jobs.preview()) : null,
      busy: jobs.busy() ? jobs.summary(jobs.busy()) : null,
      history: info.available ? await git.log(20) : [],
      jobs: jobs.recent(),
    };
  });

  router.get('/api/publish/diff', (ctx) => git.diff(String(ctx.query.file ?? '')));

  router.post('/api/publish/discard', { auth: 'editor' }, async (ctx) => {
    const { file } = await ctx.body();
    const result = await git.discard(String(file ?? ''), {
      toTrash: async (abs) => {
        const publicDir = path.join(config.siteRoot, 'public');
        if (!abs.startsWith(publicDir + path.sep)) {
          fs.unlinkSync(abs);
          return { file };
        }
        return app.media.remove(`/${path.relative(publicDir, abs).split(path.sep).join('/')}`, await app.contentStrings());
      },
    });
    app.audit(ctx.user, 'publish.discard', `Discarded the change to ${file}`, { target: file });
    return result;
  });

  router.post('/api/publish/commit', { auth: 'editor' }, async (ctx) => {
    const body = await ctx.body();
    const message = text(body.message, { field: 'message', max: 200, required: true });
    const files = Array.isArray(body.files) ? body.files.map(String) : [];
    const result = await git.commit({ files, message, author: { name: ctx.user.name, email: ctx.user.email } });
    app.audit(ctx.user, 'publish.commit', `Saved a version: “${message}”`, { target: result.hash, meta: { files: result.files } });
    return result;
  });

  router.get('/api/jobs', () => jobs.recent());

  router.post('/api/jobs', { auth: 'editor' }, async (ctx) => {
    const body = await ctx.body();
    const spec = recipe(body.type);
    if (!spec) throw badRequest('Unknown job.');
    if (!atLeast(ctx.user, spec.role)) throw forbidden(`Only the studio owner can ${spec.label.toLowerCase()}.`);
    if (body.type === 'deploy' && body.confirm !== 'deploy') throw badRequest('Type “deploy” to confirm.');
    const job = await jobs.start(body.type, ctx.user);
    app.audit(ctx.user, `job.${body.type}`, `Started: ${spec.label}`, { target: job.id });
    return job;
  });

  router.get('/api/jobs/:id', (ctx) => jobs.get(ctx.params.id));

  router.post('/api/jobs/:id/stop', { auth: 'editor' }, (ctx) => {
    const job = jobs.get(ctx.params.id);
    if (job.type === 'deploy' && !atLeast(ctx.user, 'owner')) throw forbidden('Only the owner can stop a deploy.');
    const stopped = jobs.stop(ctx.params.id);
    app.audit(ctx.user, 'job.stop', `Stopped: ${stopped.label}`, { target: stopped.id });
    return stopped;
  });

  // Server-sent events: the job's output so far, then each line as it comes.
  router.get('/api/jobs/:id/stream', (ctx) => {
    const job = jobs.get(ctx.params.id);
    const { res } = ctx;
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('hello', { ...job, lines: undefined });
    for (const line of job.lines) send('line', { text: line });
    if (job.status !== 'running') {
      send('end', { status: job.status, exitCode: job.exitCode });
      res.end();
      return undefined;
    }
    const off = jobs.subscribe(job.id, (event) => {
      send(event.type, event);
      if (event.type === 'end') {
        cleanup();
        res.end();
      }
    });
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
    const cleanup = () => {
      clearInterval(beat);
      off();
    };
    ctx.req.on('close', cleanup);
    return undefined;
  });

  /* -------------------------------- Analytics ------------------------------ */

  router.get('/api/analytics', (ctx) => {
    const span = [7, 30, 90].includes(Number(ctx.query.days)) ? Number(ctx.query.days) : 30;
    return { ...analytics.report(span), origins: app.allowedOrigins(), sample: (db.data.sampleDays ?? []).length > 0 };
  });

  router.post('/api/public/collect', { auth: false, public: true, limit: 4_000 }, async (ctx) => {
    if (app.limits.collect.hit(ctx.ip).limited) throw new HttpError(429, 'limited', 'Slow down.');
    const body = await ctx.body();
    const own = app.allowedOrigins().map((origin) => {
      try {
        return new URL(origin).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    });
    analytics.record({
      path: body.p,
      referrer: typeof body.r === 'string' ? body.r.slice(0, 500) : '',
      width: body.w,
      event: typeof body.e === 'string' ? body.e : '',
      ua: String(ctx.req.headers['user-agent'] ?? ''),
      ip: ctx.ip,
      country: String(ctx.req.headers['cf-ipcountry'] ?? ''),
      ownHosts: own,
    });
    ctx.res.writeHead(204);
    ctx.res.end();
    return undefined;
  });
}
