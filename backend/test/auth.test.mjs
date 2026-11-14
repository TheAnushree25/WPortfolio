import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Client, OWNER, SETUP_TOKEN } from './helpers.mjs';
import { codeAt, stepAt } from '../src/totp.mjs';

let env;
let owner;

before(async () => {
  env = await boot();
  owner = env.client();
});
after(() => env.close());

test('a fresh backend asks for setup and says it is hosted', async () => {
  const { status, data } = await owner.get('/api/auth/state');
  assert.equal(status, 200);
  assert.equal(data.needsSetup, true);
  assert.equal(data.mode, 'hosted');
  assert.equal(data.setupLocal, false);
  assert.equal(data.features.twoFactor, true);
  assert.equal(data.features.chunkedUploads, true);
});

test('setup needs the setup token, then creates the owner and signs them in', async () => {
  const stranger = env.client({ ip: '198.51.100.9' });
  const refused = await stranger.post('/api/auth/setup', { ...OWNER, token: 'wrong' });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.error, 'setup_token');

  const weak = await owner.post('/api/auth/setup', { ...OWNER, password: 'short', token: SETUP_TOKEN });
  assert.equal(weak.status, 400);

  const done = await owner.setup();
  assert.equal(done.status, 200);
  assert.equal(done.data.user.role, 'owner');
  assert.ok(done.data.csrf);
  const line = owner.cookieLines.find((item) => item.startsWith('atlas_admin='));
  assert.match(line, /HttpOnly/);
  assert.match(line, /SameSite=Strict/);
  assert.match(line, /Path=\/admin/);
  assert.match(line, /Secure/, 'the admin is served over https here, so the cookie is Secure');

  const again = await env.client().setup({ ...OWNER, email: 'other@atlas.test' });
  assert.equal(again.status, 409);
});

