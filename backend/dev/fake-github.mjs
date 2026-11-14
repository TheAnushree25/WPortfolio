import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

/**
 * A stand-in for GitHub, for the backend's tests and its local demo: a real
 * HTTP server answering the REST and GraphQL calls the backend makes, over an
 * in-memory Git object store with GitHub's own rules.
 *
 *  - Blobs are hashed as Git hashes them, so the site's real files keep their
 *    real SHAs; trees and commits are stored as objects too.
 *  - Branches only move forward unless forced; comparisons are three-dot
 *    (from the merge base), with unified-diff patches for text files;
 *    merges are three-way at file level and refuse clashing edits.
 *  - It can be seeded from a real repository (`seedFromGit`), reading file
 *    contents lazily with `git cat-file`, so the whole site is there in a
 *    fraction of a second without loading every video into memory.
 *
 * Nothing here talks to the real GitHub.
 */

const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');
export const blobSha = (buffer) => sha1(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer]));
const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

/** Reads blobs from a real repository through one long-lived `git cat-file --batch`. */
class GitObjectReader {
  constructor(dir) {
    this.proc = spawn('git', ['cat-file', '--batch'], { cwd: dir, windowsHide: true });
    this.queue = [];
    this.chunks = [];
    this.length = 0;
    this.proc.stdout.on('data', (chunk) => {
      this.chunks.push(chunk);
      this.length += chunk.length;
      this.drain();
    });
    this.proc.on('error', (error) => {
      for (const item of this.queue.splice(0)) item.reject(error);
    });
  }

  read(sha) {
    return new Promise((resolve, reject) => {
      this.queue.push({ sha, resolve, reject });
      this.proc.stdin.write(`${sha}\n`);
    });
  }

  drain() {
    while (this.queue.length && this.length) {
      // The header line ("<sha> <type> <size>") is short; join chunks only until it's whole.
      while (this.chunks[0].indexOf(10) < 0 && this.chunks.length > 1) this.chunks.splice(0, 2, Buffer.concat([this.chunks[0], this.chunks[1]]));
      const first = this.chunks[0];
      const newline = first.indexOf(10);
      if (newline < 0) return;
      const [, type, size] = first.subarray(0, newline).toString().split(' ');
      if (type === 'missing' || size === undefined) {
        this.#take(newline + 1);
        this.queue.shift().reject(new Error('missing object'));
        continue;
      }
      const total = newline + 1 + Number(size) + 1;
      if (this.length < total) return;
      const record = this.#take(total);
      this.queue.shift().resolve(Buffer.from(record.subarray(newline + 1, newline + 1 + Number(size))));
    }
  }

  /** The first `count` buffered bytes, joined once. */
  #take(count) {
    const parts = [];
    let need = count;
    while (need > 0) {
      const chunk = this.chunks[0];
      if (chunk.length <= need) {
        parts.push(chunk);
        this.chunks.shift();
        need -= chunk.length;
      } else {
        parts.push(chunk.subarray(0, need));
        this.chunks[0] = chunk.subarray(need);
        need = 0;
      }
    }
    this.length -= count;
    return parts.length === 1 ? parts[0] : Buffer.concat(parts);
  }

  close() {
    this.proc.stdin.end();
    this.proc.kill();
  }
}

/* ------------------------------------- A small line diff ------------------------------------- */

