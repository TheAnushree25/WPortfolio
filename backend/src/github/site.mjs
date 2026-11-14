import { HttpError, isManaged } from '../shared.mjs';

/**
 * The site's repository as the admin sees it: two branches.
 *
 *  - The live branch (usually main), which the hosting provider builds and
 *    serves to visitors.
 *  - The drafts branch (admin-drafts), where every save made in the admin
 *    lands as a commit. The provider builds it as a preview. Publishing puts
 *    everything waiting there onto the live branch as one commit, and the
 *    drafts start again from it.
 *
 * When someone pushes code to the live branch, the drafts take it in (a merge)
 * before the next save or publish, so nothing anyone did is lost. All writes
 * to the drafts go through one lock in the database, so two people saving at
 * once, even on different serverless instances, never overwrite each other;
 * a branch that moved underneath a save makes it start again from the newer
 * head, with every check re-run.
 *
 * With GITHUB_DRAFT_BRANCH equal to the live branch, saves go live at once.
 */

const SNAPSHOT_TTL = 4_000;

export class SiteRepo {
  constructor({ github, db, liveBranch = '', draftBranch = 'admin-drafts' }) {
    this.github = github;
    this.db = db;
    this.liveName = liveBranch;
    this.draftName = draftBranch;
    this.cachedHeads = null;
    this.texts = new Map();
  }

  async names() {
    if (!this.liveName) this.liveName = (await this.github.repository()).default_branch || 'main';
    return { live: this.liveName, draft: this.draftName || this.liveName };
  }

  async direct() {
    const { live, draft } = await this.names();
    return live === draft;
  }

  async heads({ fresh = false } = {}) {
    if (!fresh && this.cachedHeads && Date.now() - this.cachedHeads.at < SNAPSHOT_TTL) return this.cachedHeads.value;
    const { live, draft } = await this.names();
    const all = await this.github.branchHeads();
    if (!all[live]) throw new HttpError(502, 'github_branch', `${this.github.repo} has no “${live}” branch. Set GITHUB_BRANCH to the branch the site is built from.`);
    const value = { live: all[live], draft: live === draft ? all[live] : (all[draft] ?? null) };
    this.cachedHeads = { at: Date.now(), value };
    return value;
  }

  forget() {
    this.cachedHeads = null;
  }

  /** A commit's files: path → { sha, size, mode }. */
  async snapshot(sha, { draft = false } = {}) {
    const commit = await this.github.commit(sha);
    const tree = await this.github.tree(commit.tree.sha);
    const files = new Map();
    for (const entry of tree.tree) if (entry.type === 'blob') files.set(entry.path, { sha: entry.sha, size: entry.size ?? 0, mode: entry.mode });
    return { sha, treeSha: commit.tree.sha, commit, files, draft };
  }

