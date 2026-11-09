import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Store } from './db.mjs';
import { ContentStore } from './content/store.mjs';
import { MediaLibrary } from './media.mjs';
import { Git } from './git.mjs';
import { Jobs } from './jobs.mjs';
import { Analytics, BEACON } from './analytics.mjs';
import { HttpError, Router, cookie, forbidden, parseCookies, readJson, sendFile, sendJson, sendText, within } from './http.mjs';
import { atLeast, rateLimiter, safeEqual, securityHeaders, sha256, randomToken } from './security.mjs';
export { publicUser } from './security.mjs';
import { authRoutes } from './routes/auth.mjs';
import { contentRoutes } from './routes/content.mjs';
import { mediaRoutes } from './routes/media.mjs';
import { clientRoutes } from './routes/clients.mjs';
import { siteRoutes } from './routes/site.mjs';
import { adminRoutes } from './routes/admin.mjs';

/**
 * The admin as one request handler. Every /api route declares who may call
 * it (signed out, viewer, editor or owner); changes also need the session's
 * CSRF token and a same-site origin. The two public endpoints, which the
 * site itself calls (enquiries and visit counts), instead answer only the
 * origins listed in SITE_ORIGINS or Settings, and are rate-limited.
 */

export const COOKIE = 'atlas_admin';