function unifiedPatch(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  // Longest common subsequence over the changed middle only.
  const table = Array.from({ length: midA.length + 1 }, () => new Uint32Array(midB.length + 1));
  for (let i = midA.length - 1; i >= 0; i--) for (let j = midB.length - 1; j >= 0; j--) table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const ops = [];
  for (let k = 0; k < start; k++) ops.push([' ', a[k]]);
  let i = 0;
  let j = 0;
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      ops.push([' ', midA[i]]);
      i++;
      j++;
    } else if (j < midB.length && (i === midA.length || table[i][j + 1] >= table[i + 1][j])) ops.push(['+', midB[j++]]);
    else ops.push(['-', midA[i++]]);
  }
  for (let k = endA; k < a.length; k++) ops.push([' ', a[k]]);

  const hunks = [];
  let lineA = 1;
  let lineB = 1;
  let current = null;
  ops.forEach(([kind, text], index) => {
    const near = ops.slice(Math.max(0, index - 3), index + 4).some(([k]) => k !== ' ');
    if (kind !== ' ' || near) {
      if (!current) current = { startA: lineA, startB: lineB, countA: 0, countB: 0, lines: [] };
      current.lines.push(`${kind}${text}`);
      if (kind !== '+') current.countA++;
      if (kind !== '-') current.countB++;
    } else if (current) {
      hunks.push(current);
      current = null;
    }
    if (kind !== '+') lineA++;
    if (kind !== '-') lineB++;
  });
  if (current) hunks.push(current);
  const additions = ops.filter(([k]) => k === '+').length;
  const deletions = ops.filter(([k]) => k === '-').length;
  return { patch: hunks.map((hunk) => `@@ -${hunk.startA},${hunk.countA} +${hunk.startB},${hunk.countB} @@\n${hunk.lines.join('\n')}`).join('\n'), additions, deletions };
}

/* --------------------------------------------- The store --------------------------------------------- */

export class FakeGitHub {
  constructor({ owner = 'atlas', name = 'site', token = 'test-token', defaultBranch = 'main', private: isPrivate = true } = {}) {
    this.owner = owner;
    this.name = name;
    this.token = token;
    this.defaultBranch = defaultBranch;
    this.isPrivate = isPrivate;
    this.objects = new Map();
    this.refs = new Map();
    this.deployments = [];
    this.calls = [];
    this.reader = null;
    this.autoDeploy = null;
    this.persistFile = null;
    this.failNext = null;
  }

  /* ----------------------------- objects ----------------------------- */

  putBlob(buffer) {
    const data = Buffer.from(buffer);
    const sha = blobSha(data);
    if (!this.objects.has(sha) || !this.objects.get(sha).data) this.objects.set(sha, { type: 'blob', data, size: data.length });
    return sha;
  }

  async blob(sha) {
    const object = this.objects.get(sha);
    if (!object || object.type !== 'blob') return null;
    if (object.data) return object.data;
    const data = await this.reader.read(sha);
    return data;
  }

  putTree(entries) {
    const sorted = [...entries].sort((x, y) => (x.name < y.name ? -1 : 1));
    const sha = sha1(`tree\0${JSON.stringify(sorted.map((entry) => [entry.name, entry.mode, entry.type, entry.sha]))}`);
    this.objects.set(sha, { type: 'tree', entries: new Map(sorted.map((entry) => [entry.name, entry])) });
    return sha;
  }

  putCommit({ tree, parents, message, author, committer }) {
    const body = { tree, parents, message, author, committer: committer ?? author };
    const sha = sha1(`commit\0${JSON.stringify(body)}\0${crypto.randomUUID()}`);
    this.objects.set(sha, { type: 'commit', ...body });
    return sha;
  }

