import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.mjs';

/**
 * The site's git history, as the publish page needs it: what has changed in
 * the content and media since the last commit, each change as a diff, and a
 * way to keep a version or to drop a change. Git is always run with a fixed
 * argument list (never through a shell) and only on the paths the admin
 * manages. Nothing here pushes: publishing is the deploy, and it stays a
 * deliberate step of its own.
 */

export const MANAGED = ['src/content/', 'src/app/layout.tsx', 'public/'];
export const isManaged = (file) => MANAGED.some((prefix) => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));

function describe(file) {
  if (file === 'src/content/site.ts') return 'Site content';
  if (file === 'src/content/work.ts') return 'Case studies';
  if (file === 'src/content/systems.ts') return 'Systems';
  if (file === 'src/app/layout.tsx') return 'Search & sharing';
  if (file.startsWith('src/content/')) return 'Generated content';
  if (file.startsWith('public/')) return `Media · ${file.slice('public/'.length)}`;
  return file;
}

const STATES = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'conflicted', T: 'modified' };

export class Git {
  constructor(siteRoot, adminRoot = null) {
    this.root = siteRoot;
    // The admin's own folder sits inside the site's repository; its files are neither content nor the site's code.
    const rel = adminRoot ? path.relative(siteRoot, adminRoot).split(path.sep).join('/') : '';
    this.adminPrefix = rel && !rel.startsWith('..') ? `${rel}/` : null;
  }

  run(args, { timeout = 30_000, env = {} } = {}) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn('git', args, { cwd: this.root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...env } });
      } catch (error) {
        resolve({ code: -1, stdout: '', stderr: error.message });
        return;
      }
      const out = [];
      const err = [];
      const timer = setTimeout(() => child.kill(), timeout);
      child.stdout.on('data', (chunk) => out.push(chunk));
      child.stderr.on('data', (chunk) => err.push(chunk));
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout: '', stderr: error.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
      });
    });
  }

  async must(args, options) {
    const result = await this.run(args, options);
    if (result.code !== 0) throw new HttpError(500, 'git', (result.stderr || result.stdout || 'git failed').trim().split('\n').slice(-3).join(' '));
    return result.stdout;
  }

  async info() {
    const inside = await this.run(['rev-parse', '--is-inside-work-tree']);
    if (inside.code !== 0) return { available: false, reason: inside.stderr.includes('not a git') ? 'The site folder isn’t a git repository.' : 'Git isn’t installed or can’t be run.' };
    const branch = (await this.run(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    const head = (await this.run(['log', '-1', '--pretty=format:%h%x1f%s%x1f%aI'])).stdout.split('\x1f');
    const counts = await this.run(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    const [behind, ahead] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [null, null];
    const name = (await this.run(['config', 'user.name'])).stdout.trim();
    return { available: true, branch, head: { hash: head[0], subject: head[1], at: head[2] }, ahead, behind, identity: Boolean(name) };
  }

  async status() {
    const out = await this.must(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const parts = out.split('\0');
    const entries = [];
    for (let i = 0; i < parts.length; i++) {
      const item = parts[i];
      if (item.length < 4) continue;
      const code = item.slice(0, 2);
      let file = item.slice(3);
      let from = null;
      if (code[0] === 'R' || code[0] === 'C') from = parts[++i];
      if (file.endsWith('/') || (this.adminPrefix && file.startsWith(this.adminPrefix))) continue;
      const state = code === '??' ? 'new' : STATES[code[1] !== ' ' ? code[1] : code[0]] ?? 'modified';
      entries.push({ file, from, code, state, managed: isManaged(file), label: describe(file) });
    }
    return entries;
  }

  async diff(file) {
    if (typeof file !== 'string' || file.includes('\0')) throw new HttpError(400, 'invalid', 'No file named.');
    const status = (await this.status()).find((entry) => entry.file === file);
    if (!status) return { file, state: 'unchanged', diff: '' };
    if (status.state === 'new') {
      const abs = path.join(this.root, file);
      const stat = await fsp.stat(abs).catch(() => null);
      const text = stat && stat.size < 400_000 && /\.(ts|tsx|json|css|md|txt|mjs|js)$/.test(file) ? await fsp.readFile(abs, 'utf8') : null;
      return { file, state: 'new', bytes: stat?.size ?? 0, diff: text === null ? '' : text.split(/\r?\n/).map((line) => `+${line}`).join('\n'), binary: text === null };
    }
    const diff = await this.must(['-c', 'core.quotepath=off', 'diff', '--no-color', '--no-ext-diff', 'HEAD', '--', file]);
    return { file, state: status.state, diff, binary: /^Binary files /m.test(diff) };
  }

  /** Drops the uncommitted change to one managed file: back to the last commit, or (for a new file) into the media trash. */
  async discard(file, { toTrash }) {
    const status = (await this.status()).find((entry) => entry.file === file);
    if (!status) throw new HttpError(404, 'not_found', 'That file has no changes.');
    if (!status.managed) throw new HttpError(403, 'forbidden', 'The admin only discards changes to content and media.');
    if (status.state === 'new') {
      const abs = path.join(this.root, file);
      if (!fs.existsSync(abs)) throw new HttpError(404, 'not_found', 'That file is already gone.');
      return toTrash(abs);
    }
    await this.must(['checkout', 'HEAD', '--', file]);
    return { file };
  }

  /** Commits the named managed files (all managed changes when none are named), as the admin user. */
  async commit({ files, message, author }) {
    const changes = (await this.status()).filter((entry) => entry.managed);
    const chosen = files?.length ? changes.filter((entry) => files.includes(entry.file)) : changes;
    if (!chosen.length) throw new HttpError(400, 'invalid', 'There are no content or media changes to keep.');
    const paths = [...new Set(chosen.flatMap((entry) => [entry.file, entry.from].filter(Boolean)))];
    const info = await this.info();
    const identity = info.identity ? [] : ['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`];
    await this.must(['add', '-A', '--', ...paths]);
    await this.must([...identity, 'commit', '--no-verify', `--author=${author.name} <${author.email}>`, '-m', message, '--', ...paths]);
    const head = (await this.run(['log', '-1', '--pretty=format:%h'])).stdout.trim();
    return { hash: head, files: paths };
  }

  async log(limit = 30) {
    const out = await this.run(['log', `-n${limit}`, '--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s', '--', ...MANAGED.map((prefix) => prefix.replace(/\/$/, ''))]);
    if (out.code !== 0) return [];
    return out.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, short, author, at, subject] = line.split('\x1f');
        return { hash, short, author, at, subject };
      });
  }
}
