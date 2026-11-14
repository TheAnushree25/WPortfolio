import crypto from 'node:crypto';
import path from 'node:path';
import { FILE_LIKE, HttpError, MIME, PATH_IN_SOURCE, SOURCE_EXTS, UPLOADS, dimensions, kindOf, labelFor } from '../shared.mjs';
import { trash } from '../data.mjs';
import { bytes as asBuffer } from '../db/index.mjs';

/**
 * The site's public folder, on GitHub. The same library the local admin
 * shows (sizes, dimensions, where the site uses each file, filters for unused
 * and heavy files) built from the repository's tree; uploads, replacements and
 * removals are commits on the drafts.
 *
 * The trash keeps a removed file's Git blob, which history already holds, so
 * putting a file back restores it byte for byte without storing a copy.
 *
 * Uploads larger than a serverless request allows (4.5 MB on Vercel) arrive
 * in chunks, kept in the database until the last one comes, then committed
 * as one file. GitHub takes files up to 100 MB; the admin stops at 95 MB.
 */

export const CHUNK_SIZE = 3_500_000;
const HOSTED_MAX = 95e6;
const PUBLIC = 'public';

const toPublic = (repoPath) => repoPath.slice(PUBLIC.length);
const toRepo = (publicPath) => `${PUBLIC}${publicPath}`;

export function tidyName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  const base = path
    .basename(String(name || ''), path.extname(String(name || '')))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return { base, ext };
}

export function tidyFolder(folder) {
  const clean = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (clean && !/^[a-z0-9][a-z0-9/_-]*$/i.test(clean)) throw new HttpError(400, 'invalid', 'Folder names use letters, numbers, hyphens and slashes.');
  if (clean.split('/').some((part) => part === '..' || part === '.')) throw new HttpError(400, 'invalid', 'That folder is outside the public folder.');
  if (clean.split('/').length > 6) throw new HttpError(400, 'invalid', 'That folder is nested too deeply.');
  return clean;
}

/** What an upload may be: an allowed type, within its size, and really that type by its first bytes. */
export function checkUpload(name, size, data = null) {
  const { base, ext } = tidyName(name);
  const rule = UPLOADS[ext];
  if (!rule) throw new HttpError(415, 'unsupported', 'Upload PNG, JPEG, WebP, AVIF or GIF pictures, MP4 or WebM video, or PDF documents. (SVG isn’t accepted: it can carry scripts.)');
  const max = Math.min(rule.max, HOSTED_MAX);
  if (size > max) throw new HttpError(413, 'too_large', `That ${ext.slice(1).toUpperCase()} is over ${Math.round(max / 1e6)} MB${rule.max > HOSTED_MAX ? ' (GitHub’s limit for one file)' : ''}.`);
  if (data && !rule.magic(data)) throw new HttpError(415, 'mismatch', `That file isn’t really a ${ext.slice(1).toUpperCase()}; its contents don’t match its name.`);
  if (!base) throw new HttpError(400, 'invalid', 'Give the file a name with letters or numbers.');
  return { base, ext: ext === '.jpeg' ? '.jpg' : ext };
}

export class HostedMedia {
  constructor({ repo, db, siteUrl = '' }) {
    this.repo = repo;
    this.db = db;
    this.siteUrl = siteUrl;
    this.usageMemo = null;
  }

  exists(publicPath, snapshot) {
    return typeof publicPath === 'string' && snapshot.files.has(toRepo(publicPath));
  }

