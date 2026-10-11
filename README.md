# Atlas Studios — Gulafsan Shaheen

The portfolio of Gulafsan Shaheen, built on a hand-made Next.js replica of the Viper
Framer template (the layout of gscreativestudio.framer.website). Every section, type
ramp, spacing value and transition curve follows the reference; the words, imagery
and the Atlas Studios palette are hers.

## Stack

| Concern           | Choice                      | Why                                                                                       |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Framework         | Next.js 15 (App Router)     | Server components for the static shell, client islands only where motion needs them.       |
| Language          | TypeScript (strict)         | The content layer is fully typed, so copy changes are checked at build time.               |
| Styling           | Tailwind CSS v4             | CSS-first `@theme` config keeps the sampled tokens in one place with no JS config file.     |
| Animation         | Motion (`motion/react`)     | Same underlying engine Framer uses, so easing and spring semantics match exactly.           |
| Scrolling         | Lenis                       | Reproduces the reference's weighted inertial scroll.                                        |
| Page light        | WebGL fragment shader (no library) | The Figma gradients, alive and fixed behind every section: GPU-drawn at device resolution, dithered against banding. |
| Landing art       | Inline SVG                  | The wordmark and emblem are vector geometry measured from the Figma frames — crisp at any size and animatable part by part. |
| Fonts             | Inter variable + Red Hat Display via `next/font` | Inter's optical-size axis reproduces Framer's "Inter Display"; Red Hat Display Medium sets the landing statement. |

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
npm run typecheck
```

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_CAL_LINK` to the studio's
Cal.com booking link (`username/event-slug`) to load the real scheduler on
`/contact`; left empty, the page takes booking requests by email.

## Structure

```
src/
├─ app/
│  ├─ layout.tsx          Font loading, intro boot script, cursor, smooth scroll, nav
│  ├─ page.tsx            Section order — the entire page composition
│  ├─ contact/page.tsx    Book a meeting (Cal.com, or requests by email)
│  ├─ deck/page.tsx       The deck, read over the living gradient
│  └─ globals.css         Design tokens (@theme) + typography utilities
├─ components/
│  ├─ layout/             Chrome that persists across the page
│  │  ├─ Navbar.tsx       Mirage's header: two links, a glowing contact pill, graded blur
│  │  ├─ Cursor.tsx       16px spring-followed brand dot
│  │  ├─ PageLight.tsx    The living gradient behind pages other than the landing
│  │  └─ SmoothScroll.tsx Lenis instance + anchor interception
│  ├─ hero/               The landing's pieces (orchestrated by sections/Hero.tsx)
│  │  ├─ IntroReel.tsx      Full-screen studio reel with sound, skip and progress
│  │  ├─ LivingGradient.tsx WebGL light fitted to both Figma slides, behind the page
│  │  ├─ fluid.ts           Studio Mirage's cursor fluid, ported pass for pass
│  │  ├─ finaleShader.ts    The sand-formed wordmark and the globe, drawn by the light
│  │  ├─ AtlasWordmark.tsx  The “Atlas” letters, assembled and pushed through
│  │  ├─ AtlasEmblem.tsx    The emblem's two-turn spin and lock-in
│  │  ├─ StudioStatement.tsx The statement, revealed character by character
│  │  ├─ MissionStatement.tsx The mission line, revealed the same way
│  │  └─ geometry.ts        Vector paths measured from the 1440 × 807 frames
│  ├─ sections/           One file per band of the page
│  │  ├─ Hero.tsx           The reel and its three slides, pinned over the light
│  │  ├─ Works.tsx          Selected work: pinned cards travelling sideways
│  │  ├─ Practice.tsx       Areas of practice in columns, one screen
│  │  ├─ Story.tsx          Imagination, with direction — two columns, one screen
│  │  ├─ Partners.tsx       They trust us — the client marks in a hairline grid
│  │  ├─ Process.tsx        How we work — pinned timeline of stacking cards
│  │  ├─ Testimonials.tsx   Stacked glass testimonial cards
│  │  ├─ Finale.tsx         The footer: wordmark from sand, the globe, links, credits
│  │  └─ NextPage.tsx       The torn white teaser at the foot of the page
│  ├─ contact/            The booking page: Booker, CalEmbed, RequestBooker
│  ├─ deck/               The deck viewer
│  └─ ui/                 Primitives reused across sections
│     ├─ GlassButton.tsx     Frosted pill with border shine and label sweep
│     └─ FocusText.tsx       Text that focuses in character by character
├─ content/
│  └─ site.ts             Every string and image URL on the page
└─ lib/
   ├─ motion.ts           Shared easing curves and the character focus-in
   ├─ reveal.ts           Cues a section's reveal as it comes on screen
   ├─ finale.ts           Hands the footer's scene geometry to the page light
   ├─ footage.ts          Hands the reel and the carousel clip to the page light
   ├─ env.ts              Public build-time settings (the Cal.com link)
   ├─ scroll.ts           Lenis registry + scroll locks for the landing
   ├─ intro.ts            Whether the landing reel is playing
   └─ utils.ts
```

