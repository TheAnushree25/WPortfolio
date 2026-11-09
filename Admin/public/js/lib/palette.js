import { h, debounce } from './dom.js';
import { icon } from './icons.js';
import { get } from './api.js';
import { navigate } from './router.js';

/**
 * The command palette (Ctrl K / ⌘K, or /): jump to any page, start a common
 * task, or find a project, a content section or a client by name.
 */

let open = false;
let commandsProvider = () => [];
export const setPaletteCommands = (fn) => (commandsProvider = fn);

export function openPalette() {
  if (open) return;
  open = true;
  const returnFocus = document.activeElement;
  const input = h('input', { type: 'search', placeholder: 'Jump to a page, a project or a client…', 'aria-label': 'Search the admin', autocomplete: 'off', spellcheck: false });
  const results = h('div.palette-results', { role: 'listbox' });
  const panel = h('div.palette', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search' }, h('div.palette-input', icon('search'), input, h('span.kbd', 'Esc')), results);
  const overlay = h('div.overlay.palette-overlay', panel);
  let items = [];
  let active = 0;
  let remote = [];
  let token = 0;

  const close = () => {
    open = false;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = '';
    returnFocus?.focus?.();
  };
  const run = (item) => {
    close();
    if (item.run) item.run();
    else if (item.href) navigate(item.href);
  };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const local = commandsProvider().filter((item) => !q || `${item.title} ${item.group} ${item.keywords ?? ''}`.toLowerCase().includes(q));
    const groups = new Map();
    for (const item of [...local, ...remote]) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    }
    items = [...groups.values()].flat().slice(0, 40);
    active = Math.min(active, Math.max(0, items.length - 1));
    let index = 0;
    results.replaceChildren(
      ...(items.length
        ? [...groups.entries()].map(([group, list]) => [
            h('div.palette-group', group),
            list.map((item) => {
              const at = index++;
              const el = h(`button.palette-item${at === active ? '.active' : ''}`, { type: 'button', role: 'option', 'aria-selected': String(at === active) }, icon(item.icon ?? 'arrowRight'), h('span.truncate', item.title), item.detail && h('span.detail', item.detail));
              el.addEventListener('click', () => run(item));
              el.addEventListener('mousemove', () => {
                if (active === at) return;
                active = at;
                draw();
              });
              return el;
            }),
          ])
        : [h('div.empty', { style: { padding: '26px' } }, q.length > 1 ? 'Nothing matches that.' : 'Type to search.')]),
    );
    results.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  };
  const searchRemote = debounce(async () => {
    const q = input.value.trim();
    const mine = ++token;
    if (q.length < 2) {
      remote = [];
      draw();
      return;
    }
    try {
      const { results: found } = await get(`/api/search?q=${encodeURIComponent(q)}`, { quiet: true });
      if (mine !== token) return;
      const glyphs = { Project: 'briefcase', System: 'layers', Content: 'fileText', Enquiry: 'inbox' };
      remote = found.map((item) => ({ group: `${item.type === 'Enquiry' ? 'Clients' : item.type === 'Content' ? 'Content' : 'Projects'}`, title: item.title, detail: item.detail, href: item.href, icon: glyphs[item.type] }));
      draw();
    } catch {
      /* the local commands still show */
    }
  }, 160);
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      draw();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, active - 1);
      draw();
    } else if (event.key === 'Enter' && items[active]) {
      event.preventDefault();
      run(items[active]);
    }
  };
  input.addEventListener('input', () => {
    active = 0;
    draw();
    searchRemote();
  });
  overlay.addEventListener('mousedown', (event) => event.target === overlay && close());
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  document.documentElement.style.overflow = 'hidden';
  draw();
  input.focus();
}

export function bindPaletteKeys() {
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable;
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      openPalette();
    } else if (event.key === '/' && !typing && !document.querySelector('.overlay, .drawer')) {
      event.preventDefault();
      openPalette();
    }
  });
}
