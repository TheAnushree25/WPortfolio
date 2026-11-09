import { h, withBase, withoutBase } from './lib/dom.js';
import { get, configureApi } from './lib/api.js';
import { route, start, navigate, onRouteChange } from './lib/router.js';
import { session, startBadges } from './lib/session.js';
import { renderShell, refreshNav, NAV, signOut, toggleTheme } from './lib/shell.js';
import { bindPaletteKeys, setPaletteCommands } from './lib/palette.js';
import { renderSetup, renderLogin, renderPasswordChange } from './views/auth.js';

/**
 * Boots the admin: asks who is signed in, then shows setup (first run),
 * sign-in, a required password change, or the admin itself. Each page's code
 * is loaded the first time it is opened.
 */

const app = document.getElementById('app');
const lazy = (load) => async (ctx) => (await load()).default(ctx);

const views = {
  dashboard: lazy(() => import('./views/dashboard.js')),
  analytics: lazy(() => import('./views/analytics.js')),
  projects: lazy(() => import('./views/projects.js')),
  content: lazy(() => import('./views/content.js')),
  media: lazy(() => import('./views/media.js')),
  enquiries: lazy(() => import('./views/enquiries.js')),
  meetings: lazy(() => import('./views/meetings.js')),
  publish: lazy(() => import('./views/publish.js')),
  activity: lazy(() => import('./views/activity.js')),
  team: lazy(() => import('./views/team.js')),
  settings: lazy(() => import('./views/settings.js')),
};

function registerRoutes() {
  route('/', views.dashboard);
  route('/analytics', views.analytics);
  route('/projects', views.projects);
  route('/projects/new', views.projects);
  route('/projects/design/:slug', views.projects);
  route('/projects/system/:slug', views.projects);
  route('/content', views.content);
  route('/content/:id', views.content);
  route('/media', views.media);
  route('/enquiries', views.enquiries);
  route('/enquiries/:id', views.enquiries);
  route('/meetings', views.meetings);
  route('/publish', views.publish);
  route('/activity', views.activity);
  route('/team', views.team);
  route('/settings', views.settings);
  route('/settings/:tab', views.settings);
  route('/login', () => navigate('/', { replace: true, force: true }));
  route('*', async () => {
    const { show, setTitle } = await import('./lib/shell.js');
    const { empty, button } = await import('./lib/ui.js');
    setTitle('Not found');
    show(empty({ glyph: 'search', title: 'There’s no page here', text: 'It may have moved. The dashboard has everything.', action: button('Go to the dashboard', { href: '/', kind: 'primary' }) }));
  });
}

function paletteCommands() {
  const pages = NAV.flatMap((group) => group.items.filter((item) => !item.role || session.can(item.role)).map((item) => ({ group: 'Pages', title: item.label, href: item.href, icon: item.icon, keywords: group.label })));
  const actions = [
    session.can('editor') && { group: 'Actions', title: 'Add an enquiry', href: '/enquiries?new=1', icon: 'plus', keywords: 'lead client new' },
    session.can('editor') && { group: 'Actions', title: 'Add a meeting', href: '/meetings?new=1', icon: 'calendar', keywords: 'book call' },
    session.can('editor') && { group: 'Actions', title: 'Add a project card', href: '/projects/new', icon: 'briefcase', keywords: 'work card new' },
    session.can('editor') && { group: 'Actions', title: 'Upload media', href: '/media?upload=1', icon: 'upload', keywords: 'image picture file' },
    { group: 'Actions', title: 'Review and publish changes', href: '/publish', icon: 'rocket', keywords: 'deploy build live' },
    { group: 'Actions', title: 'Switch light / dark theme', run: toggleTheme, icon: 'moon', keywords: 'appearance dark light' },
    { group: 'Actions', title: 'Sign out', run: signOut, icon: 'logout' },
  ].filter(Boolean);
  const sections = [
    ['studio', 'Studio profile'],
    ['hero', 'Landing statement'],
    ['practice', 'Areas of practice'],
    ['story', 'Story'],
    ['partners', 'Partners'],
    ['method', 'How we work'],
    ['footer', 'Footer & legal notice'],
    ['booking', 'Bookings & time slots'],
  ].map(([id, title]) => ({ group: 'Content', title, href: `/content/${id}`, icon: 'fileText' }));
  return [...pages, ...actions, ...sections];
}

/** An admin path to return to after signing in: one of the admin's own, never another site. */
const safeNext = (value) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/');

async function boot() {
  // The admin's own path for this page (without /admin), to come back to after signing in.
  const here = withoutBase(location.pathname) + location.search;
  configureApi({
    onSignedOut: () => {
      location.href = withBase('/login') + (here && here !== '/' ? `?next=${encodeURIComponent(here)}` : '');
    },
    onPasswordChange: () => location.reload(),
  });

  let state;
  try {
    state = await get('/api/auth/state', { quiet: true });
  } catch (error) {
    app.replaceChildren(h('div.boot', h('span.boot-mark'), h('span.boot-text', error.message)));
    return;
  }

  if (state.needsSetup) {
    history.replaceState({}, '', withBase('/setup') + location.search);
    renderSetup(app, state);
    return;
  }
  const atAuthPage = ['/login', '/setup'].includes(withoutBase(location.pathname));
  if (!state.user) {
    const next = atAuthPage ? new URLSearchParams(location.search).get('next') ?? '/' : here;
    history.replaceState({}, '', withBase('/login'));
    renderLogin(app, { next: safeNext(next) });
    return;
  }
  session.user = state.user;
  configureApi({ csrf: state.csrf });
  if (state.user.mustChangePassword) {
    renderPasswordChange(app);
    return;
  }

  if (atAuthPage) history.replaceState({}, '', withBase(safeNext(new URLSearchParams(location.search).get('next'))));
  renderShell(app);
  registerRoutes();
  onRouteChange(() => {
    refreshNav();
    window.scrollTo({ top: 0 });
  });
  setPaletteCommands(paletteCommands);
  bindPaletteKeys();
  startBadges();
  await start();
}

boot();