test('changes need the CSRF token and the admin’s own origin', async () => {
  const noToken = await owner.patch('/api/auth/profile', { name: 'G' }, { headers: { 'x-csrf-token': 'nope' } });
  assert.equal(noToken.status, 403);
  assert.equal(noToken.data.error, 'csrf');

  const foreign = await owner.patch('/api/auth/profile', { name: 'G' }, { headers: { origin: 'https://evil.test' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.data.error, 'origin');

  const crossSite = await owner.patch('/api/auth/profile', { name: 'G' }, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403);

  const ok = await owner.patch('/api/auth/profile', { name: OWNER.name });
  assert.equal(ok.status, 200);
});

test('signed-out requests are refused, and security headers are on every reply', async () => {
  const anonymous = env.client();
  const result = await anonymous.get('/api/dashboard');
  assert.equal(result.status, 401);
  assert.equal(result.data.error, 'signed_out');
  assert.match(result.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(result.headers.get('x-frame-options'), 'DENY');
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
  const media = await anonymous.get('/site-media/images/works/yooj.jpg');
  assert.equal(media.status, 401);
});

test('wrong passwords are counted and then paused', async () => {
  const attacker = env.client({ ip: '192.0.2.50' });
  for (let i = 0; i < 5; i++) assert.equal((await attacker.login(OWNER.email, 'not-the-password')).status, 401);
  const paused = await attacker.login(OWNER.email, OWNER.password);
  assert.equal(paused.status, 429, 'even the right password waits once the limit is reached');
  assert.ok(Number(paused.headers.get('retry-after')) > 0);
  const elsewhere = await env.client({ ip: '192.0.2.51' }).login(OWNER.email, OWNER.password);
  assert.equal(elsewhere.status, 200, 'the limit is per address and email');
  const log = await owner.get('/api/activity?category=auth');
  assert.ok(log.data.items.some((item) => item.action === 'auth.failed'));
});

test('roles are enforced and a temporary password must be changed first', async () => {
  const created = await owner.post('/api/users', { name: 'Ed Itor', email: 'editor@atlas.test', role: 'editor' });
  assert.equal(created.status, 200);
  assert.match(created.data.password, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

  const editor = env.client({ ip: '203.0.113.20' });
  assert.equal((await editor.login('editor@atlas.test', created.data.password)).status, 200);
  const blocked = await editor.get('/api/dashboard');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, 'password_change');
  const changed = await editor.post('/api/auth/password', { current: created.data.password, next: 'amber-harbour-silent-77' });
  assert.equal(changed.status, 200);
  assert.equal((await editor.get('/api/dashboard')).status, 200);
  assert.equal((await editor.get('/api/users')).status, 403, 'only owners see the team');
  assert.equal((await editor.patch('/api/settings', { siteUrl: 'https://x.test' })).status, 403);

  const viewerMade = await owner.post('/api/users', { name: 'Vee Ewer', email: 'viewer@atlas.test', role: 'viewer' });
  const viewer = env.client({ ip: '203.0.113.21' });
  await viewer.login('viewer@atlas.test', viewerMade.data.password);
  await viewer.post('/api/auth/password', { current: viewerMade.data.password, next: 'cobalt-meadow-drift-31' });
  const t = await viewer.get('/api/content/testimonials');
  assert.equal(t.status, 200);
  assert.equal((await viewer.put('/api/content/testimonials', { value: t.data.value, version: t.data.version })).status, 403);

  assert.equal((await owner.patch(`/api/users/${(await owner.get('/api/auth/state')).data.user.id}`, { role: 'editor' })).status, 400, 'the last owner can’t step down');
});

test('two-step sign-in: setup, sign-in with a code, no replays, recovery codes', async () => {
  const setup = await owner.post('/api/auth/2fa/setup', {});
  assert.equal(setup.status, 200);
  assert.match(setup.data.uri, /^otpauth:\/\/totp\/Atlas%20Studios:owner%40atlas\.test\?secret=[A-Z2-7]{32}&issuer=Atlas%20Studios$/);
  assert.ok(setup.data.qr.path.length > 100 && setup.data.qr.size > 21);
  const secret = setup.data.secret.replace(/\s/g, '');

  assert.equal((await owner.post('/api/auth/2fa/enable', { code: '000000' })).status, 400);
  const enabled = await owner.post('/api/auth/2fa/enable', { code: codeAt(secret, stepAt()) });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.data.user.twoFactor, true);
  assert.equal(enabled.data.recoveryCodes.length, 10);

  const phone = env.client({ ip: '203.0.113.30' });
  const first = await phone.login(OWNER.email, OWNER.password);
  assert.equal(first.status, 200);
  assert.equal(first.data.twoFactor, true);
  assert.equal(first.data.user, undefined, 'no session before the code');
  assert.equal(phone.cookies.size, 0);

  assert.equal((await phone.post('/api/auth/login/verify', { challenge: first.data.challenge, code: '123456' })).status, 401);
  const nextCode = codeAt(secret, stepAt() + 1);
  const verified = await phone.post('/api/auth/login/verify', { challenge: first.data.challenge, code: nextCode });
  assert.equal(verified.status, 200);
  assert.ok(verified.data.csrf);
  assert.equal((await phone.get('/api/dashboard')).status, 200);

  const laptop = env.client({ ip: '203.0.113.31' });
  const second = await laptop.login(OWNER.email, OWNER.password);
  const replay = await laptop.post('/api/auth/login/verify', { challenge: second.data.challenge, code: nextCode });
  assert.equal(replay.status, 401, 'a code that was used once is refused');

  const recovery = await laptop.post('/api/auth/login/verify', { challenge: second.data.challenge, code: enabled.data.recoveryCodes[0].toUpperCase() });
  assert.equal(recovery.status, 200, 'a recovery code works (in any case)');
  const third = await env.client({ ip: '203.0.113.32' }).login(OWNER.email, OWNER.password);
  const reused = await env.client({ ip: '203.0.113.32' }).post('/api/auth/login/verify', { challenge: third.data.challenge, code: enabled.data.recoveryCodes[0] });
  assert.equal(reused.status, 401, 'each recovery code works once');

  const status = await laptop.get('/api/auth/2fa');
  assert.equal(status.data.recoveryLeft, 9);

  // The owner can turn it off for someone who lost their phone (here: the editor, who never had it).
  const users = await owner.get('/api/users');
  const editor = users.data.find((item) => item.email === 'editor@atlas.test');
  assert.equal((await owner.post(`/api/users/${editor.id}/two-factor-reset`, {})).status, 400);

  const off = await laptop.post('/api/auth/2fa/disable', { password: OWNER.password, code: enabled.data.recoveryCodes[1] });
  assert.equal(off.status, 200);
  assert.equal(off.data.user.twoFactor, false);
});

test('a forgotten password is reset through an emailed link, once', async () => {
  const before = env.mails.length;
  const asked = await env.client({ ip: '203.0.113.40' }).post('/api/auth/forgot', { email: OWNER.email });
  assert.equal(asked.status, 200);
  const unknown = await env.client({ ip: '203.0.113.40' }).post('/api/auth/forgot', { email: 'nobody@atlas.test' });
  assert.deepEqual(unknown.data, asked.data, 'the same answer for an unknown address');
  assert.equal(env.mails.length, before + 1);
  const mail = env.mails.at(-1);
  assert.deepEqual(mail.to, [OWNER.email]);
  const link = /https:\/\/studio\.test\/admin\/reset\?token=([\w-]+)/.exec(mail.text);
  assert.ok(link, 'the email links to the admin’s public address');

  const visitor = env.client({ ip: '203.0.113.41' });
  const peek = await visitor.get(`/api/auth/reset?token=${link[1]}`);
  assert.equal(peek.data.email, OWNER.email);
  assert.equal((await visitor.post('/api/auth/reset', { token: link[1], password: 'short' })).status, 400);
  const reset = await visitor.post('/api/auth/reset', { token: link[1], password: 'copper-lantern-orbit-58' });
  assert.equal(reset.status, 200);
  assert.equal((await visitor.post('/api/auth/reset', { token: link[1], password: 'velvet-canyon-thread-90' })).status, 400, 'the link works once');
  assert.equal((await owner.get('/api/dashboard')).status, 401, 'a reset signs every device out');
  assert.equal((await owner.login(OWNER.email, 'copper-lantern-orbit-58')).status, 200);
  OWNER.password = 'copper-lantern-orbit-58';
});

test('people can be invited by email and choose their own password', async () => {
  const invited = await owner.post('/api/users', { name: 'Inna Vite', email: 'invite@atlas.test', role: 'editor', invite: true });
  assert.equal(invited.status, 200);
  assert.equal(invited.data.invited, true);
  assert.equal(invited.data.password, undefined, 'nobody sees a password for an invited person');
  const mail = env.mails.at(-1);
  assert.match(mail.subject, /invited you/);
  const token = /reset\?token=([\w-]+)/.exec(mail.text)[1];
  const person = env.client({ ip: '203.0.113.50' });
  assert.equal((await person.get(`/api/auth/reset?token=${token}`)).data.kind, 'invite');
  assert.equal((await person.post('/api/auth/reset', { token, password: 'saffron-island-kite-26' })).status, 200);
  const signedIn = await person.login('invite@atlas.test', 'saffron-island-kite-26');
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.user.mustChangePassword, false);
});

test('behind the site’s /admin route, forwarded headers count only with the proxy secret', async () => {
  // The request reaches the backend at its own host, but the browser's origin is the site's.
  const site = { origin: 'https://theatlasstudios.vercel.app', 'x-forwarded-host': 'theatlasstudios.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.77' };
  const viaSite = new Client(env.backend, { origin: 'https://backend.internal', ip: '10.0.0.5', headers: { ...site, 'x-atlas-proxy': 'proxy-secret-for-tests' } });
  const signedIn = await viaSite.login(OWNER.email, OWNER.password);
  assert.equal(signedIn.status, 200);
  const change = await viaSite.patch('/api/auth/profile', { name: OWNER.name }, { headers: { origin: 'https://theatlasstudios.vercel.app' } });
  assert.equal(change.status, 200, 'the site’s origin is accepted because the proxy vouched for the forwarded host');
  const sessions = await viaSite.get('/api/auth/sessions');
  assert.equal(sessions.data.find((item) => item.current).ip, '198.51.100.77', 'the visitor’s address comes from the proxy');

  const forged = new Client(env.backend, { origin: 'https://backend.internal', headers: { ...site, 'x-atlas-proxy': 'guess' } });
  forged.cookies = viaSite.cookies;
  forged.csrf = viaSite.csrf;
  const refused = await forged.patch('/api/auth/profile', { name: OWNER.name }, { headers: { origin: 'https://theatlasstudios.vercel.app' } });
  assert.equal(refused.status, 403, 'without the secret the forwarded host is ignored');
});

test('signing out ends the session', async () => {
  const out = await owner.post('/api/auth/logout', {});
  assert.equal(out.status, 200);
  assert.equal((await owner.get('/api/dashboard')).status, 401);
});

test('the admin’s page answers at /admin and /admin/ (the site trims the slash), and the root leads there', async () => {
  const anonymous = env.client();
  for (const route of ['', '/', '/enquiries/123']) {
    const page = await anonymous.get(route);
    assert.equal(page.status, 200, route);
    assert.match(page.data, /<base href="\/admin\/" \/>/);
  }
  const root = await env.backend.fetch(new Request('https://studio.test/'));
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/admin/');
  assert.equal((await env.backend.fetch(new Request('https://studio.test/elsewhere'))).status, 404);
  assert.equal((await env.backend.fetch(new Request('https://studio.test/admin/server.mjs'))).status, 404, 'the backend’s own files are never served');
});
