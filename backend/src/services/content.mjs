import { FILES, HttpError, SECTIONS, listSections, parseModule, planSave, readContent, sectionOf, valuesOf } from '../shared.mjs';

/**
 * The site's words and projects, read from and saved to GitHub. Reading,
 * checking and rewriting are the admin's own (the same parser, rules and
 * smallest-possible edits), only the files come from a commit instead of the
 * disk, and a save becomes one commit on the drafts carrying every file it
 * changed. Git's history is the backup: any earlier version of a file can be
 * brought back.
 */

export class HostedContent {
  constructor({ repo }) {
    this.repo = repo;
    this.parsed = new Map();
  }

  /** A content file at a snapshot, parsed (kept by blob SHA: a file that hasn't changed is never parsed twice). */
  async read(fileKey, snapshot) {
    const { path } = FILES[fileKey];
    const entry = snapshot.files.get(path);
    if (!entry) throw new HttpError(503, 'site_missing', `The site’s ${path} isn’t on GitHub (${this.repo.github.repo}).`);
    const key = `${fileKey}:${entry.sha}`;
    if (this.parsed.has(key)) return this.parsed.get(key);
    const read = readContent(fileKey, await this.repo.text(entry.sha));
    this.parsed.set(key, read);
    if (this.parsed.size > 24) this.parsed.delete(this.parsed.keys().next().value);
    return read;
  }

  async section(id, snapshot = null) {
    const meta = SECTIONS[id];
    if (!meta) throw new HttpError(404, 'not_found', 'There’s no such section.');
    return sectionOf(id, await this.read(meta.file, snapshot ?? (await this.repo.view())));
  }

  async values(ids, snapshot = null) {
    const at = snapshot ?? (await this.repo.view());
    return valuesOf(ids, (fileKey) => this.read(fileKey, at));
  }

  list() {
    return listSections();
  }

  /**
   * Saves sections, all or nothing, as one commit on the drafts.
   * `rulesContext(snapshot)` says what the rules check against at that commit.
   */
  async save(changes, { rulesContext, author, message }) {
    const outcome = await this.repo.commit(async (snapshot) => {
      const writes = await planSave(changes, { read: (fileKey) => this.read(fileKey, snapshot), rulesContext: () => rulesContext(snapshot) });
      return { files: writes.map((write) => ({ path: write.path, text: write.after })), message };
    }, { author });
    const saved = [];
    for (const change of changes) saved.push(await this.section(change.id, outcome.snapshot));
    return { saved, files: outcome.files, sha: outcome.sha };
  }

  /**
   * Earlier versions of each content file, as the admin's backup list shows
   * them: one entry per commit that changed the file, standing for the file
   * as it was just before that change (`name` is the commit before it).
   */
  async backups() {
    const out = [];
    for (const [key, file] of Object.entries(FILES)) {
      const commits = await this.repo.history({ branch: 'draft', path: file.path, limit: 25 });
      for (const commit of commits) {
        if (!commit.parent) continue;
        out.push({ file: key, path: file.path, name: commit.parent, at: commit.at, actor: commit.author, subject: commit.subject });
      }
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  async restoreBackup(fileKey, name, { author }) {
    const file = FILES[fileKey];
    if (!file || !/^[0-9a-f]{40}$/.test(String(name))) throw new HttpError(404, 'not_found', 'No such backup.');
    const then = await this.repo.snapshot(name);
    const text = await this.repo.fileText(file.path, then);
    if (text === null) throw new HttpError(404, 'not_found', `${file.path} didn’t exist at that point.`);
    parseModule(text.replace(/\r\n/g, '\n'), { only: file.only });
    const date = new Date(then.commit.author?.date ?? then.commit.committer?.date ?? Date.now()).toISOString().slice(0, 10);
    await this.repo.commit(async () => ({ files: [{ path: file.path, text }], message: `Restore ${file.path} to its version of ${date}, from the admin` }), { author });
    return { path: file.path };
  }
}
