import { ContentError, literalValue, parseModule, unwrap } from './parse.mjs';
import { evaluateModule } from './evaluate.mjs';

/**
 * Writes a new value into a content file with the smallest possible change.
 *
 * The new value is compared with the old one, tree against tree. Where only
 * a value changed, just that literal is replaced. Where a list or object
 * changed shape (an item added, removed or moved), it is rebuilt from the
 * original text of the items it keeps, comments and formatting included,
 * and only new items are written fresh, in the style of their neighbours.
 * References to other consts (the systems record points at one const per
 * system) are followed, so an edit lands where the data is written.
 *
 * Items in lists can carry `__i`, the index they had when the admin loaded
 * them; that is how a moved-and-edited item is still recognised as itself.
 */

export const ORIGIN = '__i';

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownKeys = (value) => Object.keys(value).filter((key) => key !== ORIGIN && value[key] !== undefined);

/** The value without the admin's `__i` markers or undefined fields. */
export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (isPlain(value)) {
    const out = {};
    for (const key of ownKeys(value)) out[key] = clean(value[key]);
    return out;
  }
  return value;
}

export function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => equal(item, b[index]));
  }
  if (isPlain(a) && isPlain(b)) {
    const left = ownKeys(a);
    const right = ownKeys(b);
    return left.length === right.length && left.every((key) => b[key] !== undefined && equal(a[key], b[key]));
  }
  return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
}

