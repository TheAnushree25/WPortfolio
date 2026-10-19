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
| Project routes    | Parallel + intercepting routes (`@modal/(.)work/[slug]`) | Every project has a shareable, statically generated `/work/<slug>` page; opened from the home page it plays over it instead, so the back button closes it and the page underneath never reloads. |
| Project pages     | PyMuPDF → WebP at two widths, served by `srcset` | Each PDF is rendered once at build time (`scripts/work/build.py`), so a 105 MB deck reads as 8 MB of instant pages; no image optimiser in the way. |
| Viewer scroll     | A second Lenis on the viewer | The deck scrolls with the page's weighted feel, and chapter jumps glide or cut on the same clock. |
| Work page         | CSS 3D + the page light     | Studio Mirage's /works: five screens on an arc (CSS 3D with trig functions, no WebGL library) over the living gradient. |
| System screens    | Headless Chrome over CDP (`scripts/work/screens.mjs`) | Each live product is scrolled with real wheel events and captured at 2x; pictures are resized and encoded in the browser itself, so the script needs no packages. |
| Bookings          | Calendly, pre-filled from the site's own form | Calendly owns the studio's times, takes one booking per slot and sends every email; the visitor types their details once, in the studio's form. No package: Calendly's widget script is loaded on the page. |

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
npm run typecheck
```

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_CALENDLY_URL` to the
studio's Calendly event link to take bookings on `/contact` (see "Bookings");
left empty, the page takes booking requests by email.

## Structure

