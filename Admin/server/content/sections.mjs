/**
 * Which parts of the site the admin edits, where each lives, and the rules a
 * change must keep before it is written. The rules guard the build: a card
 * pointing at a missing image, a chapter past the end of its deck, or a
 * system the site has no screens for would otherwise only fail at deploy.
 */

export const FILES = {
  site: { path: 'src/content/site.ts', label: 'Site content' },
  work: { path: 'src/content/work.ts', label: 'Case studies' },
  systems: { path: 'src/content/systems.ts', label: 'Systems' },
  layout: { path: 'src/app/layout.tsx', label: 'Page metadata', only: ['metadata', 'viewport'] },
};

export const SECTIONS = {
  studio: { file: 'site', name: 'site', label: 'Studio profile', group: 'Studio', description: 'Name, owner, contact details and social links used across the site.' },
  seo: { file: 'layout', name: 'metadata', label: 'Search & sharing', group: 'Studio', description: 'The title and description search engines and link previews show.' },
  viewport: { file: 'layout', name: 'viewport', label: 'Browser theme', group: 'Studio', description: 'The colour phones paint their browser bar.' },
  nav: { file: 'site', name: 'nav', label: 'Header', group: 'Every page', description: 'The links and contact pill in the header.' },
  footer: { file: 'site', name: 'footer', label: 'Footer', group: 'Every page', description: 'Locations, ways to start a project, links, credits and the legal notice.' },
  hero: { file: 'site', name: 'hero', label: 'Landing', group: 'Home page', description: 'The statement, the mission line and the intro reel.' },
  works: { file: 'site', name: 'works', label: 'Selected work', group: 'Home page', description: 'The travelling cards and the words of the project viewers.' },
  practice: { file: 'site', name: 'practice', label: 'Areas of practice', group: 'Home page', description: 'The four columns of what the studio does and for whom.' },
  story: { file: 'site', name: 'story', label: 'Story', group: 'Home page', description: 'Imagination, with direction: who Atlas is.' },
  partners: { file: 'site', name: 'partners', label: 'Partners', group: 'Home page', description: 'The client marks in “They trust us”.' },
  method: { file: 'site', name: 'method', label: 'How we work', group: 'Home page', description: 'The six stacking process cards.' },
  testimonials: { file: 'site', name: 'testimonials', label: 'Testimonials', group: 'Home page', description: 'Client words in the stacked glass cards.' },
  nextPage: { file: 'site', name: 'nextPage', label: 'Next-page teaser', group: 'Home page', description: 'The torn white sheet at the foot of the home page.' },
  worksPage: { file: 'site', name: 'worksPage', label: 'Work page', group: 'Other pages', description: 'The title, filters and rows of /works.' },
  deck: { file: 'site', name: 'deck', label: 'The deck', group: 'Other pages', description: 'The words around /deck and its PDF.' },
  booking: { file: 'site', name: 'booking', label: 'Bookings', group: 'Other pages', description: 'The meeting, its time slots and every word of /contact.' },
  studies: { file: 'work', name: 'studies', label: 'Case studies', group: 'Projects', hidden: true },
  systems: { file: 'systems', name: 'systems', label: 'Systems', group: 'Projects', hidden: true },
  systemOrder: { file: 'systems', name: 'systemOrder', label: 'System order', group: 'Projects', hidden: true },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FOCUS = /^\d{1,3}% \d{1,3}%$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:.]+(?:\.[^\s@<>()",;:.]+)+$/;
const MEDIA_KEYS = new Set(['src', 'poster', 'small', 'pdf', 'clip']);
const URL_KEYS = new Set(['linkedin', 'instagram', 'resume']);

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (path) => path.map((part) => (typeof part === 'number' ? `#${part + 1}` : part)).join(' › ');

function okHref(value) {
  if (/^(?:\/|#|mailto:|tel:)/.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Problems with a section's new value, as `{ path, message }`. `ctx` carries
 * what the rules check against: which public files exist, how many pages each
 * deck has, and the current cards and systems.
 */
export function checkSection(id, value, ctx, before) {
  const problems = [];
  const flag = (path, message) => problems.push({ path, message: `${label(path)}: ${message}` });

  // Rules for every section: sizes, links and pictures.
  (function walk(node, path) {
    if (typeof node === 'string') {
      if (node.length > 6000) flag(path, 'is longer than 6,000 characters.');
      const key = path[path.length - 1];
      if (key === 'href' && node && !okHref(node)) flag(path, 'should be a page on the site (/works), an anchor (#about), mailto: or a full https:// address.');
      if (URL_KEYS.has(key) && node && !/^https?:\/\//.test(node)) flag(path, 'should be a full https:// address.');
      if ((key === 'accent' || key === 'hex' || key === 'themeColor') && !HEX.test(node)) flag(path, 'should be a colour like #095cfb.');
      if (key === 'email' && !EMAIL.test(node)) flag(path, 'isn’t a valid email address.');
      if (MEDIA_KEYS.has(key) && node.startsWith('/') && !ctx.publicFile(node)) flag(path, `points at ${node}, which isn’t in the public folder.`);
      return;
    }
    if (typeof node === 'number' && !Number.isFinite(node)) flag(path, 'isn’t a number.');
    if (Array.isArray(node)) node.forEach((item, index) => walk(item, [...path, index]));
    else if (isPlain(node)) for (const [key, item] of Object.entries(node)) walk(item, [...path, key]);
  })(value, []);

  const required = (object, keys, path) => {
    for (const key of keys) if (!String(object?.[key] ?? '').trim()) flag([...path, key], 'can’t be empty.');
  };

  switch (id) {
    case 'studio':
      required(value, ['name', 'owner', 'email'], []);
      break;
    case 'works': {
      const seen = new Set();
      (value.projects ?? []).forEach((card, index) => {
        const path = ['projects', index];
        required(card, ['slug', 'title', 'kind', 'src', 'industry'], path);
        if (card.slug && !SLUG.test(card.slug)) flag([...path, 'slug'], 'uses lowercase letters, numbers and hyphens only.');
        if (seen.has(card.slug) || ctx.systemSlugs.includes(card.slug)) flag([...path, 'slug'], `“${card.slug}” is already taken.`);
        seen.add(card.slug);
        if (card.focus && !FOCUS.test(card.focus)) flag([...path, 'focus'], 'should look like “50% 50%”.');
      });
      break;
    }
    case 'studies': {
      for (const [slug, study] of Object.entries(value)) {
        if (!ctx.cardSlugs.includes(slug)) flag([slug], 'has no card in Selected work.');
        required(study, ['summary', 'accent'], [slug]);
        (study.editions ?? []).forEach((edition, e) => {
          const path = [slug, 'editions', e];
          required(edition, ['label', 'deck'], path);
          const pages = ctx.deckPages(edition.deck);
          if (!pages) flag([...path, 'deck'], `has no rendered pages (run scripts/work/build.py for “${edition.deck}”).`);
          (edition.chapters ?? []).forEach((chapter, c) => {
            required(chapter, ['title'], [...path, 'chapters', c]);
            if (!Number.isInteger(chapter.page) || chapter.page < 1 || (pages && chapter.page > pages)) {
              flag([...path, 'chapters', c, 'page'], pages ? `should be a page from 1 to ${pages}.` : 'should be a page number.');
            }
          });
        });
      }
      break;
    }
    case 'systems': {
      const was = Object.keys(before ?? {}).sort().join();
      if (Object.keys(value).sort().join() !== was) flag([], 'systems can be edited here but not added or removed: each needs its captured screens (README → Systems).');
      for (const [slug, study] of Object.entries(value)) required(study, ['title', 'kind', 'summary', 'accent'], [slug]);
      break;
    }
    case 'systemOrder': {
      if (!Array.isArray(value) || !value.length) flag([], 'needs at least one system.');
      const seen = new Set();
      (value ?? []).forEach((slug, index) => {
        if (!ctx.systemSlugs.includes(slug)) flag([index], `“${slug}” isn’t a system.`);
        if (seen.has(slug)) flag([index], `“${slug}” appears twice.`);
        seen.add(slug);
      });
      break;
    }
    case 'partners':
      (value.logos ?? []).forEach((logo, index) => {
        required(logo, ['name', 'src'], ['logos', index]);
        for (const key of ['width', 'height']) if (!Number.isInteger(logo[key]) || logo[key] < 1) flag(['logos', index, key], 'should be a whole number of pixels.');
      });
      break;
    case 'testimonials':
      (value.cards ?? []).forEach((card, index) => required(card, ['quote', 'name'], ['cards', index]));
      if (!(value.cards ?? []).length) flag(['cards'], 'needs at least one testimonial; the section shows the deck of cards.');
      break;
    case 'method':
      (value.steps ?? []).forEach((step, index) => required(step, ['title', 'text'], ['steps', index]));
      break;
    case 'booking': {
      const slots = value.slots ?? [];
      slots.forEach((slot, index) => {
        if (!TIME.test(slot)) flag(['slots', index], 'should be a 24-hour time like 14:30.');
      });
      if (new Set(slots).size !== slots.length) flag(['slots'], 'has the same time twice.');
      if ([...slots].sort().join() !== slots.join()) flag(['slots'], 'should run in time order.');
      if (!Number.isInteger(value.minutes) || value.minutes < 5 || value.minutes > 480) flag(['minutes'], 'should be from 5 to 480 minutes.');
      if (!Number.isInteger(value.horizon) || value.horizon < 1 || value.horizon > 365) flag(['horizon'], 'should be from 1 to 365 days.');
      break;
    }
    case 'seo':
      required(value, ['title', 'description'], []);
      if ((value.description ?? '').length > 320) flag(['description'], 'is over 320 characters; search engines cut it short.');
      break;
    default:
      break;
  }
  return problems;
}
