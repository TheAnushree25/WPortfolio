import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The backend's settings, read from the environment and, when it exists,
 * backend/.env (which never overrides a value already set). The same code runs
 * on a developer's computer, in a container and as a Vercel Function; what
 * changes is only what's set here. `configProblems` says what is missing or
 * unsafe, and start-up refuses to run in production with an error.
 */

export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnvFile(file, env = process.env) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || env[match[1]] !== undefined) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const originOf = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
};

/** `postgres://user:secret@host/db` → `postgres://user:•••@host/db`, for showing where the data lives. */
export function maskUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '•••';
    return url.toString();
  } catch {
    return value ? '(set)' : '';
  }
}

function smtpFrom(env) {
  const raw = (env.SMTP_URL ?? '').trim();
  if (raw) {
    try {
      const url = new URL(raw);
      const secure = url.protocol === 'smtps:';
      return {
        host: url.hostname,
        port: Number(url.port) || (secure ? 465 : 587),
        secure,
        user: decodeURIComponent(url.username),
        pass: decodeURIComponent(url.password),
      };
    } catch {
      return { invalid: true };
    }
  }
  if (!env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT) || 587;
  return {
    host: env.SMTP_HOST.trim(),
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: (env.SMTP_USER ?? '').trim(),
    pass: env.SMTP_PASS ?? '',
  };
}

export function loadConfig(env = process.env) {
  const get = (key, fallback = '') => (env[key] ?? '').trim() || fallback;
  const serverless = Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY);
  const basePath = `/${get('ADMIN_BASE_PATH', '/admin').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  const publicUrl = get('ADMIN_PUBLIC_URL').replace(/\/+$/, '');
  const siteUrl = get('SITE_URL').replace(/\/+$/, '');
  const [owner = '', name = ''] = get('GITHUB_REPO').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
  const liveBranch = get('GITHUB_BRANCH');
  const api = get('GITHUB_API_URL', 'https://api.github.com').replace(/\/+$/, '');
  const origins = get('SITE_ORIGINS')
    .split(',')
    .map((item) => originOf(item.trim()))
    .filter(Boolean);

  return {
    version: '1.0.0',
    port: Number(get('PORT', get('ADMIN_PORT', '4320'))),
    host: get('ADMIN_HOST', serverless ? '0.0.0.0' : '127.0.0.1'),
    /** Where the admin is served: /admin, both on its own and behind the site. */
    basePath,
    /** The admin's public address (e.g. https://theatlasstudios.vercel.app/admin), for links in emails. */
    publicUrl,
    publicOrigin: originOf(publicUrl),
    /** The live site, for "view on the site" links, its files' sizes and its booking page. */
    siteUrl,
    /** Sites allowed to send enquiries and visits from another address (the admin's own always may). */
    siteOrigins: [...new Set([...origins, originOf(siteUrl)].filter(Boolean))],
    databaseUrl: get('DATABASE_URL', get('POSTGRES_URL')),
    /** Without DATABASE_URL, a Postgres of its own (PGlite) keeps its files here. */
    dataDir: path.resolve(BACKEND_ROOT, get('ADMIN_DATA_DIR', '.data/db')),
    secret: get('ADMIN_SECRET'),
    github: {
      token: get('GITHUB_TOKEN'),
      owner,
      name,
      repo: owner && name ? `${owner}/${name}` : '',
      /** Where the live site is built from; empty means the repository's default branch. */
      liveBranch,
      /** Where admin edits wait until they're published. The same as the live branch publishes every edit at once. */
      draftBranch: get('GITHUB_DRAFT_BRANCH', 'admin-drafts'),
      api,
      graphql: get('GITHUB_GRAPHQL_URL', api === 'https://api.github.com' ? 'https://api.github.com/graphql' : `${api}/graphql`),
    },
    /** Shared with the site's /admin route, which forwards requests here; it vouches for their forwarded headers. */
    proxySecret: get('ADMIN_PROXY_SECRET'),
    setupToken: get('ADMIN_SETUP_TOKEN'),
    sessionHours: Math.max(1, Number(get('ADMIN_SESSION_HOURS', '12')) || 12),
    /** Behind a platform that sets X-Forwarded-For itself (Vercel always does). */
    trustProxy: get('ADMIN_TRUST_PROXY') === 'true' || Boolean(env.VERCEL),
    cronSecret: get('CRON_SECRET'),
    mail: {
      from: get('MAIL_FROM'),
      smtp: smtpFrom(env),
      resendKey: get('RESEND_API_KEY'),
      /** Every email is written to the console instead of sent (for local work). */
      log: get('MAIL_LOG') === 'true',
    },
    calendlyBase: get('CALENDLY_API_BASE', 'https://api.calendly.com').replace(/\/+$/, ''),
    timeZone: 'Asia/Kolkata',
    serverless,
    production: env.NODE_ENV === 'production' || serverless,
  };
}

/** What's missing or risky, as { level: 'error' | 'warning', message }. */
export function configProblems(config) {
  const out = [];
  const error = (message) => out.push({ level: 'error', message });
  const warning = (message) => out.push({ level: 'warning', message });

  if (!config.github.token) error('GITHUB_TOKEN is not set: the backend edits the site through GitHub and needs a token with read and write access to its contents.');
  if (!config.github.repo) error('GITHUB_REPO is not set: name the site’s repository as owner/name (e.g. TheAnushree25/WPortfolio).');
  if (!config.databaseUrl && config.serverless) error('DATABASE_URL is not set. Serverless functions don’t keep files between requests, so the admin needs a Postgres database (Neon, from the Vercel dashboard → Storage, is free).');
  if (!config.secret) (config.production ? error : warning)('ADMIN_SECRET is not set: it encrypts the stored Calendly token and two-step sign-in keys. Use 32 or more random characters.');
  else if (config.secret.length < 32) (config.production ? error : warning)('ADMIN_SECRET is shorter than 32 characters.');
  if (config.production && !config.setupToken) warning('ADMIN_SETUP_TOKEN is not set, so the first account can’t be created here (first-run setup needs it).');
  if (config.production && !config.publicUrl) warning('ADMIN_PUBLIC_URL is not set: emails can’t link back to the admin.');
  if (config.mail.smtp?.invalid) error('SMTP_URL isn’t a valid address like smtps://user:app-password@smtp.gmail.com:465.');
  if ((config.mail.smtp || config.mail.resendKey) && !config.mail.from) warning('MAIL_FROM is not set: emails need a sender, like “Atlas Studios <contact.theatlasstudio@gmail.com>”.');
  if (config.github.draftBranch === config.github.liveBranch && config.github.liveBranch) warning('GITHUB_DRAFT_BRANCH is the live branch: every save goes live at once, without a preview.');
  return out;
}
