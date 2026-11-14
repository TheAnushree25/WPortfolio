import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from './db/index.mjs';
import { GitHub } from './github/client.mjs';
import { SiteRepo } from './github/site.mjs';
import { HostedContent } from './services/content.mjs';
import { CHUNK_SIZE, HostedMedia } from './services/media.mjs';
import { DbAnalytics } from './services/analytics.mjs';
import { createMailer } from './mail.mjs';
import { createSealer } from './secrets.mjs';
import { dbLimiter } from './ratelimit.mjs';
import { failure, json, readJson, redirect, secure, text } from './http.mjs';
import { ADMIN_UI_DIR, BEACON, HttpError, MIME, Router, atLeast, blankDay, cookie, dayKey, forbidden, isLoopback, loadSample as generateSample, parseCookies, rateLimiter, safeEqual, within } from './shared.mjs';
import { activity, enquiries, meetings, meta, publicUser, sessions, settings, tokens, users } from './data.mjs';
import { authRoutes } from './routes/auth.mjs';
import { adminRoutes } from './routes/admin.mjs';
import { clientRoutes } from './routes/clients.mjs';
import { contentRoutes } from './routes/content.mjs';
import { mediaRoutes } from './routes/media.mjs';
import { siteRoutes } from './routes/site.mjs';
import { cronRoutes } from './routes/cron.mjs';

/**
 * The backend as one web-standard handler, `fetch(Request) → Response`:
 * Node's server, a Vercel Function and the tests all call it the same way.
 *
 * Every /api route says who may call it (signed out, viewer, editor or
 * owner). Changes need the session's CSRF token and a same-site origin. The
 * two public endpoints the site calls (enquiries and visits) answer the
 * admin's own address and the origins allowed in settings, and are
 * rate-limited. Behind the site's /admin route, requests carry the shared
 * ADMIN_PROXY_SECRET; only then are their forwarded host and address believed.
 */

export const COOKIE = 'atlas_admin';

const firstIp = (value) => String(value ?? '').split(',')[0].trim();

