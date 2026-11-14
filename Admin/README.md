# Atlas Studios — Admin

The studio's control room for the Atlas Studios site in the folder above: its words,
its work, its media, its clients and meetings, its visitors, and getting changes live.
It runs on Node.js alone (no packages to install) and edits the site's own content
files, so what you change here is exactly what the site builds from.

## Start it

**At /admin, inside the site.** Start the site as usual and the admin is part of it:

```bash
npm run dev          # in the site folder → http://localhost:3000/admin
```

The site's route `src/app/admin/[[...path]]/route.ts` hands everything under `/admin` to this
folder (`server/mount.mjs`), loaded from disk at run time, so the admin never becomes part of
the built site. While it runs inside the site's development server, builds and deploys are left
to a terminal: they would rewrite the files that server is using.

**On its own**, with deploys from the Publish page:

```bash
cd Admin
npm start            # → http://localhost:4310
```

Both use the same records (`Admin/data`), so run one at a time.

The first visit sets up the **owner** account. For safety, setup only works on the computer the
admin runs on (inside the site: from the development server, at a `localhost` address). Tick
“Show sample data” to explore with invented enquiries, meetings and visits; they're marked
*Sample* everywhere and are cleared in one click from **Settings → Data**.

**On the hosted site** (Vercel) the site's files and git history aren't there for the admin to
edit, so these same pages are served by the **backend** in `../backend`: a database for the
accounts, enquiries and visits, and GitHub for the site's content, where each save is a draft
commit and publishing deploys it. It also adds two-step sign-in, email (enquiry alerts, password
resets, invitations) and uploads in pieces. With `ADMIN_BACKEND_URL` set where the site is built,
the site's `/admin` forwards to it; without it, `/admin` is this local admin. Setting it up is in
`backend/README.md`. The pages tell the two apart from `/api/auth/state` (`mode: 'hosted'` and
its `features`), so everything here keeps working unchanged on this computer.

| Needs | For |
| ----- | --- |
| Node.js **22.13+** | Running the admin (it reads the site's TypeScript with Node's own type stripping). |
| Git | The publish page: changes, diffs, saving versions. |
| The site's packages (`npm ci` in the site folder) | Checks, builds, the local preview and deploys. The publish page can install them. |
| Wrangler signed in (`npx wrangler login`) | Deploying to Cloudflare from the publish page. |

Forgot the password? In this folder: `npm run reset-password -- you@example.com` prints a
temporary one; you choose a new password when you sign in with it.

## What it does