```
src/
├─ app/
│  ├─ layout.tsx          Font loading, intro boot script, cursor, smooth scroll, nav
│  ├─ page.tsx            Section order — the entire page composition
│  ├─ contact/page.tsx    Book a meeting (Calendly; Cal.com or requests by email as fallbacks)
│  ├─ deck/page.tsx       The deck, read over the living gradient
│  ├─ works/page.tsx      The work page: systems and design, after Studio Mirage's /works
│  ├─ work/[slug]/page.tsx  A project on its own page (shared links, reloads)
│  ├─ @modal/             The slot a project fills when opened from the home or work page
│  │  └─ (.)work/[slug]/page.tsx  Hands the project to the stage over the page
│  ├─ api/booking/        Books a meeting (route.ts) and reports busy times (availability/)
│  ├─ globals.css         Design tokens (@theme) + typography utilities
│  ├─ works.css           The work page: filters, screening room, index rows, rows of cards
│  └─ system.css          The system viewer's chapters
├─ components/
│  ├─ layout/             Chrome that persists across the page
│  │  ├─ Navbar.tsx       Mirage's header: the logo, two links, a glowing contact pill, graded
│  │  │                   blur; on a phone the links fold into a menu that opens as a circle
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
│  ├─ contact/            The booking page: Booker, CalendlyBooker (the form, then Calendly),
│  │                      MeetingDetails, and the fallbacks CalEmbed and RequestBooker
│  ├─ deck/               The deck viewer
│  ├─ works/              The work page: WorksPage, ScreeningRoom (the arc), Filters
│  ├─ work/               The project viewers
│  │  ├─ CardRow.tsx        The pinned row of travelling cards (landing and work page)
│  │  ├─ ProjectStage.tsx   Lifts a card's shot to the screen and back; hosts a viewer
│  │  ├─ ProjectViewer.tsx  A design's deck: title card, pages, scroll-spy, chapter jumps
│  │  ├─ SystemViewer.tsx   A system's case study, chapter by chapter
│  │  ├─ system/            Its chapters: Brief, Stack (+ architecture), Plan, Journeys,
│  │  │                     Design, Screens, Numbers; browser and phone frames; logos
│  │  ├─ ViewerIndex.tsx    The index rail, the phone's pill and sheet, editions
│  │  ├─ ViewerPage.tsx     One page (develops as it loads) and the ambient light
│  │  └─ OpenProject.tsx    Rendered by the intercepted route: names the open project
│  └─ ui/                 Primitives reused across sections
│     ├─ AtlasLogo.tsx       The Atlas Studios lockup (wordmark over “STUDIOS”), as vectors
│     ├─ GlassButton.tsx     Frosted pill with border shine and label sweep
│     └─ FocusText.tsx       Text that focuses in character by character
├─ content/
│  ├─ site.ts             Every string and image URL on the page
│  ├─ work.ts             Each design's decks: summary, accent colour, chapters
│  ├─ systems.ts          Each system's case study: stack, architecture, plan, journeys…
│  ├─ projects.ts         Joins cards, studies, pages and screens (server only)
│  ├─ decks/*.json        Page sizes, tones and previews, written by the build script
│  └─ screens/*.json      System screens, written by scripts/work/screens.mjs
└─ lib/
   ├─ work.ts             Shared state between the row, the route and the stage
   ├─ booking.ts          The booking rules both the page and the server keep
   ├─ google.ts           Calendar and Gmail over REST (server only)
   ├─ motion.ts           Shared easing curves and the character focus-in
   ├─ reveal.ts           Cues a section's reveal as it comes on screen
   ├─ finale.ts           Hands the footer's scene geometry to the page light
   ├─ footage.ts          Hands the reel and the carousel clip to the page light
   ├─ env.ts              Public build-time settings (the Calendly and Cal.com links)
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

### Project decks

Seven cards open their brand guidelines or company deck in the project viewer
(`/work/<slug>`); Teddy, Dishoom and Animal have no deck yet and open their shot.
The YOOJ and Dorikala cards are stand-ins — mockups lifted from their own decks —
until their card art is made.

The pages are rendered from the original PDFs by

```bash
python scripts/work/build.py path/to/folder/with/the/pdfs   # all decks
python scripts/work/build.py path/to/folder yooj dorikala    # just these
```

which needs Python with `pymupdf` and `pillow`. It writes each page to
`public/work/<deck>/NN.webp` (and `NN-half.webp`) and its sizes, tone and preview
to `src/content/decks/<deck>.json`. The PDFs themselves are not in the repository
(Dorikala's is 105 MB, over GitHub's file limit); `DECKS` in the script maps each
deck to its file name.

To add a project: give its card a `slug` in `site.ts`, add its PDF to `DECKS` in
the script and run it, import the new JSON in `content/projects.ts`, and describe it
in `content/work.ts` — a summary, an accent colour, and its chapters, each named by
the page it starts on. A project can have more than one edition (FreightEasy has its
presentation and its A4 brochure).

### Systems

The work page (`/works`) has a second row: the systems — websites, platforms and
AI the studio engineers. Each opens a case study in the system viewer at
`/work/<slug>`: the brief, the tech stack with its architecture, the site map, the
user journeys, the design language, the screens and the numbers. The words live in
`content/systems.ts`, counted from each system's own repository.

The screens are captured from the live products:

```bash
node scripts/work/screens.mjs                 # all systems
node scripts/work/screens.mjs shoku keeri     # just these
```

It drives a headless Google Chrome (set `CHROME_PATH` if it isn't in the usual
place) and writes `public/work/systems/<slug>/NN.webp` (+ `NN-half.webp`) and
`src/content/screens/<slug>.json`. Which pages, scroll positions and captions to
take is the `SYSTEMS` list at the top of the script; the first desktop screen is
the card and the title card's backdrop. Keeri's in-app screens are the
screenshots its own docs publish, since the console sits behind a sign-in.

Saaj is an Android app (`platform: 'app'` in `content/systems.ts`): its screens
play in a phone instead of a browser, and its card is a key visual the script
sets from three of its phone screens. It has no public web address, so its own
web build is served on this machine with its staging API's demo catalogue,
read-only, by `scripts/work/saaj-preview.mjs` (the script's header says how to
make the build); then `node scripts/work/screens.mjs saaj`.

To add a system: add its shots to `SYSTEMS` and run the script, import its JSON in
`content/projects.ts`, and describe it in `content/systems.ts` (and add its slug to
`systemOrder`).

## Bookings

`/contact` books meetings through Calendly. The visitor first fills in the studio's
own form (name, email, anything we should know), then picks a time in Calendly's
calendar, shown on the page with those answers already in its form, so nothing is
typed twice (`components/contact/CalendlyBooker.tsx`). Pressing
Schedule books it. Calendly takes one booking per slot, so of two visitors on the
same time the second is turned away. It puts the meeting on the studio's Google
Calendar with a Meet link, sends the visitor a calendar invitation, and emails the
studio their answers.

To connect it, set `NEXT_PUBLIC_CALENDLY_URL` to the event's link
(`https://calendly.com/theatlasstudio/meeting`) in `.env.local` and on both Vercel
projects, then rebuild: the value is written into the page when it's built. The
Calendly event must be:

- **One-on-one**, so each slot takes a single booking.
- On **Google Meet**, with the studio's Google Calendar connected both to check for
  conflicts and to add events to.
- Sending invitees a **calendar invitation**.
- Asking **Anything we should know?** as its first question, after name and
  email. Calendly fills its questions by position (`a1` is the first), so the
  site's answer only lands in the right place while it stays first.

The studio manages its times in Calendly: weekly hours, date-specific hours, and
anything marked busy in its Google Calendar.

### Cancellations

