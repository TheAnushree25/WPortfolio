import crypto from 'node:crypto';
import nodeModule from 'node:module';
import vm from 'node:vm';

/**
 * The exact values of a content file, worked out the way the site's build
 * would: Node strips the TypeScript (keeping every position, the types become
 * blanks), and the result runs in an empty sandbox with nothing to reach but
 * JavaScript itself. This is what fills in values the parser can only see
 * as expressions, like `mailto:${site.email}` or the deck's slide list.
 *
 * Without type stripping (Node older than 22.13) or for .tsx files, this
 * returns null and callers fall back to the parser's literal values.
 */

const strip = nodeModule.stripTypeScriptTypes;
const cache = new Map();

export function evaluateModule(src, mod) {
  if (typeof strip !== 'function') return null;
  const names = [...mod.decls.keys()];
  const key = crypto.createHash('sha1').update(src).update(names.join(',')).digest('hex');
  if (cache.has(key)) return structuredClone(cache.get(key));

  let js;
  try {
    js = strip(src, { mode: 'strip' });
  } catch {
    return null;
  }
  js = js
    .replace(/^[ \t]*import\s+(?:[\s\S]*?\sfrom\s*)?['"][^'"\n]+['"];?/gm, '')
    .replace(/^[ \t]*export\s*\{[^}]*\}(?:\s*from\s*['"][^'"\n]+['"])?;?/gm, '')
    .replace(/^([ \t]*)export\s+default\s+/gm, '$1void ')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class|async)\b)/g, '');

  let values;
  try {
    const result = vm.runInNewContext(`${js}\n;({ ${names.join(', ')} });`, {}, { timeout: 1500, filename: 'content.js' });
    values = JSON.parse(JSON.stringify(result));
  } catch {
    return null;
  }
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  cache.set(key, values);
  return structuredClone(values);
}
