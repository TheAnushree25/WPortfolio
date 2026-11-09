/**
 * A reader for the site's content files. They are TypeScript, but what the
 * admin edits in them is plain data: object and array literals of strings,
 * numbers and booleans bound to consts. This reads just enough of the
 * language to find those literals and their exact positions, so an edit can
 * replace one value and leave every comment, blank line and neighbour as it
 * was. Anything that isn't plain data (a reference like `site.email`, a
 * template with substitutions, a call) is kept as an opaque expression: the
 * admin shows its value but never rewrites it.
 *
 * Types are skipped rather than understood: a declaration's annotation runs
 * to its `=`, an `as`/`satisfies` suffix to the end of its expression, and
 * type aliases, interfaces, imports and functions are stepped over whole.
 */

export class ContentError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**',
];
/** After these, a `/` starts a regular expression rather than a division. */
const REGEX_AFTER = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '&&', '||', '??', '=>', '+', '-', '*', '%', '<', '>', '~', '^',
  '==', '===', '!=', '!==', '<=', '>=', '+=', '-=', '*=', '%=', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new',
  'delete', 'void', 'throw', 'yield', 'await', 'instanceof',
]);
/** A word that starts a new statement when it opens a line. */
const STATEMENT_WORDS = new Set(['const', 'let', 'var', 'export', 'import', 'function', 'class', 'type', 'interface', 'enum', 'declare', 'async', 'return', 'if', 'for', 'while']);
const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

const isIdStart = (c) => /[A-Za-z_$]/.test(c) || (c > '\u007f' && /\p{ID_Start}/u.test(c));
const isIdPart = (c) => /[\w$]/.test(c) || c === '‌' || c === '‍' || (c > '\u007f' && /\p{ID_Continue}/u.test(c));

