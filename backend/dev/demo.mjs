#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeGitHub } from './fake-github.mjs';

/**
 * The hosted admin on this computer, with nothing real at stake: the backend
 * runs against a stand-in for GitHub seeded with this repository's last
 * commit, and its own Postgres (PGlite) in backend/.data. Saves, uploads and
 * publishes change only the stand-in (kept in .data/demo-github.json), never
 * the real repository or GitHub. Emails are printed here instead of sent.
 *
 *   npm run demo                       → http://localhost:4320/admin
 *
 * To see it as the live site will, through the site's /admin route, start the
 * site with ADMIN_BACKEND_URL=http://127.0.0.1:4320 and
 * ADMIN_PROXY_SECRET=demo-proxy-secret, and open http://localhost:<site port>/admin.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(backendRoot, '..');
const dataDir = path.join(backendRoot, '.data');
fs.mkdirSync(dataDir, { recursive: true });

const siteUrl = process.env.DEMO_SITE_URL ?? 'http://localhost:3112';
const github = new FakeGitHub({ owner: 'TheAnushree25', name: 'WPortfolio', token: 'demo-token' });
github.seedFromGit(repoRoot, 'HEAD');
const restored = github.restore(path.join(dataDir, 'demo-github.json'));
github.autoDeploy = { preview: siteUrl, production: siteUrl };
if (!restored) github.persist();
const port = await github.listen(Number(process.env.DEMO_GITHUB_PORT ?? 0));

const defaults = {
  GITHUB_TOKEN: 'demo-token',
  GITHUB_REPO: 'TheAnushree25/WPortfolio',
  GITHUB_API_URL: `http://127.0.0.1:${port}`,
  GITHUB_GRAPHQL_URL: `http://127.0.0.1:${port}/graphql`,
  ADMIN_SECRET: 'demo-only-secret-never-use-it-anywhere-else-0123',
  ADMIN_SETUP_TOKEN: 'demo-setup',
  ADMIN_PROXY_SECRET: 'demo-proxy-secret',
  ADMIN_DATA_DIR: '.data/demo-db',
  ADMIN_PUBLIC_URL: `${siteUrl}/admin`,
  SITE_URL: siteUrl,
  SITE_ORIGINS: siteUrl,
  CRON_SECRET: 'demo-cron',
  MAIL_LOG: 'true',
};
// The demo never reads backend/.env: real credentials there must not meet the stand-in.
for (const key of Object.keys(defaults)) delete process.env[key];
Object.assign(process.env, defaults, { NODE_ENV: 'development' });
for (const key of ['DATABASE_URL', 'POSTGRES_URL', 'SMTP_URL', 'RESEND_API_KEY', 'GITHUB_BRANCH', 'GITHUB_DRAFT_BRANCH']) delete process.env[key];
process.env.ATLAS_DEMO = '1';

console.log(`\n  Demo: GitHub stand-in on :${port}, ${restored ? 'continuing the saved demo' : 'seeded from this repository'} (${path.relative(repoRoot, path.join(dataDir, 'demo-github.json'))}).`);
console.log(`  First visit: http://localhost:${process.env.PORT ?? 4320}/admin/setup?token=demo-setup\n`);
await import('../server.mjs');
