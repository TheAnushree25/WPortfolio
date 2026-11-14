# Atlas Studios — Backend

The server behind the studio's admin on the **live site**. The admin in `../Admin` runs on
the studio's computer and edits the site's files on disk; that can't work on Vercel, where
there are no files to edit and nothing is kept between requests. This backend is the same
admin made for hosting:

- **Postgres** keeps the accounts, sessions, enquiries, meetings, visit counts, activity log
  and settings (Neon on Vercel; on your own computer it runs a Postgres of its own, so
  nothing has to be installed).
- **GitHub** is the site's disk: content edits, uploads and removals become commits, so a
  change goes live the way every change to the site already does, through a deploy.
- It serves the **same admin pages** (`../Admin/public`) and reuses the admin's own content
  engine, field checks, sample data and health review, so the two never drift apart.

The site's `/admin` route forwards to it, so the admin keeps the site's address
(`https://theatlasstudios.vercel.app/admin`).

```
 Browser ──► theatlasstudios.vercel.app/admin/…   (the site's route: forwards, adds ADMIN_PROXY_SECRET)
                     │
                     ▼
            Backend (this folder, its own Vercel project)
              ├─ Postgres (Neon) ── accounts, enquiries, meetings, visits, activity, settings
              ├─ GitHub API ────── the site's content and media: drafts branch → live branch
              ├─ Calendly API ──── bookings into Meetings (on demand and daily)
              └─ SMTP / Resend ─── enquiry alerts, password resets, invitations
 Site pages ──► /admin/beacon.js, /admin/api/public/{collect,enquiry}   (visits, enquiries)
```

## What it adds to the admin

Everything the local admin does (dashboard, projects, every word of the site, media library,
enquiries, meetings, analytics, activity, team, settings) works here too. On top of that:

| | |
| - | - |
| **Drafts and publishing** | Each save is a commit on the `admin-drafts` branch, in the editor's name. Vercel builds it as a preview. The Publish page lists what's waiting with each diff, puts a change back, links the preview, and **publishes**: everything waiting becomes one commit on `main`, which Vercel deploys. Code pushed to `main` meanwhile is merged into the drafts, never lost. |
| **History** | Git history is the backup: any earlier version of a content file can be restored (as a new draft). |
| **Two-step sign-in** | Codes from an authenticator app (QR code to scan), ten one-time recovery codes, replayed codes refused; the owner can reset it for someone who lost their phone. |
| **Email** | New-enquiry alerts (reply goes straight to the person), password reset by email, team invitations where people choose their own password, a test button. |
| **Website enquiries** | The site's booking form now sends each person to Enquiries as they start booking, and the site counts visits, bookings and deck downloads. |
| **Calendly** | Synced when the Meetings page opens (if older than 15 minutes) and daily on a schedule. |
| **Large uploads** | Files over Vercel's 4.5 MB request limit upload in pieces (up to 95 MB, GitHub's per-file limit). |

## How publishing works

1. An editor saves a section or uploads a picture. The backend reads the file from the
   drafts branch, applies the change with the admin's own engine (the smallest possible edit,
   checked against the section's rules and read back), and commits it to `admin-drafts`.
2. Vercel sees the push and builds a **preview** of the drafts; the Publish page shows its
   state and link (Vercel reports it to GitHub).
3. The owner presses **Publish** (typed confirmation). One commit with the drafts' files lands
   on `main`; Vercel deploys it; the drafts start again from `main`.

All writes to the drafts go through one lock in the database, so two people saving at once
(even on different serverless instances) never overwrite each other. A stale form is refused
rather than undoing someone's change. Set `GITHUB_DRAFT_BRANCH=main` to make every save go
live immediately instead (no previews).

## Set it up on Vercel (about 15 minutes)

You need: the GitHub account that owns the repository, and the Vercel account that hosts the site.

**1. A GitHub token.** github.com → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token. Resource owner: the repository's owner;
Repository access: **Only select repositories** → `WPortfolio`; Permissions:
**Contents: Read and write**, **Metadata: Read**, **Deployments: Read**, **Commit statuses: Read**.
Expiration: up to a year (put a reminder in the calendar to renew it). Copy the token.

**2. A second Vercel project for the backend.** Vercel → Add New → Project → import the same
`WPortfolio` repository. **Root Directory: `backend`**. Leave "Include files outside the root
directory in the Build Step" switched on (the default): the backend uses `../Admin`.
Don't deploy yet.

**3. The database.** In the new project: Storage → Create Database → **Neon** (Postgres, free
plan) → connect it to this project. It adds `DATABASE_URL` by itself.

**4. Its environment variables** (Settings → Environment Variables), see `.env.example`:

| Variable | Value |
| - | - |
| `GITHUB_TOKEN` | the token from step 1 |
| `GITHUB_REPO` | `TheAnushree25/WPortfolio` |
| `ADMIN_SECRET` | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `ADMIN_SETUP_TOKEN` | another random string, for creating the first account |
| `ADMIN_PROXY_SECRET` | another random string (the site gets the same one) |
| `ADMIN_PUBLIC_URL` | `https://theatlasstudios.vercel.app/admin` |
| `SITE_URL` | `https://theatlasstudios.vercel.app` |
| `CRON_SECRET` | another random string (the daily schedule uses it) |
| `SMTP_URL`, `MAIL_FROM` | optional, for email: `smtps://contact.theatlasstudio%40gmail.com:APP-PASSWORD@smtp.gmail.com:465` and `Atlas Studios <contact.theatlasstudio@gmail.com>` (a Gmail app password needs 2-Step Verification on the account) |

