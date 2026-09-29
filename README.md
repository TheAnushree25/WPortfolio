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
| Fonts             | Inter variable via `next/font` | Inter's optical-size axis reproduces Framer's "Inter Display" cut at large sizes.        |

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
npm run typecheck
```

## Structure

```
src/
├─ app/
│  ├─ layout.tsx          Font loading, preloader, cursor, smooth scroll, nav
│  ├─ page.tsx            Section order — the entire page composition
│  └─ globals.css         Design tokens (@theme) + typography utilities
├─ components/
│  ├─ layout/             Chrome that persists across the page
│  │  ├─ Navbar.tsx       Fixed nav, hide-on-scroll, mobile overlay
│  │  ├─ Preloader.tsx    Brand panel that wipes away in five columns
│  │  ├─ Cursor.tsx       16px spring-followed brand dot
│  │  ├─ SmoothScroll.tsx Lenis instance + anchor interception
│  │  └─ Footer.tsx
│  ├─ sections/           One file per band of the page
│  └─ ui/                 Primitives reused across sections
│     ├─ PillButton.tsx      Flood-fill CTA with rolling label
│     ├─ RollText.tsx        Duplicate-label roll-up on hover
│     ├─ GridLines.tsx       Five-column hairline rhythm
│     ├─ Grain.tsx           Canvas film grain
│     ├─ ProgressiveBlur.tsx Eight stacked backdrop-blur layers
│     ├─ Marquee.tsx         Seamless CSS marquee
│     ├─ ParallaxImage.tsx   Scroll-linked media frame
│     ├─ Counter.tsx         Count-up statistic
│     ├─ Divider.tsx         Centre-out hairline with plus marker
│     └─ Badge.tsx           Badge / Tag / Chip / ProgressDots
├─ content/
│  └─ site.ts             Every string and image URL on the page
└─ lib/
   ├─ motion.ts           Shared easing curves, variants, viewport configs
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

`src/content/site.ts` holds every string, link and image path. Copy comes from
Gulafsan's Canva portfolio and her AI Studio portfolio; project links open her Pitch
decks, Figma prototypes and Google Slides.

All images live in `public/images/`:

- `work/`: project covers from her published decks and prototypes.
- `logos/`: the logofolio marks, trimmed from her Canva portfolio.
- `plates/`: logo plates and research covers composed from those assets.
- `aurora*.jpg`, `work-collage.jpg`, `identity-wall.jpg`, `expertise.jpg`,
  `logo-collage.jpg`: full-bleed frames composed from her work.

To change a picture, drop a file into `public/images/` and point the matching
entry in `site.ts` at it.

## Motion inventory

Each of these mirrors a specific behaviour in the reference:

- **Preloader** — brand panel holds the wordmark, then wipes upward in five staggered columns.
- **Hero reveal** — ten orange panels retract from the centre seam, left to right.
- **Dark-to-light covers** — each dark frame stays pinned and drifts upward at 20% of scroll while the following light sections slide over it. Image breaks also ease from 1.14× down to 1× as they are covered.
- **Heading reveals** — per-word mask, rising 110% with an expo-out curve.
- **Pill buttons** — a 44px circle scales until it floods the pill; label rolls to its light duplicate; arrow pair slides one slot.
- **Nav** — hides on downward scroll, returns on upward; inactive links at 50% opacity; labels roll on hover.
- **Marquees** — partner wordmarks and the photography strip, paused on hover.
- **Counters** — statistics count from zero when scrolled into view.
- **Pricing switch** — spring-driven knob; prices roll vertically between billing cycles.
- **FAQ** — plus rotates into a minus while the answer height animates open.
- **Grain + progressive blur** — canvas noise over dark sections, eight-layer blur falloff under the nav.

All motion is disabled under `prefers-reduced-motion`.

## Contact form

`src/components/sections/Contact.tsx` has no backend: submitting composes the note
into an email to gulafsan.shaheen@gmail.com in the visitor's own mail app. Point
`onSubmit` at a route handler or a service (Resend, Formspree, etc.) to send it
from the page instead.