  /** The site as the admin shows it: the drafts when edits are waiting, otherwise the live branch. */
  async view() {
    const heads = await this.heads();
    if (heads.draft && heads.draft !== heads.live) {
      const comparison = await this.github.compare(heads.live, heads.draft);
      if (comparison.ahead_by > 0) {
        // Newer code on the live branch is brought into the drafts first, so what's shown is what would go live.
        const sha = comparison.behind_by > 0 ? await this.db.withLock('drafts', async () => this.#ensureDrafts(await this.heads({ fresh: true }))) : heads.draft;
        return this.snapshot(sha, { draft: true });
      }
    }
    return this.snapshot(heads.live);
  }

  async live() {
    return this.snapshot((await this.heads()).live);
  }

  /* ------------------------------------ Reading files ------------------------------------ */

  /** A text file's contents by blob SHA: from memory, the database's copy, or GitHub. */
  async text(sha) {
    if (this.texts.has(sha)) return this.texts.get(sha);
    const row = await this.db.one('SELECT text FROM blob_text WHERE sha = $1', [sha]);
    const text = row ? row.text : (await this.github.blob(sha)).toString('utf8');
    if (!row) await this.remember(sha, text);
    this.#keep(sha, text);
    return text;
  }

  /** Many text files at once (a few GraphQL requests instead of one request per file). */
  async manyTexts(shas) {
    const out = new Map();
    const missing = [];
    for (const sha of new Set(shas)) {
      if (this.texts.has(sha)) out.set(sha, this.texts.get(sha));
      else missing.push(sha);
    }
    if (missing.length) {
      const rows = await this.db.query('SELECT sha, text FROM blob_text WHERE sha = ANY($1)', [missing]);
      for (const row of rows) {
        out.set(row.sha, row.text);
        this.#keep(row.sha, row.text);
      }
    }
    const still = missing.filter((sha) => !out.has(sha));
    if (still.length) {
      let fetched;
      try {
        fetched = await this.github.texts(still);
      } catch (error) {
        if (error.code === 'github_rate') throw error;
        fetched = new Map();
        for (const sha of still) fetched.set(sha, (await this.github.blob(sha)).toString('utf8'));
      }
      for (const [sha, text] of fetched) {
        if (text === null) continue;
        out.set(sha, text);
        this.#keep(sha, text);
        await this.remember(sha, text);
      }
    }
    return out;
  }

  async remember(sha, text) {
    if (text.length > 2_000_000) return;
    await this.db.query('INSERT INTO blob_text (sha, text) VALUES ($1, $2) ON CONFLICT (sha) DO NOTHING', [sha, text]);
  }

  #keep(sha, text) {
    this.texts.set(sha, text);
    if (this.texts.size > 400) this.texts.delete(this.texts.keys().next().value);
  }

  async fileText(path, snapshot) {
    const entry = snapshot.files.get(path);
    return entry ? this.text(entry.sha) : null;
  }

  /* --------------------------------------- Writing --------------------------------------- */

