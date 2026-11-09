import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The studio's admin at /admin. Everything under this path (its pages, its
 * API, the site's files it shows) is answered by the admin in the Admin
 * folder, loaded from disk at run time rather than built into the site:
 * it reads and edits this repository's content, so it runs wherever the
 * repository is (`npm run dev` on the studio's computer). Where it isn't
 * there, on the hosted site, /admin says so instead.
 */

type Admin = { handleRequest: (request: Request, options: { basePath: string }) => Promise<Response> };

let loading: Promise<Admin> | null = null;

function load() {
  const entry = pathToFileURL(join(process.cwd(), 'Admin', 'server', 'mount.mjs')).href;
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry) as Promise<Admin>;
}

const UNAVAILABLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Admin · Atlas Studios</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#020923;color:#eaf0ff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px">
<main style="max-width:420px;text-align:center"><p style="margin:0 0 10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#7fb0ff;font-weight:700">Atlas Studios · Admin</p>
<h1 style="margin:0 0 12px;font-size:24px;font-weight:600">The admin isn’t connected here yet</h1>
<p style="margin:0;color:#8a9ac3;line-height:1.6">It runs where the site’s files are. On the studio’s computer, start the site with <code>npm run dev</code> and open /admin there.</p></main></body></html>`;

async function admin(request: Request) {
  try {
    loading ??= load();
    return await (await loading).handleRequest(request, { basePath: '/admin' });
  } catch (error) {
    loading = null;
    console.error('[admin] unavailable:', error instanceof Error ? error.message : error);
    return new Response(UNAVAILABLE, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
    });
  }
}

export { admin as GET, admin as HEAD, admin as POST, admin as PUT, admin as PATCH, admin as DELETE, admin as OPTIONS };