- **The studio cancels** in Calendly (Calendar → the meeting → Cancel), or deletes the
  meeting in Google Calendar and sends the cancellation. Either way Calendly cancels the
  booking and offers the time again, because the studio's calendar is connected with
  "Automatically sync changes from this calendar to Calendly". The client's invitation
  is withdrawn.
- **The client cancels or reschedules** with the links in their invitation. Calendly
  updates the calendar and emails the studio.
- **The client answers "No"** to the invitation. Calendly doesn't act on that, so
  `scripts/bookings/decline-guard.gs`, a Google Apps Script running in the studio's
  account every five minutes, deletes any upcoming Calendly meeting whose guests have
  all declined. Calendly then cancels the booking. The script writes the client a note
  with a link to book again, and tells the studio. To set it up, sign in to
  script.google.com as the studio, create a project and paste the file in. Add the
  "Google Calendar API" service (as `Calendar`), then run `install` once and allow
  access.

### Without Calendly

With no Calendly link, `/contact` loads Cal.com's scheduler if `NEXT_PUBLIC_CAL_LINK`
is set, and otherwise the studio's own booker, which books meetings straight onto the
studio's Google Calendar. Don't connect Google while Calendly is set: two systems
taking bookings can both accept the same time.

In the studio's own booker, a visitor picks a time and leaves a name and email; the
server (`app/api/booking`) checks the time against the studio's slots and its
calendar, creates the event with a Google Meet link (Google emails the visitor the
invitation) and sends the studio's inbox, contact.theatlasstudio@gmail.com, a note it
can reply to. Times already taken are left out of the calendar. Until Google is
connected, or if it can't be reached, the page falls back to opening the visitor's
email app with the request written.

To connect it, once, signed in to Google as contact.theatlasstudio@gmail.com:

