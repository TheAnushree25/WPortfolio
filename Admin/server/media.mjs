import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError, within } from './http.mjs';

/**
 * The site's public folder as a media library: every picture, video and
 * document with its size and dimensions, where the site uses it, and safe
 * uploads and removals. Dimensions are read from the files' own headers
 * (PNG, JPEG, WebP, GIF, SVG), so nothing needs installing. A removed file
 * goes to Admin/data/trash and can be put back; a file the site still uses
 * can't be removed at all.
 */

const KINDS = {
  image: ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico'],
  video: ['.mp4', '.webm', '.mov'],
  document: ['.pdf'],
};
const kindOf = (ext) => Object.keys(KINDS).find((kind) => KINDS[kind].includes(ext)) ?? 'other';

/** What may be uploaded, how large, and the bytes each must start with. */
const UPLOADS = {
  '.png': { max: 15e6, magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  '.jpg': { max: 15e6, magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  '.jpeg': { max: 15e6, magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  '.webp': { max: 15e6, magic: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  '.gif': { max: 15e6, magic: (b) => b.toString('latin1', 0, 4) === 'GIF8' },
  '.avif': { max: 15e6, magic: (b) => b.toString('latin1', 4, 8) === 'ftyp' && /avi[fs]/.test(b.toString('latin1', 8, 12)) },
  '.mp4': { max: 300e6, magic: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  '.webm': { max: 300e6, magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  '.pdf': { max: 120e6, magic: (b) => b.toString('latin1', 0, 5) === '%PDF-' },
};
export const UPLOAD_LIMIT = 300e6;

/* ------------------------------------------------------------------ *
 * Reading dimensions from file headers.
 * ------------------------------------------------------------------ */

function dimensions(buffer, ext) {
  try {
    if (ext === '.png' && buffer.toString('latin1', 12, 16) === 'IHDR') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (ext === '.gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    if (ext === '.webp' && buffer.toString('latin1', 0, 4) === 'RIFF') {
      const chunk = buffer.toString('latin1', 12, 16);
      if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8X') return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      let at = 2;
      while (at + 9 < buffer.length) {
        if (buffer[at] !== 0xff) {
          at++;
          continue;
        }
        const marker = buffer[at + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          at += 2;
          continue;
        }
        const length = buffer.readUInt16BE(at + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: buffer.readUInt16BE(at + 7), height: buffer.readUInt16BE(at + 5) };
        }
        at += 2 + length;
      }
    }
    if (ext === '.svg') {
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));
      const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
      const width = parseFloat(/\bwidth="([\d.]+)/.exec(tag)?.[1] ?? '');
      const height = parseFloat(/\bheight="([\d.]+)/.exec(tag)?.[1] ?? '');
      if (width && height) return { width: Math.round(width), height: Math.round(height) };
      const box = /\bviewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(tag);
      if (box) return { width: Math.round(parseFloat(box[1])), height: Math.round(parseFloat(box[2])) };
    }
  } catch {
    /* a header that can't be read just has no dimensions */
  }
  return null;
}

async function headerOf(file, size) {
  const handle = await fsp.open(file, 'r');
  try {
    const length = Math.min(size, 512 * 1024);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

/* ------------------------------------------------------------------ *
 * Where the site uses each file.
 * ------------------------------------------------------------------ */

const PATH_IN_SOURCE = /["'`(]\s*(\/(?:images|work|video|docs|deck|fonts|media)\/[^"'`)\s?#]+)/g;
/** A path to a file (it has an extension), not a page route or a template still to be filled in. */
const FILE_LIKE = /^\/[^\s'"`$&{}[\]<>,;]+\.[a-z0-9]{2,5}$/i;
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx', '.css', '.json']);

function labelFor(rel) {
  const name = path.basename(rel);
  if (rel === 'src/content/site.ts') return 'Site content';
  if (rel === 'src/content/work.ts') return 'Case studies';
  if (rel === 'src/content/systems.ts') return 'Systems';
  if (rel.startsWith('src/content/decks/')) return `Deck pages · ${name.replace('.json', '')}`;
  if (rel.startsWith('src/content/screens/')) return `System screens · ${name.replace('.json', '')}`;
  return `Code · ${name}`;
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export class MediaLibrary {
  constructor({ siteRoot, dataDir, db }) {
    this.siteRoot = siteRoot;
    this.publicDir = path.join(siteRoot, 'public');
    this.trashDir = path.join(dataDir, 'trash');
    this.db = db;
    this.headers = new Map();
    this.usageCache = null;
  }

  toPublic(abs) {
    return `/${path.relative(this.publicDir, abs).split(path.sep).join('/')}`;
  }

  exists(publicPath) {
    const abs = within(this.publicDir, publicPath);
    return Boolean(abs && fs.existsSync(abs) && fs.statSync(abs).isFile());
  }

  async scan() {
    const files = [];
    for (const abs of await walk(this.publicDir)) {
      const stat = await fsp.stat(abs);
      const ext = path.extname(abs).toLowerCase();
      const publicPath = this.toPublic(abs);
      const kind = kindOf(ext);
      let size = null;
      if (kind === 'image') {
        const key = `${publicPath}:${stat.size}:${stat.mtimeMs}`;
        if (!this.headers.has(key)) this.headers.set(key, dimensions(await headerOf(abs, stat.size), ext));
        size = this.headers.get(key);
      }
      files.push({
        path: publicPath,
        name: path.basename(abs),
        folder: path.posix.dirname(publicPath),
        ext,
        kind,
        bytes: stat.size,
        modified: stat.mtime.toISOString(),
        width: size?.width ?? null,
        height: size?.height ?? null,
        system: path.posix.dirname(publicPath) === '/' && !kind.match(/image|video|document/),
      });
    }
    // The viewers' half-size renders sit beside each page; mark them so the library can fold them away.
    const all = new Set(files.map((file) => file.path));
    for (const file of files) file.variant = /-half\.webp$/.test(file.path) && all.has(file.path.replace(/-half\.webp$/, '.webp'));
    return files.sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }));
  }

  /** public path → the places that use it. `values` are strings from the evaluated content (the deck's slide list is worked out, not written). */
  async usage(values = []) {
    const src = path.join(this.siteRoot, 'src');
    const stamp = [];
    const sources = [];
    for (const abs of await walk(src)) {
      if (!SOURCE_EXTS.has(path.extname(abs))) continue;
      const stat = await fsp.stat(abs);
      stamp.push(`${abs}:${stat.mtimeMs}`);
      sources.push(abs);
    }
    const key = stamp.join('|') + values.length;
    if (this.usageCache?.key === key) return this.usageCache.map;

    const map = new Map();
    const add = (publicPath, where) => {
      if (!FILE_LIKE.test(publicPath)) return;
      if (!map.has(publicPath)) map.set(publicPath, new Set());
      map.get(publicPath).add(where);
    };
    for (const abs of sources) {
      const rel = path.relative(this.siteRoot, abs).split(path.sep).join('/');
      const text = await fsp.readFile(abs, 'utf8');
      for (const match of text.matchAll(PATH_IN_SOURCE)) add(match[1], labelFor(rel));
    }
    for (const value of values) if (typeof value === 'string' && value.startsWith('/')) add(value.split(/[?#]/)[0], 'Site content');
    const plain = new Map([...map].map(([publicPath, set]) => [publicPath, [...set]]));
    this.usageCache = { key, map: plain };
    return plain;
  }

  async library(values) {
    const [files, usage] = await Promise.all([this.scan(), this.usage(values)]);
    const folders = new Map();
    let unusedBytes = 0;
    for (const file of files) {
      file.usedBy = usage.get(file.path) ?? [];
      file.used = file.usedBy.length > 0 || file.system;
      if (!file.used && !file.variant) unusedBytes += file.bytes;
      const folder = folders.get(file.folder) ?? { path: file.folder, files: 0, bytes: 0 };
      folder.files++;
      folder.bytes += file.bytes;
      folders.set(file.folder, folder);
    }
    const missing = [...usage.keys()].filter((publicPath) => !files.some((file) => file.path === publicPath));
    return {
      files,
      folders: [...folders.values()].sort((a, b) => a.path.localeCompare(b.path)),
      totals: {
        files: files.length,
        bytes: files.reduce((sum, file) => sum + file.bytes, 0),
        unused: files.filter((file) => !file.used && !file.variant).length,
        unusedBytes,
        large: files.filter((file) => (file.kind === 'image' && file.bytes > 1_000_000) || (file.kind === 'video' && file.bytes > 15_000_000)).length,
      },
      missing,
    };
  }

  folderPath(folder) {
    const clean = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (clean && !/^[a-z0-9][a-z0-9/_-]*$/i.test(clean)) throw new HttpError(400, 'invalid', 'Folder names use letters, numbers, hyphens and slashes.');
    const abs = within(this.publicDir, clean);
    if (!abs) throw new HttpError(400, 'invalid', 'That folder is outside the public folder.');
    return { abs, clean };
  }

  async upload({ folder, name, data, replace = false }) {
    const ext = path.extname(String(name || '')).toLowerCase();
    const rule = UPLOADS[ext];
    if (!rule) throw new HttpError(415, 'unsupported', 'Upload PNG, JPEG, WebP, AVIF or GIF pictures, MP4 or WebM video, or PDF documents. (SVG isn’t accepted: it can carry scripts.)');
    if (data.length > rule.max) throw new HttpError(413, 'too_large', `That ${ext.slice(1).toUpperCase()} is over ${Math.round(rule.max / 1e6)} MB.`);
    if (!rule.magic(data)) throw new HttpError(415, 'mismatch', `That file isn’t really a ${ext.slice(1).toUpperCase()}; its contents don’t match its name.`);
    const base = path
      .basename(String(name), path.extname(String(name)))
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    if (!base) throw new HttpError(400, 'invalid', 'Give the file a name with letters or numbers.');
    const { abs: dir, clean } = this.folderPath(folder);
    if (clean.split('/').length > 6) throw new HttpError(400, 'invalid', 'That folder is nested too deeply.');
    await fsp.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${base}${ext === '.jpeg' ? '.jpg' : ext}`);
    let replaced = null;
    if (fs.existsSync(target)) {
      if (!replace) throw new HttpError(409, 'exists', `${this.toPublic(target)} already exists. Choose “Replace” to swap it, or rename the file.`, { path: this.toPublic(target) });
      replaced = await this.#toTrash(target, 'replaced');
    }
    await fsp.writeFile(target, data);
    this.usageCache = null;
    const stat = await fsp.stat(target);
    return { path: this.toPublic(target), bytes: stat.size, ...(dimensions(data.subarray(0, 512 * 1024), path.extname(target)) ?? {}), replaced };
  }

  async remove(publicPath, values) {
    const abs = within(this.publicDir, publicPath);
    if (!abs || !fs.existsSync(abs)) throw new HttpError(404, 'not_found', 'That file isn’t there any more.');
    if (path.dirname(abs) === this.publicDir && !kindOf(path.extname(abs)).match(/image|video|document/)) {
      throw new HttpError(400, 'system', 'That file configures the site’s hosting and can’t be removed here.');
    }
    const usedBy = (await this.usage(values)).get(publicPath) ?? [];
    if (usedBy.length) throw new HttpError(409, 'in_use', `The site still uses ${publicPath} (${usedBy.join(', ')}). Point those at another file first.`, { usedBy });
    return this.#toTrash(abs, 'removed');
  }

  async #toTrash(abs, reason) {
    await fsp.mkdir(this.trashDir, { recursive: true });
    const id = crypto.randomUUID();
    const entry = { id, path: this.toPublic(abs), reason, at: new Date().toISOString(), bytes: (await fsp.stat(abs)).size, file: `${id}${path.extname(abs)}` };
    await move(abs, path.join(this.trashDir, entry.file));
    this.db.data.trash = [entry, ...(this.db.data.trash ?? [])].slice(0, 500);
    this.db.save();
    this.usageCache = null;
    return entry;
  }

  trash() {
    return this.db.data.trash ?? [];
  }

  async restore(id) {
    const entry = this.trash().find((item) => item.id === id);
    if (!entry) throw new HttpError(404, 'not_found', 'That item has left the trash.');
    const target = within(this.publicDir, entry.path);
    if (!target) throw new HttpError(400, 'invalid', 'That file can’t go back where it was.');
    if (fs.existsSync(target)) throw new HttpError(409, 'exists', `Something else is at ${entry.path} now. Move it first.`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await move(path.join(this.trashDir, entry.file), target);
    this.db.data.trash = this.trash().filter((item) => item.id !== id);
    this.db.save();
    this.usageCache = null;
    return entry;
  }

  async purge(id) {
    const entry = this.trash().find((item) => item.id === id);
    if (!entry) throw new HttpError(404, 'not_found', 'That item has left the trash.');
    await fsp.unlink(path.join(this.trashDir, entry.file)).catch(() => {});
    this.db.data.trash = this.trash().filter((item) => item.id !== id);
    this.db.save();
    return entry;
  }

  trashFile(id) {
    const entry = this.trash().find((item) => item.id === id);
    return entry ? path.join(this.trashDir, entry.file) : null;
  }
}

async function move(from, to) {
  try {
    await fsp.rename(from, to);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fsp.copyFile(from, to);
    await fsp.unlink(from);
  }
}