export async function createApp(config) {
  const db = new Store(path.join(config.dataDir, 'db.json'));
  await db.load();

  const app = {
    config,
    db,
    content: new ContentStore({ siteRoot: config.siteRoot, dataDir: config.dataDir }),
    media: new MediaLibrary({ siteRoot: config.siteRoot, dataDir: config.dataDir, db }),
    git: new Git(config.siteRoot, path.dirname(config.publicDir)),
    jobs: new Jobs({ siteRoot: config.siteRoot, db, previewPort: config.previewPort, mounted: Boolean(config.mounted) }),
    analytics: new Analytics({ db, timeZone: config.timeZone }),
    limits: {
      login: rateLimiter({ windowMs: 15 * 60_000, max: 5 }),
      loginIp: rateLimiter({ windowMs: 15 * 60_000, max: 25 }),
      enquiry: rateLimiter({ windowMs: 10 * 60_000, max: 5 }),
      collect: rateLimiter({ windowMs: 60_000, max: 120 }),
    },
  };

  app.audit = (user, action, summary, { target = null, meta = null } = {}) => {
    db.data.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), userId: user?.id ?? null, userName: user?.name ?? 'System', action, target, summary, meta });
    if (db.data.activity.length > 3000) db.data.activity.length = 3000;
    db.save();
  };

  app.allowedOrigins = () => [...new Set([...config.siteOrigins, ...(db.data.settings.siteOrigins ?? [])])];

  app.sessionFrom = (req) => {
    const raw = parseCookies(req.headers.cookie)[COOKIE];
    if (!raw) return null;
    const id = sha256(raw);
    const session = db.data.sessions.find((item) => item.id === id);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = db.data.users.find((item) => item.id === session.userId && !item.disabled);
    return user ? { session, user } : null;
  };

  app.createSession = (user, ctx) => {
    const raw = randomToken(32);
    const now = Date.now();
    const session = {
      id: sha256(raw),
      userId: user.id,
      csrf: randomToken(24),
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + config.sessionHours * 3_600_000).toISOString(),
      ip: ctx.ip,
      agent: String(ctx.req.headers['user-agent'] ?? '').slice(0, 240),
    };
    db.data.sessions = db.data.sessions.filter((item) => Date.parse(item.expiresAt) > now).concat(session);
    db.save();
    ctx.res.setHeader('set-cookie', cookie(COOKIE, raw, { maxAge: config.sessionHours * 3600, ...cookieScope(ctx) }));
    return session;
  };

  app.endSession = (ctx) => {
    if (ctx.session) db.data.sessions = db.data.sessions.filter((item) => item.id !== ctx.session.id);
    db.save();
    ctx.res.setHeader('set-cookie', cookie(COOKIE, '', { maxAge: 0, ...cookieScope(ctx) }));
  };

  // Mounted in the site, the cookie stays under /admin, and is marked Secure whenever the site is served over HTTPS.
  const basePath = config.basePath ?? '';
  const cookieScope = (ctx) => ({
    path: basePath || '/',
    secure: config.secureCookies || ((config.mounted || config.trustProxy) && ctx.req.headers['x-forwarded-proto'] === 'https'),
  });

  const router = new Router();
  for (const register of [authRoutes, contentRoutes, mediaRoutes, clientRoutes, siteRoutes, adminRoutes]) register(router, app);

  const clientIp = (req) => {
    if (config.trustProxy) {
      const forwarded = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
      if (forwarded) return forwarded;
    }
    return req.socket.remoteAddress ?? '';
  };

  /** Changes must come from the admin's own pages, never another site. */
  const checkOrigin = (req) => {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'origin', 'Changes can only be made from the admin itself.');
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let host;
      try {
        host = new URL(origin).host;
      } catch {
        throw new HttpError(403, 'origin', 'Changes can only be made from the admin itself.');
      }
      if (host !== req.headers.host) throw new HttpError(403, 'origin', 'Changes can only be made from the admin itself.');
    }
  };

  const cors = (req, res) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    const allowed = app.allowedOrigins().includes(origin.replace(/\/+$/, ''));
    if (allowed) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('cross-origin-resource-policy', 'cross-origin');
    }
    return allowed;
  };

  async function api(req, res, url) {
    if (req.method === 'OPTIONS') {
      if (url.pathname.startsWith('/api/public/') && cors(req, res)) {
        res.writeHead(204, { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
        res.end();
        return;
      }
      throw new HttpError(403, 'origin', 'Not allowed.');
    }
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'not_found', 'There’s no such endpoint.');
    if (found.wrongMethod) throw new HttpError(405, 'method', 'That method isn’t allowed here.');
    const { route, params } = found;
    const options = route.options;
    const ctx = { req, res, url, params, query: Object.fromEntries(url.searchParams), ip: clientIp(req), user: null, session: null };
    ctx.body = () => readJson(req, options.limit ?? 2_000_000);
    const mutating = !['GET', 'HEAD'].includes(req.method);

    if (options.public) {
      if (!cors(req, res)) throw new HttpError(403, 'origin', 'This site isn’t allowed to send to the admin. Add it under Settings → Integrations.');
    } else if (mutating) checkOrigin(req);

    if (options.auth !== false && !options.public) {
      const signedIn = app.sessionFrom(req);
      if (!signedIn) throw new HttpError(401, 'signed_out', 'You’ve been signed out. Sign in again to carry on.');
      ctx.user = signedIn.user;
      ctx.session = signedIn.session;
      if (Date.now() - Date.parse(ctx.session.lastSeenAt) > 60_000) {
        ctx.session.lastSeenAt = new Date().toISOString();
        db.save();
      }
      if (!atLeast(ctx.user, options.auth ?? 'viewer')) throw forbidden();
      if (mutating && !safeEqual(req.headers['x-csrf-token'], ctx.session.csrf)) throw new HttpError(403, 'csrf', 'This page is out of date. Reload it and try again.');
      if (ctx.user.mustChangePassword && !options.passwordChange) throw new HttpError(403, 'password_change', 'Choose a new password first.');
    }

    const result = await route.handler(ctx);
    if (result !== undefined && !res.headersSent) sendJson(res, 200, result);
  }

  async function siteMedia(req, res, url) {
    if (!app.sessionFrom(req)) throw new HttpError(401, 'signed_out', 'Sign in to see the site’s files.');
    let relative;
    try {
      relative = decodeURIComponent(url.pathname.slice('/site-media/'.length));
    } catch {
      throw new HttpError(400, 'invalid', 'That address isn’t valid.');
    }
    const file = within(path.join(config.siteRoot, 'public'), relative);
    if (!file || !(await sendFile(req, res, file, { cache: 'private, max-age=60' }))) throw new HttpError(404, 'not_found', 'That file isn’t in the site’s public folder.');
  }

  async function trashMedia(req, res, url) {
    const signedIn = app.sessionFrom(req);
    if (!signedIn) throw new HttpError(401, 'signed_out', 'Sign in first.');
    const file = app.media.trashFile(url.pathname.slice('/trash-media/'.length));
    if (!file || !(await sendFile(req, res, file, { cache: 'private, max-age=60' }))) throw new HttpError(404, 'not_found', 'That item has left the trash.');
  }

  async function staticFile(req, res, url) {
    if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'method', 'Method not allowed.');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'invalid', 'That address isn’t valid.');
    }
    const shell = pathname === '/' || pathname === '/index.html' || !path.extname(pathname);
    const file = shell ? null : within(config.publicDir, pathname);
    if (file && (await sendFile(req, res, file))) return;
    // Every page of the single-page app is served the same shell; the app routes on the client.
    // Its <base> carries the path the admin is mounted at, so the shell's own links resolve under it.
    if (shell) {
      shellHtml ??= await fsp.readFile(path.join(config.publicDir, 'index.html'), 'utf8');
      const html = shellHtml.replace('<base href="/" />', `<base href="${basePath}/" />`);
      sendText(res, 200, req.method === 'HEAD' ? '' : html, 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
      return;
    }
    throw new HttpError(404, 'not_found', 'Not found.');
  }
  let shellHtml = null;

  function fail(res, error) {
    if (error instanceof HttpError) {
      const headers = error.extra?.retryAfter ? { 'retry-after': String(error.extra.retryAfter) } : {};
      if (res.headersSent) return res.end();
      if (error.status === 404 && !res.req?.url?.startsWith('/api/') && res.req?.headers.accept?.includes('text/html')) {
        return sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
      }
      return sendJson(res, error.status, { error: error.code, message: error.message, ...(error.extra ?? {}) }, headers);
    }
    console.error('[admin]', error);
    if (res.headersSent) return res.end();
    sendJson(res, 500, { error: 'server', message: 'Something went wrong in the admin. The details are in its console window.' });
  }

  async function handle(req, res) {
    securityHeaders(res);
    let url;
    try {
      url = new URL(req.url, 'http://admin.local');
    } catch {
      return sendJson(res, 400, { error: 'invalid', message: 'Bad request.' });
    }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (url.pathname.startsWith('/site-media/')) return await siteMedia(req, res, url);
      if (url.pathname.startsWith('/trash-media/')) return await trashMedia(req, res, url);
      if (url.pathname === '/beacon.js') {
        return sendText(res, 200, BEACON, 'text/javascript; charset=utf-8', { 'cache-control': 'public, max-age=3600', 'cross-origin-resource-policy': 'cross-origin' });
      }
      return await staticFile(req, res, url);
    } catch (error) {
      fail(res, error);
    }
  }

  // Expired sessions are swept every hour.
  const sweep = setInterval(() => {
    const now = Date.now();
    const before = db.data.sessions.length;
    db.data.sessions = db.data.sessions.filter((item) => Date.parse(item.expiresAt) > now);
    if (db.data.sessions.length !== before) db.save();
  }, 3_600_000);
  sweep.unref();

  return {
    app,
    handle,
    async close() {
      clearInterval(sweep);
      app.jobs.stopAll();
      await db.flush();
    },
  };
}

export const forbiddenUnless = (ctx, role) => {
  if (!atLeast(ctx.user, role)) throw forbidden();
};