function lineOf(src, at) {
  let line = 1;
  for (let i = 0; i < at && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

class Lexer {
  constructor(src, pos = 0, prev = null) {
    this.src = src;
    this.pos = pos;
    this.prev = prev;
  }

  error(message, at = this.pos) {
    const line = lineOf(this.src, at);
    return new ContentError('syntax', `${message} on line ${line}.`, { line });
  }

  /** Skips whitespace and comments; says whether a line break was crossed. */
  trivia() {
    const { src } = this;
    let newline = false;
    while (this.pos < src.length) {
      const c = src[this.pos];
      if (c === '\n') {
        newline = true;
        this.pos++;
      } else if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' || c === ' ' || c === ' ') {
        this.pos++;
      } else if (c === '/' && src[this.pos + 1] === '/') {
        const end = src.indexOf('\n', this.pos);
        this.pos = end < 0 ? src.length : end;
      } else if (c === '/' && src[this.pos + 1] === '*') {
        const end = src.indexOf('*/', this.pos + 2);
        if (end < 0) throw this.error('A comment is never closed', this.pos);
        if (src.slice(this.pos, end).includes('\n')) newline = true;
        this.pos = end + 2;
      } else break;
    }
    return newline;
  }

  next() {
    const nl = this.trivia();
    const { src } = this;
    if (this.pos >= src.length) return null;
    const c = src[this.pos];
    let token;
    if (c === "'" || c === '"') token = this.string(c);
    else if (c === '`') token = this.template();
    else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[this.pos + 1] ?? ''))) token = this.number();
    else if (isIdStart(c)) token = this.word();
    else if (c === '/' && this.regexAllowed()) token = this.regex();
    else token = this.punct();
    token.nl = nl;
    this.prev = token;
    return token;
  }

  regexAllowed() {
    const prev = this.prev;
    if (!prev) return true;
    if (prev.t === 'p' || prev.t === 'id') return REGEX_AFTER.has(prev.v);
    return false;
  }

  word() {
    const start = this.pos;
    let end = start + 1;
    while (end < this.src.length && isIdPart(this.src[end])) end++;
    this.pos = end;
    return { t: 'id', v: this.src.slice(start, end), start, end };
  }

  number() {
    const start = this.pos;
    const match = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d[\d_]*)?)n?/.exec(this.src.slice(start, start + 80));
    if (!match) throw this.error('A number can’t be read', start);
    this.pos = start + match[0].length;
    const clean = match[0].replace(/_/g, '').replace(/n$/, '');
    return { t: 'n', v: Number(clean), raw: match[0], start, end: this.pos };
  }

  escape(at) {
    const { src } = this;
    const next = src[at + 1];
    switch (next) {
      case 'n': return ['\n', 2];
      case 'r': return ['\r', 2];
      case 't': return ['\t', 2];
      case 'b': return ['\b', 2];
      case 'f': return ['\f', 2];
      case 'v': return ['\v', 2];
      case '0':
        if (!/[0-9]/.test(src[at + 2] ?? '')) return ['\0', 2];
        break;
      case 'x': {
        const hex = src.slice(at + 2, at + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) return [String.fromCharCode(parseInt(hex, 16)), 4];
        break;
      }
      case 'u': {
        if (src[at + 2] === '{') {
          const close = src.indexOf('}', at + 3);
          const hex = src.slice(at + 3, close);
          if (close > 0 && /^[0-9a-fA-F]{1,6}$/.test(hex)) return [String.fromCodePoint(parseInt(hex, 16)), close - at + 1];
          break;
        }
        const hex = src.slice(at + 2, at + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) return [String.fromCharCode(parseInt(hex, 16)), 6];
        break;
      }
      case '\r':
        return ['', src[at + 2] === '\n' ? 3 : 2];
      case '\n':
      case ' ':
      case ' ':
        return ['', 2];
      case undefined:
        throw this.error('A string is never closed', at);
      default:
        return [next, 2];
    }
    throw this.error('A string has an invalid escape', at);
  }

  string(quote) {
    const { src } = this;
    const start = this.pos;
    let at = start + 1;
    let out = '';
    while (at < src.length) {
      const c = src[at];
      if (c === quote) {
        this.pos = at + 1;
        return { t: 's', v: out, start, end: at + 1 };
      }
      if (c === '\\') {
        const [chars, used] = this.escape(at);
        out += chars;
        at += used;
        continue;
      }
      if (c === '\n') break;
      out += c;
      at++;
    }
    throw this.error('A string is never closed', start);
  }

  template() {
    const { src } = this;
    const start = this.pos;
    let at = start + 1;
    let cooked = '';
    const quasis = [];
    const exprs = [];
    while (at < src.length) {
      const c = src[at];
      if (c === '`') {
        quasis.push(cooked);
        this.pos = at + 1;
        return { t: 'tpl', start, end: at + 1, quasis, exprs };
      }
      if (c === '\\') {
        const [chars, used] = this.escape(at);
        cooked += chars;
        at += used;
        continue;
      }
      if (c === '$' && src[at + 1] === '{') {
        quasis.push(cooked);
        cooked = '';
        const inner = new Lexer(src, at + 2, { t: 'p', v: '{' });
        let depth = 0;
        let token;
        while ((token = inner.next())) {
          if (token.t !== 'p') continue;
          if (token.v === '{') depth++;
          else if (token.v === '}') {
            if (depth === 0) break;
            depth--;
          }
        }
        if (!token) throw this.error('A template’s ${…} is never closed', at);
        exprs.push({ start: at + 2, end: token.start });
        at = token.end;
        continue;
      }
      cooked += c;
      at++;
    }
    throw this.error('A template string is never closed', start);
  }

  regex() {
    const { src } = this;
    const start = this.pos;
    let at = start + 1;
    let inClass = false;
    while (at < src.length) {
      const c = src[at];
      if (c === '\n') break;
      if (c === '\\') {
        at += 2;
        continue;
      }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        at++;
        while (at < src.length && /[a-z]/i.test(src[at])) at++;
        this.pos = at;
        return { t: 're', v: src.slice(start, at), start, end: at };
      }
      at++;
    }
    throw this.error('A regular expression is never closed', start);
  }

  punct() {
    const start = this.pos;
    for (const p of PUNCTUATORS) {
      if (this.src.startsWith(p, start)) {
        this.pos = start + p.length;
        return { t: 'p', v: p, start, end: this.pos };
      }
    }
    this.pos = start + 1;
    return { t: 'p', v: this.src[start], start, end: this.pos };
  }
}

class Parser {
  constructor(src) {
    this.src = src;
    this.lexer = new Lexer(src);
    this.buffer = [];
    this.lastEnd = 0;
    this.eof = { t: 'eof', v: '', start: src.length, end: src.length, nl: true };
  }
  peek(ahead = 0) {
    while (this.buffer.length <= ahead) {
      const token = this.lexer.next();
      if (!token) return this.eof;
      this.buffer.push(token);
    }
    return this.buffer[ahead];
  }
  next() {
    const token = this.peek();
    if (token !== this.eof) this.buffer.shift();
    this.lastEnd = token.end;
    return token;
  }
  is(value) {
    const token = this.peek();
    return token.t === 'p' && token.v === value;
  }
  eat(value) {
    return this.is(value) ? this.next() : null;
  }
  error(message, at) {
    return this.lexer.error(message, at ?? this.peek().start);
  }
}

