/**
 * The case studies behind the selected-work cards, read in the work viewer at
 * /work/<slug>. Each edition is one PDF, rendered page by page into
 * public/work/<deck>/ by scripts/work/build.py; its chapters are what the
 * viewer's index lists, each named by the page it starts on (counting from 1).
 * The card itself (title, kind, shot) lives with the others in `site.ts`.
 */

import type { SystemStudy } from './systems';

export type Chapter = { readonly title: string; readonly page: number };

type Edition = { readonly label: string; readonly deck: string; readonly chapters: readonly Chapter[] };

export type Study = {
  /** Two or three sentences for the title card, in the deck's own words. */
  readonly summary: string;
  /** The brand's colour, lifted so it reads on the night ground. */
  readonly accent: string;
  readonly editions: readonly Edition[];
};

export const studies: Record<string, Study> = {
  yooj: {
    summary:
      'Healthcare feels better when we do it together. One identity carries YOOJ across care, consultation, pharmacy, clinic and pathology: a stethoscope that forms a Y, a deep maroon and a calm, human voice.',
    accent: '#fd6e81',
    editions: [
      {
        label: 'Brand guidelines',
        deck: 'yooj',
        chapters: [
          { title: 'The brand family', page: 1 },
          { title: 'Manifesto', page: 7 },
          { title: 'The logo', page: 8 },
          { title: 'Colour palette', page: 11 },
          { title: 'Typography', page: 12 },
          { title: 'Imagery', page: 14 },
          { title: 'In the world', page: 16 },
          { title: 'Illustration', page: 21 },
          { title: 'Out of home', page: 22 },
          { title: 'Social', page: 24 },
          { title: 'Icons', page: 25 },
          { title: 'Do’s and don’ts', page: 26 },
          { title: 'At the heart of YOOJ', page: 27 },
          { title: 'On LinkedIn', page: 28 },
        ],
      },
    ],
  },
  dorikala: {
    summary:
      'Dori, the thread. Kala, the art. A fashion label for a generation that wears heritage and now at once, with a knot-crowned wordmark and colours chosen not from a mood board, but from memory.',
    accent: '#f2539c',
    editions: [
      {
        label: 'Brand guidelines',
        deck: 'dorikala',
        chapters: [
          { title: 'Introduction', page: 1 },
          { title: 'Manifesto', page: 3 },
          { title: 'Vision & mission', page: 4 },
          { title: 'Our people', page: 5 },
          { title: 'Positioning', page: 6 },
          { title: 'Four pillars', page: 9 },
          { title: 'The name', page: 10 },
          { title: 'The logo', page: 11 },
          { title: 'Colour', page: 15 },
          { title: 'Typography', page: 17 },
          { title: 'Imagery', page: 18 },
          { title: 'Packaging', page: 19 },
          { title: 'Collateral', page: 25 },
          { title: 'Retail & campaign', page: 32 },
          { title: 'Social', page: 36 },
          { title: 'Elements & icons', page: 38 },
          { title: 'Voice & tone', page: 40 },
          { title: 'Do’s and don’ts', page: 41 },
          { title: 'The thread continues', page: 42 },
        ],
      },
    ],
  },
  kidcity: {
    summary:
      'Made for everyday joy. A kids’ wear identity with a panda for a mascot, five cheerful colours and rounded, friendly type.',
    accent: '#3ad3fb',
    editions: [
      {
        label: 'Brand guide',
        deck: 'kidcity',
        chapters: [
          { title: 'Introduction', page: 1 },
          { title: 'Colour palette', page: 3 },
          { title: 'Typography', page: 6 },
          { title: 'In the world', page: 7 },
          { title: 'Objects to play with', page: 10 },
          { title: 'The character', page: 11 },
          { title: 'Pattern', page: 13 },
        ],
      },
    ],
  },
  'fresh-feast': {
    summary:
      'Inspired by palaces, perfected for your palate. A salad and juice bar that serves Jaipur in every forkful, with a fresh green identity, playful produce and packaging to match.',
    accent: '#8fcb2a',
    editions: [
      {
        label: 'Brand book',
        deck: 'fresh-feast',
        chapters: [
          { title: 'Introduction', page: 1 },
          { title: 'The story', page: 2 },
          { title: 'The logo', page: 3 },
          { title: 'Colour palette', page: 4 },
          { title: 'Typography', page: 5 },
          { title: 'Icons', page: 6 },
          { title: 'Patterns', page: 8 },
          { title: 'In the world', page: 9 },
          { title: 'Coming to Jaipur', page: 11 },
        ],
      },
    ],
  },
  'spring-chu': {
    summary:
      'The spirit of Bhutan in every drop. Naming and identity for a premium water drawn from the springs beneath Gangkhar Puensum, the highest unclimbed mountain in the world.',
    accent: '#2fb6e4',
    editions: [
      {
        label: 'Brand book',
        deck: 'spring-chu',
        chapters: [
          { title: 'Introduction', page: 1 },
          { title: 'Background', page: 2 },
          { title: 'The brief', page: 3 },
          { title: 'Positioning', page: 4 },
          { title: 'Design values', page: 6 },
          { title: 'The logo', page: 7 },
          { title: 'The name', page: 8 },
          { title: 'Colour palette', page: 9 },
          { title: 'Typography', page: 10 },
          { title: 'Gradient', page: 11 },
          { title: 'To be continued', page: 12 },
        ],
      },
    ],
  },
  zenoxa: {
    summary:
      'True growth begins from within. A wellness brand whose mark folds two safeguarding hands into a Z: protection, healing and growth in a single gesture.',
    accent: '#94c48b',
    editions: [
      {
        label: 'Brand book',
        deck: 'zenoxa',
        chapters: [
          { title: 'Introduction', page: 1 },
          { title: 'Design values', page: 2 },
          { title: 'The logo', page: 3 },
          { title: 'Colour', page: 5 },
          { title: 'Typography', page: 6 },
          { title: 'In the world', page: 7 },
          { title: 'About the brand', page: 8 },
        ],
      },
    ],
  },
  freighteasy: {
    summary:
      'Making freight easy. The company deck for Freighteasy Solutions, a multi-modal logistics partner: its leadership, services, clients and mission, as a presentation and as an A4 brochure.',
    accent: '#4c8dff',
    editions: [
      {
        label: 'Presentation',
        deck: 'freighteasy',
        chapters: [
          { title: 'Cover & contents', page: 1 },
          { title: 'Overview', page: 3 },
          { title: 'Leadership', page: 4 },
          { title: 'Partnerships', page: 11 },
          { title: 'Services', page: 12 },
          { title: 'Clients', page: 18 },
          { title: 'Mission & vision', page: 19 },
          { title: 'Let’s connect', page: 22 },
        ],
      },
      {
        label: 'Brochure',
        deck: 'freighteasy-brochure',
        chapters: [
          { title: 'Cover', page: 1 },
          { title: 'Overview', page: 2 },
          { title: 'Leadership', page: 3 },
          { title: 'Partners & services', page: 6 },
          { title: 'Financials', page: 7 },
          { title: 'What we move', page: 9 },
          { title: 'Contact', page: 10 },
        ],
      },
    ],
  },
};