  /** public path → the places that use it, from the site's source files and the content's own values. */
  async usage(values, snapshot) {
    const sources = [...snapshot.files].filter(([file]) => file.startsWith('src/') && SOURCE_EXTS.has(path.posix.extname(file)));
    const key = sources.map(([file, entry]) => `${file}:${entry.sha}`).join('|') + values.length;
    if (this.usageMemo?.key === key) return this.usageMemo.map;
    const texts = await this.repo.manyTexts(sources.map(([, entry]) => entry.sha));
    const map = new Map();
    const add = (publicPath, where) => {
      if (!FILE_LIKE.test(publicPath)) return;
      if (!map.has(publicPath)) map.set(publicPath, new Set());
      map.get(publicPath).add(where);
    };
    for (const [file, entry] of sources) {
      const text = texts.get(entry.sha);
      if (typeof text !== 'string') continue;
      for (const match of text.matchAll(PATH_IN_SOURCE)) add(match[1], labelFor(file));
    }
    for (const value of values) if (typeof value === 'string' && value.startsWith('/')) add(value.split(/[?#]/)[0], 'Site content');
    const plain = new Map([...map].map(([publicPath, set]) => [publicPath, [...set]]));
    this.usageMemo = { key, map: plain };
    return plain;
  }

  async library(values, snapshot) {
    const entries = [...snapshot.files].filter(([file]) => file.startsWith(`${PUBLIC}/`));
    const shas = entries.map(([, entry]) => entry.sha);
    const known = new Map((await this.db.query('SELECT sha, width, height FROM media_dims WHERE sha = ANY($1)', [shas])).map((row) => [row.sha, row]));
    const files = entries.map(([file, entry]) => {
      const publicPath = toPublic(file);
      const ext = path.posix.extname(publicPath).toLowerCase();
      const kind = kindOf(ext);
      const size = known.get(entry.sha);
      return {
        path: publicPath,
        name: path.posix.basename(publicPath),
        folder: path.posix.dirname(publicPath),
        ext,
        kind,
        bytes: entry.size,
        modified: null,
        width: size?.width ?? null,
        height: size?.height ?? null,
        system: path.posix.dirname(publicPath) === '/' && !/image|video|document/.test(kind),
        sha: entry.sha,
      };
    });
    const all = new Set(files.map((file) => file.path));
    for (const file of files) file.variant = /-half\.webp$/.test(file.path) && all.has(file.path.replace(/-half\.webp$/, '.webp'));

    // Pictures not measured yet are measured a few dozen at a time, so the first visit stays quick.
    const unmeasured = files.filter((file) => file.kind === 'image' && !known.has(file.sha) && !file.variant).slice(0, 40);
    if (unmeasured.length) await this.measure(unmeasured).catch((error) => console.warn('[media] measuring failed:', error.message));

    const usage = await this.usage(values, snapshot);
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
    const missing = [...usage.keys()].filter((publicPath) => !all.has(publicPath));
    return {
      files: files.sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true })),
      folders: [...folders.values()].sort((a, b) => a.path.localeCompare(b.path)),
      totals: {
        files: files.length,
        bytes: files.reduce((sum, file) => sum + file.bytes, 0),
        unused: files.filter((file) => !file.used && !file.variant).length,
        unusedBytes,
        large: files.filter((file) => (file.kind === 'image' && file.bytes > 1_000_000) || (file.kind === 'video' && file.bytes > 15_000_000)).length,
      },
      missing,
      pending: unmeasured.length >= 40,
    };
  }

