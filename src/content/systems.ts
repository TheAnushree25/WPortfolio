/**
 * The systems: websites, platforms and AI products the studio has engineered,
 * read in the system viewer at /work/<slug> (chapter by chapter: the brief,
 * the stack, the plan, the journeys, the design, the screens, the numbers).
 * Each one's screens are captured from the live product by
 * `node scripts/work/screens.mjs`, which writes content/screens/<slug>.json.
 *
 * Every figure here was counted in the system's own repository (October 2026).
 */

export type StackItem = { readonly name: string; readonly detail?: string; readonly icon?: string };
export type StackLayer = { readonly layer: string; readonly items: readonly StackItem[] };

/** One box in the architecture, in a tier of boxes; links join boxes by id, left to right. */
export type ArchNode = { readonly id: string; readonly label: string; readonly detail: string };
export type ArchTier = { readonly label: string; readonly nodes: readonly ArchNode[] };
export type Architecture = { readonly tiers: readonly ArchTier[]; readonly links: readonly (readonly [string, string])[] };

/** The site map: a root, its areas, and their pages. */
export type PlanNode = { readonly label: string; readonly detail?: string; readonly children?: readonly PlanNode[] };

export type Journey = {
  readonly actor: string;
  readonly goal: string;
  readonly steps: readonly { readonly title: string; readonly detail: string }[];
  readonly outcome: string;
};

export type Swatch = { readonly hex: string; readonly name: string; readonly role: string };
/**
 * A typeface: `stack` sets the specimen; `google` (a Google Fonts family spec)
 * loads it when the chapter comes near; `note` says when the specimen is set
 * in a stand-in (a licensed face the site can't share).
 */
export type Face = {
  readonly family: string;
  readonly role: string;
  readonly sample: string;
  readonly stack: string;
  readonly google?: string;
  readonly note?: string;
};

export type SystemStudy = {
  readonly title: string;
  /** The card's line: what it is, for whom. */
  readonly kind: string;
  /** For the work page's filters. */
  readonly industry: string;
  readonly year: string;
  readonly live: { readonly href: string; readonly label: string } | null;
  /** Two or three sentences for the title card. */
  readonly summary: string;
  /** The brief, set large. */
  readonly brief: string;
  /** The product's colour, lifted so it reads on the night ground. */
  readonly accent: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly stack: readonly StackLayer[];
  readonly architecture: Architecture;
  readonly plan: { readonly title: string; readonly root: PlanNode };
  readonly journeys: readonly Journey[];
  readonly design: { readonly palette: readonly Swatch[]; readonly faces: readonly Face[]; readonly notes: readonly string[] };
  readonly figures: readonly { readonly value: string; readonly label: string }[];
  readonly highlights: readonly { readonly title: string; readonly detail: string }[];
};

