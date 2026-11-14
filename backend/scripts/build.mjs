import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prepares a deployment: copies the admin's pages (../Admin/public) into
 * .ui, so a platform that packs only this folder's function still serves
 * them, and writes the one folder served as static files (static/), which
 * keeps the backend's own source out of reach. Run by `npm run build`
 * (Vercel does on every deploy).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '..', 'Admin', 'public');
const target = path.join(root, '.ui');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`The admin's pages aren't at ${source}. Build from the whole repository (Vercel: keep "Include files outside the Root Directory" on).`);
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
const count = fs.readdirSync(target, { recursive: true }).length;

const statics = path.join(root, 'static');
fs.mkdirSync(statics, { recursive: true });
fs.writeFileSync(path.join(statics, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Copied the admin's pages (${count} files) into .ui; static/ holds robots.txt.`);
