/**
 * A tiny element builder. `h('button.btn.primary', { onClick }, 'Save')`.
 * Text always goes in as text nodes, so nothing a client types can become
 * markup; only the admin's own icons use `html`.
 */

/**
 * Where the admin is served: '' on its own server, '/admin' inside the site.
 * The page's <base> says so; every path the admin writes goes through withBase.
 */
export const BASE = (() => {
  try {
    return new URL(document.baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

export function withBase(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return path;
  if (BASE && (path === BASE || path.startsWith(`${BASE}/`) || path.startsWith(`${BASE}?`))) return path;
  return BASE + path;
}

/** A path as the admin's own routes see it, without the base. */
export function withoutBase(path) {
  if (BASE && (path === BASE || path.startsWith(`${BASE}/`))) return path.slice(BASE.length) || '/';
  return path;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'linearGradient', 'stop', 'text', 'ellipse']);

export function h(tag, props, ...children) {
  // 'div#view.a.b' → a div with id "view" and classes "a b".
  const [head, ...classes] = tag.split('.');
  const [name, id] = head.split('#');
  const svg = SVG_TAGS.has(name);
  const el = svg ? document.createElementNS(SVG_NS, name) : document.createElement(name || 'div');
  if (id) el.id = id;
  if (classes.length) el.setAttribute('class', classes.join(' '));
  if (props === null || props === undefined || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  // An input's type goes first: setting it after the value can clear the value.
  if (props.type !== undefined && props.type !== null) el.setAttribute('type', props.type);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false || key === 'type') continue;
    if (key === 'class') el.setAttribute('class', [el.getAttribute('class'), value].filter(Boolean).join(' '));
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (v === undefined || v === null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'href') el.setAttribute('href', withBase(String(value)));
    else if (key === 'ref' && typeof value === 'function') value(el);
    else if (!svg && key in el && !['list', 'form', 'type', 'width', 'height'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function mount(el, ...children) {
  clear(el);
  return append(el, children);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Debounces a function by `ms`. */
export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`atlas-admin-${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`atlas-admin-${key}`, JSON.stringify(value));
    } catch {
      /* private windows can refuse storage; preferences then last for the visit */
    }
  },
};

/** The site's public files are served to signed-in users from /site-media. */
export const mediaUrl = (publicPath) => (publicPath ? `${BASE}/site-media${publicPath.split('/').map(encodeURIComponent).join('/')}` : '');
/** The half-size render beside a deck page or screen, when the path has one. */
export const thumbUrl = (publicPath) => mediaUrl(/\/work\/.+\/\d+\.webp$/.test(publicPath ?? '') ? publicPath.replace(/\.webp$/, '-half.webp') : publicPath);

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}