## Design tokens

The Atlas Studios palette, declared in `src/app/globals.css`:

| Token                | Value     | Used for                                   |
| -------------------- | --------- | ------------------------------------------ |
| `--color-brand`      | `#095cfb` | Electric Blue — page ground, CTAs, accents |
| `--color-royal`      | `#0838b9` | Royal Blue — hover                         |
| `--color-sky`        | `#0a90fe` | Highlights                                 |
| `--color-ink`        | `#020923` | Dark frames and primary text               |
| `--color-ink-800`    | `#052179` | Labels and card titles                     |
| `--color-ink-700`    | `#3a4d73` | Body copy inside cards                     |
| `--color-ink-500`    | `#5c6d8f` | Muted body copy                            |
| `--color-paper`      | `#f4f7ff` | Light sheets                               |
| `--color-cream`      | `#ffffff` | Cards and banded sections                  |
| `--color-line`       | `#d9e2f2` | Hairlines and chips                        |
| `--color-brand-soft` | `#d6e4ff` | Checklist bullets                          |

Type ramps live alongside them as `text-display`, `text-h1` … `text-eyebrow`, each
carrying the size / line-height / tracking triple measured from the reference.

## Content and imagery

`src/content/site.ts` holds every string and image path on the page. The three
testimonials there are placeholders (quotes, "Client name", initials avatars) —
replace them with real client words, names and photos before publishing.

Images live in `public/images/`:

- `atlas-intro-poster.jpg`: the reel's first frame, shown until it starts.
- `works/`: the selected-work shots on the travelling cards.
- `deck/`: the deck's pages with their black ground lifted, for `/deck`.
- `partners/`: the client marks in "They trust us" — each one the original logo
  from `logos/`, reduced to a single white mark on transparency.
- `work/`, `logos/`, `plates/` and the full-bleed `*.jpg` frames are from the
  earlier sections; nothing on the page uses them now (`logos/` holds the
  colour originals of the partner marks).

The deck PDF lives in `public/docs/the-atlas-studio.pdf`. Both it and the
`deck/` pages are generated from the original black-themed export by
`python scripts/deck/retheme.py path/to/source.pdf`, which lays each page over
the site's gradient (each page at a different moment of its swing).

The studio reel lives in `public/video/`: `atlas-intro-1080.mp4` (the original
export, already fast-start) and `atlas-intro-720.mp4` (an H.264 re-encode for
screens up to 900px wide).

To change a picture, drop a file into `public/images/` and point the matching
entry in `site.ts` at it.

## Motion inventory

Each of these mirrors a specific behaviour in the reference:

- **Landing reel** — the studio reel plays full screen first (muted; sound and skip one tap away, Esc skips). It ends by defocusing and pushing in while it fades, uncovering the same blue light the first slide is lit by.
- **Atlas slide** — the letters track in from wider spacing and pull into focus from the middle outward while the camera eases back; a light sweep then crosses the word. The background is the Figma gradient, drifting continuously.
- **Studio slide** — one scroll pushes the camera through the wordmark as the light morphs from beams to a radial glow; the emblem spins exactly two turns out of depth, its ring drawing itself around, and locks in with a glint before the statement focuses in character by character.
- **Mission slide** — the next scroll swaps the statement for the mission line, revealed with the same focus-in over the dimmed emblem. Scroll triggers each scene and time plays it; the page holds still for each moment (never during a nav-link glide), then the landing scrolls away.
- **Living light** — the landing's gradient (the Figma radial #001873 → #020923 with the #082BFF streak) is fixed behind the whole page, the landing included. It drifts continuously and swings between two states every two seconds: the light travels, swells and brightens towards the electric blue, then ebbs while a low light rises opposite.
- **Cursor sand** — Studio Mirage's about-page effect, ported from their shaders pass for pass: the pointer stirs a fluid simulation (splat, divergence, pressure, advection on their letterboxed 256² grid) whose ink displaces and scatters the light and grains it, so a cloud of sand trails the cursor and settles. The grain is lifted so it reads against blue as theirs does against black. It fades within a second of the pointer stopping and sleeps when idle; touch screens and reduced motion go without.
- **Selected work** — after Studio Mirage's cards: the section pins and a row of 9:16 cards travels sideways exactly as far as the page scrolls. Shots zoom on hover and lean against the travel; each card's glass button opens the full project in a native dialog.
- **Areas of practice and story** — Studio Mirage's listing and two-column texts, each filling one screen with type scaled to the viewport. Every line focuses in character by character like the landing statement — titles first, then the columns or paragraphs in turn — and replays on the next visit; practice items rest at 60% and brighten on hover.
- **They trust us** — Studio Mirage's partner grid: full-bleed hairlines with the client marks at 55%. The marks sharpen in a wave after the title; under the pointer a cell frosts, its mark turns full white and a light runs along the nearby lines.
- **How we work** — Studio Mirage's timeline: the section pins for 0.8 of a screen per card. The first card stands alone and the rest wait in a deck on the right; each stretch of scroll slides the next card across onto the stack, nudging the one beneath aside, and turns it into frosted glass over the light, lit from its corner in its own hue. A plus rides above each card and brightens as it arrives.
- **Testimonials** — Studio Mirage's stacked glass cards: the front card shows its quote, the others step back and up behind it (20px, 7% smaller and 12% fainter per step), each lit from its top edge in its own colour. Dots, arrow keys and swipes shuffle the deck in 0.4s; on arrival the deck builds from the back and the quote focuses in.
- **Finale** — in place of Mirage's giant footer logo, “Atlas” gathers out of blown sand as it rises into view, then a light sweeps across it; it is drawn by the page light, so the cursor scatters it back into sand. Beneath it a planet of light rises over the horizon: latitudes and longitudes draw out from the pole (dashed tropics and polar circles, the far side faint through the glass), city lights twinkle and travellers' arcs cross it as it turns, under a glowing blue atmosphere.
- **Footer** — Mirage's links between hairlines, with a light that runs along the lines under the pointer and a frosted shift on hover; the credits line ends in a bouncing return-to-top arrow.
- **Next page** — Mirage's white teaser, torn along its top edge: on hover the call to action follows the pointer and a gradient line wakes along the bottom; an eye watches the pointer and blinks every few seconds.
- **Header** — Mirage's: the wordmark left, "Our works" and "About us" with a dot marking the part of the page in view, and a white "Contact us" pill with a turning blue glow, over a band of graded blur.

All motion is disabled under `prefers-reduced-motion`.
