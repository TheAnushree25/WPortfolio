import { works } from './site';
import { studies, type DeckPage, type ProjectData, type Screen } from './work';
import { systemOrder, systems } from './systems';
import yooj from './decks/yooj.json';
import dorikala from './decks/dorikala.json';
import kidcity from './decks/kidcity.json';
import freshFeast from './decks/fresh-feast.json';
import springChu from './decks/spring-chu.json';
import zenoxa from './decks/zenoxa.json';
import freighteasy from './decks/freighteasy.json';
import freighteasyBrochure from './decks/freighteasy-brochure.json';
import mapleFurnishersScreens from './screens/maple-furnishers.json';
import mapleStudiosScreens from './screens/maple-studios.json';
import shokuScreens from './screens/shoku.json';
import keeriScreens from './screens/keeri.json';
import madhusudanScreens from './screens/madhusudan-voice.json';
import ishitaScreens from './screens/ishita-traders.json';

/**
 * Joins each card with its study and the pages or screens rendered for it.
 * Only the work routes read this, on the server, so a project's data travels
 * to the browser with the one project being opened (and the work page's
 * cards and screening room with that page) and nowhere else.
 */
const decks: Record<string, { pages: DeckPage[] }> = {
  yooj,
  dorikala,
  kidcity,
  'fresh-feast': freshFeast,
  'spring-chu': springChu,
  zenoxa,
  freighteasy,
  'freighteasy-brochure': freighteasyBrochure,
};

const screens = {
  'maple-furnishers': mapleFurnishersScreens,
  'maple-studios': mapleStudiosScreens,
  shoku: shokuScreens,
  keeri: keeriScreens,
  'madhusudan-voice': madhusudanScreens,
  'ishita-traders': ishitaScreens,
} as Record<string, { screens: Screen[] }>;

/** The design cards that open a deck, in the order the row shows them. */
const deckCards = works.projects.filter((project) => project.slug in studies);

/** A system's screens; its first desktop screen is its cover. */
function screensOf(slug: string) {
  const list = screens[slug]?.screens;
  if (!list?.length) throw new Error(`No screens for system "${slug}": run node scripts/work/screens.mjs ${slug}`);
  return list;
}
const coverOf = (slug: string) => {
  const list = screensOf(slug);
  return { src: (list.find((screen) => screen.device === 'desktop') ?? list[0]).src, focus: '50% 0%' };
};

export const projectSlugs = [...deckCards.map((card) => card.slug), ...systemOrder];

export function getProject(slug: string): ProjectData | null {
  if (slug in systems) {
    const study = systems[slug];
    const index = systemOrder.indexOf(slug as (typeof systemOrder)[number]);
    const nextSlug = systemOrder[(index + 1) % systemOrder.length];
    return {
      discipline: 'system',
      slug,
      title: study.title,
      kind: study.kind,
      summary: study.summary,
      accent: study.accent,
      cover: coverOf(slug),
      system: { ...study, screens: screensOf(slug) },
      next: { slug: nextSlug, title: systems[nextSlug].title, kind: systems[nextSlug].kind, cover: coverOf(nextSlug) },
    };
  }

  const index = deckCards.findIndex((card) => card.slug === slug);
  if (index < 0) return null;
  const card = deckCards[index];
  const study = studies[slug];
  const next = deckCards[(index + 1) % deckCards.length];
  return {
    discipline: 'design',
    slug,
    title: card.title,
    kind: card.kind,
    summary: study.summary,
    accent: study.accent,
    cover: { src: card.src, focus: card.focus },
    editions: study.editions.map((edition) => {
      const pages = decks[edition.deck]?.pages;
      if (!pages) throw new Error(`No pages for deck "${edition.deck}": run scripts/work/build.py`);
      return { label: edition.label, pages, chapters: [...edition.chapters] };
    }),
    next: { slug: next.slug, title: next.title, kind: next.kind, cover: { src: next.src, focus: next.focus } },
  };
}

/** A few frames spread through a list: its first, then evenly to near its end. */
const spread = <T,>(list: readonly T[], count: number) =>
  list.length <= count ? [...list] : Array.from({ length: count }, (_, i) => list[Math.round((i * (list.length - 1)) / count)]);

/** Accents for the design cards that have no deck yet, taken from their labels. */
const SHOT_ACCENTS: Record<string, string> = { teddy: '#e0a85c', dishoom: '#e07a52', animal: '#c8a46e' };

/**
 * Everything the work page shows: its two rows of cards and the screening
 * room's programme (each project's frames, half-size, with their previews).
 */
export function worksData() {
  const systemCards = systemOrder.map((slug) => {
    const study = systems[slug];
    return { slug, title: study.title, kind: study.kind, src: coverOf(slug).src, focus: '50% 0%', industry: study.industry, accent: study.accent, opens: true };
  });
  const designCards = works.projects.map((card) => ({
    slug: card.slug,
    title: card.title,
    kind: card.kind,
    src: card.src,
    focus: card.focus,
    industry: card.industry,
    accent: studies[card.slug]?.accent ?? SHOT_ACCENTS[card.slug] ?? '#7fb2ff',
    opens: card.slug in studies,
  }));

  const reels = [
    ...systemOrder.map((slug) => ({
      slug,
      title: systems[slug].title,
      kind: systems[slug].kind,
      discipline: 'system' as const,
      frames: spread(
        screensOf(slug).filter((screen) => screen.device === 'desktop'),
        5,
      ).map((screen) => ({ src: screen.half, preview: screen.preview })),
    })),
    ...works.projects.map((card) => {
      const pages = studies[card.slug] ? decks[studies[card.slug].editions[0].deck]?.pages ?? [] : [];
      return {
        slug: card.slug,
        title: card.title,
        kind: card.kind,
        discipline: 'design' as const,
        frames: pages.length ? spread(pages, 5).map((page) => ({ src: page.half, preview: page.preview })) : [{ src: card.src, preview: '' }],
      };
    }),
  ];

  return { systems: systemCards, designs: designCards, reels };
}
