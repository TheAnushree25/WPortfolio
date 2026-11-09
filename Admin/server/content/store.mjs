import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../http.mjs';
import { computedPaths, ContentError, literalValue, parseModule } from './parse.mjs';
import { evaluateModule } from './evaluate.mjs';
import { clean, equal, rewriteSource } from './rewrite.mjs';
import { checkSection, FILES, SECTIONS } from './sections.mjs';

/**
 * Reads and writes the site's content, section by section.
 *
 * A section's version is a hash of its value, so two people editing
 * different sections of the same file never collide, and a stale form is
 * turned away instead of quietly undoing someone's change. Every write is
 * checked three ways before it lands: the section's rules, a re-read of the
 * rewritten file (it must parse and hold exactly the value asked for), and
 * the old file is kept in Admin/data/backups first.
 */

const versionOf = (value) => crypto.createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 12);
const KEEP_BACKUPS = 40;

export class ContentStore {
  constructor({ siteRoot, dataDir }) {
    this.siteRoot = siteRoot;
    this.backupDir = path.join(dataDir, 'backups');
    this.queue = Promise.resolve();
  }

  abs(fileKey) {
    return path.join(this.siteRoot, FILES[fileKey].path);
  }

  async readFile(fileKey) {
    const file = FILES[fileKey];
    let src;
    try {
      src = await fsp.readFile(this.abs(fileKey), 'utf8');
    } catch (error) {
      throw new HttpError(503, 'site_missing', `The site file ${file.path} can’t be read (${error.code ?? error.message}). Is SITE_ROOT right?`);
    }
    const text = src.replace(/\r\n/g, '\n');
    const mod = parseModule(text, { only: file.only });
    const values = file.only ? null : evaluateModule(text, mod);
    const valueOf = (name) => {
      const decl = mod.decls.get(name);
      if (!decl?.init) return undefined;
      return values && name in values ? values[name] : clean(literalValue(decl.init, mod));
    };
    return { src, mod, values, valueOf };
  }

  async section(id) {
    const meta = SECTIONS[id];
    if (!meta) throw new HttpError(404, 'not_found', 'There’s no such section.');
    const { mod, valueOf } = await this.readFile(meta.file);
    const decl = mod.decls.get(meta.name);
    if (!decl?.init) throw new HttpError(503, 'site_changed', `${FILES[meta.file].path} no longer has “${meta.name}”.`);
    const value = valueOf(meta.name);
    return {
      id,
      ...meta,
      path: FILES[meta.file].path,
      value,
      computed: computedPaths(decl.init, mod),
      version: versionOf(value),
    };
  }

  async values(ids) {
    const out = {};
    const files = new Map();
    for (const id of ids) {
      const meta = SECTIONS[id];
      if (!files.has(meta.file)) files.set(meta.file, await this.readFile(meta.file));
      out[id] = files.get(meta.file).valueOf(meta.name);
    }
    return out;
  }

  list() {
    return Object.entries(SECTIONS).map(([id, meta]) => ({ id, ...meta, path: FILES[meta.file].path }));
  }