  /** Reads pictures' dimensions from their first bytes: from the live site when it serves the same file, else from GitHub. */
  async measure(files) {
    const live = this.siteUrl ? await this.repo.live().catch(() => null) : null;
    const queue = [...files];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        let head = null;
        try {
          if (live?.files.get(toRepo(file.path))?.sha === file.sha) {
            const response = await fetch(`${this.siteUrl}${file.path.split('/').map(encodeURIComponent).join('/')}`, { headers: { range: 'bytes=0-131071' }, signal: AbortSignal.timeout(8000) });
            if (response.ok) head = Buffer.from(await response.arrayBuffer());
          }
          if (!head && file.bytes < 20e6) head = await this.repo.github.blob(file.sha);
        } catch {
          head = null;
        }
        const size = head ? dimensions(head, file.ext) : null;
        await this.db.query('INSERT INTO media_dims (sha, width, height) VALUES ($1, $2, $3) ON CONFLICT (sha) DO NOTHING', [file.sha, size?.width ?? null, size?.height ?? null]);
        if (size) Object.assign(file, size);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  /** Uploads (or replaces) one file: a commit on the drafts. Returns { path, bytes, width, height, replaced }. */
  async upload({ folder, name, data, replace = false, user }) {
    const buffer = asBuffer(data);
    const { base, ext } = checkUpload(name, buffer.length, buffer);
    const clean = tidyFolder(folder);
    const publicPath = `/${clean ? `${clean}/` : ''}${base}${ext}`;
    const size = dimensions(buffer.subarray(0, 512 * 1024), ext);
    const outcome = await this.repo.commit(async (snapshot) => {
      const existing = snapshot.files.get(toRepo(publicPath));
      if (existing && !replace) throw new HttpError(409, 'exists', `${publicPath} already exists. Choose “Replace” to swap it, or rename the file.`, { path: publicPath });
      return {
        files: [{ path: toRepo(publicPath), content: buffer }],
        message: `${existing ? 'Replace' : 'Upload'} ${publicPath} from the admin`,
        result: existing ?? null,
      };
    }, { author: user });
    let replaced = null;
    if (outcome.result && outcome.result.sha !== outcome.snapshot.files.get(toRepo(publicPath))?.sha) {
      replaced = await trash.add(this.db, { path: publicPath, sha: outcome.result.sha, mode: outcome.result.mode, reason: 'replaced', bytes: outcome.result.size, by: user.name });
    }
    const blob = outcome.snapshot.files.get(toRepo(publicPath));
    if (blob) await this.db.query('INSERT INTO media_dims (sha, width, height) VALUES ($1, $2, $3) ON CONFLICT (sha) DO NOTHING', [blob.sha, size?.width ?? null, size?.height ?? null]);
    this.usageMemo = null;
    return { path: publicPath, bytes: buffer.length, ...(size ?? {}), replaced };
  }

  /** Moves an unused file to the trash: a commit removing it from the drafts. */
  async remove(publicPath, values, user) {
    const view = await this.repo.view();
    const entry = view.files.get(toRepo(publicPath));
    if (!entry) throw new HttpError(404, 'not_found', 'That file isn’t there any more.');
    const kind = kindOf(path.posix.extname(publicPath).toLowerCase());
    if (path.posix.dirname(publicPath) === '/' && !/image|video|document/.test(kind)) throw new HttpError(400, 'system', 'That file configures the site’s hosting and can’t be removed here.');
    const usedBy = (await this.usage(values, view)).get(publicPath) ?? [];
    if (usedBy.length) throw new HttpError(409, 'in_use', `The site still uses ${publicPath} (${usedBy.join(', ')}). Point those at another file first.`, { usedBy });
    const outcome = await this.repo.commit(async (snapshot) => {
      const current = snapshot.files.get(toRepo(publicPath));
      if (!current) throw new HttpError(404, 'not_found', 'That file isn’t there any more.');
      return { files: [{ path: toRepo(publicPath), remove: true }], message: `Remove ${publicPath} from the admin (kept in its trash)`, result: current };
    }, { author: user });
    this.usageMemo = null;
    return trash.add(this.db, { path: publicPath, sha: outcome.result.sha, mode: outcome.result.mode, reason: 'removed', bytes: outcome.result.size, by: user.name });
  }

  /** Records a file the drafts no longer have (a discarded upload), so it can be put back. */
  rememberRemoved(publicPath, entry, user, reason = 'discarded') {
    return trash.add(this.db, { path: publicPath, sha: entry.sha, mode: entry.mode, reason, bytes: entry.size, by: user.name });
  }

  trash() {
    return trash.list(this.db);
  }

  async restore(id, user) {
    const entry = await trash.byId(this.db, id);
    if (!entry) throw new HttpError(404, 'not_found', 'That item has left the trash.');
    await this.repo.commit(async (snapshot) => {
      if (snapshot.files.has(toRepo(entry.path))) throw new HttpError(409, 'exists', `Something else is at ${entry.path} now. Move it first.`);
      return { files: [{ path: toRepo(entry.path), sha: entry.sha, mode: entry.mode }], message: `Put ${entry.path} back from the admin’s trash` };
    }, { author: user });
    await trash.remove(this.db, id);
    this.usageMemo = null;
    return entry;
  }

  async purge(id) {
    const entry = await trash.byId(this.db, id);
    if (!entry) throw new HttpError(404, 'not_found', 'That item has left the trash.');
    await trash.remove(this.db, id);
    return entry;
  }

  /* -------------------------------------- Chunked uploads -------------------------------------- */

  async startUpload({ folder, name, size, replace, user }) {
    const total = Number(size);
    if (!Number.isInteger(total) || total <= 0) throw new HttpError(400, 'invalid', 'Say how large the file is.');
    checkUpload(name, total);
    tidyFolder(folder);
    const id = crypto.randomUUID();
    const chunks = Math.ceil(total / CHUNK_SIZE);
    await this.db.query('INSERT INTO uploads (id, user_id, folder, name, size, replace_existing, chunks) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, user.id, String(folder ?? ''), String(name), total, Boolean(replace), chunks]);
    return { id, chunkSize: CHUNK_SIZE, chunks };
  }

  async putChunk(id, index, data, user) {
    const upload = await this.db.one('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!upload) throw new HttpError(404, 'not_found', 'That upload has expired. Start it again.');
    const at = Number(index);
    if (!Number.isInteger(at) || at < 0 || at >= upload.chunks) throw new HttpError(400, 'invalid', 'That piece isn’t part of this upload.');
    const expected = at === upload.chunks - 1 ? upload.size - CHUNK_SIZE * (upload.chunks - 1) : CHUNK_SIZE;
    if (data.length !== expected) throw new HttpError(400, 'invalid', `Piece ${at + 1} should be ${expected} bytes, not ${data.length}.`);
    await this.db.query('INSERT INTO upload_chunks (upload_id, idx, data) VALUES ($1, $2, $3) ON CONFLICT (upload_id, idx) DO UPDATE SET data = EXCLUDED.data', [id, at, Buffer.from(data)]);
    return { received: at };
  }

  async finishUpload(id, user) {
    const upload = await this.db.one('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!upload) throw new HttpError(404, 'not_found', 'That upload has expired. Start it again.');
    const rows = await this.db.query('SELECT idx, data FROM upload_chunks WHERE upload_id = $1 ORDER BY idx', [id]);
    if (rows.length !== upload.chunks) throw new HttpError(400, 'incomplete', `Only ${rows.length} of ${upload.chunks} pieces have arrived.`);
    const data = Buffer.concat(rows.map((row) => asBuffer(row.data)));
    try {
      return await this.upload({ folder: upload.folder, name: upload.name, data, replace: upload.replace_existing, user });
    } finally {
      await this.db.query('DELETE FROM uploads WHERE id = $1', [id]);
    }
  }

  /* ------------------------------------- Serving the files ------------------------------------- */

  /**
   * A site file for the admin's previews. A file the live site serves unchanged
   * is sent there (its CDN handles video seeking); a new or changed one streams
   * from GitHub.
   */
  async serve(publicPath, request) {
    const view = await this.repo.view();
    const entry = view.files.get(toRepo(publicPath));
    if (!entry) throw new HttpError(404, 'not_found', 'That file isn’t in the site’s public folder.');
    if (this.siteUrl) {
      const live = await this.repo.live();
      if (live.files.get(toRepo(publicPath))?.sha === entry.sha) {
        return new Response(null, { status: 302, headers: { location: `${this.siteUrl}${publicPath.split('/').map(encodeURIComponent).join('/')}`, 'cache-control': 'private, max-age=300' } });
      }
    }
    return this.stream(entry.sha, path.posix.extname(publicPath), request, entry.size);
  }

  async stream(sha, ext, request, size = null) {
    const etag = `"${sha}"`;
    const headers = { etag, 'cache-control': 'private, max-age=3600', 'content-type': MIME[ext.toLowerCase()] || 'application/octet-stream' };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    const upstream = await this.repo.github.blobResponse(sha);
    if (size) headers['content-length'] = String(size);
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
  }

  async serveTrash(id, request) {
    const entry = await trash.byId(this.db, id);
    if (!entry) throw new HttpError(404, 'not_found', 'That item has left the trash.');
    return this.stream(entry.sha, path.posix.extname(entry.path), request, entry.bytes);
  }
}
