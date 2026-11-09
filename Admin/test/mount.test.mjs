import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

/**
 * The admin mounted at /admin inside the site: web Requests in, web
 * Responses out, through the same admin. Its records go to a temporary
 * folder, never Admin/data.
 */

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-admin-mount-'));
let handleRequest;

before(async () => {
  process.env.ADMIN_DATA_DIR = data;
  ({ handleRequest } = await import('../server/mount.mjs'));
});

after(() => fs.rmSync(data, { recursive: true, force: true }));

const ask = (url, init) => handleRequest(new Request(`http://localhost:3100${url}`, init), { basePath: '/admin' });

test('/admin serves the shell with its base, at any depth', async () => {
  for (const url of ['/admin', '/admin/projects/design/yooj']) {
    const response = await ask(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<base href="\/admin\/" \/>/);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
});

test('the API and the admin’s files answer under /admin', async () => {
  const state = await ask('/admin/api/auth/state');
  assert.equal(state.status, 200);
  assert.equal((await state.json()).needsSetup, true);
  const css = await ask('/admin/app.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.ok((await css.arrayBuffer()).byteLength > 10_000, 'the stylesheet streams through whole');
  assert.equal((await ask('/admin/assets/missing.png')).status, 404);
});

test('a claim to be local is only believed from the development server', async () => {
  const forged = await ask('/admin/api/auth/state', { headers: { 'x-forwarded-for': '127.0.0.1' } });
  assert.equal((await forged.json()).setupLocal, false, 'outside development, setup needs the token');
  const setup = await ask('/admin/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify({ name: 'Intruder', email: 'x@test.example', password: 'quiet harbour lantern 42' }),
  });
  assert.equal(setup.status, 403);
});

test('a request body reaches the admin, and HEAD has no body', async () => {
  const login = await ask('/admin/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@test.example', password: 'nothing' }) });
  assert.equal(login.status, 401);
  assert.equal((await login.json()).error, 'credentials');
  const head = await ask('/admin/app.css', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
});