const furnishers: SystemStudy = {
  title: 'Maple Furnishers',
  kind: 'Bespoke furniture · Cinematic site & 3D pipeline',
  industry: 'Furniture',
  year: '2026',
  live: { href: 'https://maplefurnishers.com', label: 'maplefurnishers.com' },
  summary:
    'Every home has a story, so the site tells it as a film: scrubbed frame by frame from blueprint to golden hour, with rooms you can shop by touching what is in them and chairs you can turn in 3D, in your own wood and fabric.',
  brief:
    'A bespoke furniture house that needed to sell the feeling before the piece. We built a film you scroll through, rooms you shop by touch, a catalogue of every collection and a 3D customizer, all run from one admin, with checkout left to the store.',
  accent: '#e39a63',
  facts: [
    { label: 'Client', value: 'Maple Furnishers, India' },
    { label: 'Scope', value: 'Film site, catalogue, 3D customizer, admin and API' },
    { label: 'Platform', value: 'Next.js · Express · PostgreSQL · three.js' },
    { label: 'Year', value: '2026' },
  ],
  stack: [
    {
      layer: 'Site',
      items: [
        { name: 'Next.js 15', detail: 'App Router, server-fetched hotspots', icon: 'nextdotjs' },
        { name: 'React 19', icon: 'react' },
        { name: 'TypeScript', icon: 'typescript' },
        { name: 'Tailwind CSS 4', detail: '@theme tokens', icon: 'tailwindcss' },
      ],
    },
    {
      layer: 'Film & 3D',
      items: [
        { name: 'GSAP ScrollTrigger', detail: 'Scrubs 1,820 WebP frames on canvas', icon: 'greensock' },
        { name: 'Lenis', detail: 'Smooth scroll on GSAP’s ticker' },
        { name: 'three.js + R3F', detail: 'Configurator stage and photo-real room', icon: 'threedotjs' },
        { name: 'GLSL', detail: 'Hue-split recolouring, soft shadows', icon: 'webgl' },
      ],
    },
    {
      layer: 'Backend',
      items: [
        { name: 'Express 5', detail: '37 endpoints', icon: 'express' },
        { name: 'Prisma 6', detail: '12 models', icon: 'prisma' },
        { name: 'PostgreSQL', icon: 'postgresql' },
        { name: 'Zod', detail: 'Validated inputs everywhere', icon: 'zod' },
      ],
    },
    {
      layer: 'Asset pipeline',
      items: [
        { name: 'Meshy', detail: 'Multi-image to 3D, then split into materials' },
        { name: 'Blender', detail: 'Master files and 4 views per model', icon: 'blender' },
        { name: 'FFmpeg + sharp', detail: 'Footage to frame sequences', icon: 'ffmpeg' },
        { name: 'Vite', detail: 'The catalogue, a separate SPA', icon: 'vite' },
      ],
    },
    {
      layer: 'Hosting & commerce',
      items: [
        { name: 'Cloudflare', detail: 'Tunnel to the VPS', icon: 'cloudflare' },
        { name: 'Vercel', detail: 'Catalogue and mirrors', icon: 'vercel' },
        { name: 'Shopify', detail: 'Checkout, at shop.maplefurnishers.com', icon: 'shopify' },
      ],
    },
  ],
  architecture: {
    tiers: [
      {
        label: 'Experiences',
        nodes: [
          { id: 'site', label: 'The film site', detail: 'Desktop films, phone story, customizer' },
          { id: 'catalogue', label: 'Catalogue', detail: 'Vite SPA, 27 collection PDFs' },
          { id: 'admin', label: 'Admin', detail: 'Products, placements, 3D assets' },
        ],
      },
      { label: 'One origin', nodes: [{ id: 'origin', label: 'maplefurnishers.com', detail: 'Rewrites /api and /catalogue' }] },
      {
        label: 'Services',
        nodes: [
          { id: 'api', label: 'Express API', detail: 'Scenes, inquiries, 3D manifests' },
          { id: 'worker', label: '3D import worker', detail: 'Locked, leased, checksum-verified' },
        ],
      },
      {
        label: 'Data',
        nodes: [
          { id: 'db', label: 'PostgreSQL', detail: 'Products, placements, versions' },
          { id: 'store', label: 'Artifact store', detail: 'Immutable GLB, .blend and views' },
        ],
      },
      {
        label: 'Outside',
        nodes: [
          { id: 'shop', label: 'Shopify store', detail: 'Where purchases happen' },
          { id: 'keeri', label: 'Keeri', detail: 'Approved product packs' },
        ],
      },
    ],
    links: [
      ['site', 'origin'],
      ['catalogue', 'origin'],
      ['admin', 'origin'],
      ['origin', 'api'],
      ['api', 'db'],
      ['api', 'store'],
      ['worker', 'db'],
      ['worker', 'store'],
      ['store', 'shop'],
      ['worker', 'keeri'],
    ],
  },
  plan: {
    title: 'Website plan',
    root: {
      label: 'maplefurnishers.com',
      detail: 'One origin for the films, the catalogue and the API',
      children: [
        {
          label: 'Home',
          detail: 'The film, in chapters',
          children: [
            { label: 'Intro film', detail: 'Every home has a story' },
            { label: 'The chair weaves itself', detail: '240-frame scrub' },
            { label: 'Craftsmanship', detail: 'The chair, taken apart' },
            { label: 'Rooms to shop', detail: '5 rooms, 23 hotspots' },
          ],
        },
        {
          label: 'Spaces',
          detail: 'Choose a world',
          children: [{ label: 'The ink box' }, { label: 'Nimbus', detail: 'Shaped by clouds' }, { label: 'Terra', detail: 'Shaped by earth' }],
        },
        {
          label: 'Catalogue',
          detail: '9 families',
          children: [{ label: 'Collections landing' }, { label: 'Chairs, sofas, beds, tables' }, { label: 'In-app PDF reader', detail: '28 collections' }],
        },
        {
          label: 'Customize',
          detail: 'Make it yours',
          children: [
            { label: 'Axtra lounge chair', detail: '4 finishes × 4 fabrics' },
            { label: 'Taro, in a room', detail: 'Photo-real 3D' },
            { label: 'Any published model' },
          ],
        },
        {
          label: 'About',
          detail: 'A home, drawn around you',
          children: [{ label: 'Letter from Maple' }, { label: 'Project folder' }, { label: 'FAQ' }],
        },
        {
          label: 'Admin',
          detail: 'Private',
          children: [{ label: 'Products and placements' }, { label: '3D assets and publishing' }, { label: 'Inquiries and subscribers' }],
        },
      ],
    },
  },
  journeys: [
    {
      actor: 'Visitor',
      goal: 'From the story to the store.',
      steps: [
        { title: 'The intro film', detail: '“Every home has a story” rises while the opening plays; skipping is one tap away.' },
        { title: 'The chair weaves itself', detail: 'Scrolling scrubs 240 frames as the chair comes together: “Let’s furnish yours.”' },
        { title: 'Craft, taken apart', detail: 'On the cream plate the chair explodes into its parts, each one named.' },
        { title: 'Rooms you can shop', detail: 'As each room settles, dots breathe on the furniture; a glass card names each piece.' },
        { title: 'Shop now', detail: 'The header hands the visitor to the Shopify store.' },
      ],
      outcome: 'They reach the store already knowing the piece they want.',
    },
    {
      actor: 'Collector',
      goal: 'Browse a whole collection.',
      steps: [
        { title: 'Into Spaces', detail: 'A burgundy graph-paper curtain falls between pages.' },
        { title: 'Choose a world', detail: 'The ink box bursts into cloud, then Nimbus, then Terra.' },
        { title: 'The catalogue', detail: 'Nine families, from chairs and sofas to cafés and restaurants.' },
        { title: 'Read it in place', detail: 'The collection opens as a PDF inside the site, or natively on a phone.' },
      ],
      outcome: 'A full collection read without leaving the site.',
    },
    {
      actor: 'Customer',
      goal: 'Make a chair their own.',
      steps: [
        { title: 'Pick a finish', detail: 'Natural Ash, Walnut Brown, Dark Oak or Ebony.' },
        { title: 'Pick a fabric', detail: 'Ivory, Sand, Mauve or Charcoal, recoloured live in WebGL.' },
        { title: 'Turn it around', detail: 'Four views fly the camera; 360 opens an inertia spinner.' },
        { title: 'See it in a room', detail: 'Taro turns inside a room photograph: drag to rotate, pinch to zoom.' },
        { title: 'Save the look', detail: 'A summary with a link that reopens exactly this chair.' },
      ],
      outcome: 'A saved look that reopens exactly as they left it.',
    },
    {
      actor: 'Studio team',
      goal: 'Publish a new 3D product.',
      steps: [
        { title: 'Import from Keeri', detail: 'An approved pack is queued; the worker fetches and checks every original.' },
        { title: 'Deliver the model', detail: 'Upload the GLB, four views and the Blender master; each is validated.' },
        { title: 'Save a version', detail: 'Swatches, material slots and millimetre dimensions.' },
        { title: 'Preview privately', detail: 'A 15-minute link shows the draft, badged “not published”.' },
        { title: 'Publish', detail: 'It goes live at /customize/<slug>; an older version is one republish away.' },
      ],
      outcome: 'A model live on the site, with a rollback one click away.',
    },
  ],
  design: {
    palette: [
      { hex: '#741A14', name: 'Maple burgundy', role: 'Curtains, accents, the Bulk Order pill' },
      { hex: '#171310', name: 'Ink', role: 'The film’s ground' },
      { hex: '#F6F1E8', name: 'Cream', role: 'Type over footage' },
      { hex: '#8A2F1D', name: 'Terracotta', role: 'Light-theme accent' },
      { hex: '#B39A72', name: 'Sand', role: 'Warm neutrals' },
      { hex: '#DFA35C', name: 'Gold', role: 'Customizer selection and focus' },
    ],
    faces: [
      { family: 'Catilde', role: 'Title cards, navigation and sub-copy', sample: 'Every home has a story.', stack: "'Cormorant Garamond', Georgia, serif", google: 'Cormorant+Garamond:wght@400;500', note: 'A licensed face, shown here in Cormorant' },
      { family: 'Manrope', role: 'Navigation and Shop Now, tracked wide', sample: 'SHOP NOW · SPACES · ABOUT', stack: "'Manrope', sans-serif", google: 'Manrope:wght@400;600' },
      { family: 'Red Hat Display', role: 'Sub-text, the customizer and cards', sample: 'Crafted for the moments you’ll remember.', stack: 'var(--font-red-hat), sans-serif' },
    ],
    notes: [
      'Every headline is stroked in its own colour, so it holds over moving footage.',
      'Copy and hotspots follow the painted frame, never the scroll, so nothing drifts.',
      'Phones get their own portrait films, not a shrunken desktop.',
      'Under reduced motion, every film settles on its last frame.',
    ],
  },
  figures: [
    { value: '1,820', label: 'film frames, scrubbed on canvas' },
    { value: '23', label: 'shoppable hotspots in 5 rooms' },
    { value: '37', label: 'API endpoints' },
    { value: '28', label: 'catalogue collections' },
    { value: '59', label: 'automated tests' },
    { value: '31.2k', label: 'lines of code' },
  ],
  highlights: [
    { title: 'A frame-sequence engine', detail: 'Decodes ahead of the playhead, wider the faster you scroll, and reports the painted frame so copy and hotspots never drift.' },
    { title: 'Hotspots in footage space', detail: 'Points on the 1280×720 film are projected through the canvas’s cover transform and follow the camera push.' },
    { title: 'A crash-safe import queue', detail: 'Advisory locks, heartbeat leases and fencing tokens; a stopped worker requeues its batch instead of losing it.' },
    { title: 'Verified, immutable artifacts', detail: 'GLB, PNG, WebP and .blend files are validated byte by byte and re-checked by SHA-256 on every read.' },
    { title: 'Scoped draft previews', detail: 'A separate HMAC-derived key opens one draft for 15 minutes; only published manifests are public.' },
    { title: 'A photo-real room in the browser', detail: 'three.js shadows patched for soft PCSS, tone-mapped lighting and pinch zoom, rendered on demand.' },
    { title: 'AI to web in five scripts', detail: 'Meshy’s multi-view model becomes named wood and fabric materials, slimmed from 15.4 MB to 4.6 MB.' },
    { title: 'A flicker-free device split', detail: 'Phones never download the 14 MB of desktop film; each gets the story made for it.' },
  ],
};

