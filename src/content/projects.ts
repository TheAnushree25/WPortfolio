import { works } from './site';
import { studies, type DeckPage, type ProjectData } from './work';
import yooj from './decks/yooj.json';
import dorikala from './decks/dorikala.json';
import kidcity from './decks/kidcity.json';
import freshFeast from './decks/fresh-feast.json';
import springChu from './decks/spring-chu.json';
import zenoxa from './decks/zenoxa.json';
import freighteasy from './decks/freighteasy.json';
import freighteasyBrochure from './decks/freighteasy-brochure.json';

/**
 * Joins each card with its study and the pages scripts/work/build.py rendered.
 * Only the /work routes read this, on the server, so the page data travels to
 * the browser with the one project being opened and nowhere else.
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

/** The cards that open a deck, in the order the row shows them. */
const cards = works.projects.filter((project) => project.slug in studies);

export const projectSlugs = cards.map((card) => card.slug);

export function getProject(slug: string): ProjectData | null {
  const index = cards.findIndex((card) => card.slug === slug);
  if (index < 0) return null;
  const card = cards[index];
  const study = studies[slug];
  const next = cards[(index + 1) % cards.length];
  return {
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