  /** Makes sure the drafts exist and contain everything on the live branch; returns their head. Call inside the lock. */
  async #ensureDrafts(heads) {
    const { live, draft } = await this.names();
    if (live === draft) return heads.live;
    if (!heads.draft) {
      await this.github.createBranch(draft, heads.live);
      this.forget();
      return heads.live;
    }
    if (heads.draft === heads.live) return heads.draft;
    const comparison = await this.github.compare(heads.live, heads.draft);
    if (comparison.behind_by === 0) return heads.draft;
    if (comparison.ahead_by === 0) {
      await this.github.updateBranch(draft, heads.live, false);
      this.forget();
      return heads.live;
    }
    const merged = await this.github.merge(draft, live, `Bring the live site’s latest changes into the admin’s drafts`);
    this.forget();
    return merged?.sha ?? heads.draft;
  }

  /**
   * Commits to the drafts (or straight to the live branch in direct mode).
   * `build(snapshot)` works out { files, message } against the newest drafts:
   * files are { path, text } | { path, content: Buffer } | { path, sha, mode }
   * | { path, remove: true }. If a branch moves underneath, build runs again.
   */
  async commit(build, { author }) {
    return this.db.withLock('drafts', async () => {
      const { live, draft } = await this.names();
      for (let attempt = 0; attempt < 4; attempt++) {
        const heads = await this.heads({ fresh: true });
        const base = await this.#ensureDrafts(heads);
        const snapshot = await this.snapshot(base, { draft: live !== draft });
        const plan = await build(snapshot);
        const entries = [];
        for (const file of plan?.files ?? []) {
          const existing = snapshot.files.get(file.path);
          const mode = file.mode ?? existing?.mode ?? '100644';
          if (file.remove) {
            if (existing) entries.push({ path: file.path, mode, type: 'blob', sha: null });
          } else if (file.sha) {
            if (existing?.sha !== file.sha) entries.push({ path: file.path, mode, type: 'blob', sha: file.sha });
          } else if (file.content) {
            entries.push({ path: file.path, mode, type: 'blob', sha: await this.github.createBlob(file.content) });
          } else {
            entries.push({ path: file.path, mode, type: 'blob', content: file.text });
          }
        }
        if (!entries.length) return { sha: base, files: [], snapshot, unchanged: true, result: plan?.result };
        const tree = await this.github.createTree(snapshot.treeSha, entries);
        if (tree === snapshot.treeSha) return { sha: base, files: [], snapshot, unchanged: true, result: plan?.result };
        const sha = await this.github.createCommit({ message: plan.message, tree, parents: [base], author });
        const moved = await this.github.updateBranch(live === draft ? live : draft, sha, false);
        this.forget();
        if (moved) return { sha, files: entries.map((entry) => entry.path), snapshot: await this.snapshot(sha, { draft: live !== draft }), result: plan?.result };
      }
      throw new HttpError(409, 'busy', 'Several changes were being saved at the same moment. Try again.');
    });
  }

  /** The admin's edits not yet live: the drafts compared with the live branch. */
  async pending() {
    const heads = await this.heads();
    if ((await this.direct()) || !heads.draft || heads.draft === heads.live) return { files: [], heads, ahead: 0, behind: 0 };
    const comparison = await this.github.compare(heads.live, heads.draft);
    return { files: comparison.ahead_by ? (comparison.files ?? []) : [], heads, ahead: comparison.ahead_by, behind: comparison.behind_by };
  }

  /** Puts one file back as it is on the live branch, or removes it if it's new there. Returns the drafts' entry it replaced. */
  async discard(path, { author }) {
    const live = await this.live();
    return this.commit(async (snapshot) => {
      const current = snapshot.files.get(path);
      if (!current && !live.files.has(path)) throw new HttpError(404, 'not_found', 'That file has no changes.');
      const original = live.files.get(path);
      return {
        files: [original ? { path, sha: original.sha, mode: original.mode } : { path, remove: true }],
        message: `Discard the admin’s change to ${path}`,
        result: { previous: current ?? null, existsLive: Boolean(original) },
      };
    }, { author });
  }

  /**
   * Publishes the drafts: one commit on the live branch carrying the drafts'
   * files exactly, then the drafts begin again from it. Nothing can save to the
   * drafts meanwhile (the lock).
   */
  async publish({ message, author }) {
    return this.db.withLock('drafts', async () => {
      const { live, draft } = await this.names();
      if (live === draft) throw new HttpError(400, 'direct', 'Every save is already live: there are no drafts to publish.');
      const heads = await this.heads({ fresh: true });
      if (!heads.draft || heads.draft === heads.live) throw new HttpError(400, 'nothing', 'There’s nothing waiting to go live.');
      const draftHead = await this.#ensureDrafts(heads);
      const [draftCommit, liveCommit] = await Promise.all([this.github.commit(draftHead), this.github.commit(heads.live)]);
      if (draftCommit.tree.sha === liveCommit.tree.sha) {
        await this.github.updateBranch(draft, heads.live, true);
        this.forget();
        throw new HttpError(400, 'nothing', 'The drafts match the live site; there’s nothing to publish.');
      }
      const comparison = await this.github.compare(heads.live, draftHead);
      const sha = await this.github.createCommit({ message, tree: draftCommit.tree.sha, parents: [heads.live], author });
      if (!(await this.github.updateBranch(live, sha, false))) throw new HttpError(409, 'live_moved', 'Someone pushed to the live branch while this was publishing. Try again: their change will be included.');
      await this.github.updateBranch(draft, sha, true);
      this.forget();
      return { sha, files: (comparison.files ?? []).map((file) => file.filename) };
    });
  }

  /** Recent commits on a branch, optionally only those touching `path`. */
  async history({ branch = 'live', path = '', limit = 30 } = {}) {
    const heads = await this.heads();
    const sha = branch === 'draft' ? (heads.draft ?? heads.live) : heads.live;
    const list = await this.github.commitsFor({ sha, path, perPage: limit });
    return list.map((item) => ({
      hash: item.sha,
      short: item.sha.slice(0, 7),
      author: item.commit?.author?.name ?? item.author?.login ?? '',
      at: item.commit?.author?.date ?? item.commit?.committer?.date ?? null,
      subject: String(item.commit?.message ?? '').split('\n')[0],
      parent: item.parents?.[0]?.sha ?? null,
    }));
  }
}

/** Files the admin manages (content and media), as the local admin counts them. */
export const managedFile = (path) => isManaged(path);