  /** A tree's files, path → { mode, sha, size }. */
  flatten(treeSha, prefix = '', out = new Map()) {
    const tree = this.objects.get(treeSha);
    for (const entry of tree.entries.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.type === 'tree') this.flatten(entry.sha, path, out);
      else out.set(path, { mode: entry.mode, sha: entry.sha, size: this.objects.get(entry.sha)?.size ?? 0 });
    }
    return out;
  }

  /** Builds trees from path → { mode, sha }; returns the root's SHA. */
  build(files) {
    const root = new Map();
    for (const [path, entry] of files) {
      const parts = path.split('/');
      let node = root;
      for (const part of parts.slice(0, -1)) {
        if (!node.has(part) || !(node.get(part) instanceof Map)) node.set(part, new Map());
        node = node.get(part);
      }
      node.set(parts[parts.length - 1], entry);
    }
    const write = (node) =>
      this.putTree(
        [...node].map(([name, value]) => (value instanceof Map ? { name, mode: '040000', type: 'tree', sha: write(value) } : { name, mode: value.mode, type: 'blob', sha: value.sha })),
      );
    return write(root);
  }

  commitFiles(branch, changes, { message = 'Change', author = { name: 'Developer', email: 'dev@example.com', date: new Date().toISOString() } } = {}) {
    const head = this.refs.get(branch);
    const files = head ? this.flatten(this.objects.get(head).tree) : new Map();
    for (const [path, value] of Object.entries(changes)) {
      if (value === null) files.delete(path);
      else files.set(path, { mode: '100644', sha: this.putBlob(Buffer.from(value)) });
    }
    const sha = this.putCommit({ tree: this.build(files), parents: head ? [head] : [], message, author });
    this.moveRef(branch, sha);
    return sha;
  }

  /** Seeds the default branch with files given in memory: { path: string | Buffer }. */
  seedFiles(files, options = {}) {
    return this.commitFiles(this.defaultBranch, files, { message: 'Initial commit', ...options });
  }

  /** Seeds the default branch with a real repository's commit (contents read when first asked for). */
  seedFromGit(dir, ref = 'HEAD') {
    this.reader = new GitObjectReader(dir);
    const listing = execFileSync('git', ['ls-tree', '-r', '-l', '-z', ref], { cwd: dir, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    const files = new Map();
    for (const record of listing.split('\0')) {
      if (!record) continue;
      const tab = record.indexOf('\t');
      const [mode, type, sha, size] = record.slice(0, tab).trim().split(/\s+/);
      if (type !== 'blob') continue;
      if (!this.objects.has(sha)) this.objects.set(sha, { type: 'blob', size: Number(size) });
      files.set(record.slice(tab + 1), { mode, sha });
    }
    const [subject, name, email, date] = execFileSync('git', ['log', '-1', '--format=%s%x1f%an%x1f%ae%x1f%aI', ref], { cwd: dir }).toString('utf8').trim().split('\x1f');
    const sha = this.putCommit({ tree: this.build(files), parents: [], message: subject, author: { name, email, date } });
    this.refs.set(this.defaultBranch, sha);
    return sha;
  }

  /* ----------------------------- history ----------------------------- */

  commit(sha) {
    const object = this.objects.get(sha);
    return object?.type === 'commit' ? object : null;
  }

  ancestors(sha) {
    const seen = new Set();
    const stack = [sha];
    while (stack.length) {
      const next = stack.pop();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      stack.push(...(this.commit(next)?.parents ?? []));
    }
    return seen;
  }

  isAncestor(maybe, of) {
    return this.ancestors(of).has(maybe);
  }

  mergeBase(a, b) {
    const fromA = this.ancestors(a);
    const queue = [b];
    const seen = new Set();
    while (queue.length) {
      const next = queue.shift();
      if (seen.has(next)) continue;
      seen.add(next);
      if (fromA.has(next)) return next;
      queue.push(...(this.commit(next)?.parents ?? []));
    }
    return null;
  }

  moveRef(branch, sha) {
    this.refs.set(branch, sha);
    if (this.autoDeploy) {
      const environment = branch === this.defaultBranch ? 'Production' : 'Preview';
      this.deploy(sha, { environment, state: 'success', url: branch === this.defaultBranch ? this.autoDeploy.production : this.autoDeploy.preview });
    }
    this.persist();
  }

  /** Records a deployment, the way a hosting provider reports one to GitHub. */
  deploy(sha, { environment = 'Preview', state = 'success', url = 'https://preview.example.com' } = {}) {
    const id = this.deployments.length + 1;
    this.deployments.unshift({ id, sha, environment, created_at: new Date().toISOString(), statuses: [{ state, environment_url: url, target_url: url, description: `Deployment ${state}`, created_at: new Date().toISOString() }] });
    return id;
  }

  /* ----------------------------- persistence (the demo) ----------------------------- */

  persist() {
    if (!this.persistFile) return;
    const objects = [];
    for (const [sha, object] of this.objects) {
      if (object.type === 'blob' && !object.data) continue;
      objects.push([sha, object.type === 'blob' ? { type: 'blob', data: object.data.toString('base64') } : object.type === 'tree' ? { type: 'tree', entries: [...object.entries.values()] } : object]);
    }
    fs.writeFileSync(this.persistFile, JSON.stringify({ refs: [...this.refs], objects, deployments: this.deployments }));
  }

  restore(file) {
    this.persistFile = file;
    if (!fs.existsSync(file)) return false;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [sha, object] of saved.objects) {
      if (object.type === 'blob') this.objects.set(sha, { type: 'blob', data: Buffer.from(object.data, 'base64'), size: Buffer.from(object.data, 'base64').length });
      else if (object.type === 'tree') this.objects.set(sha, { type: 'tree', entries: new Map(object.entries.map((entry) => [entry.name, entry])) });
      else this.objects.set(sha, object);
    }
    this.refs = new Map(saved.refs);
    this.deployments = saved.deployments ?? [];
    return true;
  }

  /* --------------------------------------------- HTTP --------------------------------------------- */

  listen(port = 0) {
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: error.message }));
      });
    });
    // GitHub keeps connections open far longer than Node's five-second default.
    this.server.keepAliveTimeout = 65_000;
    return new Promise((resolve) => this.server.listen(port, '127.0.0.1', () => resolve(this.server.address().port)));
  }

  async close() {
    this.reader?.close();
    await new Promise((resolve) => (this.server ? this.server.close(resolve) : resolve()));
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://fake');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
    this.calls.push(`${req.method} ${url.pathname}`);
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600), ...headers });
      res.end(data === undefined ? '' : JSON.stringify(data));
    };
    if (req.headers.authorization !== `Bearer ${this.token}`) return send(401, { message: 'Bad credentials' });
    if (this.failNext && url.pathname.includes(this.failNext.match)) {
      const failure = this.failNext;
      this.failNext = null;
      return send(failure.status, { message: failure.message }, failure.headers);
    }

    if (req.method === 'POST' && url.pathname === '/graphql') {
      const out = {};
      for (const match of String(body.query).matchAll(/(\w+): object\(oid: "([0-9a-f]{40})"\)/g)) {
        const data = await this.blob(match[2]);
        out[match[1]] = data ? { text: isBinary(data) ? null : data.toString('utf8'), isBinary: isBinary(data) } : null;
      }
      return send(200, { data: { repository: out } });
    }

    const prefix = `/repos/${this.owner}/${this.name}`;
    if (!url.pathname.startsWith(prefix)) return send(404, { message: 'Not Found' });
    const path = url.pathname.slice(prefix.length);
    const commitJson = (sha) => {
      const c = this.commit(sha);
      return { sha, tree: { sha: c.tree }, parents: c.parents.map((parent) => ({ sha: parent })), message: c.message, author: c.author, committer: c.committer };
    };

    if (req.method === 'GET' && path === '') return send(200, { full_name: `${this.owner}/${this.name}`, default_branch: this.defaultBranch, private: this.isPrivate, html_url: `https://github.com/${this.owner}/${this.name}`, permissions: { push: true, admin: false, pull: true } });

    if (req.method === 'GET' && path === '/git/matching-refs/heads') {
      return send(200, [...this.refs].map(([branch, sha]) => ({ ref: `refs/heads/${branch}`, object: { sha, type: 'commit' } })));
    }
    let match;
    if (req.method === 'POST' && path === '/git/refs') {
      const branch = String(body.ref).replace(/^refs\/heads\//, '');
      if (this.refs.has(branch)) return send(422, { message: 'Reference already exists' });
      if (!this.commit(body.sha)) return send(422, { message: 'Object does not exist' });
      this.moveRef(branch, body.sha);
      return send(201, { ref: body.ref, object: { sha: body.sha, type: 'commit' } });
    }
    if ((match = /^\/git\/refs\/heads\/(.+)$/.exec(path)) && req.method === 'PATCH') {
      const branch = decodeURIComponent(match[1]);
      const current = this.refs.get(branch);
      if (!current) return send(422, { message: 'Reference does not exist' });
      if (!this.commit(body.sha)) return send(422, { message: 'Object does not exist' });
      if (!body.force && !this.isAncestor(current, body.sha)) return send(422, { message: 'Update is not a fast forward' });
      this.moveRef(branch, body.sha);
      return send(200, { ref: `refs/heads/${branch}`, object: { sha: body.sha, type: 'commit' } });
    }
    if ((match = /^\/git\/commits\/([0-9a-f]{40})$/.exec(path)) && req.method === 'GET') {
      return this.commit(match[1]) ? send(200, commitJson(match[1])) : send(404, { message: 'Not Found' });
    }
    if (req.method === 'POST' && path === '/git/commits') {
      if (!this.objects.has(body.tree) || !(body.parents ?? []).every((parent) => this.commit(parent))) return send(422, { message: 'Invalid tree or parent' });
      const sha = this.putCommit({ tree: body.tree, parents: body.parents ?? [], message: body.message, author: body.author ?? { name: 'Token owner', email: 'bot@example.com', date: new Date().toISOString() } });
      return send(201, commitJson(sha));
    }
    if ((match = /^\/git\/trees\/([0-9a-f]{40})$/.exec(path)) && req.method === 'GET') {
      if (this.objects.get(match[1])?.type !== 'tree') return send(404, { message: 'Not Found' });
      const files = this.flatten(match[1]);
      return send(200, { sha: match[1], tree: [...files].map(([file, entry]) => ({ path: file, mode: entry.mode, type: 'blob', sha: entry.sha, size: entry.size })), truncated: false });
    }
    if (req.method === 'POST' && path === '/git/trees') {
      const files = body.base_tree ? this.flatten(body.base_tree) : new Map();
      for (const entry of body.tree ?? []) {
        if (entry.sha === null) files.delete(entry.path);
        else if (typeof entry.content === 'string') files.set(entry.path, { mode: entry.mode, sha: this.putBlob(Buffer.from(entry.content, 'utf8')) });
        else {
          if (!this.objects.has(entry.sha)) return send(422, { message: `Object ${entry.sha} does not exist` });
          files.set(entry.path, { mode: entry.mode, sha: entry.sha });
        }
      }
      return send(201, { sha: this.build(files) });
    }
    if ((match = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(path)) && req.method === 'GET') {
      const data = await this.blob(match[1]);
      if (!data) return send(404, { message: 'Not Found' });
      if (/raw/.test(req.headers.accept ?? '')) {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(data.length) });
        return res.end(data);
      }
      return send(200, { sha: match[1], size: data.length, encoding: 'base64', content: data.toString('base64') });
    }
    if (req.method === 'POST' && path === '/git/blobs') {
      const data = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
      return send(201, { sha: this.putBlob(data) });
    }
    if ((match = /^\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/.exec(path)) && req.method === 'GET') {
      const [, base, head] = match;
      const mergeBase = this.mergeBase(base, head);
      const fromHead = this.ancestors(head);
      const fromBase = this.ancestors(base);
      const ahead = [...fromHead].filter((sha) => !fromBase.has(sha));
      const behind = [...fromBase].filter((sha) => !fromHead.has(sha));
      const before = this.flatten(this.commit(mergeBase).tree);
      const after = this.flatten(this.commit(head).tree);
      const files = [];
      for (const file of new Set([...before.keys(), ...after.keys()])) {
        const a = before.get(file);
        const b = after.get(file);
        if (a?.sha === b?.sha) continue;
        const entry = { filename: file, sha: b?.sha ?? null, status: !a ? 'added' : !b ? 'removed' : 'modified', additions: 0, deletions: 0 };
        const left = a ? await this.blob(a.sha) : Buffer.alloc(0);
        const right = b ? await this.blob(b.sha) : Buffer.alloc(0);
        if (!isBinary(left) && !isBinary(right) && left.length + right.length < 2_000_000) Object.assign(entry, unifiedPatch(left.toString('utf8'), right.toString('utf8')));
        files.push(entry);
      }
      const status = !ahead.length && !behind.length ? 'identical' : !behind.length ? 'ahead' : !ahead.length ? 'behind' : 'diverged';
      return send(200, { status, ahead_by: ahead.length, behind_by: behind.length, total_commits: ahead.length, merge_base_commit: { sha: mergeBase }, commits: ahead.map((sha) => ({ sha, commit: { message: this.commit(sha).message, author: this.commit(sha).author } })), files: files.sort((x, y) => (x.filename < y.filename ? -1 : 1)) });
    }
    if (req.method === 'POST' && path === '/merges') {
      const baseHead = this.refs.get(body.base);
      const headHead = this.refs.get(body.head) ?? (this.commit(body.head) ? body.head : null);
      if (!baseHead || !headHead) return send(404, { message: 'Branch not found' });
      if (this.isAncestor(headHead, baseHead)) return send(204);
      const mergeBase = this.mergeBase(baseHead, headHead);
      const m = this.flatten(this.commit(mergeBase).tree);
      const ours = this.flatten(this.commit(baseHead).tree);
      const theirs = this.flatten(this.commit(headHead).tree);
      const merged = new Map();
      for (const file of new Set([...m.keys(), ...ours.keys(), ...theirs.keys()])) {
        const [o, t, b] = [ours.get(file), theirs.get(file), m.get(file)];
        let pick;
        if (o?.sha === t?.sha) pick = o;
        else if (o?.sha === b?.sha) pick = t;
        else if (t?.sha === b?.sha) pick = o;
        else return send(409, { message: 'Merge conflict' });
        if (pick) merged.set(file, pick);
      }
      const sha = this.putCommit({ tree: this.build(merged), parents: [baseHead, headHead], message: body.commit_message ?? `Merge ${body.head} into ${body.base}`, author: { name: 'GitHub', email: 'noreply@github.com', date: new Date().toISOString() } });
      this.moveRef(body.base, sha);
      return send(201, commitJson(sha));
    }
    if (req.method === 'GET' && path === '/commits') {
      const start = this.refs.get(url.searchParams.get('sha')) ?? url.searchParams.get('sha');
      const file = url.searchParams.get('path');
      const limit = Number(url.searchParams.get('per_page') ?? 30);
      const out = [];
      const queue = [start];
      const seen = new Set();
      while (queue.length && out.length < limit) {
        const sha = queue.shift();
        if (!sha || seen.has(sha)) continue;
        seen.add(sha);
        const c = this.commit(sha);
        if (!c) continue;
        const parent = c.parents[0];
        const here = file ? this.flatten(c.tree).get(file)?.sha : 'x';
        const before = file ? (parent ? this.flatten(this.commit(parent).tree).get(file)?.sha : undefined) : 'y';
        if (!file || here !== before) out.push({ sha, commit: { message: c.message, author: c.author, committer: c.committer }, parents: c.parents.map((p) => ({ sha: p })) });
        queue.push(...c.parents);
      }
      return send(200, out);
    }
    if ((match = /^\/commits\/([0-9a-f]{40})\/status$/.exec(path)) && req.method === 'GET') return send(200, { state: 'pending', statuses: [] });
    if (req.method === 'GET' && path === '/deployments') {
      const sha = url.searchParams.get('sha');
      return send(200, this.deployments.filter((item) => !sha || item.sha === sha).map(({ id, sha: commit, environment, created_at }) => ({ id, sha: commit, environment, created_at })));
    }
    if ((match = /^\/deployments\/(\d+)\/statuses$/.exec(path)) && req.method === 'GET') {
      return send(200, this.deployments.find((item) => item.id === Number(match[1]))?.statuses ?? []);
    }
    return send(404, { message: `Not Found: ${req.method} ${path}` });
  }
}
