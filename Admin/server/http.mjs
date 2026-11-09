import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * The small amount of HTTP the admin needs, on Node's own `http` module: a
 * router with `:params`, body readers with size limits, cookies, JSON
 * replies, and a static file server that understands ETags and byte ranges
 * (so videos in the media library can be scrubbed).
 */

export class HttpError extends Error {
  constructor(status, code, message = code, extra = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'invalid', message, extra);
export const notFound = (message = 'That doesn’t exist any more.') => new HttpError(404, 'not_found', message);
export const forbidden = (message = 'Your role doesn’t allow that.') => new HttpError(403, 'forbidden', message);
export const conflict = (message, extra) => new HttpError(409, 'conflict', message, extra);

function compile(pattern) {
  const keys = [];
  const parts = pattern
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rest = segment.endsWith('*');
      keys.push(segment.slice(1, rest ? -1 : undefined));
      return rest ? '(.+)' : '([^/]+)';
    });
  return { keys, re: new RegExp(`^/${parts.join('/')}/?$`) };
}

export class Router {
  #routes = [];

  add(method, pattern, options, handler) {
    if (typeof options === 'function') [handler, options] = [options, {}];
    this.#routes.push({ method, handler, options, ...compile(pattern) });
    return this;
  }
  get(pattern, options, handler) {
    return this.add('GET', pattern, options, handler);
  }
  post(pattern, options, handler) {
    return this.add('POST', pattern, options, handler);
  }
  put(pattern, options, handler) {
    return this.add('PUT', pattern, options, handler);
  }
  patch(pattern, options, handler) {
    return this.add('PATCH', pattern, options, handler);
  }
  delete(pattern, options, handler) {
    return this.add('DELETE', pattern, options, handler);
  }

  match(method, pathname) {
    let wrongMethod = false;
    for (const route of this.#routes) {
      const found = route.re.exec(pathname);
      if (!found) continue;
      if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) {
        wrongMethod = true;
        continue;
      }
      const params = {};
      try {
        route.keys.forEach((key, index) => (params[key] = decodeURIComponent(found[index + 1])));
      } catch {
        throw badRequest('That address isn’t valid.');
      }
      return { route, params };
    }
    return wrongMethod ? { wrongMethod } : null;
  }
}

/** The request's body, refusing anything larger than `limit` bytes. */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => new HttpError(413, 'too_large', `That’s larger than ${Math.round(limit / 1_000_000)} MB.`);
    if (Number(req.headers['content-length'] || 0) > limit) {
      req.resume();
      reject(tooLarge());
      return;
    }
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) over = true;
      if (!over) chunks.push(chunk);
    });
    req.on('end', () => (over ? reject(tooLarge()) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

export async function readJson(req, limit = 2_000_000) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  const type = String(req.headers['content-type'] || '');
  if (!/application\/json|text\/plain/.test(type)) throw new HttpError(415, 'unsupported', 'Send the request as JSON.');
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw badRequest('That request wasn’t valid JSON.');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    try {
      out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      /* a malformed cookie is ignored */
    }
  }
  return out;
}

export function cookie(name, value, { maxAge, secure = false, path: scope = '/' } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${scope}`,
    maxAge !== undefined && `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    'HttpOnly',
    'SameSite=Strict',
    secure && 'Secure',
  ]
    .filter(Boolean)
    .join('; ');
}

export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body ?? null));
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(text);
}

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

/** `relative` resolved inside `root`, or null if it would step outside it. */
export function within(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\0')) return null;
  const target = path.resolve(root, `.${path.sep}${relative.replace(/^[\\/]+/, '')}`);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return rel === '' ? root : null;
  return target;
}

/** Streams a file with an ETag, honouring If-None-Match and a single byte range. Returns false when there is no such file. */
export async function sendFile(req, res, file, { cache = 'no-cache', download = null, type = null } = {}) {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'content-type': type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    etag,
    'cache-control': cache,
    'last-modified': stat.mtime.toUTCString(),
    'accept-ranges': 'bytes',
  };
  if (download) headers['content-disposition'] = `attachment; filename="${download.replace(/["\\\r\n]/g, '')}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': cache });
    res.end();
    return true;
  }
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'content-length': stat.size });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}