1. In [Google Cloud](https://console.cloud.google.com), create a project and enable
   the **Google Calendar API** and the **Gmail API**.
2. Under **Google Auth Platform**, set up the consent screen (External), add the
   scopes `calendar.events`, `calendar.freebusy` and `gmail.send`, and **publish the
   app** to production. A testing-mode app's sign-in expires after seven days.
   Unverified is fine for the studio's own account: Google shows a warning screen
   once, and "Advanced, then Go to the app" continues.
3. Under **Clients**, create an OAuth client of type **Desktop app**, and put its ID
   and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Run `node scripts/google/authorize.mjs`, sign in as the studio and allow access.
   It writes `GOOGLE_REFRESH_TOKEN` into `.env.local` (never printing it) and checks
   it can read the calendar. `--check` re-checks it later.
5. Restart `npm run dev`. On Vercel, add the same three variables to the project.

`.env.example` lists the optional settings: another calendar (`BOOKING_CALENDAR_ID`),
another inbox (`BOOKING_NOTIFY_EMAIL`), or no invitation for the visitor
(`BOOKING_INVITE_GUEST=false`).

## Motion inventory

Each of these mirrors a specific behaviour in the reference:

- **Landing reel** — the studio reel plays full screen first (muted; sound and skip one tap away, Esc skips). It ends by defocusing and pushing in while it fades, uncovering the same blue light the first slide is lit by.
- **Atlas slide** — the letters track in from wider spacing and pull into focus from the middle outward while the camera eases back; a light sweep then crosses the word. The background is the Figma gradient, drifting continuously.
- **Studio slide** — one scroll pushes the camera through the wordmark as the light morphs from beams to a radial glow; the emblem spins exactly two turns out of depth, its ring drawing itself around, and locks in with a glint before the statement focuses in character by character.
- **Mission slide** — the next scroll swaps the statement for the mission line, revealed with the same focus-in over the dimmed emblem. Scroll triggers each scene and time plays it; the page holds still for each moment (never during a nav-link glide), then the landing scrolls away.
- **Living light** — the landing's gradient (the Figma radial #001873 → #020923 with the #082BFF streak) is fixed behind the whole page, the landing included. It drifts continuously and swings between two states every two seconds: the light travels, swells and brightens towards the electric blue, then ebbs while a low light rises opposite.
- **Cursor sand** — Studio Mirage's about-page effect, ported from their shaders pass for pass: the pointer stirs a fluid simulation (splat, divergence, pressure, advection on their letterboxed 256² grid) whose ink displaces and scatters the light and grains it, so a cloud of sand trails the cursor and settles. The grain is lifted so it reads against blue as theirs does against black. It fades within a second of the pointer stopping and sleeps when idle; touch screens and reduced motion go without.
- **Selected work** — after Studio Mirage's cards: the section pins and a row of 9:16 cards travels sideways exactly as far as the page scrolls. Shots zoom on hover and lean against the travel; a click anywhere on a card opens its project (or, without a deck, its shot in a native dialog), and its glass pill lights up wherever the pointer is on the card.
- **Project viewer** — the card's shot lifts off the row exactly where it sits (its drift and hover zoom included) and travels, growing and darkening, until it fills the screen; the night closes in behind it and the page underneath stops. It becomes the title card's backdrop, drifting slowly closer, while the name focuses in character by character. Scrolling on, the pages arrive one after another: each develops out of its own blurred preview as it loads, and lifts out of the dark as it crosses the middle of the screen, while the room behind takes its light from the page in view (its 24px rendering, blown up and blurred). The index on the left follows the reading — a lit marker slides from chapter to chapter, a hairline fills as each is read, the bar names the chapter and rolls the page count, and a segment per chapter fills along the top edge. Hovering a chapter floats its opening page beside the index; choosing it glides there if it is near, or dips to a chapter card and cuts if it is far. The end of the deck opens the next project, whose shot grows out of its panel the same way. Closing dissolves back to the shot, which settles into its card — scrolling the row to the card first if the reader has moved on through other projects. On phones the index folds into a pill with a progress ring and a sheet. Escape closes, the arrow keys turn the page, and the back button works throughout.
- **Areas of practice and story** — Studio Mirage's listing and two-column texts, each filling one screen with type scaled to the viewport. Every line focuses in character by character like the landing statement — titles first, then the columns or paragraphs in turn — and replays on the next visit; practice items rest at 60% and brighten on hover.
- **They trust us** — Studio Mirage's partner grid: full-bleed hairlines with the client marks at 55%. The marks sharpen in a wave after the title; under the pointer a cell frosts, its mark turns full white and a light runs along the nearby lines.
- **How we work** — Studio Mirage's timeline: the section pins for 0.8 of a screen per card. The first card stands alone and the rest wait in a deck on the right; each stretch of scroll slides the next card across onto the stack, nudging the one beneath aside, and turns it into frosted glass over the light, lit from its corner in its own hue. A plus rides above each card and brightens as it arrives.
- **Testimonials** — Studio Mirage's stacked glass cards: the front card shows its quote, the others step back and up behind it (20px, 7% smaller and 12% fainter per step), each lit from its top edge in its own colour. Dots, arrow keys and swipes shuffle the deck in 0.4s; on arrival the deck builds from the back and the quote focuses in.
- **Finale** — in place of Mirage's giant footer logo, “Atlas” gathers out of blown sand as it rises into view, then a light sweeps across it; it is drawn by the page light, so the cursor scatters it back into sand. Beneath it a planet of light rises over the horizon: latitudes and longitudes draw out from the pole (dashed tropics and polar circles, the far side faint through the glass), city lights twinkle and travellers' arcs cross it as it turns, under a glowing blue atmosphere.
- **Footer** — Mirage's links between hairlines, with a light that runs along the lines under the pointer and a frosted shift on hover; the credits line ends in a bouncing return-to-top arrow.
- **Next page** — Mirage's white teaser, torn along its top edge: on hover the call to action follows the pointer and a gradient line wakes along the bottom; an eye watches the pointer and blinks every few seconds.
- **Header** — Mirage's: the wordmark left, "Our works" and "About us" with a dot marking the part of the page in view, and a white "Contact us" pill with a turning blue glow, over a band of graded blur.
- **Work page** — Studio Mirage's /works: the title and its glass filters (discipline and industry, as chips with a clear-all), then a screening room: five screens on an arc, standing on a floor that catches their light, leaning after the pointer. Left alone they run a programme of the work, one screen turning over at a time; pointing at an index row plays that kind of work on every screen, centre first. The index rows are Mirage's hairline list: the row under the pointer slides in and frosts while the other dims, and a light runs along the nearest hairline. Below, each kind of work is a row of cards travelling sideways like the landing's: the systems as screens, the identities as the landing's own posters, opening exactly as they do there. While a card is pointed at, the others step back and the row's heading names it.
- **System viewer** — a system opens the way a deck does (its screen lifts off the row into the title card), then reads in chapters: the brief beside the facts, with the product in its browser tipping up to face the reader; the stack as lit tiles, layer by layer, and the architecture with light running along its wires; the site map drawing out from its root; the journeys, one person at a time, the line filling as each step lights; the palette that opens under the pointer and the typefaces set in themselves; the screens, a browser that stays in view and turns its pages with the reading; and the numbers, counted up as they arrive. The index, the bar, the chapter cuts and the next-project ending are the deck viewer's.

All motion is disabled under `prefers-reduced-motion`.
