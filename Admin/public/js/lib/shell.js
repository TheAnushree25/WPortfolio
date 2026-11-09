import { h, mount, store, withBase, withoutBase } from './dom.js';
import { icon } from './icons.js';
import { post } from './api.js';
import { modal, popMenu, toastError } from './ui.js';
import { navigate, currentRoute } from './router.js';
import { session, onBadges, ROLE_INFO } from './session.js';
import { initials } from './format.js';
import { openPalette } from './palette.js';

/**
 * The frame around every page: the sidebar on wide screens, the top bar, a
 * tab bar and a “More” sheet on phones, the sample-data notice, and the
 * outlet each view draws into.
 */

export const NAV = [
  { label: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: 'dashboard' }, { href: '/analytics', label: 'Analytics', icon: 'chart' }] },
  { label: 'Studio work', items: [{ href: '/projects', label: 'Projects', icon: 'briefcase' }, { href: '/media', label: 'Media library', icon: 'image' }] },
  {
    label: 'Website',
    items: [
      { href: '/content', label: 'Pages & copy', icon: 'fileText' },
      { href: '/content/testimonials', label: 'Testimonials', icon: 'quote' },
      { href: '/content/seo', label: 'Search & sharing', icon: 'globe' },
    ],
  },
  {
    label: 'Clients',
    items: [
      { href: '/enquiries', label: 'Enquiries', icon: 'inbox', badge: 'enquiries' },
      { href: '/meetings', label: 'Meetings', icon: 'calendar', badge: 'meetingsToday' },
    ],
  },
  {
    label: 'Site',
    items: [
      { href: '/publish', label: 'Publish', icon: 'rocket', badge: 'changes', warn: true },
      { href: '/activity', label: 'Activity', icon: 'history' },
    ],
  },
  { label: 'Admin', items: [{ href: '/team', label: 'Team', icon: 'users', role: 'owner' }, { href: '/settings', label: 'Settings', icon: 'settings' }] },
];
const TABS = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/projects', label: 'Projects', icon: 'briefcase' },
  { href: '/enquiries', label: 'Enquiries', icon: 'inbox', badge: 'enquiries' },
  { href: '/meetings', label: 'Meetings', icon: 'calendar', badge: 'meetingsToday' },
];

const allItems = () => NAV.flatMap((group) => group.items).filter((item) => !item.role || session.can(item.role));