const studios: SystemStudy = {
  title: 'Maple Studios',
  kind: 'Digital studio · Website, CMS & growth platform',
  industry: 'Technology',
  year: '2026',
  live: { href: 'https://maplestudios.co.in', label: 'maplestudios.co.in' },
  summary:
    'Intelligence, built into business. The studio’s own home: an oxblood film of a site with a live WebGL eagle, a console that runs its content, and a growth platform that sends its campaigns and schedules its posts.',
  brief:
    'A studio that builds websites, AI products and brands needed a site that proves it. Every page is scroll choreography and every case study a deck. Behind it sit a 27-screen console for content and a growth API for leads, email campaigns and social posts, all on one VPS.',
  accent: '#f0c987',
  facts: [
    { label: 'Client', value: 'Maple Studios, New Delhi' },
    { label: 'Scope', value: 'Marketing site, 27-screen console, growth API' },
    { label: 'Platform', value: 'Next.js · Express · MongoDB · three.js' },
    { label: 'Year', value: '2026' },
  ],
  stack: [
    {
      layer: 'Site',
      items: [
        { name: 'Next.js 15', detail: 'Server Components, revalidated per request', icon: 'nextdotjs' },
        { name: 'React 19', icon: 'react' },
        { name: 'TypeScript', detail: 'Strict, site and API', icon: 'typescript' },
        { name: 'Tailwind CSS 4', detail: 'CSS-first tokens', icon: 'tailwindcss' },
      ],
    },
    {
      layer: 'Motion & 3D',
      items: [
        { name: 'Motion', detail: '72 scroll-linked transforms, no GSAP', icon: 'framer' },
        { name: 'three.js + R3F', detail: 'The gold and porcelain relic orbit', icon: 'threedotjs' },
        { name: 'WebGL shaders', detail: 'Depth-mapped eagle, fbm smoke', icon: 'webgl' },
        { name: 'ONNX', detail: 'Depth-Anything-V2 depth maps, offline', icon: 'onnx' },
      ],
    },
    {
      layer: 'Console & content',
      items: [
        { name: 'File-backed CMS', detail: '15 collections, versioned site copy' },
        { name: 'Schema-driven screens', detail: 'One resource screen, many modules' },
        { name: 'SEO console', detail: 'Overrides, JSON-LD, redirects' },
      ],
    },
    {
      layer: 'Growth API',
      items: [
        { name: 'Express 5', detail: '76 routes, 9 modules', icon: 'express' },
        { name: 'MongoDB', detail: 'Mongoose, 12 models', icon: 'mongodb' },
        { name: 'Zod', icon: 'zod' },
        { name: 'Resend', detail: 'Campaigns with one-click unsubscribe', icon: 'resend' },
        { name: 'X and Instagram', detail: 'Scheduled posting', icon: 'x' },
      ],
    },
    {
      layer: 'Infrastructure',
      items: [
        { name: 'Ubuntu VPS', icon: 'ubuntu' },
        { name: 'nginx', icon: 'nginx' },
        { name: 'PM2', icon: 'pm2' },
        { name: 'Cloudflare', icon: 'cloudflare' },
        { name: 'Vitest', detail: '128 API tests', icon: 'vitest' },
      ],
    },
  ],
  architecture: {
    tiers: [
      {
        label: 'People',
        nodes: [
          { id: 'site', label: 'The site', detail: '7 pages, 6 case-study decks' },
          { id: 'console', label: 'The console', detail: '27 screens in 5 groups' },
        ],
      },
      { label: 'Edge', nodes: [{ id: 'edge', label: 'Cloudflare + nginx', detail: 'One domain, two processes' }] },
      {
        label: 'Apps',
        nodes: [
          { id: 'next', label: 'Next.js server', detail: 'Pages, CMS, inquiries, bookings' },
          { id: 'api', label: 'Growth API', detail: 'Express behind a same-origin rewrite' },
        ],
      },
      {
        label: 'Data',
        nodes: [
          { id: 'cms', label: 'JSON CMS', detail: 'Atomic writes, seeded fallbacks' },
          { id: 'mongo', label: 'MongoDB', detail: 'Leads, campaigns, posts' },
        ],
      },
      {
        label: 'Outside',
        nodes: [
          { id: 'resend', label: 'Resend', detail: 'Email campaigns' },
          { id: 'social', label: 'Social networks', detail: 'X, Instagram, LinkedIn' },
        ],
      },
    ],
    links: [
      ['site', 'edge'],
      ['console', 'edge'],
      ['edge', 'next'],
      ['next', 'api'],
      ['next', 'cms'],
      ['api', 'mongo'],
      ['mongo', 'resend'],
      ['mongo', 'social'],
    ],
  },
  plan: {
    title: 'Website plan',
    root: {
      label: 'maplestudios.co.in',
      detail: 'The studio’s site, and the console behind it',
      children: [
        {
          label: 'Home',
          detail: 'One long film',
          children: [
            { label: 'Hero', detail: 'Intelligence, built into business' },
            { label: 'The studio statement', detail: 'Lit word by word' },
            { label: 'Maple facts' },
            { label: 'Selected work → services stage' },
          ],
        },
        { label: 'Work', detail: '6 case studies', children: [{ label: 'Our work' }, { label: 'Case study decks', detail: 'Challenge, approach, outcome' }] },
        {
          label: 'Services',
          detail: 'Area of expertise',
          children: [{ label: 'The relic orbit', detail: 'WebGL' }, { label: 'Five service panels' }, { label: 'How we work' }],
        },
        { label: 'About', detail: 'At Maple', children: [{ label: 'The live eagle' }, { label: 'Values, as fold cards' }, { label: 'Founder and team' }] },
        { label: 'Contact', detail: 'Let’s start something', children: [{ label: 'Inquiry form' }, { label: 'Book a 30-minute call' }, { label: 'FAQ' }] },
        {
          label: 'Console',
          detail: 'Key-gated',
          children: [{ label: 'Studio: inquiries, calls' }, { label: 'Content: portfolio, blog' }, { label: 'Growth: leads, campaigns, social' }, { label: 'Site: SEO, redirects' }],
        },
      ],
    },
  },
  journeys: [
    {
      actor: 'Prospect',
      goal: 'Send an inquiry.',
      steps: [
        { title: 'Let’s talk', detail: 'Cream belts sweep across the screen and carry the visitor to Contact.' },
        { title: 'The form', detail: 'The hero dissolves under maroon strips into the inquiry form.' },
        { title: 'Pick and write', detail: 'Service and budget from custom pickers, then their goals.' },
        { title: 'Send', detail: 'The inquiry is stored even if the tab closes, and a ready email opens.' },
      ],
      outcome: 'The inquiry lands in the console and in the studio’s inbox.',
    },
    {
      actor: 'Prospect',
      goal: 'Book a call.',
      steps: [
        { title: 'Open the calendar', detail: 'Thirty-minute slots in India time across the next two weeks.' },
        { title: 'Pick a time', detail: 'A day, a time, a name and a note.' },
        { title: 'Confirm', detail: 'The slot is taken at once, so no one else can book it.' },
      ],
      outcome: '“You’re booked”, and the call appears on the console’s overview.',
    },
    {
      actor: 'Evaluator',
      goal: 'Read the work.',
      steps: [
        { title: 'The work track', detail: 'A pinned row of projects travels sideways on the home page.' },
        { title: 'A case study', detail: 'The deck rail and its four tabs keep each other in step.' },
        { title: 'Next project', detail: 'The last page leads into the next study.' },
      ],
      outcome: 'A whole case study read inside the site.',
    },
    {
      actor: 'Studio operator',
      goal: 'Run content and growth.',
      steps: [
        { title: 'Publish', detail: 'A project published in Portfolio shows on the next request, with no redeploy.' },
        { title: 'Tune SEO', detail: 'Overrides, noindex and redirects take effect through the middleware.' },
        { title: 'Import leads', detail: 'CSV preview, column mapping, then de-duplication.' },
        { title: 'Send a campaign', detail: 'Merge fields, a daily cap, an India-time send window, weekdays only.' },
      ],
      outcome: 'Campaigns go out through Resend; bounces are suppressed automatically.',
    },
  ],
  design: {
    palette: [
      { hex: '#741A14', name: 'Maple maroon', role: 'Ink on cream, the footer, accents' },
      { hex: '#FFF3D3', name: 'Cream', role: 'Light sections, display type on maroon' },
      { hex: '#5D1411', name: 'Page maroon', role: 'The page’s base' },
      { hex: '#2F0500', name: 'Deep oxblood', role: 'The hero gradient’s edge' },
      { hex: '#C9A262', name: 'Antique gold', role: 'The 3D relics' },
      { hex: '#93352F', name: 'Wordmark red', role: 'The giant footer wordmark' },
    ],
    faces: [
      { family: 'Catilde', role: 'Every display headline', sample: 'Intelligence, built into business.', stack: "'Cormorant Garamond', Georgia, serif", google: 'Cormorant+Garamond:wght@400;500', note: 'A licensed face, shown here in Cormorant' },
      { family: 'Red Hat Display', role: 'Body, labels and uppercase calls to action', sample: 'START A PROJECT →', stack: 'var(--font-red-hat), sans-serif' },
    ],
    notes: [
      'Scroll is the storyteller: pins, strips and belts carry every transition.',
      'Random effects are seeded, so the server and the first frame agree.',
      'A CMS outage can never blank the homepage: the shipped copy stands in.',
      'Every effect parks off-screen and falls back to a still under reduced motion.',
    ],
  },
  figures: [
    { value: '27', label: 'console screens' },
    { value: '76', label: 'growth API routes' },
    { value: '6', label: 'case studies, read as decks' },
    { value: '128', label: 'backend tests' },
    { value: '34.6k', label: 'lines of TypeScript' },
    { value: '72', label: 'scroll-linked transforms' },
  ],
  highlights: [
    { title: 'Scroll choreography without GSAP', detail: 'Pin-at-end strip transitions, route belts and a pinned track that feeds a scrubbed film, all in Motion.' },
    { title: 'Hand-written GLSL', detail: 'An eagle displaced by its own depth map that blinks and follows the cursor, and smoke that is a shader, not footage.' },
    { title: 'A 3D orbit that loads only where needed', detail: 'Client-only, reflective, fogged in maroon, and paused while off-screen.' },
    { title: 'WebKit performance work', detail: 'Seven full-screen gradient layers cut to two to stop Safari scroll flicker.' },
    { title: 'Hydration-safe randomness', detail: 'Seeded shuffles and rounded trajectories, so the server render matches the first client frame.' },
    { title: 'PDF decks as 12 seamless tiles', detail: 'About 20 MB of PDF becomes 0.8 MB of images, with typed section anchors.' },
    { title: 'A CMS that survives bad input', detail: 'Per-file locks, atomic writes and a type-checked merge that ignores a broken field instead of crashing a page.' },
    { title: 'A production-hardened growth API', detail: 'Rate limits, an encrypted token vault, signed unsubscribe links and verified webhooks, with 128 tests.' },
  ],
};

