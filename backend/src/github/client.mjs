import { HttpError } from '../shared.mjs';

/**
 * The small part of GitHub's REST and GraphQL APIs the backend needs to read
 * and write the site's repository: branches, commits, trees and blobs (the
 * Git Data API, which writes several files as one commit), comparisons,
 * merges, history, and the deployment status the hosting provider reports.
 *
 * Git objects never change, so commits, trees and comparisons are kept in
 * memory by SHA. Every failure comes back as an HttpError that says, in
 * plain words, what to fix (an expired token, missing permissions, the
 * hourly limit).
 */

class Lru {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }
}

const shorten = (path) => path.replace(/\?.*$/, '').replace(/\/[0-9a-f]{40}/g, '/…');

export class GitHub {
  constructor({ token, api = 'https://api.github.com', graphql = 'https://api.github.com/graphql', owner, name, fetch: fetcher = globalThis.fetch, userAgent = 'atlas-studios-admin' }) {
    this.token = token;
    this.api = api.replace(/\/+$/, '');
    this.graphqlUrl = graphql;
    this.owner = owner;
    this.name = name;
    this.repo = `${owner}/${name}`;
    this.fetch = fetcher;
    this.userAgent = userAgent;
    this.rate = null;
    this.commits = new Lru(400);
    this.trees = new Lru(24);
    this.compares = new Lru(64);
    this.repoInfo = null;
  }

