#!/usr/bin/env node
/**
 * Connects the booking page to the studio's Google account, once.
 *
 * It signs in to Google in your browser as the studio
 * (contact.theatlasstudio@gmail.com), asks for two permissions — put events on
 * the calendar, and send email as the studio — and writes the resulting
 * refresh token into .env.local as GOOGLE_REFRESH_TOKEN. The token is never
 * printed. No packages needed (Node 18+).
 *
 * Before running it, put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (an OAuth
 * client of type "Desktop app") in .env.local. README.md → "Bookings" walks
 * through creating one.
 *
 * Usage
 *   node scripts/google/authorize.mjs           connect, then check the calendar
 *   node scripts/google/authorize.mjs --check   only check the token in .env.local
 */
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_FILE = join(ROOT, '.env.local');
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/gmail.send',
];

const readEnv = () => {
  const values = {};
  if (!existsSync(ENV_FILE)) return values;
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
};

/** Sets one variable in .env.local, keeping every other line as it was. */
const writeEnv = (key, value) => {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  const at = lines.findIndex((line) => line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1] === key);
  if (at >= 0) lines[at] = `${key}=${value}`;
  else {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${key}=${value}`);
  }
  writeFileSync(ENV_FILE, `${lines.join('\n')}\n`);
};

const env = { ...readEnv(), ...process.env };
const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;
const expected = (env.BOOKING_NOTIFY_EMAIL || 'contact.theatlasstudio@gmail.com').toLowerCase();

if (!clientId || !clientSecret) {
  console.error('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first (README.md → "Bookings").');
  process.exit(1);
}

async function check(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!response.ok) throw new Error(`Google refused the refresh token (${response.status}): ${await response.text()}`);
  const { access_token: token } = await response.json();
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  const id = env.BOOKING_CALENDAR_ID || 'primary';
  const freeBusy = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin: now.toISOString(), timeMax: week.toISOString(), items: [{ id }] }),
  });
  if (!freeBusy.ok) throw new Error(`The calendar could not be read (${freeBusy.status}): ${await freeBusy.text()}`);
  const data = await freeBusy.json();
  const busy = Object.values(data.calendars ?? {}).flatMap((calendar) => calendar.busy ?? []);
  console.log(`Calendar "${id}" is reachable: ${busy.length} busy stretch${busy.length === 1 ? '' : 'es'} in the next 7 days.`);
}

if (process.argv.includes('--check')) {
  if (!env.GOOGLE_REFRESH_TOKEN) {
    console.error('There is no GOOGLE_REFRESH_TOKEN in .env.local yet: run this script without --check.');
    process.exit(1);
  }
  await check(env.GOOGLE_REFRESH_TOKEN).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
  process.exit(0);
}

const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;

const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consent.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'true',
  login_hint: expected,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#020923;color:#fff;font-family:system-ui,sans-serif"><div style="max-width:30rem;padding:2rem;text-align:center"><h1 style="font-weight:600">${title}</h1><p style="opacity:.7;line-height:1.6">${body}</p></div>`;

const done = new Promise((resolve, reject) => {
  server.on('request', async (request, response) => {
    const url = new URL(request.url, redirectUri);
    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404).end();
      return;
    }
    const finish = (status, title, body, error) => {
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(page(title, body));
      if (error) reject(error);
    };
    if (url.searchParams.get('state') !== state) return finish(400, 'That link has expired', 'Run the script again.', new Error('State mismatch'));
    if (url.searchParams.get('error')) {
      return finish(400, 'Not connected', 'Google said: ' + url.searchParams.get('error'), new Error(`Consent refused: ${url.searchParams.get('error')}`));
    }
    try {
      const exchange = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: url.searchParams.get('code') ?? '',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      if (!exchange.ok) throw new Error(`Token exchange failed (${exchange.status}): ${await exchange.text()}`);
      const tokens = await exchange.json();
      if (!tokens.refresh_token) throw new Error('Google sent no refresh token. Remove the app at myaccount.google.com/permissions and run this again.');
      const granted = new Set(String(tokens.scope ?? '').split(' '));
      const missing = SCOPES.filter((scope) => scope.startsWith('https://') && !granted.has(scope));
      const claims = tokens.id_token ? JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8')) : {};
      writeEnv('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
      finish(200, 'Connected', 'The booking page can now add meetings to the calendar and email the studio. You can close this tab.');
      resolve({ email: String(claims.email ?? '').toLowerCase(), missing });
    } catch (error) {
      finish(500, 'Not connected', String(error.message), error);
    }
  });
});

console.log('\nOpen this link and sign in as', expected, '\n\n ', consent.toString(), '\n');
const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', consent.toString().replace(/&/g, '^&')]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [consent.toString()]];
try {
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
} catch {}

try {
  const { email, missing } = await done;
  console.log(`Saved GOOGLE_REFRESH_TOKEN to .env.local${email ? ` (connected as ${email})` : ''}.`);
  if (email && email !== expected) console.warn(`Note: you signed in as ${email}, not ${expected}. Bookings will go to ${email}'s calendar.`);
  if (missing.length) console.warn(`Note: these permissions were not granted, so bookings will fail until they are: ${missing.join(', ')}`);
  await check(readEnv().GOOGLE_REFRESH_TOKEN);
  console.log('\nDone. Restart `npm run dev`, and on Vercel add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN to the project.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server.close();
}
