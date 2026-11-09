import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { config as baseConfig } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

/**
 * The admin's API against a throwaway copy of the site's content: who may
 * do what, the CSRF and origin checks, sign-in limits, stale saves, the
 * rules, uploads, and the public enquiry endpoint. Nothing here touches the
 * real site or the real admin data.
 */

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-admin-test-'));
const site = path.join(temp, 'site');
const copy = (rel) => {
  fs.mkdirSync(path.dirname(path.join(site, rel)), { recursive: true });
  fs.copyFileSync(path.join(siteRoot, rel), path.join(site, rel));
};
for (const rel of ['src/content/site.ts', 'src/content/work.ts', 'src/content/systems.ts', 'src/app/layout.tsx']) copy(rel);
for (const dir of ['src/content/decks', 'src/content/screens']) for (const name of fs.readdirSync(path.join(siteRoot, dir))) copy(`${dir}/${name}`);
// Every picture the content points at, so the rules see a complete public folder.
for (const rel of fs.readFileSync(path.join(siteRoot, 'src/content/site.ts'), 'utf8').match(/\/(?:images|video|docs)\/[\w./-]+\.\w+/g)) {
  if (fs.existsSync(path.join(siteRoot, 'public', rel))) copy(`public${rel}`);
}

let server;
let base;
let close;