  get base() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.name)}`;
  }

  headers(accept = 'application/vnd.github+json', json = false) {
    return {
      authorization: `Bearer ${this.token}`,
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': this.userAgent,
      ...(json ? { 'content-type': 'application/json' } : {}),
    };
  }

  /**
   * One request, tried again (twice, briefly) when the connection itself
   * fails: a reused connection closing underneath, a network blip. Every call
   * here is safe to repeat (Git objects are addressed by content, a branch
   * moved to where it already is stays put, a merge already made answers
   * "nothing to merge"); answers from GitHub, errors included, are never retried.
   */
  async send(method, path, { body, accept, timeout = 30_000 } = {}) {
    const url = path.startsWith('http') ? path : `${this.api}${path}`;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.fetch(url, { method, headers: this.headers(accept, body !== undefined), body: payload, signal: AbortSignal.timeout(timeout) });
        break;
      } catch (error) {
        if (attempt >= 2 || error?.name === 'TimeoutError') throw new HttpError(502, 'github_unreachable', 'GitHub couldn’t be reached. Try again in a moment.');
        await new Promise((resolve) => setTimeout(resolve, 250 * 3 ** attempt));
      }
    }
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining !== null) this.rate = { remaining: Number(remaining), limit: Number(response.headers.get('x-ratelimit-limit')), reset: Number(response.headers.get('x-ratelimit-reset')) * 1000 };
    return response;
  }

  async failure(response, method, path) {
    const body = await response.json().catch(() => ({}));
    const message = String(body.message ?? '').slice(0, 300);
    if (response.status === 401) return new HttpError(502, 'github_token', 'GitHub turned the backend’s token down: it has expired or been revoked. Create a new one and set GITHUB_TOKEN.');
    if ((response.status === 403 || response.status === 429) && (response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(message))) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const wait = Math.max(60, Math.round((reset - Date.now()) / 1000) || 600);
      return new HttpError(503, 'github_rate', `GitHub’s hourly allowance for the backend’s token is used up. It renews in about ${Math.ceil(wait / 60)} minutes.`, { retryAfter: wait });
    }
    if (response.status === 403) return new HttpError(502, 'github_forbidden', `The backend’s token isn’t allowed to do that on ${this.repo} (${message || 'forbidden'}). It needs read and write access to the repository’s contents.`);
    if (response.status === 404 && path === this.base) return new HttpError(502, 'github_repo', `GitHub can’t find ${this.repo}, or the backend’s token can’t see it.`);
    return new HttpError(502, 'github', `GitHub answered ${response.status} to ${method} ${shorten(path)}${message ? `: ${message}` : ''}.`);
  }

  async json(method, path, { body, expect = [200], allow = [] } = {}) {
    const response = await this.send(method, path, { body });
    if (allow.includes(response.status)) return { status: response.status, body: await response.json().catch(() => ({})) };
    if (!expect.includes(response.status)) throw await this.failure(response, method, path);
    if (response.status === 204) return null;
    return response.json();
  }

  /* --------------------------------- The repository --------------------------------- */

  async repository({ fresh = false } = {}) {
    if (!fresh && this.repoInfo && Date.now() - this.repoInfo.at < 600_000) return this.repoInfo.value;
    const value = await this.json('GET', this.base);
    this.repoInfo = { at: Date.now(), value };
    return value;
  }

  /** Every branch's head commit, as { branch: sha }. */
  async branchHeads() {
    const out = {};
    for (let page = 1; page <= 5; page++) {
      const list = await this.json('GET', `${this.base}/git/matching-refs/heads?per_page=100&page=${page}`);
      for (const ref of list) if (ref.object?.type === 'commit') out[ref.ref.replace(/^refs\/heads\//, '')] = ref.object.sha;
      if (list.length < 100) break;
    }
    return out;
  }

  async createBranch(branch, sha) {
    const result = await this.json('POST', `${this.base}/git/refs`, { body: { ref: `refs/heads/${branch}`, sha }, expect: [201], allow: [422] });
    if (result?.status === 422 && !/already exists/i.test(result.body.message ?? '')) throw new HttpError(502, 'github', `GitHub wouldn’t create the ${branch} branch: ${result.body.message}`);
  }

  /** Moves a branch. Without `force` it only moves forward; returns false when it couldn't (someone else moved it first). */
  async updateBranch(branch, sha, force = false) {
    const result = await this.json('PATCH', `${this.base}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, { body: { sha, force }, allow: [409, 422] });
    if (result?.status === 422 || result?.status === 409) {
      const message = result.body.message ?? '';
      if (/protected branch/i.test(message)) throw new HttpError(409, 'github_protected', `${branch} is a protected branch on GitHub, so the backend can’t publish to it directly. Let the token bypass its rules, or turn off “Require a pull request” for it.`);
      if (/fast.?forward|is at .* but expected|not a fast/i.test(message) || !force) return false;
      throw new HttpError(502, 'github', `GitHub wouldn’t move ${branch}: ${message}`);
    }
    return true;
  }

  async commit(sha) {
    return this.commits.get(sha) ?? this.commits.set(sha, await this.json('GET', `${this.base}/git/commits/${sha}`));
  }

  /** A commit's whole tree, every file at once. */
  async tree(sha) {
    const cached = this.trees.get(sha);
    if (cached) return cached;
    const tree = await this.json('GET', `${this.base}/git/trees/${sha}?recursive=1`);
    if (tree.truncated) throw new HttpError(502, 'github_tree', 'The repository has too many files for GitHub to list at once.');
    return this.trees.set(sha, tree);
  }

  async blob(sha) {
    const response = await this.blobResponse(sha);
    return Buffer.from(await response.arrayBuffer());
  }

  /** A blob's raw bytes as a streaming response. */
  async blobResponse(sha) {
    const response = await this.send('GET', `${this.base}/git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json', timeout: 120_000 });
    if (!response.ok) throw await this.failure(response, 'GET', `${this.base}/git/blobs/${sha}`);
    return response;
  }

  async createBlob(buffer) {
    const result = await this.json('POST', `${this.base}/git/blobs`, { body: { content: Buffer.from(buffer).toString('base64'), encoding: 'base64' }, expect: [201] });
    return result.sha;
  }

  async createTree(baseTree, entries) {
    return (await this.json('POST', `${this.base}/git/trees`, { body: { base_tree: baseTree, tree: entries }, expect: [201] })).sha;
  }

  async createCommit({ message, tree, parents, author }) {
    const body = { message, tree, parents };
    if (author?.email) body.author = { name: author.name, email: author.email, date: new Date().toISOString() };
    const commit = await this.json('POST', `${this.base}/git/commits`, { body, expect: [201] });
    this.commits.set(commit.sha, commit);
    return commit.sha;
  }

  /** How `head` differs from `base` since they parted: ahead_by, behind_by and the changed files with their patches. */
  async compare(base, head) {
    const key = `${base}...${head}`;
    return this.compares.get(key) ?? this.compares.set(key, await this.json('GET', `${this.base}/compare/${base}...${head}?per_page=100`));
  }

  /** Merges `head` into `base`. Returns the merge commit, null when there was nothing to merge; a clash is an HttpError. */
  async merge(base, head, message) {
    const result = await this.json('POST', `${this.base}/merges`, { body: { base, head, commit_message: message }, expect: [201, 204], allow: [409] });
    if (result?.status === 409) throw new HttpError(409, 'drafts_conflict', 'The live site’s code changed on GitHub in the same places as edits waiting here, so they can’t be combined automatically. Discard those edits on the publish page, or publish them first.');
    return result;
  }

  async commitsFor({ sha, path, perPage = 30 }) {
    const query = new URLSearchParams({ sha, per_page: String(perPage) });
    if (path) query.set('path', path);
    return this.json('GET', `${this.base}/commits?${query}`);
  }

  /**
   * Where a commit is deployed, as the hosting provider reports it to GitHub
   * (Vercel and Cloudflare both do): { state, url, environment, description, at }.
   * Tokens without permission to read deployments get { state: 'unknown' }.
   */
  async deployment(sha) {
    const outcome = { state: 'unknown', url: '', environment: '', description: '', at: null };
    try {
      const deployments = await this.json('GET', `${this.base}/deployments?sha=${sha}&per_page=10`, { allow: [403, 404] });
      const list = Array.isArray(deployments) ? deployments : [];
      for (const deployment of list) {
        const statuses = await this.json('GET', `${this.base}/deployments/${deployment.id}/statuses?per_page=1`, { allow: [403, 404] });
        const latest = Array.isArray(statuses) ? statuses[0] : null;
        if (!latest || latest.state === 'inactive') continue;
        const state = { success: 'success', failure: 'failure', error: 'failure', in_progress: 'pending', queued: 'pending', pending: 'pending' }[latest.state] ?? 'unknown';
        return { state, url: latest.environment_url || latest.target_url || '', environment: deployment.environment ?? '', description: latest.description ?? '', at: latest.created_at ?? deployment.created_at };
      }
      const combined = await this.json('GET', `${this.base}/commits/${sha}/status`, { allow: [403, 404] });
      const status = combined?.statuses?.[0];
      if (status) return { state: { success: 'success', pending: 'pending', failure: 'failure', error: 'failure' }[status.state] ?? 'unknown', url: status.target_url ?? '', environment: status.context ?? '', description: status.description ?? '', at: status.updated_at };
    } catch (error) {
      if (error.code === 'github_rate') throw error;
    }
    return outcome;
  }

  /** Many blobs' text in one or two GraphQL requests: sha → text (null for binary files). */
  async texts(shas) {
    const out = new Map();
    for (let at = 0; at < shas.length; at += 60) {
      const batch = shas.slice(at, at + 60);
      const fields = batch.map((sha, index) => `b${index}: object(oid: "${sha}") { ... on Blob { text isBinary } }`).join('\n');
      const query = `query { repository(owner: ${JSON.stringify(this.owner)}, name: ${JSON.stringify(this.name)}) { ${fields} } }`;
      const response = await this.send('POST', this.graphqlUrl, { body: { query } });
      if (!response.ok) throw await this.failure(response, 'POST', '/graphql');
      const body = await response.json();
      if (!body.data?.repository) throw new HttpError(502, 'github', `GitHub’s GraphQL API wouldn’t read the files${body.errors?.[0]?.message ? `: ${body.errors[0].message}` : ''}.`);
      batch.forEach((sha, index) => {
        const blob = body.data.repository[`b${index}`];
        out.set(sha, blob && !blob.isBinary && typeof blob.text === 'string' ? blob.text : null);
      });
    }
    return out;
  }
}