/** One rendered page, as scripts/work/build.py describes it. */
export type DeckPage = {
  /** The page at reading resolution, `width` pixels wide. */
  src: string;
  /** The same at half the width, for phones and 1x screens. */
  half: string;
  width: number;
  height: number;
  /** The page's average colour: its ground until the image arrives. */
  tone: string;
  /** A 24px rendering, blurred into the placeholder and the light behind the page. */
  preview: string;
};

/** A project's shot, as the card shows it. */
export type Shot = { src: string; focus: string };

type ProjectBase = {
  slug: string;
  title: string;
  kind: string;
  summary: string;
  accent: string;
  cover: Shot;
  next: { slug: string; title: string; kind: string; cover: Shot };
};

/** A design project: its deck (or decks), read page by page. */
export type DeckProject = ProjectBase & {
  discipline: 'design';
  editions: { label: string; pages: DeckPage[]; chapters: Chapter[] }[];
};

/** A system: its case study, read chapter by chapter (content/systems.ts). */
export type SystemProject = ProjectBase & {
  discipline: 'system';
  system: SystemCase;
};

/** Everything a viewer needs to show one project, assembled on the server. */
export type ProjectData = DeckProject | SystemProject;

/** A system's study with its screens, as the viewer reads it. */
export type SystemCase = SystemStudy & { screens: Screen[] };

/** One screen of a live site, as scripts/work/screens.mjs captured it. */
export type Screen = DeckPage & {
  device: 'desktop' | 'phone';
  caption: string;
};
