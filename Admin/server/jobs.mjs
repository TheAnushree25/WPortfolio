import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { HttpError } from './http.mjs';

/**
 * Long-running work on the site: installing its packages, checking types,
 * building, deploying, and a local preview. Each job runs one of a fixed set
 * of npm scripts (never anything typed by a user), streams its output to the
 * publish page as it happens, and is stopped by its own process id.
 * Checks, builds and deploys run one at a time; the preview runs beside them.
 */

const RECIPES = {
  install: { label: 'Install the site’s packages', args: ['ci'], role: 'owner' },
  typecheck: { label: 'Check the site compiles', args: ['run', 'typecheck'], role: 'editor' },
  lint: { label: 'Lint the site', args: ['run', 'lint'], role: 'editor' },
  build: { label: 'Production build', args: ['run', 'build'], role: 'editor' },
  deploy: { label: 'Deploy to Cloudflare', args: ['run', 'deploy'], role: 'owner' },
  preview: { label: 'Local preview', args: null, role: 'editor', long: true },
};
export const JOB_TYPES = Object.keys(RECIPES);
export const recipe = (type) => RECIPES[type];

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
const MAX_LINES = 3000;

/** Whether something already answers on the port, and if so whether it is the Atlas site. */
export function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    socket.once('connect', async () => {
      socket.destroy();
      try {
        const html = await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(4000) })).text();
        resolve({ busy: true, atlas: /Atlas Studios/i.test(html) });
      } catch {
        resolve({ busy: true, atlas: false });
      }
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ busy: false });
    });
    socket.once('error', () => resolve({ busy: false }));
  });
}

/**
 * Mounted at /admin, the admin is served by the site's own development server.
 * The site is already running, a build or deploy would rewrite the .next folder
 * that server is using, and reinstalling would pull its packages out from under
 * it; those wait for a terminal, or for the admin run on its own.
 */
const NOT_WHILE_MOUNTED = new Set(['install', 'build', 'deploy', 'preview']);

export class Jobs {
  constructor({ siteRoot, db, previewPort, mounted = false }) {
    this.siteRoot = siteRoot;
    this.db = db;
    this.previewPort = previewPort;
    this.mounted = mounted;
    this.jobs = new Map();
    this.listeners = new Map();
  }

  siteReady() {
    return {
      packages: fs.existsSync(path.join(this.siteRoot, 'node_modules', 'next', 'package.json')),
      packageJson: fs.existsSync(path.join(this.siteRoot, 'package.json')),
    };
  }

  busy() {
    return [...this.jobs.values()].find((job) => job.status === 'running' && !RECIPES[job.type].long) ?? null;
  }

  preview() {
    return [...this.jobs.values()].find((job) => job.type === 'preview' && job.status === 'running') ?? null;
  }

  summary(job) {
    const rest = { ...job, lineCount: job.lines.length };
    delete rest.lines;
    delete rest.child;
    return rest;
  }

