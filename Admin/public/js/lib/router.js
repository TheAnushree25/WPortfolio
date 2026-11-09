import { BASE, withBase, withoutBase } from './dom.js';

/**
 * Client-side routes on the History API. A view is an async function that
 * fills the page and may return a clean-up (to close a stream, say). A page
 * with unsaved changes registers a guard, and leaving asks first. Routes are
 * written from the admin's root; the address bar carries its base (/admin).
 */

const routes = [];
let current = null;
let cleanup = null;
let guard = null;
let onChange = () => {};
let renderId = 0;

function compile(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { keys, re: new RegExp(`^/${source}/?$`) };
}

export function route(pattern, view, options = {}) {
  routes.push({ pattern, view, options, ...compile(pattern) });
}

export function setGuard(fn) {
  guard = fn;
}

export function onRouteChange(fn) {
  onChange = fn;
}

export function currentRoute() {
  return current;
}

export async function navigate(to, { replace = false, force = false } = {}) {
  const url = new URL(withBase(to), location.origin);
  const target = url.pathname + url.search;
  if (!force && guard && !(await guard())) return false;
  guard = null;
  if (replace) history.replaceState({}, '', target);
  else if (target !== location.pathname + location.search) history.pushState({}, '', target);
  await render();
  return true;
}

export async function render() {
  const id = ++renderId;
  const pathname = withoutBase(location.pathname);
  let match = null;
  let params = {};
  for (const item of routes) {
    const found = item.re.exec(pathname);
    if (found) {
      match = item;
      item.keys.forEach((key, index) => (params[key] = decodeURIComponent(found[index + 1])));
      break;
    }
  }
  if (!match) match = routes.find((item) => item.pattern === '*');
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch {
      /* a view's clean-up never blocks the next page */
    }
  }
  cleanup = null;
  current = { ...match, params, query: Object.fromEntries(new URLSearchParams(location.search)), path: pathname };
  onChange(current);
  const result = await match.view(current);
  if (id === renderId) cleanup = result;
  else if (typeof result === 'function') result();
}

export function start() {
  window.addEventListener('popstate', async () => {
    if (guard && !(await guard())) {
      history.pushState({}, '', withBase(current?.path ?? '/'));
      return;
    }
    guard = null;
    render();
  });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download') || link.dataset.external !== undefined) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    // A link out of the admin (the site's own pages) is an ordinary link.
    if (BASE && url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return;
    const path = withoutBase(url.pathname);
    if (/^\/(api|site-media|trash-media|assets)\//.test(path)) return;
    event.preventDefault();
    navigate(path + url.search);
  });
  window.addEventListener('beforeunload', (event) => {
    if (guard) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  return render();
}
