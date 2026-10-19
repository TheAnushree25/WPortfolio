#!/usr/bin/env node
/**
 * Serves the Saaj app's web build with its staging API's demo catalogue, for
 * `node scripts/work/screens.mjs saaj` (Saaj has no public web address).
 *
 * The build is the app's own web export, made with the API on this same origin:
 *   EXPO_PUBLIC_API_URL=http://localhost:8095 npx expo export --platform web --output-dir <dir>
 * This serves <dir> (every unknown path falls back to index.html, as on Vercel)
 * and relays /v1, /demo and /health to the staging API — read-only: anything
 * that would write (POST, PUT, PATCH, DELETE) is refused before it leaves.
 *
 * Usage
 *   node scripts/work/saaj-preview.mjs <web-export-dir> [port=8095]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const API = 'https://saaj-api.onrender.com';
const [dirArg, portArg = '8095'] = process.argv.slice(2);
if (!dirArg) {
  console.error('Usage: node scripts/work/saaj-preview.mjs <web-export-dir> [port]');
  process.exit(1);
}
const root = resolve(dirArg);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  if (/^\/(v1|demo|health)(\/|$)/.test(path)) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'READ_ONLY', message: 'The preview only reads.' } }));
    }
    try {
      const upstream = await fetch(API + req.url, { method: req.method, headers: { accept: req.headers.accept || '*/*' } });
      const headers = {};
      for (const name of ['content-type', 'cache-control', 'etag']) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      res.writeHead(upstream.status, headers);
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'UPSTREAM', message: String(error) } }));
    }
  }

  let file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(Number(portArg), '127.0.0.1', () => console.log(`Saaj preview on http://localhost:${portArg} (API: ${API}, read-only)`));