| Area | What you can do |
| ---- | --------------- |
| **Dashboard** | New enquiries this week, the open pipeline (₹), upcoming meetings, site visits; a 30-day enquiry chart and the pipeline by stage; a **site health** score with each finding linked to where it's fixed; what's coming up, who needs a follow-up, the latest enquiries and recent activity. |
| **Projects** | The design cards in the order they travel across the home page: reorder by dragging (or the arrows), edit a card's title, line, industry and picture, place its **focus point** on the shot and see the 9:16 crop the site will show, and edit its case study (summary, accent colour, editions and chapters, each chapter showing the page it opens on). Add a new card, archive one (kept here to bring back), restore it. Systems: reorder, hide from /works, and edit every part of a case study (facts, figures, highlights, journeys, stack, palette, typefaces, principles; the architecture and site map as JSON). |
| **Pages & copy** | Every word on the site, grouped the way a visitor meets it: studio profile and links, header, footer and legal notice, the landing statement and reel, selected work, areas of practice, story, partners (with the marks' sizes filled in from the file), how we work, testimonials, the next-page teaser, the work page, the deck, and bookings (meeting, time slots, every label on /contact). Live previews for the testimonial card, the partner grid, the landing, the process cards and the browser colour. |
| **Search & sharing** | The page title and description, with a Google result and a WhatsApp/LinkedIn link preview drawn as you type; add a preview image. |
| **Media library** | All 500-odd files in `public/`: pictures, video, PDFs, with sizes and dimensions, **where the site uses each one**, filters for unused and heavy files, upload (button or drop files anywhere), replace a file everywhere it's used, and remove unused files to a trash you can restore from. |
| **Enquiries** | A board from *New* to *Won/Lost* (drag on a desktop; swipe the columns on a phone), a searchable list, each enquiry's details, value, follow-up date, tags and a timeline of notes, status changes and meetings; CSV export; and an endpoint the site's own form can post to. |
| **Meetings** | Upcoming and past meetings in your time zone (India time alongside when you're abroad), a month calendar, the studio's bookable times as visitors see them, and a **Calendly sync** that brings in every booking and each new person as an enquiry. |
| **Analytics** | Page views and visitors over 7/30/90 days, the most-opened work, top pages, where visitors came from, devices and countries, counted by the admin's own cookie-free beacon. |
| **Publish** | What has changed since the last saved version, each change as a diff, discard a change, then the steps: **check the site compiles**, **preview it locally**, **save a version** (a git commit; nothing is pushed), and **deploy to Cloudflare** (owner only, typed confirmation). Output streams live. |
| **Activity** | Every change made through the admin, by whom and when, and every sign-in (failed ones too). |
| **Team** | Owners, editors and viewers; temporary passwords shown once; turn accounts off; reset passwords. |
| **Settings** | Profile and password, signed-in devices (sign out any), theme (night, paper or match the device), Calendly, allowed sites, the enquiry and visit snippets, export/import, sample data, content backups, and system details. |

Everything works on a phone: a tab bar and a *More* sheet instead of the sidebar, sheets
instead of dialogs, tables that become cards, the enquiry board as swipeable columns, and
inputs sized so phones don't zoom.

Search anything with **Ctrl K** (⌘K on a Mac) or **/**.

## How editing the site works

The site keeps its content in TypeScript (`src/content/site.ts`, `work.ts`, `systems.ts`,
and the metadata in `src/app/layout.tsx`). The admin reads those files with a small parser
of its own (`server/content/parse.mjs`), works out their values exactly as the build would,
and writes a change back as the **smallest possible edit**: one changed string replaces one
string; a reordered list keeps each item's original text, comments and all; a new item is
written in the style of its neighbours. Values the site works out from others (the footer's
email link follows the studio email, the deck's slide list is generated) are shown locked.

Every save is checked before it lands: the section's rules (a card must point at a picture
that exists, a chapter must start on a page the deck has, time slots must be real times),
then the rewritten file is read back and must hold exactly what was asked. The previous file
is kept in `data/backups/` (the last 40 of each), and a section changed elsewhere since you
opened it is refused rather than overwritten. Tests: `npm test`.

Edits reach visitors when the site is built and deployed (the **Publish** page). Saving a
version commits only the content and media files, under the editor's name; pushing to
GitHub stays a separate, deliberate step.

Some things still need the site's scripts, and the admin says so where they come up: a new
**case study** needs its PDF rendered (`python scripts/work/build.py`) and its JSON imported
in `content/projects.ts`; a new **system** needs its screens captured
(`node scripts/work/screens.mjs <slug>`).

## Security

- Passwords are stretched with **scrypt** and compared in constant time; only hashes are stored.
- Sessions are random tokens (only their SHA-256 is stored) in an **HttpOnly, SameSite=Strict**
  cookie, for 12 hours by default. Every change also needs the session's **CSRF token** and a
  same-site origin.
- Sign-in is limited to 5 tries per 15 minutes per address and email.
- Roles are enforced on the server for every endpoint: **viewers** read, **editors** change
  content, media and clients and run checks, **owners** also deploy, manage the team and settings.
- A strict **Content-Security-Policy** (no inline scripts, no third-party code), `nosniff`,
  frame denial and a same-origin referrer policy on every response.
- Uploads are checked by their bytes, not their names (SVG isn't accepted: it can carry
  scripts); paths can't escape the site's `public/` folder; the site's files are only
  written through the content store.
- Jobs run fixed npm scripts only, and are stopped by their own process id.
- First-run setup only works from this computer, unless `ADMIN_SETUP_TOKEN` is set.
- `data/` (accounts, enquiries, backups) is git-ignored. Never commit it.

## On a phone, or from elsewhere

By default the admin listens on `127.0.0.1`, so only this computer can reach it.

- **Same Wi-Fi:** set `ADMIN_HOST=0.0.0.0` in `Admin/.env`, restart, and open
  `http://<this-computer's-address>:4310` on the phone. Anyone on that network can then reach
  the sign-in page, so use it on networks you trust.
- **Anywhere:** put it behind HTTPS, for example a Cloudflare Tunnel to this computer or a small
  server that also holds a checkout of the site. Then set `ADMIN_SECURE_COOKIES=true` and
  `ADMIN_TRUST_PROXY=true`. A hosted admin can also receive enquiries and visit counts from the
  live site: add the site's address under **Settings → Integrations**.

## Connecting the site (optional)

- **Calendly:** paste a Personal Access Token in **Settings → Integrations**
  (Calendly → Integrations → API & Webhooks), then **Sync now** on the meetings page.
- **Enquiries from a form:** post `name, email, company, phone, service, budget, message` as
  JSON to `/api/public/enquiry` from an allowed site. A hidden `website_url` field catches bots.
- **Visit counting:** add `<script defer src="https://<admin-address>/beacon.js"></script>` to
  the site's `<head>`. No cookies; visitors are counted with a hash salted afresh each day.

## Settings

Copy `.env.example` to `.env` (or set these in the environment):

| Variable | Default | |
| -------- | ------- | - |
| `ADMIN_PORT` | `4310` | Where the admin listens. |
| `ADMIN_HOST` | `127.0.0.1` | `0.0.0.0` to reach it from other devices. |
| `SITE_ROOT` | `..` | The site folder. |
| `ADMIN_DATA_DIR` | `data` | The admin's records. |
| `SITE_ORIGINS` | `http://localhost:3100` | Sites allowed to send enquiries and visits (more can be added in Settings). |
| `ADMIN_SESSION_HOURS` | `12` | How long a sign-in lasts. |
| `ADMIN_SECURE_COOKIES` | `false` | `true` behind HTTPS. |
| `ADMIN_TRUST_PROXY` | `false` | `true` behind a proxy, to read the visitor's address from its headers. |
| `ADMIN_SETUP_TOKEN` | — | Allows setup from another device at `/setup?token=…`. |
| `SITE_PREVIEW_PORT` | `3100` | The port of the local preview on the publish page. |

## Data

`data/db.json` holds the accounts, sessions, enquiries, meetings, activity log, visit
counts and settings, written atomically with the previous copy kept as `db.json.bak`.
`data/backups/` holds the content files as they were before each edit; `data/trash/` holds
removed media until it's put back or deleted. **Settings → Data** exports everything
(without passwords or tokens) as one JSON file, and imports it again.

## Layout

```
Admin/
├─ server.mjs              Start-up on its own, and the reset-password command
├─ server/
│  ├─ mount.mjs            The admin inside the site at /admin: web Requests in, Responses out
│  ├─ app.mjs              Request handling: sessions, roles, CSRF, CORS for the public endpoints
│  ├─ http.mjs             Router, body limits, cookies, static files with byte ranges
│  ├─ security.mjs         scrypt, tokens, roles, rate limits, security headers
│  ├─ db.mjs               The JSON store
│  ├─ content/             Reading and rewriting the site's content files, their rules, the store
│  ├─ media.mjs            The public folder: dimensions, usage, uploads, trash
│  ├─ git.mjs              Changes, diffs, discarding and saving versions
│  ├─ jobs.mjs             Install, check, build, deploy and the preview, streamed
│  ├─ health.mjs           The site health review
│  ├─ analytics.mjs        Visit counting and the beacon
│  ├─ calendly.mjs         The Calendly sync
│  ├─ sample.mjs           Sample data
│  └─ routes/              The API, by area
├─ public/                 The admin's pages: index.html, app.css, js/ (lib/ and views/)
└─ test/                   The content engine against the site's real files
```