const isWord = (token, word) => token.t === 'id' && token.v === word;

function skipGroup(p) {
  const open = p.next();
  const stack = [OPENERS[open.v]];
  while (stack.length) {
    const token = p.next();
    if (token.t === 'eof') throw p.error(`A “${open.v}” is never closed`, open.start);
    if (token.t !== 'p') continue;
    if (OPENERS[token.v]) stack.push(OPENERS[token.v]);
    else if (CLOSERS.has(token.v) && token.v !== stack.pop()) throw p.error(`A “${token.v}” doesn’t match its opening bracket`, token.start);
  }
}

const startsStatement = (token) => token.nl && token.t === 'id' && STATEMENT_WORDS.has(token.v);

function atExpressionEnd(p) {
  const token = p.peek();
  if (token.t === 'eof') return true;
  if (token.t === 'p' && (token.v === ',' || token.v === ';' || CLOSERS.has(token.v))) return true;
  if (isWord(token, 'as') || isWord(token, 'satisfies')) return true;
  return startsStatement(token);
}

/** Steps over the rest of an expression, brackets and all. */
function skipExpression(p) {
  while (!atExpressionEnd(p)) {
    if (p.peek().t === 'p' && OPENERS[p.peek().v]) skipGroup(p);
    else p.next();
  }
}

/** Steps over a type, up to one of `stops` (or a `,` `;` or closing bracket) outside any brackets. */
function skipType(p, stops = []) {
  let angle = 0;
  for (;;) {
    const token = p.peek();
    if (token.t === 'eof') return;
    if (angle === 0 && startsStatement(token)) return;
    if (token.t === 'p') {
      if (angle === 0 && (stops.includes(token.v) || token.v === ',' || token.v === ';' || CLOSERS.has(token.v))) return;
      if (OPENERS[token.v]) {
        skipGroup(p);
        continue;
      }
      if (token.v === '<') angle++;
      else if (token.v === '>') angle = Math.max(0, angle - 1);
      else if (token.v === '>>') angle = Math.max(0, angle - 2);
      else if (token.v === '>>>') angle = Math.max(0, angle - 3);
    }
    p.next();
  }
}

function skipStatement(p) {
  for (;;) {
    const token = p.peek();
    if (token.t === 'eof') return;
    if (token.t === 'p' && token.v === ';') {
      p.next();
      return;
    }
    if (token.t === 'p' && OPENERS[token.v]) skipGroup(p);
    else p.next();
    if (startsStatement(p.peek())) return;
  }
}

/** Steps over a function or class declaration: its parameters, then its body. */
function skipFunctionLike(p) {
  for (;;) {
    const token = p.peek();
    if (token.t === 'eof') return;
    if (token.t === 'p' && token.v === '(') skipGroup(p);
    else if (token.t === 'p' && token.v === '{') {
      skipGroup(p);
      p.eat(';');
      return;
    } else p.next();
  }
}

function parsePrimary(p) {
  const token = p.peek();
  if (token.t === 'p') {
    if (token.v === '{') return parseObject(p);
    if (token.v === '[') return parseArray(p);
    if (token.v === '(') {
      skipGroup(p);
      return { type: 'expr', start: token.start, end: p.lastEnd };
    }
    if (token.v === '-' && p.peek(1).t === 'n') {
      p.next();
      const number = p.next();
      return { type: 'literal', value: -number.v, start: token.start, end: number.end };
    }
    p.next();
    return { type: 'expr', start: token.start, end: token.end };
  }
  p.next();
  switch (token.t) {
    case 's':
      return { type: 'literal', value: token.v, start: token.start, end: token.end };
    case 'n':
      return { type: 'literal', value: token.v, start: token.start, end: token.end };
    case 'tpl':
      return token.exprs.length
        ? { type: 'template', start: token.start, end: token.end }
        : { type: 'literal', value: token.quasis[0], start: token.start, end: token.end };
    case 're':
      return { type: 'expr', start: token.start, end: token.end };
    case 'id':
      if (token.v === 'true' || token.v === 'false') return { type: 'literal', value: token.v === 'true', start: token.start, end: token.end };
      if (token.v === 'null') return { type: 'literal', value: null, start: token.start, end: token.end };
      return { type: 'ident', name: token.v, start: token.start, end: token.end };
    default:
      throw p.error('Something unexpected is here', token.start);
  }
}