const shoku: SystemStudy = {
  title: 'Shoku',
  kind: 'Café ordering · White-label SaaS',
  industry: 'Hospitality',
  year: '2026',
  live: { href: 'https://getshoku.com', label: 'getshoku.com' },
  summary:
    'Your café. Your brand. Zero commission. Every café gets its own ordering app on its own subdomain, backed by its own database, with a kitchen board, a till and a console for the team that runs them all.',
  brief:
    'Aggregators rent cafés their own customers back at 20 to 30 percent of every order. Shoku hands them back: a branded storefront each café owns, QR ordering at the table, a light POS for the counter, and a platform console from which Maple provisions, bills and supports every café.',
  accent: '#7fc49a',
  facts: [
    { label: 'Product', value: 'Shoku, by Maple Studios' },
    { label: 'Scope', value: 'Marketing site, diner storefronts, café console, platform console' },
    { label: 'Platform', value: 'Next.js · Prisma · PostgreSQL per café' },
    { label: 'Live cafés', value: 'cardamom.shoku.app · brewbloom.shoku.app' },
  ],
  stack: [
    {
      layer: 'App',
      items: [
        { name: 'Next.js 15', detail: 'One app, three surfaces', icon: 'nextdotjs' },
        { name: 'React 18', icon: 'react' },
        { name: 'TypeScript', icon: 'typescript' },
        { name: 'Turborepo', detail: '16 workspace packages', icon: 'turborepo' },
      ],
    },
    {
      layer: 'Data',
      items: [
        { name: 'PostgreSQL 16', detail: 'One database per café', icon: 'postgresql' },
        { name: 'Prisma 6', detail: 'Control-plane and tenant clients', icon: 'prisma' },
        { name: 'Zod', icon: 'zod' },
      ],
    },
    {
      layer: 'Money & AI',
      items: [
        { name: 'Razorpay', detail: 'Orders API, HMAC-checked webhooks', icon: 'razorpay' },
        { name: 'GST receipts', detail: 'CGST and SGST, in integer paise' },
        { name: 'Claude', detail: 'Drafts menu descriptions', icon: 'anthropic' },
      ],
    },
    {
      layer: 'Design system',
      items: [
        { name: '@shoku/ui', detail: '161 components, 225 Figma icons' },
        { name: 'Playwright', detail: '48 screenshot baselines' },
        { name: 'Vitest', detail: 'About 1,780 test cases', icon: 'vitest' },
      ],
    },
    {
      layer: 'Delivery',
      items: [
        { name: 'Cloudflare', icon: 'cloudflare' },
        { name: 'nginx', icon: 'nginx' },
        { name: 'PM2', icon: 'pm2' },
        { name: 'GitHub Actions', detail: 'Self-hosted, gitleaks and semgrep', icon: 'githubactions' },
      ],
    },
  ],
  architecture: {
    tiers: [
      {
        label: 'Surfaces',
        nodes: [
          { id: 'diner', label: 'Diner storefront', detail: '<café>.shoku.app' },
          { id: 'cafe', label: 'Café console', detail: 'Orders, kitchen, till, menu' },
          { id: 'platform', label: 'Platform console', detail: 'admin.shoku.app' },
        ],
      },
      { label: 'Gate', nodes: [{ id: 'gate', label: 'Host gate', detail: 'Resolves the café from the host' }] },
      { label: 'Domain', nodes: [{ id: 'core', label: '10 core modules', detail: 'Tenancy, orders, payments, billing…' }] },
      {
        label: 'Data',
        nodes: [
          { id: 'tenant', label: 'A database per café', detail: '23 models each' },
          { id: 'control', label: 'Control plane', detail: 'Registry, billing, leads, support' },
        ],
      },
      { label: 'Outside', nodes: [{ id: 'razorpay', label: 'Razorpay', detail: 'Payment webhooks, off any café host' }] },
    ],
    links: [
      ['diner', 'gate'],
      ['cafe', 'gate'],
      ['platform', 'gate'],
      ['gate', 'core'],
      ['core', 'tenant'],
      ['core', 'control'],
      ['tenant', 'razorpay'],
    ],
  },
  plan: {
    title: 'Product map',
    root: {
      label: 'shoku.app',
      detail: 'Three surfaces from one app, plus the marketing site',
      children: [
        { label: 'getshoku.com', detail: 'Marketing', children: [{ label: 'Your café, your brand' }, { label: 'How it works' }, { label: 'Pricing' }, { label: 'Book a demo' }] },
        {
          label: 'Storefront',
          detail: '22 pages per café',
          children: [{ label: 'Home and menu' }, { label: 'Item: know your cup' }, { label: 'Shoku AI' }, { label: 'Bag and checkout' }, { label: 'Order tracking and receipt' }],
        },
        { label: 'Table', detail: 'QR ordering', children: [{ label: 'Scan to bind a table' }, { label: 'Guest order lookup' }] },
        {
          label: 'Café console',
          detail: '28 pages',
          children: [{ label: 'Live order board' }, { label: 'Kitchen tickets' }, { label: 'POS, shifts, day end' }, { label: 'Menu and 86 board' }, { label: 'Staff, tables, QR sheet' }],
        },
        {
          label: 'Platform',
          detail: '20 pages',
          children: [{ label: 'Leads pipeline' }, { label: 'Provision a café' }, { label: 'Billing and plans' }, { label: 'Support and health' }],
        },
      ],
    },
  },
  journeys: [
    {
      actor: 'Diner',
      goal: 'Order at the table.',
      steps: [
        { title: 'Scan the QR', detail: 'The table binds after it is checked against that café’s own database.' },
        { title: 'Browse', detail: 'The menu, “Know your cup” for each item, or Shoku AI for “low caffeine”.' },
        { title: 'The bag', detail: 'Lines and the CGST and SGST split, repriced from the catalogue.' },
        { title: 'Check out', detail: 'Pay at the counter; the order mints its tracking and receipt links.' },
        { title: 'Follow it', detail: 'Live status, a GST receipt to download, and a rating.' },
      ],
      outcome: 'An order placed with the café, not an aggregator.',
    },
    {
      actor: 'Café team',
      goal: 'Fulfil the orders.',
      steps: [
        { title: 'Sign in', detail: 'Staff land on the live board.' },
        { title: 'One button per card', detail: 'Accept, mark ready, notify: forward only, and timed for the diner’s tracker.' },
        { title: 'The kitchen board', detail: 'A sold-out item goes on the 86 board for its branch.' },
        { title: 'The counter', detail: 'Walk-ins on the till; a void needs a manager’s PIN.' },
        { title: 'Close the day', detail: 'Count the drawer, then the Z-report.' },
      ],
      outcome: 'Every order accounted for, from table to drawer.',
    },
    {
      actor: 'Maple team',
      goal: 'Onboard a café.',
      steps: [
        { title: 'Work the lead', detail: 'Enquiry, demo, trial, won.' },
        { title: 'Provision', detail: 'A six-step wizard: basics, branding, menu, owner, domain, review.' },
        { title: 'Create', detail: 'A new database is created, migrated, seeded and registered.' },
        { title: 'Hand over', detail: 'The owner accepts an invite, imports the menu and prints the QR sheet.' },
      ],
      outcome: 'A café live on its own subdomain, with its own data.',
    },
  ],
  design: {
    palette: [
      { hex: '#3A6B4D', name: 'Shoku green', role: 'The café’s brand slot: calls to action, ADD' },
      { hex: '#1F3A29', name: 'Deep green', role: 'Brand ink' },
      { hex: '#F4F4EE', name: 'Ground', role: 'The storefront' },
      { hex: '#C97A4A', name: 'Terracotta', role: 'BESTSELLER and the italic accent' },
      { hex: '#DCD5C3', name: 'Warm line', role: 'Hairlines and borders' },
      { hex: '#C4EA53', name: 'Lime', role: 'Platform console labels' },
    ],
    faces: [
      { family: 'Fraunces', role: 'The marketing site’s display serif', sample: 'Your café. Your brand.', stack: "'Fraunces', Georgia, serif", google: 'Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400' },
      { family: 'DM Serif Display', role: 'Storefront display headings', sample: 'Picked for you', stack: "'DM Serif Display', Georgia, serif", google: 'DM+Serif+Display' },
      { family: 'Manrope', role: 'Diner body text', sample: 'Oat flat white · ₹220', stack: "'Manrope', sans-serif", google: 'Manrope:wght@400;600' },
    ],
    notes: [
      'Each café brings its own colour; the consoles stay neutral on purpose.',
      'Every flow works without JavaScript: forms and redirects, enhanced lightly.',
      'A phone-width storefront, centred on desktop: the table is where it is used.',
      'Motion only where it explains: a progress bar, not a show.',
    ],
  },
  figures: [
    { value: '70', label: 'pages across three surfaces' },
    { value: '75', label: 'route handlers' },
    { value: '41', label: 'data models, split across databases' },
    { value: '161', label: 'design-system components' },
    { value: '159', label: 'Figma screens tracked in CI' },
    { value: '60k', label: 'lines of TypeScript' },
  ],
  highlights: [
    { title: 'Isolation by construction', detail: 'Every café has its own database, so one cannot read another’s data even through a bad query.' },
    { title: 'Migrations that resume', detail: 'The control plane migrates first, then every café; a failed run picks up where it stopped.' },
    { title: 'One host gate', detail: 'The platform console exists on one host only, and every other door is a bare 404.' },
    { title: 'A money contract in paise', detail: 'Pure functions price every order; checkout reprices and refuses tampered sizes.' },
    { title: 'Payment safety', detail: 'HMAC on the raw webhook body, a timing-safe compare and an idempotent move to paid.' },
    { title: 'Least privilege, deny by default', detail: 'Branch and PIN grants; failed checks answer 404, and the menu shows only what a role can use.' },
    { title: 'Guard-railed AI', detail: 'Claude drafts menu copy from café text treated as data, and never sits on the order or payment path.' },
    { title: 'Figma fidelity in CI', detail: '159 screens registered, 48 screenshot baselines and a generated icon set.' },
  ],
};

