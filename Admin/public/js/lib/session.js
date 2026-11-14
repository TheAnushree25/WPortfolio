import { get } from './api.js';

/**
 * Who is signed in, what their role allows, and the counts the menu shows.
 * Views read `session.user`; the shell redraws its badges on `onBadges`.
 */

const ROLES = ['viewer', 'editor', 'owner'];
const listeners = new Set();

export const session = {
  user: null,
  /** 'local' when the admin runs beside the site's files; 'hosted' when it's the backend (backend/), with the site on GitHub. */
  mode: 'local',
  /** What the server offers beyond the basics (two-step sign-in, email, uploads in pieces); the local admin offers none of these. */
  features: {},
  get hosted() {
    return this.mode === 'hosted';
  },
  badges: { enquiries: 0, changes: 0, meetingsToday: 0, sample: false },
  can(role) {
    return Boolean(this.user) && ROLES.indexOf(this.user.role) >= ROLES.indexOf(role);
  },
};

export function onBadges(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let timer = null;
export async function refreshBadges() {
  try {
    session.badges = await get('/api/badges', { quiet: true });
    for (const fn of listeners) fn(session.badges);
  } catch {
    /* the next refresh will try again */
  }
}

export function startBadges() {
  clearInterval(timer);
  refreshBadges();
  timer = setInterval(() => document.visibilityState === 'visible' && refreshBadges(), 45_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshBadges());
}

export function stopBadges() {
  clearInterval(timer);
}

export const ROLE_INFO = {
  owner: { label: 'Owner', text: 'Everything, including deploys, team accounts, settings and data.' },
  editor: { label: 'Editor', text: 'Edits content, projects and media, works with enquiries and meetings, runs checks and previews.' },
  viewer: { label: 'Viewer', text: 'Sees everything, changes nothing. Good for a client or an accountant.' },
};