Then **Deploy**. Opening the backend's own address shows a page listing anything still missing.

**5. Point the site at it.** In the **site's** Vercel project, add `ADMIN_BACKEND_URL` (the
backend's address, e.g. `https://wportfolio-backend.vercel.app`) and `ADMIN_PROXY_SECRET` (the
same value as step 4), and redeploy the site.

**6. Create the owner account.** Open `https://theatlasstudios.vercel.app/admin/setup?token=<ADMIN_SETUP_TOKEN>`.
Then, in Settings: turn on two-step sign-in (Security), add the Calendly token and the alert
address (Integrations), and invite the team (Team). Bring the local admin's records over with
**Settings → Data → Export** there and **Import** here.

Check everything at any time with `npm run doctor` (from this folder, with the same variables in
`backend/.env`): it tests the database and the GitHub token and branch.

### Elsewhere

It's a plain Node.js 22 server, so any host works. With Docker, from the repository's root:

```bash
docker build -f backend/Dockerfile -t atlas-backend .
docker run -p 4320:4320 --env-file backend/.env -v atlas-data:/app/backend/.data atlas-backend
```

Without `DATABASE_URL` it keeps its own Postgres (PGlite) in that volume, which suits a single
server. Behind your own proxy, set `ADMIN_TRUST_PROXY=true`.

## On this computer

```bash
cd backend
npm install
npm run demo        # http://localhost:4320/admin/setup?token=demo-setup
```

The **demo** runs the whole hosted admin with nothing real at stake: a stand-in for GitHub
seeded from this repository's last commit (`dev/fake-github.mjs`) and a local database, both
in `backend/.data`. Saves, uploads and publishes only change the stand-in; emails are printed
in the console. Delete `backend/.data` to start again. To see it through the site's `/admin`
route as visitors will, start the site with `ADMIN_BACKEND_URL=http://127.0.0.1:4320` and
`ADMIN_PROXY_SECRET=demo-proxy-secret`.

With a real token in `backend/.env`, `npm start` runs against the real repository (it commits
to the drafts branch, so be deliberate).

| Command | |
| - | - |
| `npm test` | 45 tests: sign-in and security, content and publishing, media, clients and analytics, and the building blocks (RFC 6238 codes, QR codes decoded by a real decoder, SMTP, sealed secrets). They run against an in-memory Postgres and the GitHub stand-in, seeded with the real site. |
| `npm run doctor` | Checks the settings, the database and GitHub. |
| `npm run migrate` | Brings the database's tables up to date (also done at start-up). |
| `npm run reset-password -- you@example.com` | A temporary password for an account (with `DATABASE_URL` pointing at the live database). |

## Security

- Passwords: scrypt; sessions: random tokens stored only as SHA-256, in an HttpOnly,
  SameSite=Strict cookie scoped to `/admin`, Secure over HTTPS; every change needs the
  session's CSRF token and the admin's own origin.
- Sign-in, two-step codes, reset emails and the public enquiry form are rate-limited **in the
  database**, so the limits hold across serverless instances.
- Two-step keys and the Calendly token are sealed with AES-256-GCM under `ADMIN_SECRET`.
- First-run setup needs `ADMIN_SETUP_TOKEN`. Reset and invitation links are single-use, stored
  hashed, and expire (an hour; three days).
- Forwarded headers (the visitor's address, the site's host) are believed only with
  `ADMIN_PROXY_SECRET`. Uploads are checked by their bytes (no SVG).
- The GitHub token is the backend's alone, never sent to a browser; give it access to this one
  repository only.

## Limits worth knowing

- GitHub allows a token 5,000 requests an hour; the backend caches Git objects by SHA and
  file contents in the database, so normal use stays far below it (Settings → System shows
  what's left).
- Files: pictures up to 15 MB, video and PDFs up to 95 MB.
- Vercel's free plan runs the daily schedule once a day; the Meetings page syncs on demand.
- Each draft save is a preview build on Vercel. To skip previews of the drafts, add
  `"git": { "deploymentEnabled": { "admin-drafts": false } }` to the site's vercel.json.

## Layout

```
backend/
├─ server.mjs            Node server and the commands (migrate, doctor, reset-password)
├─ api/index.mjs         The Vercel Function (vercel.json sends every path to it)
├─ src/
│  ├─ app.mjs            One web-standard handler: proxy trust, sessions, CSRF, roles, CORS, pages
│  ├─ config.mjs         Settings from the environment, and what's missing
│  ├─ shared.mjs         Everything taken from ../Admin
│  ├─ db/                Postgres (pg) or PGlite behind one interface; the migrations
│  ├─ data.mjs           Every query, and rows ↔ the records the admin's pages know
│  ├─ github/            The GitHub client; the site's two branches, commits and publishing
│  ├─ services/          Content, media, analytics over GitHub and Postgres
│  ├─ routes/            The API, by area (the same endpoints as the local admin, plus new ones)
│  ├─ mail.mjs, totp.mjs, qr.mjs, secrets.mjs, ratelimit.mjs
├─ dev/                  The GitHub stand-in and the demo
├─ scripts/build.mjs     Bundles the admin's pages for a deployment
└─ test/                 The tests
```
