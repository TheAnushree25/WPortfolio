import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeGitHub } from '../dev/fake-github.mjs';
import { createBackend } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { openDatabase } from '../src/db/index.mjs';

/**
 * Boots a backend for a test: an in-memory Postgres (PGlite), the GitHub
 * stand-in seeded with this repository's own last commit (the real content
 * files, read-only: every write stays in memory), and email captured into an
 * array instead of sent.
 */

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SETUP_TOKEN = 'setup-token-for-tests';
export const OWNER = { name: 'Gulafsan Shaheen', email: 'owner@atlas.test', password: 'river-lantern-quiet-42' };

export async function boot({ env = {} } = {}) {
  const github = new FakeGitHub({ owner: 'atlas', name: 'site', token: 'test-token' });
  github.seedFromGit(REPO_ROOT, 'HEAD');
  const port = await github.listen();
  const config = loadConfig({
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPO: 'atlas/site',
    GITHUB_API_URL: `http://127.0.0.1:${port}`,
    GITHUB_GRAPHQL_URL: `http://127.0.0.1:${port}/graphql`,
    ADMIN_SECRET: 'a-long-random-secret-used-only-by-the-tests-0123456789',
    ADMIN_SETUP_TOKEN: SETUP_TOKEN,
    ADMIN_PROXY_SECRET: 'proxy-secret-for-tests',
    CRON_SECRET: 'cron-secret-for-tests',
    ADMIN_PUBLIC_URL: 'https://studio.test/admin',
    ...env,
  });
  const db = await openDatabase({ memory: true });
  const mails = [];
  const backend = await createBackend(config, { db, mailCapture: mails });
  return {
    backend,
    github,
    db,
    mails,
    config,
    client: (options) => new Client(backend, options),
    async close() {
      await backend.close();
      await github.close();
    },
  };
}

/** A browser stand-in: keeps cookies and the CSRF token, sends the admin's own origin. */
export class Client {
  constructor(backend, { origin = 'https://studio.test', ip = '203.0.113.7', headers = {} } = {}) {
    this.backend = backend;
    this.origin = origin;
    this.ip = ip;
    this.extra = headers;
    this.cookies = new Map();
    this.cookieLines = [];
    this.csrf = null;
  }

  async request(method, route, { body, raw, headers = {} } = {}) {
    const all = new Headers({ host: new URL(this.origin).host, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 test', ...this.extra, ...headers });
    if (this.cookies.size) all.set('cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    if (method !== 'GET' && method !== 'HEAD') {
      if (this.csrf && !all.has('x-csrf-token')) all.set('x-csrf-token', this.csrf);
      if (!all.has('origin')) all.set('origin', this.origin);
    }
    const init = { method, headers: all };
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
      all.set('content-type', 'application/json');
      init.body = JSON.stringify(body);
    }
    const response = await this.backend.fetch(new Request(`${this.origin}/admin${route}`, init), { ip: this.ip });
    for (const line of response.headers.getSetCookie()) {
      this.cookieLines.push(line);
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      const [key, value] = [pair.slice(0, index), pair.slice(index + 1)];
      if (/Max-Age=0/.test(line)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await response.json() : type.startsWith('text/') ? await response.text() : Buffer.from(await response.arrayBuffer());
    if (data && typeof data === 'object' && data.csrf) this.csrf = data.csrf;
    return { status: response.status, data, headers: response.headers };
  }

  get(route, options) {
    return this.request('GET', route, options);
  }
  post(route, body, options) {
    return this.request('POST', route, { ...options, body });
  }
  put(route, body, options) {
    return this.request('PUT', route, { ...options, body });
  }
  patch(route, body, options) {
    return this.request('PATCH', route, { ...options, body });
  }
  delete(route, options) {
    return this.request('DELETE', route, options);
  }

  async setup(owner = OWNER, extra = {}) {
    return this.post('/api/auth/setup', { ...owner, token: SETUP_TOKEN, ...extra });
  }

  async login(email, password) {
    return this.post('/api/auth/login', { email, password });
  }
}

/** A tiny but real PNG (1×1 pixel, or w×h when asked), for upload tests. */
export function png(width = 1, height = 1, seed = 0) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  return Buffer.concat([header, ihdr, Buffer.from(`seed-${seed}`)]);
}