export function parseExpression(p) {
  const first = p.peek();
  let node = parsePrimary(p);
  if (!atExpressionEnd(p)) {
    skipExpression(p);
    node = { type: 'expr', start: first.start, end: p.lastEnd };
  }
  while (isWord(p.peek(), 'as') || isWord(p.peek(), 'satisfies')) {
    const keyword = p.next();
    if (keyword.v === 'as' && isWord(p.peek(), 'const')) p.next();
    else skipType(p);
    node = { type: 'as', expr: node, start: first.start, end: p.lastEnd };
    if (!atExpressionEnd(p)) {
      skipExpression(p);
      node = { type: 'expr', start: first.start, end: p.lastEnd };
    }
  }
  return node;
}

function parseObject(p) {
  const open = p.next();
  const props = [];
  let leadStart = open.end;
  while (!p.is('}')) {
    const first = p.peek();
    if (first.t === 'eof') throw p.error('An object is never closed', open.start);
    let prop;
    if (p.is('...')) {
      p.next();
      const value = parseExpression(p);
      prop = { kind: 'spread', value, start: first.start, end: value.end };
    } else {
      const keyToken = p.next();
      let key = null;
      if (keyToken.t === 'id' || keyToken.t === 's' || keyToken.t === 'n') key = String(keyToken.v);
      else if (keyToken.t === 'p' && keyToken.v === '[') {
        // A computed key: [expr]. Its name isn't known without running it.
        p.buffer.unshift(keyToken);
        skipGroup(p);
      } else throw p.error('An object key can’t be read', keyToken.start);

      const accessor = keyToken.t === 'id' && ['get', 'set', 'async'].includes(keyToken.v) && !p.is(':') && !p.is(',') && !p.is('}') && !p.is('(');
      if (accessor || p.is('(') || p.is('<')) {
        if (accessor) p.next();
        skipFunctionLike(p);
        prop = { kind: 'method', key, start: first.start, end: p.lastEnd };
      } else if (p.is(':')) {
        p.next();
        const value = parseExpression(p);
        prop = { kind: 'init', key, keyStart: keyToken.start, keyEnd: keyToken.end, value, start: first.start, end: value.end };
      } else if (key !== null && (p.is(',') || p.is('}'))) {
        prop = { kind: 'shorthand', key, value: { type: 'ident', name: key, start: keyToken.start, end: keyToken.end }, start: first.start, end: keyToken.end };
      } else throw p.error('Expected “:” after an object key', p.peek().start);
    }
    prop.leadStart = leadStart;
    prop.commaEnd = null;
    if (p.is(',')) {
      prop.commaEnd = p.next().end;
      leadStart = prop.commaEnd;
    } else if (!p.is('}')) throw p.error('Expected “,” or “}” in an object', p.peek().start);
    props.push(prop);
  }
  const close = p.next();
  return { type: 'object', start: open.start, end: close.end, props };
}

function parseArray(p) {
  const open = p.next();
  const elements = [];
  let leadStart = open.end;
  while (!p.is(']')) {
    if (p.peek().t === 'eof') throw p.error('A list is never closed', open.start);
    if (p.is(',')) throw p.error('A list has an empty slot', p.peek().start);
    let element;
    if (p.is('...')) {
      const first = p.next();
      const value = parseExpression(p);
      element = { type: 'expr', spread: true, start: first.start, end: value.end };
    } else element = parseExpression(p);
    element.leadStart = leadStart;
    element.commaEnd = null;
    if (p.is(',')) {
      element.commaEnd = p.next().end;
      leadStart = element.commaEnd;
    } else if (!p.is(']')) throw p.error('Expected “,” or “]” in a list', p.peek().start);
    elements.push(element);
  }
  const close = p.next();
  return { type: 'array', start: open.start, end: close.end, elements };
}

function parseDeclaration(p, decls, exported) {
  const kind = p.next();
  for (;;) {
    const name = p.peek();
    if (name.t !== 'id') {
      skipStatement(p);
      return;
    }
    p.next();
    if (p.is(':')) {
      p.next();
      skipType(p, ['=']);
    }
    let init = null;
    if (p.is('=')) {
      p.next();
      init = parseExpression(p);
    }
    decls.set(name.v, { name: name.v, exported, kind: kind.v, start: kind.start, init });
    if (!p.eat(',')) break;
  }
  p.eat(';');
}