const keeri: SystemStudy = {
  title: 'Keeri',
  kind: 'Furniture ERP · Multi-tenant business OS',
  industry: 'Furniture',
  year: '2026',
  live: { href: 'https://maplefurnishers.keeri.in', label: 'maplefurnishers.keeri.in' },
  summary:
    'Every enquiry, quotation and dispatch in one place. A modular, multi-tenant ERP for furniture businesses, from a WhatsApp enquiry to a GST invoice in one thread, with an AI analyst and an AI photoshoot built in.',
  brief:
    'Furniture businesses in India run on WhatsApp threads, spreadsheets and memory. Keeri replaces them with one console for leads, quotations, orders, invoices, the catalogue, stock, photoshoots and staff. It is white-labelled per company, its modules switch on like features, and every row is fenced to its tenant.',
  accent: '#f3b365',
  facts: [
    { label: 'First tenant', value: 'Maple Furnishers' },
    { label: 'Scope', value: 'Sell, Make, Channels, Money and Team modules' },
    { label: 'Platform', value: 'Next.js 16 · Prisma · PostgreSQL · Turborepo' },
    { label: 'Year', value: '2026' },
  ],
  stack: [
    {
      layer: 'Console',
      items: [
        { name: 'Next.js 16', detail: '128 screens', icon: 'nextdotjs' },
        { name: 'React 19', icon: 'react' },
        { name: 'TypeScript', detail: 'Strict, unchecked index access off', icon: 'typescript' },
        { name: 'shadcn/ui on Radix', detail: '63 components, 30 stories', icon: 'shadcnui' },
        { name: 'Tailwind CSS 4', icon: 'tailwindcss' },
      ],
    },
    {
      layer: 'Data',
      items: [
        { name: 'PostgreSQL', detail: 'Row-scoped tenancy', icon: 'postgresql' },
        { name: 'Prisma 6', detail: '120 models, 122 migrations', icon: 'prisma' },
        { name: 'Cloudflare R2', detail: 'Media, backed up daily', icon: 'cloudflare' },
        { name: 'Turborepo', detail: '2 apps, 5 packages', icon: 'turborepo' },
      ],
    },
    {
      layer: 'AI',
      items: [
        { name: 'Claude', detail: 'Ask analyst, PDF reader, copy, reply drafts', icon: 'anthropic' },
        { name: 'Gemini image', detail: 'The seven-shot photoshoot', icon: 'googlegemini' },
      ],
    },
    {
      layer: 'Channels',
      items: [
        { name: 'WhatsApp Cloud API', detail: 'Inbox with reply SLAs', icon: 'whatsapp' },
        { name: 'Shopify', detail: 'Reviewed sync and publishing', icon: 'shopify' },
        { name: 'Resend', detail: 'Mail and campaigns', icon: 'resend' },
        { name: 'IndiaMART', detail: 'Lead push' },
      ],
    },
    {
      layer: 'Documents',
      items: [
        { name: 'React PDF', detail: 'Quotations, invoices, challans, payslips' },
        { name: 'ExcelJS', detail: 'Quotes, payroll, lead imports' },
        { name: 'GST', detail: 'CGST + SGST or IGST by place of supply' },
      ],
    },
    {
      layer: 'Delivery',
      items: [
        { name: 'GitHub Actions', detail: 'Self-hosted runner, drift checks', icon: 'githubactions' },
        { name: 'Vitest', detail: '775 unit and integration files', icon: 'vitest' },
        { name: 'Storybook', icon: 'storybook' },
        { name: 'nginx + PM2', icon: 'nginx' },
      ],
    },
  ],
  architecture: {
    tiers: [
      {
        label: 'People',
        nodes: [
          { id: 'console', label: 'The console', detail: 'Sales, catalogue, accounts, HR' },
          { id: 'share', label: 'Customer links', detail: 'Products, catalogues, quotations' },
        ],
      },
      {
        label: 'Gate',
        nodes: [
          { id: 'proxy', label: 'Session gate', detail: 'Brand resolved from the host' },
          { id: 'rbac', label: 'Permissions', detail: 'What was bought × what the role allows' },
        ],
      },
      {
        label: 'Modules',
        nodes: [
          { id: 'modules', label: '49 domain modules', detail: 'Each behind its own guard' },
          { id: 'jobs', label: '7 scheduled jobs', detail: 'On Postgres leases' },
        ],
      },
      {
        label: 'Data',
        nodes: [
          { id: 'db', label: 'Tenant-scoped Postgres', detail: '117 of 120 models fenced' },
          { id: 'media', label: 'Media store', detail: 'R2, sniffed, WebP copies' },
        ],
      },
      {
        label: 'Channels',
        nodes: [
          { id: 'whatsapp', label: 'WhatsApp', detail: 'Messages and calls' },
          { id: 'shopify', label: 'Shopify', detail: 'Snapshots and publishing' },
          { id: 'ai', label: 'Claude and Gemini', detail: 'Reports and photoshoots' },
        ],
      },
    ],
    links: [
      ['console', 'proxy'],
      ['share', 'proxy'],
      ['proxy', 'rbac'],
      ['rbac', 'modules'],
      ['modules', 'db'],
      ['modules', 'media'],
      ['jobs', 'db'],
      ['db', 'whatsapp'],
      ['db', 'shopify'],
      ['media', 'ai'],
    ],
  },
  plan: {
    title: 'Product map',
    root: {
      label: 'maplefurnishers.keeri.in',
      detail: '128 screens behind one sign-in, branded per company',
      children: [
        {
          label: 'Sell',
          detail: '30 screens',
          children: [{ label: 'Leads and the WhatsApp inbox' }, { label: 'Clients' }, { label: 'Quotations', detail: 'Rooms, versions, PDF' }, { label: 'Orders and challans' }, { label: 'Campaigns' }],
        },
        {
          label: 'Make',
          detail: '26 screens',
          children: [{ label: 'Products and variants' }, { label: 'Catalogue designer' }, { label: 'AI photoshoot' }, { label: 'Inventory' }],
        },
        { label: 'Channels', detail: '13 screens', children: [{ label: 'Shopify sync' }, { label: 'Reconcile' }, { label: 'Publish checks' }] },
        { label: 'Money', detail: '14 screens', children: [{ label: 'Invoices' }, { label: 'Payments and receivables' }, { label: 'Purchase orders' }, { label: 'Expenses' }] },
        { label: 'Team', detail: '22 screens', children: [{ label: 'HR and attendance' }, { label: 'Payroll' }, { label: 'Tasks', detail: 'List, calendar, timeline' }] },
        { label: 'Platform', detail: 'Everywhere', children: [{ label: 'Ask, the AI analyst' }, { label: 'Users and roles' }, { label: 'Branding' }, { label: 'Audit and jobs' }] },
      ],
    },
  },
  journeys: [
    {
      actor: 'Sales rep',
      goal: 'From a WhatsApp enquiry to an invoice.',
      steps: [
        { title: 'A message arrives', detail: 'It is stored and linked to a lead, queued by reply SLA.' },
        { title: 'Build the cart in chat', detail: 'Products saved to the lead from the chat drawer; an AI-drafted reply if wanted.' },
        { title: 'Quote it', detail: 'Rooms and charges, with the GST split worked out from the two states.' },
        { title: 'Issue', detail: 'Numbered by financial year, QT-2627-0001, with stock reserved and a link shared.' },
        { title: 'Order to cash', detail: 'Accepted, it becomes an order, a challan, an invoice and a payment.' },
      ],
      outcome: 'One thread from chat to cash, with nothing retyped.',
    },
    {
      actor: 'Catalogue team',
      goal: 'One photograph to a product on Shopify.',
      steps: [
        { title: 'Upload one photo', detail: 'Gemini makes seven shots: cut-out, room hero, three-quarter, back, dimensions, scale, fabric.' },
        { title: 'Review the frames', detail: 'Raw, generated, approved, then attached to the SKU.' },
        { title: 'Verify the design', detail: 'Sign-offs, HSN, GST and warranty, and copy drafted by Claude.' },
        { title: 'Reconcile', detail: 'Snapshots from Shopify are matched and reviewed; saving never publishes.' },
        { title: 'Publish', detail: 'Explicitly, then stock pushed with a signed preview.' },
      ],
      outcome: 'Keeri stays the source of truth; Shopify mirrors only what was reviewed.',
    },
    {
      actor: 'Owner',
      goal: 'Ask the business a question.',
      steps: [
        { title: 'Ask', detail: '“Which dealers have gone quiet?”' },
        { title: 'Only allowed reports', detail: 'Claude may run only the reports this person may see, from 69.' },
        { title: 'Answered', detail: 'Three or four sentences, with the data charted beside them.' },
      ],
      outcome: 'Analytics in plain words, without raw database access.',
    },
    {
      actor: 'Admin',
      goal: 'Onboard a teammate, least privilege first.',
      steps: [
        { title: 'Invite', detail: 'A role and an emailed invitation; no one can invite above themselves.' },
        { title: 'Tune the grants', detail: 'A permission grid per role, down to single actions.' },
        { title: 'Activate', detail: 'The invitee sets a password on the company-branded sign-in.' },
        { title: 'Land where they work', detail: 'Straight to their only screen if they have one.' },
      ],
      outcome: 'Each role sees a smaller console; what it can’t use is absent, not greyed out.',
    },
  ],
  design: {
    palette: [
      { hex: '#A63815', name: 'Copper', role: 'Primary actions, active navigation' },
      { hex: '#F3B365', name: 'Amber', role: 'The accent in dark mode' },
      { hex: '#8F1F2B', name: 'Oxblood', role: 'The mark, and Maple’s tenant colour' },
      { hex: '#18181B', name: 'Ink', role: 'Text; dark surfaces' },
      { hex: '#FAFAFA', name: 'Canvas', role: 'The page' },
      { hex: '#FFF1E9', name: 'Copper wash', role: 'Tinted grounds' },
    ],
    faces: [
      { family: 'Geist', role: 'Headings', sample: 'Publish to Shopify', stack: "'Geist', sans-serif", google: 'Geist:wght@500;600' },
      { family: 'Manrope', role: 'Interface text', sample: '52 designs · 52 variants', stack: "'Manrope', sans-serif", google: 'Manrope:wght@400;600' },
      { family: 'JetBrains Mono', role: 'SKUs and document codes', sample: 'MPL-BED-FB-10-IV', stack: "'JetBrains Mono', monospace", google: 'JetBrains+Mono:wght@500' },
    ],
    notes: [
      'One tenant hue becomes accessible light and dark families automatically.',
      'Frosted glass only on the chrome; tables, forms and photographs stay solid.',
      'Modules a role can’t use are absent, not greyed out.',
      'Motion runs 120 to 180 ms and collapses to nothing under reduced motion.',
    ],
  },
  figures: [
    { value: '128', label: 'screens' },
    { value: '346', label: 'API handlers' },
    { value: '120', label: 'data models' },
    { value: '69', label: 'reports the AI analyst can run' },
    { value: '1,046', label: 'commits in nine weeks' },
    { value: '790', label: 'test files' },
  ],
  highlights: [
    { title: 'Tenant isolation by construction', detail: 'Every query is stamped with its tenant, and cross-tenant references cannot be expressed in the schema.' },
    { title: 'One permission model for every surface', detail: 'What a company bought × what a role allows drives the sidebar, the dashboard, the AI and a permission debugger.' },
    { title: 'A guard-railed AI analyst', detail: 'The model never writes queries; it may only run hand-written, tenant-scoped reports the asker is allowed.' },
    { title: 'An AI photoshoot pipeline', detail: 'Seven shots, each generated, retried and attached on its own, with real dimensions and a watermark.' },
    { title: 'White-labelling that stays accessible', detail: 'One hue becomes contrast-checked light and dark families, asserted numerically in tests.' },
    { title: 'Indian commercial correctness', detail: 'Money in paise, GST by place of supply, documents numbered by financial year and never deleted.' },
    { title: 'A reviewed Shopify sync', detail: 'Snapshots, a match-and-review queue, explicit publishing and compare-and-swap stock.' },
    { title: 'Ops-grade delivery', detail: 'CI on the server itself, migration drift checks, size limits on every file and scripted restore drills.' },
  ],
};

