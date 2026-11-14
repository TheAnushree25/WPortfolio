import { HttpError, badRequest, burnPasswordCheck, check, hashPassword, passwordProblem, safeEqual, verifyPassword } from '../shared.mjs';
import { meta, publicUser, sessions, tokens, users } from '../data.mjs';
import { hashRecovery, newRecoveryCodes, newSecret, otpauthUri, verifyCode } from '../totp.mjs';
import { qrSvgPath } from '../qr.mjs';
import { renderEmail } from '../mail.mjs';

/**
 * Setup, sign-in (with two-step codes when a person has turned them on),
 * sign-out, passwords, the signed-in devices, two-step sign-in itself, and
 * password-reset and invitation links by email.
 */
export function authRoutes(router, app) {
  const { db, config, limits, sealer, mailer } = app;

  router.get('/api/auth/state', { auth: false }, async (ctx) => {
    const signedIn = await app.sessionFrom(ctx);
    return {
      needsSetup: (await users.count(db)) === 0,
      setupLocal: !config.production && ctx.loopback && !config.setupToken,
      setupToken: Boolean(config.setupToken),
      user: signedIn ? publicUser(signedIn.user) : null,
      csrf: signedIn?.session.csrf ?? null,
      sample: Boolean(await meta.get(db, 'sample', false)),
      version: config.version,
      mode: 'hosted',
      features: app.features(),
    };
  });

  router.post('/api/auth/setup', { auth: false }, async (ctx) => {
    const body = await ctx.body();
    const wait = await limits.loginIp.blocked(ctx.ip);
    if (wait) throw new HttpError(429, 'limited', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`, { retryAfter: wait });
    const allowed = config.setupToken ? safeEqual(body.token, config.setupToken) : !config.production && ctx.loopback;
    if (!allowed) {
      await limits.loginIp.hit(ctx.ip);
      throw new HttpError(403, 'setup_token', config.setupToken ? 'That setup link isn’t right. Open /admin/setup?token=… with the ADMIN_SETUP_TOKEN set for the backend.' : 'Set ADMIN_SETUP_TOKEN for the backend, then open /admin/setup?token=<it> to create the first account.');
    }
    const name = check.text(body.name, { field: 'name', max: 80, required: true });
    const address = check.email(body.email);
    const problem = passwordProblem(body.password, { email: address });
    if (problem) throw badRequest(problem, { field: 'password' });
    const passwordHash = await hashPassword(body.password);
    const user = await db.withLock('setup', async () => {
      if (await users.count(db)) throw new HttpError(409, 'done', 'The admin is already set up. Sign in instead.');
      return users.insert(db, { name, email: address, role: 'owner', passwordHash, lastLoginAt: new Date().toISOString() });
    });
    if (body.sample) await app.loadSample();
    await app.audit(user, 'auth.setup', `Set up the hosted admin${body.sample ? ' with sample data' : ''}`);
    const session = await app.createSession(ctx, user);
    return { user: publicUser(user), csrf: session.csrf };
  });

  router.post('/api/auth/login', { auth: false }, async (ctx) => {
    const body = await ctx.body();
    const address = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
    const key = `${ctx.ip}|${address}`;
    const wait = Math.max(await limits.login.blocked(key), await limits.loginIp.blocked(ctx.ip));
    if (wait) throw new HttpError(429, 'limited', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`, { retryAfter: wait });
    const user = await users.byEmail(db, address);
    let ok = false;
    if (user && !user.disabled) ok = await verifyPassword(String(body.password ?? ''), user.passwordHash);
    else await burnPasswordCheck(body.password);
    if (!ok) {
      await limits.login.hit(key);
      await limits.loginIp.hit(ctx.ip);
      await app.audit(null, 'auth.failed', `A sign-in failed for ${address || 'a blank email'}`, { meta: { ip: ctx.ip } });
      throw new HttpError(401, 'credentials', user?.disabled ? 'This account has been turned off. Ask the studio owner.' : 'That email and password don’t match.');
    }
    await limits.login.reset(key);
    if (user.totpEnabledAt) {
      // The password was right; the session waits for the code from their phone.
      return { twoFactor: true, challenge: await tokens.create(db, { kind: 'login', userId: user.id, minutes: 5 }) };
    }
    return app.signIn(ctx, user);
  });

  router.post('/api/auth/login/verify', { auth: false }, async (ctx) => {
    const body = await ctx.body();
    const wait = await limits.twoFactor.blocked(ctx.ip);
    if (wait) throw new HttpError(429, 'limited', `Too many wrong codes. Try again in ${Math.ceil(wait / 60)} minutes.`, { retryAfter: wait });
    const expired = () => new HttpError(401, 'challenge', 'That sign-in has expired. Enter your email and password again.');
    const token = await tokens.peek(db, body.challenge, 'login');
    if (!token) throw expired();
    const user = await users.byId(db, token.user_id);
    if (!user || user.disabled || !user.totpEnabledAt) throw expired();
    if ((await tokens.attempt(db, token.id)) > 5) {
      await tokens.use(db, token.id);
      throw new HttpError(401, 'challenge', 'Too many wrong codes. Sign in again.');
    }
    const code = String(body.code ?? '').trim();
    let ok = false;
    let recovery = false;
    if (/^\d[\d\s]{4,8}\d$/.test(code)) {
      const step = verifyCode(sealer.open(user.totpSecret), code, { lastStep: user.totpLastStep });
      ok = Boolean(step) && (await users.claimStep(db, user.id, step));
    } else if (code) {
      ok = await users.useRecovery(db, user.id, hashRecovery(code));
      recovery = ok;
    }
    if (!ok) {
      await limits.twoFactor.hit(ctx.ip);
      throw new HttpError(401, 'code', 'That code isn’t right. Check the time on your phone, or use one of your recovery codes.');
    }
    if (!(await tokens.use(db, token.id))) throw expired();
    if (recovery) {
      const left = (await users.byId(db, user.id)).recoveryCodes.length;
      await app.audit(user, 'auth.recovery', `Signed in with a recovery code (${left} left)`, { meta: { ip: ctx.ip } });
    }
    return app.signIn(ctx, user);
  });

  router.post('/api/auth/logout', { passwordChange: true }, async (ctx) => {
    await app.endSession(ctx);
    return { ok: true };
  });

  router.get('/api/auth/sessions', async (ctx) =>
    (await sessions.listForUser(db, ctx.user.id)).map((item) => ({ id: item.id, current: item.id === ctx.session.id, createdAt: item.createdAt, lastSeenAt: item.lastSeenAt, expiresAt: item.expiresAt, ip: item.ip, agent: item.agent })),
  );

  router.delete('/api/auth/sessions/:id', async (ctx) => {
    const mine = (await sessions.listForUser(db, ctx.user.id)).find((item) => item.id === ctx.params.id);
    if (!mine) throw new HttpError(404, 'not_found', 'That device is already signed out.');
    await sessions.remove(db, mine.id);
    await app.audit(ctx.user, 'auth.revoke', 'Signed out another device');
    return { ok: true };
  });

  router.post('/api/auth/sessions/revoke-others', async (ctx) => {
    const revoked = await sessions.removeForUser(db, ctx.user.id, ctx.session.id);
    await app.audit(ctx.user, 'auth.revoke', 'Signed out every other device');
    return { revoked };
  });

  router.post('/api/auth/password', { passwordChange: true }, async (ctx) => {
    const body = await ctx.body();
    if (!(await verifyPassword(String(body.current ?? ''), ctx.user.passwordHash))) throw badRequest('Your current password isn’t right.', { field: 'current' });
    const problem = passwordProblem(body.next, { email: ctx.user.email });
    if (problem) throw badRequest(problem, { field: 'next' });
    if (body.next === body.current) throw badRequest('Choose a password you haven’t used here.', { field: 'next' });
    const user = await users.update(db, ctx.user.id, { passwordHash: await hashPassword(body.next), mustChangePassword: false });
    await sessions.removeForUser(db, ctx.user.id, ctx.session.id);
    await app.audit(ctx.user, 'auth.password', 'Changed their password');
    return { user: publicUser(user) };
  });

  router.patch('/api/auth/profile', async (ctx) => {
    const body = await ctx.body();
    const name = check.text(body.name ?? ctx.user.name, { field: 'name', max: 80, required: true });
    const address = check.email(body.email ?? ctx.user.email);
    const other = await users.byEmail(db, address);
    if (other && other.id !== ctx.user.id) throw badRequest('Someone else already uses that email here.', { field: 'email' });
    const user = await users.update(db, ctx.user.id, { name, email: address });
    await app.audit(ctx.user, 'user.profile', 'Updated their profile');
    return { user: publicUser(user) };
  });

  /* ---------------------------------- Two-step sign-in ---------------------------------- */

  const confirmPassword = async (ctx, password) => {
    if (!(await verifyPassword(String(password ?? ''), ctx.user.passwordHash))) throw badRequest('Your password isn’t right.', { field: 'password' });
  };

  router.post('/api/auth/2fa/setup', async (ctx) => {
    if (ctx.user.totpEnabledAt) throw new HttpError(409, 'already', 'Two-step sign-in is already on.');
    const secret = newSecret();
    await users.update(db, ctx.user.id, { totpPending: sealer.seal(secret) });
    const uri = otpauthUri({ secret, account: ctx.user.email });
    return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri, qr: qrSvgPath(uri) };
  });

  router.post('/api/auth/2fa/enable', async (ctx) => {
    const body = await ctx.body();
    if (ctx.user.totpEnabledAt) throw new HttpError(409, 'already', 'Two-step sign-in is already on.');
    if (!ctx.user.totpPending) throw badRequest('Start the setup again: there’s no key waiting to be confirmed.');
    const secret = sealer.open(ctx.user.totpPending);
    const step = verifyCode(secret, body.code);
    if (!step) throw badRequest('That code doesn’t match. Type the six digits your app shows now.', { field: 'code' });
    const codes = newRecoveryCodes();
    const user = await users.update(db, ctx.user.id, { totpSecret: sealer.seal(secret), totpPending: null, totpEnabledAt: new Date().toISOString(), totpLastStep: step, recoveryCodes: codes.map(hashRecovery) });
    await sessions.removeForUser(db, ctx.user.id, ctx.session.id);
    await app.audit(ctx.user, 'auth.2fa', 'Turned on two-step sign-in');
    return { user: publicUser(user), recoveryCodes: codes };
  });

  router.post('/api/auth/2fa/disable', async (ctx) => {
    const body = await ctx.body();
    if (!ctx.user.totpEnabledAt) throw badRequest('Two-step sign-in isn’t on.');
    await confirmPassword(ctx, body.password);
    const code = String(body.code ?? '').trim();
    const ok = /^\d/.test(code) ? Boolean(verifyCode(sealer.open(ctx.user.totpSecret), code, { lastStep: ctx.user.totpLastStep })) : ctx.user.recoveryCodes.includes(hashRecovery(code));
    if (!ok) throw badRequest('That code isn’t right.', { field: 'code' });
    const user = await users.update(db, ctx.user.id, { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: 0, recoveryCodes: [] });
    await app.audit(ctx.user, 'auth.2fa', 'Turned off two-step sign-in');
    return { user: publicUser(user) };
  });

  router.post('/api/auth/2fa/recovery', async (ctx) => {
    const body = await ctx.body();
    if (!ctx.user.totpEnabledAt) throw badRequest('Two-step sign-in isn’t on.');
    await confirmPassword(ctx, body.password);
    const codes = newRecoveryCodes();
    await users.update(db, ctx.user.id, { recoveryCodes: codes.map(hashRecovery) });
    await app.audit(ctx.user, 'auth.2fa', 'Made new recovery codes');
    return { recoveryCodes: codes };
  });

  router.get('/api/auth/2fa', (ctx) => ({ enabled: Boolean(ctx.user.totpEnabledAt), since: ctx.user.totpEnabledAt, recoveryLeft: ctx.user.recoveryCodes.length }));

  /* ------------------------------ Password resets and invitations ------------------------------ */

  router.post('/api/auth/forgot', { auth: false }, async (ctx) => {
    if (!mailer.configured) throw new HttpError(503, 'mail_off', 'Email isn’t set up, so a reset link can’t be sent. Ask the studio owner to reset your password from Team.');
    const body = await ctx.body();
    const address = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
    const verdict = await limits.forgot.hit(`${ctx.ip}`);
    if (verdict.limited) throw new HttpError(429, 'limited', 'Several reset links were asked for already. Try again later.', { retryAfter: verdict.retryAfter });
    const user = address ? await users.byEmail(db, address) : null;
    if (user && !user.disabled) {
      const raw = await tokens.create(db, { kind: 'reset', userId: user.id, minutes: 60 });
      const link = `${app.adminUrl(ctx)}/reset?token=${raw}`;
      try {
        await mailer.send({
          to: user.email,
          subject: 'Reset your Atlas Studios admin password',
          ...renderEmail({ title: 'Choose a new password', intro: `Someone (hopefully you) asked to reset the password for ${user.email}. The link works once, for an hour.`, button: { label: 'Choose a new password', url: link }, outro: 'If you didn’t ask, ignore this email: your password stays as it is.' }),
        });
        await app.audit(null, 'auth.forgot', `Sent a password reset link to ${user.email}`, { target: user.id });
      } catch (error) {
        console.error('[auth] reset email failed:', error.message);
        await app.audit(null, 'auth.forgot', `Couldn’t email a reset link to ${user.email} (${error.message})`, { target: user.id });
      }
    }
    // The same answer either way, so the form can't be used to find out who has an account.
    return { ok: true };
  });

  const linkToken = async (raw) => (await tokens.peek(db, raw, 'reset')) ?? (await tokens.peek(db, raw, 'invite'));

  router.get('/api/auth/reset', { auth: false }, async (ctx) => {
    const token = await linkToken(ctx.query.token);
    const user = token && (await users.byId(db, token.user_id));
    if (!user || user.disabled) throw new HttpError(404, 'expired', 'That link has expired or been used. Ask for a new one.');
    return { kind: token.kind, name: user.name, email: user.email };
  });

  router.post('/api/auth/reset', { auth: false }, async (ctx) => {
    const body = await ctx.body();
    const wait = await limits.loginIp.blocked(ctx.ip);
    if (wait) throw new HttpError(429, 'limited', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`, { retryAfter: wait });
    const token = await linkToken(body.token);
    const user = token && (await users.byId(db, token.user_id));
    if (!user || user.disabled) {
      await limits.loginIp.hit(ctx.ip);
      throw new HttpError(400, 'expired', 'That link has expired or been used. Ask for a new one.');
    }
    const problem = passwordProblem(body.password, { email: user.email });
    if (problem) throw badRequest(problem, { field: 'password' });
    if (!(await tokens.use(db, token.id))) throw new HttpError(400, 'expired', 'That link has just been used.');
    await users.update(db, user.id, { passwordHash: await hashPassword(body.password), mustChangePassword: false });
    await sessions.removeForUser(db, user.id);
    await app.audit(user, token.kind === 'invite' ? 'auth.invite' : 'auth.reset', token.kind === 'invite' ? 'Accepted their invitation and chose a password' : 'Reset their password with an emailed link');
    return { ok: true, email: user.email };
  });
}