export async function createBackend(config, { db: givenDb = null, fetch: fetcher = globalThis.fetch, mailCapture = null } = {}) {
  const db = givenDb ?? (await openDatabase({ databaseUrl: config.databaseUrl, dataDir: config.dataDir, serverless: config.serverless }));
  const github = new GitHub({ token: config.github.token, api: config.github.api, graphql: config.github.graphql, owner: config.github.owner, name: config.github.name, fetch: fetcher });
  const repo = new SiteRepo({ github, db, liveBranch: config.github.liveBranch, draftBranch: config.github.draftBranch });
  const mailer = createMailer(config, { capture: mailCapture });

  const app = {
    config,
    db,
    github,
    repo,
    mailer,
    sealer: createSealer(config.secret),
    content: new HostedContent({ repo }),
    media: new HostedMedia({ repo, db, siteUrl: config.siteUrl }),
    analytics: new DbAnalytics({ db, timeZone: config.timeZone }),
    limits: {
      login: dbLimiter(db, { name: 'login', windowMs: 15 * 60_000, max: 5 }),
      loginIp: dbLimiter(db, { name: 'login-ip', windowMs: 15 * 60_000, max: 25 }),
      twoFactor: dbLimiter(db, { name: 'two-factor', windowMs: 15 * 60_000, max: 10 }),
      forgot: dbLimiter(db, { name: 'forgot', windowMs: 60 * 60_000, max: 5 }),
      enquiry: dbLimiter(db, { name: 'enquiry', windowMs: 10 * 60_000, max: 5 }),
      collect: rateLimiter({ windowMs: 60_000, max: 120 }),
    },
  };

  app.audit = (user, action, summary, { target = null, meta: details = null } = {}) => activity.add(db, { user, action, summary, target, meta: details });

  /* ------------------------------------ Settings, briefly kept ------------------------------------ */

  let settingsCache = null;
  const currentSettings = async () => {
    if (!settingsCache || Date.now() - settingsCache.at > 10_000) settingsCache = { at: Date.now(), value: await settings.get(db) };
    return settingsCache.value;
  };
  app.forgetSettings = () => (settingsCache = null);
  app.siteUrl = async () => (await currentSettings()).siteUrl || config.siteUrl;
  app.calendlyToken = async () => {
    try {
      return app.sealer.open((await currentSettings()).calendlyToken);
    } catch {
      return '';
    }
  };
  app.allowedOrigins = async (ctx) => [...new Set([...config.siteOrigins, ...((await currentSettings()).siteOrigins ?? []), config.publicOrigin, ctx?.publicOrigin].filter(Boolean))];
  app.adminUrl = (ctx) => config.publicUrl || `${ctx.publicOrigin}${config.basePath}`;
  app.features = () => ({
    hosted: true,
    twoFactor: true,
    email: mailer.configured,
    passwordReset: mailer.configured,
    invites: mailer.configured,
    chunkedUploads: true,
    chunkSize: CHUNK_SIZE,
    uploadLimit: 95e6,
    publish: config.github.draftBranch === (repo.liveName || config.github.liveBranch || 'main') ? 'direct' : 'drafts',
  });

  /** Work that may finish after the reply (an email): handed to the platform where it can wait for it, else awaited before replying. */
  app.background = (promise, ctx = null) => {
    const vercel = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    if (vercel?.waitUntil) vercel.waitUntil(promise);
    else if (config.serverless && ctx) ctx.pending.push(promise);
    else promise.catch(() => {});
  };

  /* --------------------------------------------- Sessions --------------------------------------------- */

  const cookieScope = (ctx) => ({ path: config.basePath || '/', secure: ctx.https });
  app.sessionFrom = async (ctx) => {
    if (ctx.signedIn !== undefined) return ctx.signedIn;
    const raw = parseCookies(ctx.request.headers.get('cookie') ?? '')[COOKIE];
    ctx.signedIn = raw ? await sessions.find(db, raw) : null;
    return ctx.signedIn;
  };
  app.createSession = async (ctx, user) => {
    const { raw, session } = await sessions.create(db, { userId: user.id, hours: config.sessionHours, ip: ctx.ip, agent: ctx.request.headers.get('user-agent') });
    ctx.cookies.push(cookie(COOKIE, raw, { maxAge: config.sessionHours * 3600, ...cookieScope(ctx) }));
    return session;
  };
  app.endSession = async (ctx) => {
    if (ctx.session) await sessions.remove(db, ctx.session.id);
    ctx.cookies.push(cookie(COOKIE, '', { maxAge: 0, ...cookieScope(ctx) }));
  };
  app.signIn = async (ctx, user) => {
    const fresh = await users.update(db, user.id, { lastLoginAt: new Date().toISOString() });
    const session = await app.createSession(ctx, fresh);
    await app.audit(fresh, 'auth.login', 'Signed in', { meta: { ip: ctx.ip } });
    return { user: publicUser(fresh), csrf: session.csrf };
  };

  /* ----------------------------------------------- Sample ----------------------------------------------- */

  app.sampleDays = async () => (await meta.get(db, 'sample_days', [])) ?? [];
  app.clearSample = async () => {
    const removed = (await db.query('DELETE FROM enquiries WHERE sample RETURNING id')).length + (await db.query('DELETE FROM meetings WHERE sample RETURNING id')).length;
    const days = await app.sampleDays();
    if (days.length) await db.query('DELETE FROM analytics_daily WHERE day = ANY($1)', [days]);
    await meta.set(db, 'sample_days', []);
    await meta.set(db, 'sample', false);
    return removed;
  };
  /** The local admin's sample generator, run against a scratch copy, then stored here. */
  app.loadSample = async () => {
    await app.clearSample();
    const since = dayKey(new Date(Date.now() - 61 * 86_400_000), config.timeZone);
    const counted = (await db.query('SELECT DISTINCT day FROM analytics_daily WHERE day >= $1', [since])).map((row) => row.day);
    const scratch = { data: { enquiries: [], meetings: [], analytics: { days: Object.fromEntries(counted.map((day) => [day, blankDay()])) }, sampleDays: [], sample: false }, save() {} };
    generateSample(scratch, { timeZone: config.timeZone });
    await db.tx(async (t) => {
      for (const enquiry of scratch.data.enquiries) await enquiries.insert(t, enquiry);
      for (const meeting of scratch.data.meetings) await meetings.insert(t, meeting);
    });
    const written = await app.analytics.importDays(Object.fromEntries(scratch.data.sampleDays.map((day) => [day, scratch.data.analytics.days[day]])));
    await meta.set(db, 'sample_days', written);
    await meta.set(db, 'sample', true);
    return { enquiries: scratch.data.enquiries.length, meetings: scratch.data.meetings.length, days: written.length };
  };

  /* -------------------------------------------- Housekeeping -------------------------------------------- */

  let lastTidy = 0;
  app.housekeeping = async ({ force = false } = {}) => {
    if (!force && Date.now() - lastTidy < 3_600_000) return;
    lastTidy = Date.now();
    const last = await meta.get(db, 'housekeeping_at');
    if (!force && last && Date.now() - Date.parse(last) < 3_600_000) return;
    await meta.set(db, 'housekeeping_at', new Date().toISOString());
    await sessions.sweep(db);
    await tokens.sweep(db);
    await db.query(`DELETE FROM rate_hits WHERE at < now() - interval '1 day'`);
    await db.query(`DELETE FROM uploads WHERE created_at < now() - interval '1 day'`);
    await db.query('DELETE FROM analytics_visitors WHERE day < $1', [dayKey(new Date(), config.timeZone)]);
    await activity.prune(db);
  };

  /* ---------------------------------------------- Routes ---------------------------------------------- */

  const router = new Router();
  for (const register of [authRoutes, adminRoutes, clientRoutes, contentRoutes, mediaRoutes, siteRoutes, cronRoutes]) register(router, app);

  /** Changes must come from the admin's own pages, never another site. */
  const checkOrigin = (ctx) => {
    const site = ctx.request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'origin', 'Changes can only be made from the admin itself.');
    const origin = ctx.request.headers.get('origin');
    if (origin && origin !== 'null') {
      let host;
      try {
        host = new URL(origin).host;
      } catch {
        throw new HttpError(403, 'origin', 'Changes can only be made from the admin itself.');
      }
      if (host !== ctx.publicHost) throw new HttpError(403, 'origin', 'Changes can only be made from the admin itself.');
    }
  };

  const cors = async (ctx) => {
    const origin = ctx.request.headers.get('origin');
    if (!origin) return true;
    const allowed = (await app.allowedOrigins(ctx)).includes(origin.replace(/\/+$/, ''));
    if (allowed) ctx.corsOrigin = origin;
    return allowed;
  };

  async function api(ctx, inner) {
    const { request } = ctx;
    if (request.method === 'OPTIONS') {
      if (inner.startsWith('/api/public/') && (await cors(ctx))) {
        return new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' } });
      }
      throw new HttpError(403, 'origin', 'Not allowed.');
    }
    const found = router.match(request.method, inner);
    if (!found) throw new HttpError(404, 'not_found', 'There’s no such endpoint.');
    if (found.wrongMethod) throw new HttpError(405, 'method', 'That method isn’t allowed here.');
    const { route, params } = found;
    const options = route.options;
    ctx.params = params;
    ctx.query = Object.fromEntries(ctx.url.searchParams);
    ctx.body = () => readJson(request, options.limit ?? 2_000_000);
    const mutating = !['GET', 'HEAD'].includes(request.method);

    if (options.public) {
      if (!(await cors(ctx))) throw new HttpError(403, 'origin', 'This site isn’t allowed to send to the admin. Add it under Settings → Integrations.');
    } else if (mutating && !options.cron) checkOrigin(ctx);

    if (options.auth !== false && !options.public) {
      const signedIn = await app.sessionFrom(ctx);
      if (!signedIn) throw new HttpError(401, 'signed_out', 'You’ve been signed out. Sign in again to carry on.');
      ctx.user = signedIn.user;
      ctx.session = signedIn.session;
      await sessions.touch(db, ctx.session.id);
      if (!atLeast(ctx.user, options.auth ?? 'viewer')) throw forbidden();
      if (mutating && !safeEqual(request.headers.get('x-csrf-token') ?? '', ctx.session.csrf)) throw new HttpError(403, 'csrf', 'This page is out of date. Reload it and try again.');
      if (ctx.user.mustChangePassword && !options.passwordChange) throw new HttpError(403, 'password_change', 'Choose a new password first.');
    }

    const result = await route.handler(ctx);
    return result instanceof Response ? result : json(200, result ?? null);
  }

  /* -------------------------------------------- The admin's pages -------------------------------------------- */

  // Kept in memory in production; read afresh while working on them locally.
  const files = new Map();
  async function uiFile(relative) {
    if (config.production && files.has(relative)) return files.get(relative);
    const absolute = within(ADMIN_UI_DIR, relative);
    if (!absolute) return null;
    let body;
    try {
      body = await fsp.readFile(absolute);
    } catch {
      return null;
    }
    const entry = { body, etag: `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`, type: MIME[path.extname(absolute).toLowerCase()] || 'application/octet-stream' };
    files.set(relative, entry);
    return entry;
  }

  async function page(ctx, inner) {
    const { request } = ctx;
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'method', 'Method not allowed.');
    let decoded;
    try {
      decoded = decodeURIComponent(inner);
    } catch {
      throw new HttpError(400, 'invalid', 'That address isn’t valid.');
    }
    const shell = decoded === '/' || decoded === '/index.html' || !path.extname(decoded);
    if (!shell) {
      const file = await uiFile(decoded);
      if (!file) return text(404, 'Not found');
      if (request.headers.get('if-none-match') === file.etag) return new Response(null, { status: 304, headers: { etag: file.etag, 'cache-control': 'no-cache' } });
      return new Response(request.method === 'HEAD' ? null : file.body, { status: 200, headers: { 'content-type': file.type, etag: file.etag, 'cache-control': 'no-cache' } });
    }
    // Every page of the single-page app is the same shell; its <base> names where the admin is served.
    const index = await uiFile('/index.html');
    if (!index) return text(500, 'The admin’s pages are missing from this deployment.');
    const html = index.body.toString('utf8').replace('<base href="/" />', `<base href="${config.basePath}/" />`);
    return text(200, request.method === 'HEAD' ? '' : html, 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
  }

  /* --------------------------------------------- Each request --------------------------------------------- */

  async function route(ctx) {
    const pathname = ctx.url.pathname;
    const base = config.basePath;
    if (pathname === '/healthz' || pathname === `${base}/healthz`) {
      await db.one('SELECT 1 AS ok');
      return json(200, { ok: true, version: config.version });
    }
    if (base && pathname === '/') return redirect(`${base}/`);
    // /admin itself is the admin's first page (the site's server trims the trailing slash; the page's <base> keeps links right).
    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return text(404, 'Not found');
    const inner = pathname.slice(base.length) || '/';
    if (inner.startsWith('/api/')) return api(ctx, inner);
    if (inner === '/beacon.js') return text(200, BEACON, 'text/javascript; charset=utf-8', { 'cache-control': 'public, max-age=3600', 'cross-origin-resource-policy': 'cross-origin' });
    if (inner.startsWith('/site-media/') || inner.startsWith('/trash-media/')) {
      if (!(await app.sessionFrom(ctx))) throw new HttpError(401, 'signed_out', 'Sign in to see the site’s files.');
      if (inner.startsWith('/trash-media/')) return app.media.serveTrash(inner.slice('/trash-media/'.length), ctx.request);
      let publicPath;
      try {
        publicPath = decodeURIComponent(inner.slice('/site-media'.length));
      } catch {
        throw new HttpError(400, 'invalid', 'That address isn’t valid.');
      }
      if (publicPath.includes('\0') || publicPath.split('/').some((part) => part === '..')) throw new HttpError(400, 'invalid', 'That address isn’t valid.');
      return app.media.serve(publicPath, ctx.request);
    }
    return page(ctx, inner);
  }

  /** Answers one request. `platform.ip` is the socket's address when Node's own server is in front. */
  async function fetchHandler(request, platform = {}) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return json(400, { error: 'invalid', message: 'Bad request.' });
    }
    const headers = request.headers;
    const viaProxy = Boolean(config.proxySecret) && safeEqual(headers.get('x-atlas-proxy') ?? '', config.proxySecret);
    const believeForwarded = viaProxy || config.trustProxy;
    const proto = (believeForwarded && headers.get('x-forwarded-proto')) || url.protocol.replace(':', '');
    const publicHost = (viaProxy && headers.get('x-forwarded-host')) || headers.get('host') || url.host;
    const ip = (viaProxy ? firstIp(headers.get('x-forwarded-for')) : config.trustProxy ? headers.get('x-real-ip') || firstIp(headers.get('x-forwarded-for')) : '') || platform.ip || '';
    const ctx = {
      request,
      url,
      ip,
      publicHost,
      publicOrigin: `${proto}://${publicHost}`,
      https: proto === 'https',
      loopback: !viaProxy && isLoopback(platform.ip ?? '') && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(headers.get('host') ?? ''),
      cookies: [],
      pending: [],
      user: null,
      session: null,
    };
    let response;
    try {
      response = await route(ctx);
    } catch (error) {
      response = failure(error);
    }
    if (ctx.pending.length) await Promise.allSettled(ctx.pending);
    response = secure(response, { https: ctx.https, mediaOrigins: config.siteUrl ? [new URL(config.siteUrl).origin] : [] });
    if (ctx.corsOrigin) {
      response.headers.set('access-control-allow-origin', ctx.corsOrigin);
      response.headers.append('vary', 'Origin');
      response.headers.set('cross-origin-resource-policy', 'cross-origin');
    }
    for (const value of ctx.cookies) response.headers.append('set-cookie', value);
    return response;
  }

  return {
    app,
    fetch: fetchHandler,
    async close() {
      await db.close();
    },
  };
}