/* ------------------------------------------------------------------ *
 * Writing values as source, in the codebase's own style: single quotes,
 * two-space indents, trailing commas on broken lines.
 * ------------------------------------------------------------------ */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function quote(text) {
  const singles = (text.match(/'/g) || []).length;
  const doubles = (text.match(/"/g) || []).length;
  const mark = singles > doubles ? '"' : "'";
  let out = mark;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (char === '\\') out += '\\\\';
    else if (char === mark) out += `\\${mark}`;
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += char;
  }
  return out + mark;
}

const keyText = (key) => (IDENTIFIER.test(key) ? key : quote(key));

function scalar(value) {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ContentError('invalid', 'Numbers must be finite.');
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  return null;
}

function inline(value) {
  const plain = scalar(value);
  if (plain !== null) return plain;
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  const keys = ownKeys(value);
  return keys.length ? `{ ${keys.map((key) => `${keyText(key)}: ${inline(value[key])}`).join(', ')} }` : '{}';
}

const flat = (value) =>
  scalar(value) !== null ||
  (Array.isArray(value) ? value.every((item) => scalar(item) !== null) : ownKeys(value).every((key) => scalar(value[key]) !== null));

/**
 * `inline` prefers one line (a list whose items are one-liners); `expand`
 * insists on breaking the top level (a list whose items are broken), so a
 * new item matches the items around it.
 */
export function serialize(value, indent = '', { inline: preferInline = false, expand = false, width = 100 } = {}) {
  const plain = scalar(value);
  if (plain !== null) return plain;
  const one = inline(value);
  const limit = preferInline ? 160 : width;
  if (!expand && (preferInline || flat(value)) && indent.length + one.length <= limit && !one.includes('\n')) return one;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((item) => `${inner}${serialize(item, inner)},`).join('\n')}\n${indent}]`;
  }
  const keys = ownKeys(value);
  if (!keys.length) return '{}';
  return `{\n${keys.map((key) => `${inner}${keyText(key)}: ${serialize(value[key], inner)},`).join('\n')}\n${indent}}`;
}

/* ------------------------------------------------------------------ *
 * Rewriting.
 * ------------------------------------------------------------------ */

function indentAt(src, position) {
  const lineStart = src.lastIndexOf('\n', position - 1) + 1;
  return /^[ \t]*/.exec(src.slice(lineStart, position))[0];
}

export function applyEdits(src, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  let floor = Infinity;
  for (const edit of sorted) {
    if (edit.end > floor) throw new ContentError('overlap', 'Two changes touched the same text; nothing was written.');
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    floor = edit.start;
  }
  return out;
}

const describe = (path) => path.map((part) => (typeof part === 'number' ? `#${part + 1}` : part)).join(' › ');

/** Pairs each new list item with the old item it came from, or -1 if it is new. */
export function matchItems(before, after) {
  const map = after.map(() => -1);
  const used = new Set();
  const claim = (j, i) => {
    map[j] = i;
    used.add(i);
  };
  after.forEach((item, j) => {
    const origin = isPlain(item) ? item[ORIGIN] : undefined;
    if (Number.isInteger(origin) && origin >= 0 && origin < before.length && !used.has(origin)) claim(j, origin);
  });
  after.forEach((item, j) => {
    if (map[j] >= 0) return;
    const i = before.findIndex((old, k) => !used.has(k) && equal(old, item));
    if (i >= 0) claim(j, i);
  });
  for (const key of ['slug', 'id', 'name', 'title', 'label', 'heading', 'place', 'quote', 'src', 'href', 'hex', 'layer', 'actor']) {
    after.forEach((item, j) => {
      if (map[j] >= 0 || !isPlain(item) || typeof item[key] !== 'string') return;
      const i = before.findIndex((old, k) => !used.has(k) && isPlain(old) && old[key] === item[key]);
      if (i >= 0) claim(j, i);
    });
  }
  after.forEach((item, j) => {
    if (map[j] >= 0 || j >= before.length || used.has(j)) return;
    const old = before[j];
    const sameKind = Array.isArray(old) === Array.isArray(item) && isPlain(old) === isPlain(item) && (isPlain(old) || Array.isArray(old) || typeof old === typeof item);
    if (sameKind && (isPlain(old) || Array.isArray(old))) claim(j, j);
  });
  return map;
}

function layoutOf(src, node, kids) {
  const openEnd = node.start + 1;
  const closeStart = node.end - 1;
  const closeIndent = indentAt(src, closeStart);
  if (!kids.length) return { empty: true, closeIndent, multiline: src.slice(openEnd, closeStart).includes('\n') };
  const first = kids[0];
  const last = kids[kids.length - 1];
  const multiline = src.slice(openEnd, first.start).includes('\n');
  return {
    empty: false,
    closeIndent,
    multiline,
    itemIndent: multiline ? indentAt(src, first.start) : `${closeIndent}  `,
    trailingComma: last.commaEnd !== null,
    tail: src.slice(last.commaEnd ?? last.end, closeStart),
    pad: src[openEnd] === ' ' ? ' ' : '',
  };
}

function build(pieces, layout, open, close) {
  if (!pieces.length) return open + close;
  if (layout.empty) {
    const oneLine = pieces.map((piece) => piece.text).join(', ');
    const broken = layout.multiline || oneLine.includes('\n') || layout.closeIndent.length + oneLine.length > 100;
    if (!broken) return open === '{' ? `{ ${oneLine} }` : `[${oneLine}]`;
    const inner = `${layout.closeIndent}  `;
    return `${open}\n${pieces.map((piece) => `${inner}${piece.text},`).join('\n')}\n${layout.closeIndent}${close}`;
  }
  if (layout.multiline) {
    const body = pieces.map((piece) => (piece.lead ?? `\n${layout.itemIndent}`) + piece.text).join(',');
    return open + body + (layout.trailingComma ? ',' : '') + layout.tail + close;
  }
  return open + layout.pad + pieces.map((piece) => piece.text).join(', ') + layout.pad + close;
}

/** A kept item's text, with the edits inside it applied; edits elsewhere in the file are passed on. */
function reuse(ctx, item, innerEdits, outer) {
  const inside = [];
  for (const edit of innerEdits) {
    if (edit.start >= item.start && edit.end <= item.end) inside.push({ ...edit, start: edit.start - item.start, end: edit.end - item.start });
    else outer.push(edit);
  }
  return { lead: ctx.src.slice(item.leadStart, item.start), text: applyEdits(ctx.src.slice(item.start, item.end), inside) };
}

function at(ctx, part, run) {
  ctx.path.push(part);
  try {
    return run();
  } finally {
    ctx.path.pop();
  }
}

function rewriteNode(node, before, after, ctx) {
  if (equal(before, after)) return [];
  const current = unwrap(node);
  if (current.type === 'ident') {
    const decl = ctx.mod.decls.get(current.name);
    if (decl?.init && !ctx.following.has(current.name)) {
      ctx.following.add(current.name);
      try {
        return rewriteNode(decl.init, before, after, ctx);
      } finally {
        ctx.following.delete(current.name);
      }
    }
  }
  if (current.type === 'object' && isPlain(before) && isPlain(after)) return rewriteObject(current, before, after, ctx);
  if (current.type === 'array' && Array.isArray(before) && Array.isArray(after) && !current.elements.some((element) => element.spread)) {
    return rewriteArray(current, before, after, ctx);
  }
  if (current.type !== 'literal' && current.type !== 'object' && current.type !== 'array' && !ctx.allowComputed) {
    throw new ContentError('computed', `“${describe(ctx.path)}” is worked out from other content, so it can’t be changed here.`, {
      path: ctx.path.slice(1),
    });
  }
  const oneLine = !ctx.src.slice(current.start, current.end).includes('\n');
  return [{ start: current.start, end: current.end, text: serialize(after, indentAt(ctx.src, current.start), { inline: oneLine }) }];
}

function rewriteObject(node, before, after, ctx) {
  const props = node.props.filter((prop) => prop.kind === 'init' || prop.kind === 'shorthand');
  const own = new Set(props.map((prop) => prop.key));
  const spread = node.props.some((prop) => prop.kind === 'spread');
  const added = ownKeys(after).filter((key) => !own.has(key) && !(spread && key in before));
  const removed = new Set(props.filter((prop) => after[prop.key] === undefined));
  const edits = [];

  if (!added.length && !removed.size) {
    for (const prop of props) edits.push(...at(ctx, prop.key, () => rewriteNode(prop.value, before[prop.key], after[prop.key], ctx)));
    return edits;
  }

  const pieces = [];
  for (const prop of node.props) {
    if (removed.has(prop)) continue;
    const inner = prop.kind === 'init' || prop.kind === 'shorthand' ? at(ctx, prop.key, () => rewriteNode(prop.value, before[prop.key], after[prop.key], ctx)) : [];
    pieces.push(reuse(ctx, prop, inner, edits));
  }
  const layout = layoutOf(ctx.src, node, node.props);
  const indent = layout.empty ? `${layout.closeIndent}  ` : layout.itemIndent;
  for (const key of added) pieces.push({ lead: null, text: `${keyText(key)}: ${serialize(after[key], indent, { inline: !layout.multiline && !layout.empty })}` });
  edits.push({ start: node.start, end: node.end, text: build(pieces, layout, '{', '}') });
  return edits;
}

function rewriteArray(node, before, after, ctx) {
  const elements = node.elements;
  if (elements.length !== before.length) {
    throw new ContentError('shape', `“${describe(ctx.path)}” doesn’t match the file; reload and try again.`, { path: ctx.path.slice(1) });
  }
  const map = matchItems(before, after);
  const edits = [];
  if (after.length === before.length && map.every((i, j) => i === j)) {
    elements.forEach((element, i) => edits.push(...at(ctx, i, () => rewriteNode(element, before[i], after[i], ctx))));
    return edits;
  }
  const layout = layoutOf(ctx.src, node, elements);
  const indent = layout.empty ? `${layout.closeIndent}  ` : layout.itemIndent;
  const siblingsInline = elements.length ? !ctx.src.slice(elements[0].start, elements[0].end).includes('\n') : true;
  const pieces = after.map((item, j) => {
    const i = map[j];
    if (i < 0) return { lead: null, text: serialize(item, indent, { inline: siblingsInline, expand: !siblingsInline }) };
    const inner = at(ctx, j, () => rewriteNode(elements[i], before[i], item, ctx));
    return reuse(ctx, elements[i], inner, edits);
  });
  edits.push({ start: node.start, end: node.end, text: build(pieces, layout, '[', ']') });
  return edits;
}

/**
 * Returns `src` with the const `name` holding `next`. `values` are the
 * module's evaluated values when the caller already has them.
 */
export function rewriteSource(src, name, next, { values, allowComputed = false, only = null } = {}) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const mod = parseModule(text, { only });
  const decl = mod.decls.get(name);
  if (!decl?.init) throw new ContentError('missing', `The file has no “${name}” to change.`);
  const known = values ?? evaluateModule(text, mod);
  const before = known && name in known ? known[name] : literalValue(decl.init, mod);
  const ctx = { src: text, mod, path: [name], allowComputed, following: new Set([name]) };
  const edits = rewriteNode(decl.init, before, next, ctx);
  if (!edits.length) return { source: src, changed: false };
  const out = applyEdits(text, edits);
  return { source: crlf ? out.replace(/\n/g, '\r\n') : out, changed: true };
}