  recent() {
    const live = [...this.jobs.values()].map((job) => this.summary(job));
    const past = (this.db.data.jobs ?? []).filter((job) => !this.jobs.has(job.id));
    return [...live, ...past].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 40);
  }

  get(id) {
    const job = this.jobs.get(id);
    if (job) return { ...this.summary(job), lines: job.lines.slice(-MAX_LINES) };
    const past = (this.db.data.jobs ?? []).find((item) => item.id === id);
    if (!past) throw new HttpError(404, 'not_found', 'No such job.');
    return { ...past, lines: past.tail ?? [] };
  }

  async start(type, user) {
    const spec = RECIPES[type];
    if (!spec) throw new HttpError(400, 'invalid', 'Unknown job.');
    if (this.mounted && NOT_WHILE_MOUNTED.has(type)) {
      throw new HttpError(409, type === 'preview' ? 'preview_running' : 'mounted', type === 'preview'
        ? 'The site is already running: this admin is part of it.'
        : `“${spec.label}” can’t run while the site’s development server is serving the admin. Run it from a terminal (npm ${spec.args.join(' ')}), or start the admin on its own (npm start in Admin).`, { url: '/' });
    }
    const ready = this.siteReady();
    if (!ready.packageJson) throw new HttpError(503, 'site_missing', 'The site folder has no package.json.');
    if (type !== 'install' && !ready.packages) throw new HttpError(409, 'no_packages', 'The site’s packages aren’t installed yet. Run “Install the site’s packages” first.');
    if (type === 'preview') {
      const running = this.preview();
      if (running) return this.summary(running);
      const probe = await probePort(this.previewPort);
      if (probe.busy) {
        throw new HttpError(409, probe.atlas ? 'preview_running' : 'port_taken', probe.atlas
          ? `The site is already running at http://localhost:${this.previewPort}.`
          : `Port ${this.previewPort} is used by another app. Stop it, or set SITE_PREVIEW_PORT in Admin/.env to a free port.`, { url: `http://localhost:${this.previewPort}` });
      }
    } else if (this.busy()) {
      throw new HttpError(409, 'busy', `“${this.busy().label}” is still running. Wait for it or stop it first.`);
    }

    const args = type === 'preview' ? ['run', 'dev', '--', '--port', String(this.previewPort)] : spec.args;
    const job = {
      id: crypto.randomUUID(),
      type,
      label: spec.label,
      command: `npm ${args.join(' ')}`,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null,
      by: user?.name ?? 'Admin',
      url: type === 'preview' ? `http://localhost:${this.previewPort}` : null,
      ready: false,
      lines: [],
    };
    const windows = process.platform === 'win32';
    // On Windows npm is a .cmd script, which Node only starts through a shell. The arguments are fixed above, never user text.
    const child = spawn(windows ? 'npm.cmd' : 'npm', args, {
      cwd: this.siteRoot,
      shell: windows,
      windowsHide: true,
      detached: !windows,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', NEXT_TELEMETRY_DISABLED: '1', BROWSER: 'none' },
    });
    job.pid = child.pid;
    job.child = child;
    this.jobs.set(job.id, job);
    this.#line(job, `$ ${job.command}`);

    let partial = '';
    const feed = (chunk) => {
      partial += chunk.toString('utf8').replace(ANSI, '');
      const lines = partial.split(/\r?\n|\r(?!\n)/);
      partial = lines.pop();
      for (const line of lines) this.#line(job, line);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (error) => this.#line(job, `Couldn’t start: ${error.message}`));
    child.on('close', (code) => {
      if (partial) this.#line(job, partial);
      job.exitCode = code;
      job.endedAt = new Date().toISOString();
      if (job.status === 'running') job.status = code === 0 ? 'succeeded' : 'failed';
      this.#line(job, job.status === 'stopped' ? '— stopped —' : `— finished with exit code ${code} —`);
      this.#emit(job, { type: 'end', status: job.status, exitCode: code });
      this.#persist(job);
      setTimeout(() => this.jobs.delete(job.id), 10 * 60_000).unref?.();
    });
    return this.summary(job);
  }

  #line(job, text) {
    job.lines.push(text);
    if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
    if (job.type === 'preview' && !job.ready && /ready in|Ready in|started server on|Local:\s+http/i.test(text)) {
      job.ready = true;
      this.#emit(job, { type: 'ready', url: job.url });
    }
    this.#emit(job, { type: 'line', text });
  }

  #emit(job, event) {
    for (const listener of this.listeners.get(job.id) ?? []) listener(event);
  }

  #persist(job) {
    const record = { ...this.summary(job), tail: job.lines.slice(-400) };
    this.db.data.jobs = [record, ...(this.db.data.jobs ?? []).filter((item) => item.id !== job.id)].slice(0, 50);
    this.db.save();
  }

  subscribe(id, listener) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id).add(listener);
    return () => this.listeners.get(id)?.delete(listener);
  }

  stop(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'running') throw new HttpError(404, 'not_found', 'That job isn’t running.');
    job.status = 'stopped';
    killTree(job.pid);
    return this.summary(job);
  }

  stopAll() {
    for (const job of this.jobs.values()) if (job.status === 'running') killTree(job.pid);
  }
}

/** Stops a job and everything it started (npm → node → next), by process id only. */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}