  /**
   * Saves several sections at once, all or nothing.
   * `changes`: [{ id, value, version }]; `ctx` supplies what the rules check against.
   */
  save(changes, { rulesContext, actor = 'admin' }) {
    const run = () => this.#save(changes, rulesContext, actor);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  async #save(changes, rulesContext, actor) {
    if (!Array.isArray(changes) || !changes.length) throw new HttpError(400, 'invalid', 'Nothing to save.');
    const byFile = new Map();
    for (const change of changes) {
      const meta = SECTIONS[change?.id];
      if (!meta) throw new HttpError(404, 'not_found', `There’s no section “${change?.id}”.`);
      if (!byFile.has(meta.file)) byFile.set(meta.file, []);
      byFile.get(meta.file).push({ ...change, meta });
    }

    // Rules see the batch as it will be: a card and its case study can arrive together.
    const ctx = await rulesContext();
    for (const change of changes) {
      if (change.id === 'works') ctx.cardSlugs = (clean(change.value).projects ?? []).map((card) => card.slug);
      if (change.id === 'systems') ctx.systemSlugs = Object.keys(clean(change.value));
    }
    const writes = [];
    for (const [fileKey, list] of byFile) {
      const file = FILES[fileKey];
      const current = await this.readFile(fileKey);
      let source = current.src;
      for (const change of list) {
        const before = current.valueOf(change.meta.name);
        if (change.version && change.version !== versionOf(before)) {
          throw new HttpError(409, 'conflict', `“${change.meta.label}” was changed somewhere else since you opened it. Reload to see the latest, then make your change again.`, { id: change.id });
        }
        const next = clean(change.value);
        const problems = checkSection(change.id, next, ctx, before);
        if (problems.length) throw new HttpError(422, 'rules', problems[0].message, { id: change.id, problems });
        try {
          source = rewriteSource(source, change.meta.name, change.value, { only: file.only }).source;
        } catch (error) {
          if (error instanceof ContentError) throw new HttpError(422, error.code, error.message, { id: change.id, ...error.details });
          throw error;
        }
      }
      if (source === current.src) continue;

      // Read the result back: it must parse and hold exactly what was asked for.
      const text = source.replace(/\r\n/g, '\n');
      let reread;
      try {
        const mod = parseModule(text, { only: file.only });
        const values = file.only ? null : evaluateModule(text, mod);
        reread = (name) => (values && name in values ? values[name] : clean(literalValue(mod.decls.get(name)?.init, mod)));
      } catch (error) {
        throw new HttpError(500, 'verify', `The rewritten ${file.path} didn’t read back (${error.message}); nothing was written.`);
      }
      for (const change of list) {
        if (!equal(reread(change.meta.name), clean(change.value))) {
          throw new HttpError(500, 'verify', `The rewritten “${change.meta.label}” didn’t read back as saved; nothing was written.`);
        }
      }
      writes.push({ fileKey, abs: this.abs(fileKey), before: current.src, after: source });
    }

    const done = [];
    try {
      for (const write of writes) {
        await this.#backup(write.fileKey, write.before, actor);
        await atomicWrite(write.abs, write.after);
        done.push(write);
      }
    } catch (error) {
      for (const write of done) await atomicWrite(write.abs, write.before).catch(() => {});
      throw new HttpError(500, 'write_failed', `The site files couldn’t be written (${error.code ?? error.message}); nothing was changed.`);
    }

    const saved = [];
    for (const change of changes) saved.push(await this.section(change.id));
    return { saved, files: writes.map((write) => FILES[write.fileKey].path) };
  }

  async #backup(fileKey, text, actor) {
    const dir = path.join(this.backupDir, path.basename(FILES[fileKey].path));
    await fsp.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeActor = String(actor).replace(/[^a-z0-9]+/gi, '-').slice(0, 24) || 'admin';
    await fsp.writeFile(path.join(dir, `${stamp}__${safeActor}${path.extname(FILES[fileKey].path)}`), text);
    const all = (await fsp.readdir(dir)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await fsp.unlink(path.join(dir, old)).catch(() => {});
  }

  async backups() {
    const out = [];
    for (const [key, file] of Object.entries(FILES)) {
      const dir = path.join(this.backupDir, path.basename(file.path));
      if (!fs.existsSync(dir)) continue;
      for (const name of (await fsp.readdir(dir)).sort().reverse()) {
        const [stamp, actor] = name.replace(/\.[a-z]+$/, '').split('__');
        const at = stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z');
        out.push({ file: key, path: file.path, name, at, actor: actor ?? '' });
      }
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  async restoreBackup(fileKey, name, actor) {
    const file = FILES[fileKey];
    if (!file || !/^[\w.-]+$/.test(name)) throw new HttpError(404, 'not_found', 'No such backup.');
    const backup = path.join(this.backupDir, path.basename(file.path), name);
    let text;
    try {
      text = await fsp.readFile(backup, 'utf8');
    } catch {
      throw new HttpError(404, 'not_found', 'That backup is gone.');
    }
    parseModule(text.replace(/\r\n/g, '\n'), { only: file.only });
    const current = await fsp.readFile(this.abs(fileKey), 'utf8');
    await this.#backup(fileKey, current, actor);
    await atomicWrite(this.abs(fileKey), text);
    return { path: file.path };
  }
}

async function atomicWrite(file, text) {
  const temp = `${file}.atlas-admin.tmp`;
  await fsp.writeFile(temp, text);
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(temp, file);
      return;
    } catch (error) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
        await fsp.unlink(temp).catch(() => {});
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
}
