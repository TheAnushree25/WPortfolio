import crypto from 'node:crypto';
import { HttpError, badRequest } from '../http.mjs';
import { burnPasswordCheck, hashPassword, isLoopback, passwordProblem, publicUser, safeEqual, verifyPassword } from '../security.mjs';
import { email, text } from '../validate.mjs';
import { loadSample } from '../sample.mjs';

/** Setup, sign-in, sign-out, passwords and the list of signed-in devices. */
export function authRoutes(router, app) {
  const { db, config, limits } = app;

  router.get('/api/auth/state', { auth: false }, (ctx) => {
    const signedIn = app.sessionFrom(ctx.req);
    const needsSetup = db.data.users.length === 0;
    return {
      needsSetup,
      setupLocal: isLoopback(ctx.ip),
      setupToken: Boolean(config.setupToken),
      user: signedIn ? publicUser(signedIn.user) : null,
      csrf: signedIn?.session.csrf ?? null,
      sample: db.data.sample,
      version: config.version,
    };
  });

  router.post('/api/auth/setup', { auth: false }, async (ctx) => {
    if (db.data.users.length) throw new HttpError(409, 'done', 'The admin is already set up. Sign in instead.');
    const body = await ctx.body();
    if (!isLoopback(ctx.ip) && !(config.setupToken && safeEqual(body.token, config.setupToken))) {
      throw new HttpError(403, 'setup_local', 'Finish setup on the computer the admin runs on, or open /setup?token=… with the ADMIN_SETUP_TOKEN from Admin/.env.');
    }
    const name = text(body.name, { field: 'name', max: 80, required: true });
    const address = email(body.email);
    const problem = passwordProblem(body.password, { email: address });
    if (problem) throw badRequest(problem, { field: 'password' });
    const now = new Date().toISOString();
    const user = { id: crypto.randomUUID(), name, email: address, role: 'owner', passwordHash: await hashPassword(body.password), createdAt: now, lastLoginAt: now, disabled: false, mustChangePassword: false };
    if (db.data.users.length) throw new HttpError(409, 'done', 'The admin is already set up. Sign in instead.');
    db.data.users.push(user);
    if (body.sample) loadSample(db, { timeZone: config.timeZone });
    app.audit(user, 'auth.setup', `Set up the admin${body.sample ? ' with sample data' : ''}`);
    const session = app.createSession(user, ctx);
    return { user: publicUser(user), csrf: session.csrf };
  });

  router.post('/api/auth/login', { auth: false }, async (ctx) => {
    const body = await ctx.body();
    const address = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
    const key = `${ctx.ip}|${address}`;
    const wait = Math.max(limits.login.blocked(key), limits.loginIp.blocked(ctx.ip));
    if (wait) {
      throw new HttpError(429, 'limited', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`, { retryAfter: wait });
    }
    const user = db.data.users.find((item) => item.email === address);
    let ok = false;
    if (user && !user.disabled) ok = await verifyPassword(String(body.password ?? ''), user.passwordHash);
    else await burnPasswordCheck(body.password);
    if (!ok) {
      limits.login.hit(key);
      limits.loginIp.hit(ctx.ip);
      app.audit(null, 'auth.failed', `A sign-in failed for ${address || 'a blank email'}`, { meta: { ip: ctx.ip } });
      throw new HttpError(401, 'credentials', user?.disabled ? 'This account has been turned off. Ask the studio owner.' : 'That email and password don’t match.');
    }
    limits.login.reset(key);
    user.lastLoginAt = new Date().toISOString();
    const session = app.createSession(user, ctx);
    app.audit(user, 'auth.login', 'Signed in', { meta: { ip: ctx.ip } });
    return { user: publicUser(user), csrf: session.csrf };
  });

  router.post('/api/auth/logout', { passwordChange: true }, (ctx) => {
    app.endSession(ctx);
    return { ok: true };
  });

  router.get('/api/auth/sessions', (ctx) =>
    db.data.sessions
      .filter((item) => item.userId === ctx.user.id && Date.parse(item.expiresAt) > Date.now())
      .map((item) => ({ id: item.id, current: item.id === ctx.session.id, createdAt: item.createdAt, lastSeenAt: item.lastSeenAt, expiresAt: item.expiresAt, ip: item.ip, agent: item.agent }))
      .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1)),
  );

  router.delete('/api/auth/sessions/:id', (ctx) => {
    const target = db.data.sessions.find((item) => item.id === ctx.params.id && item.userId === ctx.user.id);
    if (!target) throw new HttpError(404, 'not_found', 'That device is already signed out.');
    db.data.sessions = db.data.sessions.filter((item) => item !== target);
    db.save();
    app.audit(ctx.user, 'auth.revoke', 'Signed out another device');
    return { ok: true };
  });

  router.post('/api/auth/sessions/revoke-others', (ctx) => {
    const before = db.data.sessions.length;
    db.data.sessions = db.data.sessions.filter((item) => item.userId !== ctx.user.id || item.id === ctx.session.id);
    db.save();
    app.audit(ctx.user, 'auth.revoke', 'Signed out every other device');
    return { revoked: before - db.data.sessions.length };
  });

  router.post('/api/auth/password', { passwordChange: true }, async (ctx) => {
    const body = await ctx.body();
    if (!(await verifyPassword(String(body.current ?? ''), ctx.user.passwordHash))) throw badRequest('Your current password isn’t right.', { field: 'current' });
    const problem = passwordProblem(body.next, { email: ctx.user.email });
    if (problem) throw badRequest(problem, { field: 'next' });
    if (body.next === body.current) throw badRequest('Choose a password you haven’t used here.', { field: 'next' });
    ctx.user.passwordHash = await hashPassword(body.next);
    ctx.user.mustChangePassword = false;
    db.data.sessions = db.data.sessions.filter((item) => item.userId !== ctx.user.id || item.id === ctx.session.id);
    db.save();
    app.audit(ctx.user, 'auth.password', 'Changed their password');
    return { user: publicUser(ctx.user) };
  });

  router.patch('/api/auth/profile', async (ctx) => {
    const body = await ctx.body();
    const name = text(body.name ?? ctx.user.name, { field: 'name', max: 80, required: true });
    const address = email(body.email ?? ctx.user.email);
    if (db.data.users.some((item) => item.email === address && item.id !== ctx.user.id)) throw badRequest('Someone else already uses that email here.', { field: 'email' });
    ctx.user.name = name;
    ctx.user.email = address;
    db.save();
    app.audit(ctx.user, 'user.profile', 'Updated their profile');
    return { user: publicUser(ctx.user) };
  });
}