before(async () => {
  const app = await createApp({ ...baseConfig, siteRoot: site, dataDir: path.join(temp, 'data'), siteOrigins: ['https://site.example'] });
  close = app.close;
  server = http.createServer(app.handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await close();
  server.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

/** A tiny client that keeps its cookie and CSRF token. */
function client() {
  const jar = { cookie: '', csrf: '' };
  const call = async (method, url, { body, headers = {}, raw } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(jar.cookie && { cookie: jar.cookie }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(jar.csrf && method !== 'GET' && { 'x-csrf-token': jar.csrf }),
        ...headers,
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const set = response.headers.get('set-cookie');
    if (set) jar.cookie = set.split(';')[0];
    const data = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.text();
    if (data?.csrf) jar.csrf = data.csrf;
    return { status: response.status, data, headers: response.headers };
  };
  return { jar, get: (url, o) => call('GET', url, o), post: (url, body, o) => call('POST', url, { ...o, body }), put: (url, body, o) => call('PUT', url, { ...o, body }), raw: call };
}

const owner = client();
const PASSWORD = 'quiet harbour lantern 42';

test('first run: setup creates the owner, once', async () => {
  const state = await owner.get('/api/auth/state');
  assert.equal(state.data.needsSetup, true);
  const weak = await owner.post('/api/auth/setup', { name: 'Owner', email: 'owner@test.example', password: 'short' });
  assert.equal(weak.status, 400);
  const made = await owner.post('/api/auth/setup', { name: 'Owner', email: 'owner@test.example', password: PASSWORD });
  assert.equal(made.status, 200);
  assert.equal(made.data.user.role, 'owner');
  assert.ok(!('passwordHash' in made.data.user), 'never sends the hash');
  const again = await client().post('/api/auth/setup', { name: 'Intruder', email: 'x@test.example', password: PASSWORD });
  assert.equal(again.status, 409);
});

test('signed-out requests are refused, and sign-in is rate limited', async () => {
  const stranger = client();
  assert.equal((await stranger.get('/api/dashboard')).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await stranger.post('/api/auth/login', { email: 'owner@test.example', password: 'wrong' })).status, 401);
  const blocked = await stranger.post('/api/auth/login', { email: 'owner@test.example', password: PASSWORD });
  assert.equal(blocked.status, 429, 'even the right password waits once the limit is hit');
  assert.ok(blocked.headers.get('retry-after'));
});

test('a change needs the CSRF token and a same-site origin', async () => {
  const section = await owner.get('/api/content/testimonials');
  const value = { ...section.data.value, label: 'Kind words' };
  const noToken = await owner.raw('PUT', '/api/content/testimonials', { body: { value, version: section.data.version }, headers: { 'x-csrf-token': 'nope' } });
  assert.equal(noToken.status, 403);
  assert.equal(noToken.data.error, 'csrf');
  const crossSite = await owner.put('/api/content/testimonials', { value, version: section.data.version }, { headers: { origin: 'https://evil.example' } });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.data.error, 'origin');
});

test('saving content rewrites the site file, and a stale save is refused', async () => {
  const section = await owner.get('/api/content/testimonials');
  const cards = section.data.value.cards.map((card, i) => ({ ...card, __i: i }));
  cards[0] = { ...cards[0], name: 'Riya Kapoor', initials: 'RK' };
  const saved = await owner.put('/api/content/testimonials', { value: { ...section.data.value, cards }, version: section.data.version });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.value.cards[0].name, 'Riya Kapoor');
  const text = fs.readFileSync(path.join(site, 'src/content/site.ts'), 'utf8');
  assert.ok(text.includes("name: 'Riya Kapoor',"));
  assert.ok(fs.readdirSync(path.join(temp, 'data', 'backups', 'site.ts')).length >= 1, 'the old file was backed up');

  const stale = await owner.put('/api/content/testimonials', { value: section.data.value, version: section.data.version });
  assert.equal(stale.status, 409);
});

test('the rules stop a broken save before it is written', async () => {
  const section = await owner.get('/api/content/works');
  const projects = section.data.value.projects.map((card, i) => ({ ...card, __i: i }));
  projects[0] = { ...projects[0], src: '/images/works/missing.jpg' };
  const broken = await owner.put('/api/content/works', { value: { ...section.data.value, projects }, version: section.data.version });
  assert.equal(broken.status, 422);
  assert.match(broken.data.message, /isn’t in the public folder/);
  const locked = await owner.get('/api/content/footer');
  const tampered = await owner.put('/api/content/footer', { value: { ...locked.data.value, email: 'else@test.example' }, version: locked.data.version });
  assert.equal(tampered.status, 422);
  assert.equal(tampered.data.error, 'computed');
});

test('roles: a viewer reads but cannot change anything', async () => {
  const made = await owner.post('/api/users', { name: 'Viewer', email: 'viewer@test.example', role: 'viewer' });
  assert.equal(made.status, 200);
  const viewer = client();
  assert.equal((await viewer.post('/api/auth/login', { email: 'viewer@test.example', password: made.data.password })).status, 200);
  assert.equal((await viewer.get('/api/dashboard')).data.error, 'password_change', 'a temporary password must be replaced first');
  assert.equal((await viewer.post('/api/auth/password', { current: made.data.password, next: 'misty orchard compass 7' })).status, 200);
  assert.equal((await viewer.get('/api/projects')).status, 200);
  const section = await viewer.get('/api/content/story');
  assert.equal((await viewer.put('/api/content/story', { value: section.data.value, version: section.data.version })).status, 403);
  assert.equal((await viewer.get('/api/users')).status, 403);
  assert.equal((await viewer.post('/api/jobs', { type: 'deploy', confirm: 'deploy' })).status, 403);
});

test('enquiries: created, moved along with a timeline note, exported safely', async () => {
  const made = await owner.post('/api/enquiries', { name: '=HYPERLINK("x")', email: 'lead@test.example', service: 'Website', value: 120000 });
  assert.equal(made.status, 200);
  const moved = await owner.raw('PATCH', `/api/enquiries/${made.data.id}`, { body: { status: 'proposal' } });
  assert.equal(moved.data.status, 'proposal');
  assert.match(moved.data.notes.at(-1).text, /New to Proposal/);
  const csv = await owner.get('/api/enquiries-export');
  assert.ok(csv.data.includes(`'=HYPERLINK`), 'a formula is defused in the spreadsheet');
});

test('the public enquiry endpoint answers allowed sites only, and ignores bots', async () => {
  const blocked = await fetch(`${base}/api/public/enquiry`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@test.example' }) });
  assert.equal(blocked.status, 403);
  const ok = await fetch(`${base}/api/public/enquiry`, { method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Meera', email: 'meera@test.example', message: 'A rebrand' }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://site.example');
  const bot = await fetch(`${base}/api/public/enquiry`, { method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bot', email: 'bot@test.example', website_url: 'http://spam' }) });
  assert.equal(bot.status, 200);
  const list = await owner.get('/api/enquiries?q=test.example');
  assert.ok(list.data.items.some((item) => item.name === 'Meera' && item.source === 'website'));
  assert.ok(!list.data.items.some((item) => item.name === 'Bot'));
});

test('uploads are checked by their bytes; site files can’t be read outside public/', async () => {
  const fake = await owner.raw('POST', '/api/media/upload?folder=images&name=photo.png', { raw: Buffer.from('<script>alert(1)</script>'), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(fake.status, 415);
  const svg = await owner.raw('POST', '/api/media/upload?folder=images&name=logo.svg', { raw: Buffer.from('<svg/>'), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(svg.status, 415);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const real = await owner.raw('POST', '/api/media/upload?folder=images/test&name=My Photo!.png', { raw: png, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(real.status, 200);
  assert.equal(real.data.path, '/images/test/my-photo.png');
  assert.equal(real.data.width, 1);
  const escape = await owner.get('/site-media/..%2F..%2Fsrc%2Fcontent%2Fsite.ts');
  assert.equal(escape.status, 404);
});

test('security headers on every response', async () => {
  const response = await fetch(`${base}/`);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('signing out ends the session', async () => {
  assert.equal((await owner.post('/api/auth/logout', {})).status, 200);
  assert.equal((await owner.get('/api/dashboard')).status, 401);
});
