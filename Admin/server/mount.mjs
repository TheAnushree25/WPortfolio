import { Readable, Writable } from 'node:stream';
import { config } from './config.mjs';
import { createApp } from './app.mjs';
import { isLoopback } from './security.mjs';

/**
 * The admin mounted inside the site, at /admin. The site's route
 * (src/app/admin/[[...path]]/route.ts) hands each request here as a web
 * Request; this turns it into the Node request and response the admin
 * already speaks, runs it, and returns a web Response, streaming included
 * (job output, videos). One admin is kept per base path for the life of the
 * server, so sessions and jobs survive the site's hot reloads.
 */

const instances = (globalThis.__atlasAdmin ??= new Map());

function appFor(basePath) {
  if (!instances.has(basePath)) {
    const created = createApp({ ...config, basePath, mounted: true });
    created.catch(() => instances.delete(basePath));
    instances.set(basePath, created);
  }
  return instances.get(basePath);
}

/**
 * The visitor's address, as far as it can be trusted. The site's server copies
 * the socket's address into x-forwarded-for only when the header is missing, so
 * a request can claim to be local. A local claim is believed only from the
 * development server, addressed as localhost; anywhere else it counts as remote,
 * which keeps first-run setup to the studio's own computer.
 */
function clientAddress(request) {
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (process.env.NODE_ENV === 'development' && localHost && (!forwarded || isLoopback(forwarded))) return '127.0.0.1';
  return forwarded && !isLoopback(forwarded) ? forwarded : 'remote';
}

function toNodeRequest(request, path) {
  const hasBody = request.body && !['GET', 'HEAD'].includes(request.method);
  const stream = hasBody ? Readable.fromWeb(request.body) : Readable.from([]);
  const headers = {};
  request.headers.forEach((value, key) => (headers[key] = value));
  headers['x-forwarded-proto'] ??= new URL(request.url).protocol.replace(':', '');
  stream.method = request.method;
  stream.url = path;
  stream.headers = headers;
  stream.socket = { remoteAddress: clientAddress(request) };
  request.signal?.addEventListener('abort', () => stream.emit('close'));
  return stream;
}

/** A Node-style response whose body streams out as a web Response. */
class ResponseShim extends Writable {
  constructor(method) {
    super();
    this.method = method;
    this.statusCode = 200;
    this.headersSent = false;
    this.fields = new Map();
    this.response = new Promise((resolve) => (this.resolve = resolve));
    this.body = new ReadableStream({
      start: (controller) => (this.controller = controller),
      cancel: () => this.destroy(),
    });
  }

  setHeader(name, value) {
    this.fields.set(name.toLowerCase(), value);
    return this;
  }
  getHeader(name) {
    return this.fields.get(name.toLowerCase());
  }
  removeHeader(name) {
    this.fields.delete(name.toLowerCase());
  }

  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    this.flushHead();
    return this;
  }

  flushHead() {
    if (this.headersSent) return;
    this.headersSent = true;
    const headers = new Headers();
    for (const [name, value] of this.fields) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, String(item)));
      else headers.set(name, String(value));
    }
    const empty = this.method === 'HEAD' || [101, 204, 205, 304].includes(this.statusCode);
    if (empty) this.controller.close();
    this.resolve(new Response(empty ? null : this.body, { status: this.statusCode, headers }));
  }

  _write(chunk, encoding, callback) {
    this.flushHead();
    try {
      this.controller.enqueue(new Uint8Array(chunk));
    } catch {
      /* the visitor has gone */
    }
    callback();
  }

  _final(callback) {
    this.flushHead();
    try {
      this.controller.close();
    } catch {
      /* already closed */
    }
    callback();
  }
}

export async function handleRequest(request, { basePath = '/admin' } = {}) {
  const { handle } = await appFor(basePath);
  const url = new URL(request.url);
  const inside = url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
  const path = (inside ? url.pathname.slice(basePath.length) : url.pathname) || '/';
  const res = new ResponseShim(request.method);
  await handle(toNodeRequest(request, path + url.search), res);
  if (!res.headersSent) {
    res.statusCode = 500;
    res.end('The admin gave no answer.');
  }
  return res.response;
}
