#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BACKEND_ROOT, configProblems, loadConfig, loadEnvFile, maskUrl } from './src/config.mjs';

/**
 * The Atlas Studios backend on Node's own HTTP server: for a container, a
 * small server, or this computer.
 *
 *   node server.mjs                        start it (http://127.0.0.1:4320/admin)
 *   node server.mjs migrate                bring the database's tables up to date
 *   node server.mjs doctor                 check the settings, the database and GitHub
 *   node server.mjs reset-password EMAIL   give an account a temporary password
 *
 * Settings come from the environment or backend/.env (see .env.example).
 */

// Node calls its type stripping experimental; the content engine relies on it on purpose.
const emit = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  if (/stripTypeScriptTypes|Type Stripping/i.test(String(warning?.message ?? warning))) return;
  return emit.call(process, warning, ...rest);
};

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`The backend needs Node.js 22.13 or newer (this is ${process.version}).`);
  process.exit(1);
}

loadEnvFile(path.join(BACKEND_ROOT, '.env'));
const config = loadConfig();
const command = process.argv[2] ?? 'start';

const problems = configProblems(config);
for (const problem of problems) console[problem.level === 'error' ? 'error' : 'warn'](`  ${problem.level === 'error' ? '✗' : '!'} ${problem.message}`);

if (command === 'migrate') {
  const { openDatabase } = await import('./src/db/index.mjs');
  const db = await openDatabase(config);
  const rows = await db.query('SELECT version, applied_at FROM schema_migrations ORDER BY version');
  console.log(`\nThe database is up to date (${rows.map((row) => row.version).join(', ')}).`);
  await db.close();
  process.exit(0);
}

if (command === 'reset-password') {
  const { openDatabase } = await import('./src/db/index.mjs');
  const { users, sessions, activity } = await import('./src/data.mjs');
  const { hashPassword, temporaryPassword } = await import('./src/shared.mjs');
  const address = String(process.argv[3] ?? '').trim().toLowerCase();
  const db = await openDatabase(config);
  const user = await users.byEmail(db, address);
  if (!user) {
    const all = await users.list(db);
    console.error(address ? `No account uses ${address}. Accounts: ${all.map((item) => item.email).join(', ') || 'none yet'}.` : 'Usage: npm run reset-password -- you@example.com');
    await db.close();
    process.exit(1);
  }
  const password = temporaryPassword();
  await users.update(db, user.id, { passwordHash: await hashPassword(password), mustChangePassword: true, disabled: false });
  await sessions.removeForUser(db, user.id);
  await activity.add(db, { action: 'user.reset', target: user.id, summary: `Reset the password for ${user.name} from the command line` });
  console.log(`\nTemporary password for ${user.name}: ${password}\nSign in with it; you'll be asked to choose a new one.\n`);
  await db.close();
  process.exit(0);
}

if (command === 'doctor') {
  console.log(`\nAtlas Studios backend ${config.version} on Node ${process.version}`);
  console.log(`  Database   ${config.databaseUrl ? maskUrl(config.databaseUrl) : `built-in Postgres (PGlite) in ${config.dataDir}`}`);
  console.log(`  GitHub     ${config.github.repo || '(not set)'} · live ${config.github.liveBranch || '(default branch)'} · drafts ${config.github.draftBranch}`);
  console.log(`  Admin      ${config.publicUrl || `(no ADMIN_PUBLIC_URL) ${config.basePath}`}`);
  console.log(`  Email      ${config.mail.smtp ? `SMTP ${config.mail.smtp.host}:${config.mail.smtp.port}` : config.mail.resendKey ? 'Resend' : config.mail.log ? 'console' : 'off'}`);
  let failed = problems.some((problem) => problem.level === 'error');
  try {
    const { openDatabase } = await import('./src/db/index.mjs');
    const db = await openDatabase(config);
    const { users } = await import('./src/data.mjs');
    console.log(`  ✓ The database answers (${await users.count(db)} accounts).`);
    await db.close();
  } catch (error) {
    failed = true;
    console.log(`  ✗ The database: ${error.message}`);
  }
  if (config.github.token && config.github.repo) {
    try {
      const { GitHub } = await import('./src/github/client.mjs');
      const github = new GitHub({ token: config.github.token, api: config.github.api, graphql: config.github.graphql, owner: config.github.owner, name: config.github.name });
      const repo = await github.repository({ fresh: true });
      const heads = await github.branchHeads();
      const live = config.github.liveBranch || repo.default_branch;
      if (!repo.permissions?.push) throw new Error('the token can read the repository but not write to it.');
      if (!heads[live]) throw new Error(`there's no "${live}" branch.`);
      console.log(`  ✓ GitHub: ${repo.full_name} (${repo.private ? 'private' : 'public'}), writable, ${live} at ${heads[live].slice(0, 7)}${heads[config.github.draftBranch] ? `, drafts at ${heads[config.github.draftBranch].slice(0, 7)}` : ', no drafts yet'}. ${github.rate ? `${github.rate.remaining}/${github.rate.limit} requests left this hour.` : ''}`);
    } catch (error) {
      failed = true;
      console.log(`  ✗ GitHub: ${error.message}`);
    }
  }
  console.log(failed ? '\nSomething needs fixing (above).\n' : '\nEverything answers.\n');
  process.exit(failed ? 1 : 0);
}

if (problems.some((problem) => problem.level === 'error') && config.production) {
  console.error('\nThe backend won’t start in production until the errors above are fixed.');
  process.exit(1);
}

const { createBackend } = await import('./src/app.mjs');
const backend = await createBackend(config);

/** Node's request as a web Request, and a web Response written back. */
function toRequest(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  return new Request(`http://${req.headers.host ?? `localhost:${config.port}`}${req.url}`, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') headers[key] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  if (!response.body) return res.end();
  const stream = Readable.fromWeb(response.body);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    await send(res, await backend.fetch(toRequest(req), { ip: req.socket.remoteAddress ?? '' }));
  } catch (error) {
    console.error('[backend]', error);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Something went wrong.');
  }
});
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is in use. Set PORT to another port.` : error);
  process.exit(1);
});
server.listen(config.port, config.host, () => {
  const shown = ['0.0.0.0', '::'].includes(config.host) ? 'localhost' : config.host;
  console.log(`\n  Atlas Studios backend  →  http://${shown}:${config.port}${config.basePath}/`);
  console.log(`  Site on GitHub          ${config.github.repo || '(not set)'}`);
  console.log(`  Database                ${backend.app.db.kind === 'postgres' ? maskUrl(config.databaseUrl) : `built-in, in ${config.dataDir}`}\n`);
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  server.close();
  await backend.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
