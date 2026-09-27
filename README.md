# Viper — Portfolio & Agency

A hand-built replica of the Viper Framer template, rebuilt as a production Next.js
application. Every colour, type ramp, spacing value and transition curve was sampled
from the live reference rather than eyeballed.

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

Sampled directly from the reference and declared in `src/app/globals.css`:

| Token                | Value     | Used for                              |
| -------------------- | --------- | ------------------------------------- |
| `--color-brand`      | `#ff462e` | Page background, CTAs, accents        |
| `--color-ink`        | `#090909` | Dark sections, primary text on cream  |
| `--color-ink-900`    | `#1e1e1e` | Display headings                      |
| `--color-ink-800`    | `#29292b` | Labels and card titles                |
| `--color-ink-700`    | `#63615e` | Body copy inside cream cards          |
| `--color-ink-500`    | `#7f7f80` | Muted body copy on white              |
| `--color-cream`      | `#f5f4f3` | Cards, buttons, sections              |
| `--color-line`       | `#eaeaea` | Hairlines and chips                   |
| `--color-brand-soft` | `#f9d3cd` | Checklist bullets                     |

Type ramps live alongside them as `text-display`, `text-h1` … `text-eyebrow`, each
carrying the exact size / line-height / tracking triple measured from the reference.

## Swapping the imagery

`src/content/site.ts` is the only file that references image URLs. They currently point
at the reference CDN so the build is visually identical out of the box. To use your own:

1. Drop files into `public/images/`.
2. Replace the URL string in `site.ts` with `/images/your-file.jpg`.
3. Remove the `framerusercontent.com` entry from `next.config.ts` if no longer needed.

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

`src/components/sections/Contact.tsx` currently simulates submission. Point `onSubmit`
at a route handler or a service (Resend, Formspree, etc.) to make it live.