const ishita: SystemStudy = {
  title: 'Ishita Traders',
  kind: 'Solar & power backup · Site, catalogue & lead engine',
  industry: 'Energy',
  year: '2026',
  live: { href: 'https://ishita-traders.vercel.app', label: 'ishita-traders.vercel.app' },
  summary:
    'A solar and power-backup dealer in Bihar, given a site that works as hard as its counter: a catalogue that answers price and availability in a tap, WhatsApp everywhere, and a console where every form, tap and message becomes a lead.',
  brief:
    'Ishita Traders has sold UTL, Exide and Microtek power from Chakia, East Champaran, since 2014. The site answers every buyer’s first question, price and availability, in one tap. Behind it, a back office catches every enquiry, whether a form, a WhatsApp message, a call, an email or a text, and the team runs the catalogue, content and SEO itself.',
  accent: '#a6cc2a',
  facts: [
    { label: 'Client', value: 'Ishita Traders, Chakia, Bihar' },
    { label: 'Scope', value: 'Website, catalogue, admin console, lead inbox' },
    { label: 'Platform', value: 'Next.js 16 · Drizzle · PostgreSQL' },
    { label: 'Year', value: '2026' },
  ],
  stack: [
    {
      layer: 'Site',
      items: [
        { name: 'Next.js 16', detail: 'Server Components and Server Actions', icon: 'nextdotjs' },
        { name: 'React 19', icon: 'react' },
        { name: 'TypeScript', icon: 'typescript' },
        { name: 'Tailwind CSS 4', icon: 'tailwindcss' },
        { name: 'Motion', detail: 'Lazy-loaded features', icon: 'framer' },
      ],
    },
    {
      layer: 'Data',
      items: [
        { name: 'PostgreSQL', detail: 'On Neon, 19 tables', icon: 'postgresql' },
        { name: 'Drizzle ORM', icon: 'drizzle' },
        { name: 'PGlite', detail: 'Zero-setup local database' },
        { name: 'Zod', detail: 'Shared by server and forms', icon: 'zod' },
      ],
    },
    {
      layer: 'Console',
      items: [
        { name: 'In-house CMS', detail: 'Content, products, pages, media' },
        { name: 'In-house auth', detail: 'scrypt, hashed sessions, 4 roles' },
        { name: 'SEO crawler', detail: '76 rules in 8 categories' },
      ],
    },
    {
      layer: 'Leads',
      items: [
        { name: 'WhatsApp Cloud API', detail: 'Signed webhooks', icon: 'whatsapp' },
        { name: 'Email and SMS', detail: 'Inbound webhooks, Twilio-style', icon: 'twilio' },
        { name: 'Resend', detail: 'Alerts to the team', icon: 'resend' },
        { name: 'GA4', icon: 'googleanalytics' },
      ],
    },
    {
      layer: 'Hosting',
      items: [
        { name: 'Vercel', icon: 'vercel' },
        { name: 'Vercel Blob', detail: 'Or Postgres, for uploads' },
        { name: 'sharp', detail: 'WebP and blur placeholders' },
      ],
    },
  ],
  architecture: {
    tiers: [
      {
        label: 'People',
        nodes: [
          { id: 'site', label: 'The site', detail: 'Home, catalogue, brands, contact' },
          { id: 'admin', label: 'The console', detail: '27 screens' },
        ],
      },
      {
        label: 'App',
        nodes: [
          { id: 'rsc', label: 'Server Components', detail: 'Tag-cached, updated on publish' },
          { id: 'actions', label: '70 Server Actions', detail: 'Permission, Zod, write, audit' },
        ],
      },
      {
        label: 'Data',
        nodes: [
          { id: 'db', label: 'PostgreSQL', detail: 'Drizzle, 19 tables' },
          { id: 'seed', label: 'Seed content', detail: 'Stands in if the database is down' },
        ],
      },
      {
        label: 'Channels',
        nodes: [
          { id: 'inbox', label: 'Lead inbox', detail: 'WhatsApp, email, SMS webhooks' },
          { id: 'mail', label: 'Resend', detail: 'New-lead alerts' },
        ],
      },
    ],
    links: [
      ['site', 'rsc'],
      ['admin', 'actions'],
      ['rsc', 'db'],
      ['rsc', 'seed'],
      ['actions', 'db'],
      ['db', 'inbox'],
      ['actions', 'mail'],
    ],
  },
  plan: {
    title: 'Website plan',
    root: {
      label: 'ishita-traders.vercel.app',
      detail: 'Six public routes, and the console behind them',
      children: [
        {
          label: 'Home',
          detail: '16 sections',
          children: [{ label: 'Brand partners' }, { label: 'Product categories' }, { label: 'Solar range showcase' }, { label: 'Testimonials and FAQ' }],
        },
        {
          label: 'Products',
          detail: 'The catalogue',
          children: [{ label: 'Brand tabs, search, filters' }, { label: 'Product popup with an RFQ' }, { label: '15 product pages' }],
        },
        { label: 'Brands', detail: 'Authorised dealer', children: [{ label: 'UTL Solar' }, { label: 'Exide' }, { label: 'Microtek' }] },
        { label: 'Clients', detail: 'Proof', children: [{ label: 'Client stories' }, { label: 'Reviews' }] },
        { label: 'Contact', detail: 'Open now?', children: [{ label: 'Live open and closed hours' }, { label: 'Enquiry form' }, { label: 'Call and WhatsApp dock' }] },
        {
          label: 'Console',
          detail: '27 screens',
          children: [{ label: 'Dashboard' }, { label: 'Enquiries and inbox' }, { label: 'Products and content' }, { label: 'SEO and redirects' }, { label: 'Users and backups' }],
        },
      ],
    },
  },
  journeys: [
    {
      actor: 'Homeowner',
      goal: 'Look into solar.',
      steps: [
        { title: 'Arrive', detail: 'A “Charging” loader fills with real progress as the page arrives.' },
        { title: 'Browse', detail: 'Categories, then the pinned solar range.' },
        { title: 'Ask on WhatsApp', detail: '“Get price and availability” opens WhatsApp with the message written.' },
        { title: 'Or write in', detail: 'The homepage form, validated on both sides.' },
      ],
      outcome: 'An enquiry, an email alert and the tap itself, all logged as leads.',
    },
    {
      actor: 'Institutional buyer',
      goal: 'Request a quote.',
      steps: [
        { title: 'The mega menu', detail: 'One column per brand, straight into the filtered catalogue.' },
        { title: 'Find the product', detail: 'Search and filters, all kept in the URL.' },
        { title: 'Request for quote', detail: 'Company, quantity up to 100,000, site and application.' },
      ],
      outcome: 'A product enquiry with SKU and campaign data, and the team alerted.',
    },
    {
      actor: 'Owner',
      goal: 'Work the leads.',
      steps: [
        { title: 'The dashboard', detail: 'Enquiries this week against last, unread messages, clicks, overdue follow-ups.' },
        { title: 'Open an enquiry', detail: 'Status, follow-up date, notes, earlier enquiries from the same client.' },
        { title: 'Reply', detail: 'One tap to WhatsApp or a call.' },
      ],
      outcome: 'Every step recorded in the activity log.',
    },
    {
      actor: 'Editor',
      goal: 'Update the catalogue and the site.',
      steps: [
        { title: 'Add a product', detail: 'Images, specs, price and SEO, then publish.' },
        { title: 'It’s live', detail: 'The catalogue and sitemap update at once; a renamed product redirects itself.' },
        { title: 'Audit the SEO', detail: 'The built-in crawler links each issue to the screen that fixes it.' },
      ],
      outcome: 'The site stays current without a developer.',
    },
  ],
  design: {
    palette: [
      { hex: '#1E3A8A', name: 'Navy', role: 'Primary buttons, theme colour' },
      { hex: '#0F274A', name: 'Night navy', role: 'Headings, the console sidebar' },
      { hex: '#748F0F', name: 'Leaf', role: 'Accent buttons, section labels' },
      { hex: '#33B1E3', name: 'Azure', role: 'Highlights' },
      { hex: '#F3F9FF', name: 'Sky', role: 'Surfaces' },
      { hex: '#25D366', name: 'WhatsApp', role: 'The channel buyers use' },
    ],
    faces: [
      { family: 'Plus Jakarta Sans', role: 'Display headings', sample: 'Trusted Brands. Reliable Power.', stack: "'Plus Jakarta Sans', sans-serif", google: 'Plus+Jakarta+Sans:wght@600;700' },
      { family: 'Inter', role: 'Body text', sample: 'Solar panels, inverters, batteries and UPS.', stack: "'Inter', sans-serif", google: 'Inter:wght@400;600' },
      { family: 'Archivo Expanded', role: 'Captions, the loader, wide labels', sample: 'SCROLL TO EXPLORE', stack: "'Archivo', sans-serif", google: 'Archivo:wdth,wght@125,600' },
    ],
    notes: [
      'Price and availability are one tap away, from every product.',
      'The site never depends on the database: seed content stands in.',
      'Edits go live on the next request, with no redeploy.',
      'Every surface respects reduced motion.',
    ],
  },
  figures: [
    { value: '27', label: 'console screens' },
    { value: '70', label: 'Server Actions' },
    { value: '19', label: 'database tables' },
    { value: '76', label: 'SEO audit rules' },
    { value: '15', label: 'product pages' },
    { value: '41.4k', label: 'lines of TypeScript' },
  ],
  highlights: [
    { title: 'A zero-setup dual database', detail: 'PGlite on a laptop, Postgres on Neon in production; migrations and seed data run on first use.' },
    { title: 'A site that survives outages', detail: 'Tag-cached reads with instant updates, and seed content served if the database goes down.' },
    { title: 'Hardened in-house auth', detail: 'scrypt, hashed sessions, lockouts, equal-time failures and four roles with 18 permissions.' },
    { title: 'An omnichannel lead inbox', detail: 'WhatsApp, four email providers and SMS normalised into one inbox, verified and never duplicated.' },
    { title: 'Sandboxed uploaded pages', detail: 'Landing pages the team uploads run in a sandbox that can’t touch the console’s cookies.' },
    { title: 'A built-in SEO crawler', detail: '76 rules across meta, content, structured data and performance, each issue linked to its fix.' },
    { title: 'Safe media and backups', detail: 'Files identified by their bytes, stripped of location data, and restorable in one transaction.' },
  ],
};

export const systems: Record<string, SystemStudy> = {
  'maple-furnishers': furnishers,
  'maple-studios': studios,
  shoku,
  keeri,
  'ishita-traders': ishita,
};

/** The order the systems row shows them in. */
export const systemOrder = ['maple-furnishers', 'maple-studios', 'shoku', 'keeri', 'ishita-traders'] as const;
