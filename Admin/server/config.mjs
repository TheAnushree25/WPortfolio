import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The admin's settings, read once at start-up from the environment and, when
 * it exists, Admin/.env (which never overrides a value already set). Every
 * path is resolved from the Admin folder, so the admin runs the same from
 * wherever it is started.
 */

export const ADMIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnvFile(path.join(ADMIN_ROOT, '.env'));

const env = (key, fallback = '') => (process.env[key] ?? '').trim() || fallback;
const origins = (value) =>
  value
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

export const config = {
  version: '1.0.0',
  port: Number(env('ADMIN_PORT', '4310')),
  host: env('ADMIN_HOST', '127.0.0.1'),
  /** The Atlas Studios repository: its content files, its public folder, its git history. */
  siteRoot: path.resolve(ADMIN_ROOT, env('SITE_ROOT', '..')),
  /** The admin's own records: accounts, sessions, enquiries, backups, the media trash. */
  dataDir: path.resolve(ADMIN_ROOT, env('ADMIN_DATA_DIR', 'data')),
  publicDir: path.join(ADMIN_ROOT, 'public'),
  /** Origins allowed to post enquiries and page views to the public endpoints. */
  siteOrigins: origins(env('SITE_ORIGINS', 'http://localhost:3100')),
  sessionHours: Math.max(1, Number(env('ADMIN_SESSION_HOURS', '12')) || 12),
  secureCookies: env('ADMIN_SECURE_COOKIES') === 'true',
  trustProxy: env('ADMIN_TRUST_PROXY') === 'true',
  setupToken: env('ADMIN_SETUP_TOKEN'),
  previewPort: Number(env('SITE_PREVIEW_PORT', '3100')),
  /** Calendly's API; pointed elsewhere only by the tests. */
  calendlyBase: env('CALENDLY_API_BASE', 'https://api.calendly.com').replace(/\/+$/, ''),
  /** The studio's clock: days and charts are counted in India time. */
  timeZone: 'Asia/Kolkata',
};