/**
 * Reads a module's top-level declarations. With `only`, reading stops as soon
 * as those names are found, which lets a .tsx file be read up to its data
 * without understanding the JSX after it.
 */
export function parseModule(src, { only = null } = {}) {
  const p = new Parser(src);
  const decls = new Map();
  while (p.peek().t !== 'eof') {
    if (only && only.every((name) => decls.has(name))) break;
    let token = p.peek();
    let exported = false;
    if (isWord(token, 'import')) {
      skipStatement(p);
      continue;
    }
    if (isWord(token, 'export')) {
      p.next();
      exported = true;
      token = p.peek();
      if (isWord(token, 'default')) {
        p.next();
        if (isWord(p.peek(), 'function') || isWord(p.peek(), 'class') || isWord(p.peek(), 'async')) skipFunctionLike(p);
        else {
          skipExpression(p);
          p.eat(';');
        }
        continue;
      }
      if (token.t === 'p' && (token.v === '{' || token.v === '*')) {
        skipStatement(p);
        continue;
      }
    }
    if (isWord(token, 'declare')) {
      p.next();
      token = p.peek();
    }
    if (isWord(token, 'const') || isWord(token, 'let') || isWord(token, 'var')) {
      if (isWord(token, 'const') && isWord(p.peek(1), 'enum')) skipFunctionLike(p);
      else parseDeclaration(p, decls, exported);
    } else if ((isWord(token, 'type') && p.peek(1).t === 'id') || isWord(token, 'interface')) {
      p.next();
      p.next();
      if (p.is('<')) skipType(p, ['=', '{']);
      if (isWord(p.peek(), 'extends')) skipType(p, ['{']);
      if (p.eat('=')) {
        skipType(p);
        p.eat(';');
      } else if (p.is('{')) {
        skipGroup(p);
        p.eat(';');
      } else skipStatement(p);
    } else if (['function', 'async', 'class', 'enum', 'namespace', 'module', 'abstract'].some((word) => isWord(token, word))) {
      skipFunctionLike(p);
    } else if (token.t === 'p' && token.v === '{') {
      skipGroup(p);
    } else if (token.t === 'p' && token.v === ';') {
      p.next();
    } else skipStatement(p);
  }
  return { src, decls };
}

export function unwrap(node) {
  let current = node;
  while (current && current.type === 'as') current = current.expr;
  return current;
}

/** The value of a literal tree, following references to other consts in the file; undefined where it isn't plain data. */
export function literalValue(node, mod, seen = new Set()) {
  const current = unwrap(node);
  if (!current) return undefined;
  switch (current.type) {
    case 'literal':
      return current.value;
    case 'object': {
      const out = {};
      for (const prop of current.props) {
        if (prop.kind === 'init' || prop.kind === 'shorthand') out[prop.key] = literalValue(prop.value, mod, seen);
      }
      return out;
    }
    case 'array':
      return current.elements.map((element) => literalValue(element, mod, seen));
    case 'ident': {
      const decl = mod.decls.get(current.name);
      if (!decl?.init || seen.has(current.name)) return undefined;
      seen.add(current.name);
      const value = literalValue(decl.init, mod, seen);
      seen.delete(current.name);
      return value;
    }
    default:
      return undefined;
  }
}

/** The paths inside a value that are worked out rather than written down, so the admin can show them locked. */
export function computedPaths(node, mod, path = [], out = [], seen = new Set()) {
  const current = unwrap(node);
  if (!current) return out;
  switch (current.type) {
    case 'literal':
      return out;
    case 'object':
      for (const prop of current.props) {
        if (prop.kind === 'init' || prop.kind === 'shorthand') computedPaths(prop.value, mod, [...path, prop.key], out, seen);
      }
      return out;
    case 'array':
      current.elements.forEach((element, index) => computedPaths(element, mod, [...path, index], out, seen));
      return out;
    case 'ident': {
      const decl = mod.decls.get(current.name);
      if (decl?.init && !seen.has(current.name)) {
        seen.add(current.name);
        computedPaths(decl.init, mod, path, out, seen);
        seen.delete(current.name);
        return out;
      }
      out.push(path);
      return out;
    }
    default:
      out.push(path);
      return out;
  }
}
