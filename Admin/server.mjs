#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { config } from './server/config.mjs';
import { createApp } from './server/app.mjs';
import { Store } from './server/db.mjs';
import { hashPassword, temporaryPassword } from './server/security.mjs';

/**
 * The Atlas Studios admin.
 *
 *   node server.mjs                       start it (http://127.0.0.1:4310)
 *   node server.mjs reset-password EMAIL  give an account a temporary password
 *
 * Settings come from the environment or Admin/.env (see .env.example).
 */

// Node flags type stripping as experimental; the admin relies on it on purpose, so the notice is kept out of the console.
const emit = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  if (/stripTypeScriptTypes|Type Stripping/i.test(String(warning?.message ?? warning))) return;
  return emit.call(process, warning, ...rest);
};

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`The admin needs Node.js 22.13 or newer (this is ${process.version}).`);
  process.exit(1);
}

if (process.argv[2] === 'reset-password') {
  const address = String(process.argv[3] ?? '').trim().toLowerCase();
  const db = new Store(path.join(config.dataDir, 'db.json'));
  await db.load();
  const user = db.data.users.find((item) => item.email === address);
  if (!user) {
    console.error(address ? `No account uses ${address}. Accounts: ${db.data.users.map((item) => item.email).join(', ') || 'none yet'}.` : 'Usage: node server.mjs reset-password you@example.com');
    process.exit(1);
  }
  const password = temporaryPassword();
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = true;
  user.disabled = false;
  db.data.sessions = db.data.sessions.filter((item) => item.userId !== user.id);
  db.data.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), userId: null, userName: 'System', action: 'user.reset', target: user.id, summary: `Reset the password for ${user.name} from the command line`, meta: null });
  await db.flush();
  console.log(`\nTemporary password for ${user.name}: ${password}\nSign in with it; you'll be asked to choose a new one.\n`);
  process.exit(0);
}

const { handle, close, app } = await createApp(config);
const server = http.createServer(handle);
server.requestTimeout = 0; // uploads and job streams can run long
server.headersTimeout = 60_000;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${config.port} is in use. Set ADMIN_PORT in Admin/.env to another port.`);
  else console.error(error);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const shown = config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host;
  console.log(`\n  Atlas Studios admin  →  http://${shown}:${config.port}`);
  console.log(`  Managing the site in  ${config.siteRoot}`);
  console.log(`  Admin data in         ${config.dataDir}`);
  if (!app.db.data.users.length) console.log('\n  First run: open the address above to create the owner account.');
  if (config.host === '0.0.0.0' || config.host === '::') console.log('  Listening on your network: other devices can reach it at this computer’s address.');
  console.log('');
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  server.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
