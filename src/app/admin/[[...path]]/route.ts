import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The studio's admin at /admin.
 *
 * Hosted (ADMIN_BACKEND_URL set), the admin is the backend service in
 * backend/, deployed on its own with the database and the GitHub access. This
 * route forwards every /admin request to it, so the admin keeps the site's
 * address and its sign-in cookie stays the site's. ADMIN_PROXY_SECRET proves
 * to the backend that a request came through here, which is what lets it
 * trust the visitor's address and the site's host forwarded with it.
 *
 * Without ADMIN_BACKEND_URL (the studio's computer, `npm run dev`), the admin
 * in the Admin folder answers, editing this repository's files directly; it
 * is loaded from disk at run time rather than built into the site.
 */

type Admin = { handleRequest: (request: Request, options: { basePath: string }) => Promise<Response> };

const backend = (process.env.ADMIN_BACKEND_URL ?? '').trim().replace(/\/+$/, '');

/** Headers that belong to one connection, never forwarded. */
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'accept-encoding'];

function page(title: string, text: string, status: number) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Admin · Atlas Studios</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#020923;color:#eaf0ff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px">
<main style="max-width:420px;text-align:center"><p style="margin:0 0 10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#7fb0ff;font-weight:700">Atlas Studios · Admin</p>
<h1 style="margin:0 0 12px;font-size:24px;font-weight:600">${title}</h1>
<p style="margin:0;color:#8a9ac3;line-height:1.6">${text}</p></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

async function forward(request: Request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set('x-forwarded-host', request.headers.get('host') ?? url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  const visitor = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (visitor) headers.set('x-forwarded-for', visitor);
  else headers.delete('x-forwarded-for');
  headers.set('x-atlas-proxy', process.env.ADMIN_PROXY_SECRET ?? '');

  const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(70_000) };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
    init.duplex = 'half';
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${backend}${url.pathname}${url.search}`, init);
  } catch (error) {
    console.error('[admin] the backend didn’t answer:', error instanceof Error ? error.message : error);
    return page('The admin isn’t answering', 'Its backend couldn’t be reached just now. Try again in a minute.', 502);
  }
  // fetch() has already unpacked a compressed body, so its encoding and length no longer apply.
  const out = new Headers(upstream.headers);
  for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) out.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

let loading: Promise<Admin> | null = null;

/**
 * The site's folder, asked of the running process. Written as a plain call,
 * `process.cwd()` is read by the build's file tracer as "this whole folder":
 * it then copies the entire project into the server function (.git, .env
 * files, every picture, and build files that are gone by the time Vercel
 * packs the function, which fails the deploy). The local admin is never part
 * of the build, so its location stays out of the tracer's sight.
 */
const siteFolder = (): string => Reflect.apply(process.cwd, process, []);

function load() {
  const entry = pathToFileURL(join(siteFolder(), 'Admin', 'server', 'mount.mjs')).href;
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry) as Promise<Admin>;
}

async function local(request: Request) {
  try {
    loading ??= load();
    return await (await loading).handleRequest(request, { basePath: '/admin' });
  } catch (error) {
    loading = null;
    console.error('[admin] unavailable:', error instanceof Error ? error.message : error);
    return page('The admin isn’t connected here yet', 'Connect its backend (backend/README.md), or start the site on the studio’s computer with <code>npm run dev</code> and open /admin there.', 503);
  }
}

const admin = (request: Request) => (backend ? forward(request) : local(request));

export { admin as GET, admin as HEAD, admin as POST, admin as PUT, admin as PATCH, admin as DELETE, admin as OPTIONS };