/** The nav item a path belongs to: the longest matching prefix. */
function activeHref(path) {
  let best = '/';
  for (const item of [...allItems(), ...TABS]) {
    if (item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`)) {
      if (item.href.length > best.length || best === '/') best = item.href;
    }
  }
  return path === '/' ? '/' : best === '/' ? null : best;
}

let refs = null;

export function outlet() {
  return refs.view;
}

export function setTitle(title) {
  document.title = `${title} · Atlas Studios Admin`;
  if (refs) refs.title.textContent = title;
}

/** Fills the outlet; views call this with their page. */
export function show(...children) {
  mount(refs.view, ...children);
  refs.view.focus({ preventScroll: true });
}

function badgeFor(item) {
  if (!item.badge) return null;
  const n = session.badges[item.badge] ?? 0;
  return n > 0 ? h(`span.count${item.warn ? '.warn' : ''}`, String(n > 99 ? '99+' : n)) : null;
}

export function applyTheme(choice) {
  const theme = choice === 'light' || choice === 'dark' ? choice : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeChoice = choice;
  store.set('theme', choice === 'system' ? null : choice);
  try {
    if (choice === 'system') localStorage.removeItem('atlas-admin-theme');
    else localStorage.setItem('atlas-admin-theme', choice);
  } catch {
    /* fine */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f7ff' : '#040b22');
}

export function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

export async function signOut() {
  try {
    await post('/api/auth/logout', {});
  } catch (error) {
    if (error.status !== 401) toastError(error);
  }
  location.href = withBase('/login');
}

function userMenu(anchor) {
  const user = session.user;
  popMenu(anchor, [
    { node: h('div.menu-head', h('div.row', h('span.avatar', initials(user.name)), h('div.meta', h('strong', user.name), h('div.tiny.muted', `${user.email} · ${ROLE_INFO[user.role].label}`)))) },
    '-',
    { label: 'Account & security', icon: 'user', onClick: () => navigate('/settings/account') },
    { label: document.documentElement.dataset.theme === 'dark' ? 'Light theme' : 'Dark theme', icon: document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', onClick: toggleTheme },
    { label: 'Keyboard: search', icon: 'command', hint: navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K', onClick: openPalette },
    '-',
    { label: 'Sign out', icon: 'logout', danger: true, onClick: signOut },
  ]);
}

function notificationsMenu(anchor) {
  const b = session.badges;
  const rows = [
    b.enquiries && { label: `${b.enquiries} new ${b.enquiries === 1 ? 'enquiry' : 'enquiries'}`, icon: 'inbox', onClick: () => navigate('/enquiries') },
    b.meetingsToday && { label: `${b.meetingsToday} ${b.meetingsToday === 1 ? 'meeting' : 'meetings'} today`, icon: 'calendar', onClick: () => navigate('/meetings') },
    b.changes && { label: `${b.changes} ${b.changes === 1 ? 'change isn’t' : 'changes aren’t'} live yet`, icon: 'rocket', onClick: () => navigate('/publish') },
  ].filter(Boolean);
  popMenu(anchor, rows.length ? rows : [{ node: h('div.menu-head.small.muted', 'You’re all caught up.') }]);
}

function moreSheet() {
  const body = h(
    'div.stack',
    NAV.map((group) =>
      h(
        'div.nav-group',
        h('div.nav-label', group.label),
        group.items.filter((item) => !item.role || session.can(item.role)).map((item) => h('a.nav-link', { href: item.href, onClick: () => sheet.close() }, icon(item.icon), item.label, badgeFor(item))),
      ),
    ),
    h('div.divider'),
    h(
      'div.row.wrap',
      h('button.btn.small', { type: 'button', onClick: () => (toggleTheme(), sheet.close()) }, icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'), document.documentElement.dataset.theme === 'dark' ? 'Light theme' : 'Dark theme'),
      h('button.btn.small.danger', { type: 'button', onClick: signOut }, icon('logout'), 'Sign out'),
    ),
  );
  const sheet = modal({ title: session.user.name, body });
}

export function renderShell(root) {
  const title = h('div.topbar-title', '');
  const view = h('div#view', { tabindex: -1 });
  const themeButton = h('button.icon-btn', { type: 'button', 'aria-label': 'Switch theme' });
  const drawThemeButton = () => themeButton.replaceChildren(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'));
  themeButton.addEventListener('click', () => {
    toggleTheme();
    drawThemeButton();
  });
  drawThemeButton();
  const sidebarNav = h('nav', { 'aria-label': 'Main' });
  const tabbar = h('nav.tabbar', { 'aria-label': 'Main' });
  const bell = h('button.icon-btn', { type: 'button', 'aria-label': 'Notifications' }, icon('bell'));
  const avatar = h('button.icon-btn', { type: 'button', 'aria-label': 'Your account' }, h('span.avatar.small', initials(session.user.name)));
  const sampleBar = h(
    'div.sample-bar.hidden',
    icon('sparkles'),
    h('span.grow', h('span.long', 'Sample enquiries, meetings and visits are showing, so you can see the admin at work.'), h('span.short', 'Sample data is showing.')),
    session.can('owner') ? h('a.btn.small', { href: '/settings/data' }, 'Clear') : null,
  );

  bell.addEventListener('click', () => notificationsMenu(bell));
  avatar.addEventListener('click', () => userMenu(avatar));

  const drawNav = () => {
    const active = activeHref(currentRoute()?.path ?? withoutBase(location.pathname));
    mount(
      sidebarNav,
      NAV.map((group) => {
        const items = group.items.filter((item) => !item.role || session.can(item.role));
        if (!items.length) return null;
        return h('div.nav-group', h('div.nav-label', group.label), items.map((item) => h(`a.nav-link${active === item.href ? '.active' : ''}`, { href: item.href, 'aria-current': active === item.href ? 'page' : undefined }, icon(item.icon), h('span', item.label), badgeFor(item))));
      }),
    );
    const onTab = TABS.some((tab) => tab.href === active);
    mount(
      tabbar,
      TABS.map((tab) => h(`a.tab${active === tab.href ? '.active' : ''}`, { href: tab.href, 'aria-current': active === tab.href ? 'page' : undefined }, icon(tab.icon), tab.label, badgeFor(tab))),
      h(`button.tab${!onTab ? '.active' : ''}`, { type: 'button', onClick: moreSheet }, icon('menu'), 'More', session.badges.changes ? h('span.count.warn', String(session.badges.changes)) : null),
    );
    bell.querySelector('.dot')?.remove();
    if (session.badges.enquiries || session.badges.meetingsToday) bell.append(h('span.dot'));
    sampleBar.classList.toggle('hidden', !session.badges.sample);
  };

  mount(
    root,
    h(
      'div.shell',
      h(
        'aside.sidebar',
        h('a.sidebar-brand', { href: '/', 'aria-label': 'Atlas Studios admin, dashboard' }, h('span.logo', { role: 'img', 'aria-label': 'Atlas Studios' }), h('span.badge-admin', 'Admin')),
        sidebarNav,
        h(
          'div.sidebar-foot',
          h('button.nav-link', { type: 'button', style: { width: '100%', border: '0', background: 'none' }, onClick: (event) => userMenu(event.currentTarget) }, h('span.avatar.small', initials(session.user.name)), h('span.truncate', session.user.name), icon('chevronUp')),
        ),
      ),
      h(
        'div',
        { style: { minWidth: '0' } },
        h(
          'header.topbar',
          h('a.topbar-brand', { href: '/', 'aria-label': 'Dashboard' }, h('span.mark')),
          title,
          h(
            'div.topbar-actions',
            h('button.btn.small.search-trigger', { type: 'button', onClick: openPalette }, icon('search'), h('span.muted', 'Search…'), h('span.kbd', navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K')),
            h('button.icon-btn', { type: 'button', class: 'mobile-search', 'aria-label': 'Search', onClick: openPalette }, icon('search')),
            themeButton,
            bell,
            avatar,
          ),
        ),
        h('main.main', sampleBar, view),
        tabbar,
      ),
    ),
  );
  refs = { title, view, drawNav, sampleBar };
  onBadges(drawNav);
  drawNav();
  return refs;
}

export function refreshNav() {
  refs?.drawNav();
}
