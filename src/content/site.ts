export const site = {
  name: 'Atlas Studios',
  owner: 'Gulafsan Shaheen',
  wordmark: 'Atlas',
  brandSuffix: '*',
  year: '©2026',
  email: 'gulafsan.shaheen@gmail.com',
  linkedin: 'https://www.linkedin.com/in/gulafsan-shaheen/',
  instagram: 'https://www.instagram.com/a.gulafsan/',
  resume: 'https://drive.google.com/file/d/1PbuxKr7F3agauJBiAvXJwXcSzHWvT4wD/view?usp=sharing',
  copyright: 'Copyright © Gulafsan Shaheen 2026',
} as const;

/**
 * Studio Mirage's header: two links and a contact pill. Each link lights its
 * dot on its own page, and on the landing while the page is in its sections.
 */
export const nav = {
  links: [
    { label: 'Our works', href: '/works', sections: ['work'] },
    { label: 'About us', href: '#about', sections: ['expertise', 'about', 'clients', 'process', 'testimonials'] },
  ],
  contact: { label: 'Contact us', href: '/contact' },
} as const;

/**
 * The landing: the studio reel plays first, then two slides from the Atlas
 * Studios Figma frames — the wordmark, and the emblem with the studio statement.
 */
export const hero = {
  wordmark: site.wordmark,
  statement: ['We are a 360 design', 'and tech studio'],
  mission:
    'We turn imagination into direction. Through research, strategy, and design, we create identities and digital experiences that make people pause, connect, and take the next step.',
  scrollCue: 'Scroll',
  emblem: 'Atlas Studios emblem',
  reel: {
    label: 'The Atlas Studio — turning imagination into direction',
    src: '/video/atlas-intro-1080.mp4',
    small: '/video/atlas-intro-720.mp4',
    poster: '/images/atlas-intro-poster.jpg',
    skip: 'Skip intro',
    play: 'Play intro',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
  },
} as const;

/**
 * Selected work, shown as tall cards that travel sideways while the section is
 * pinned. `focus` is the object-position that keeps each square shot's subject
 * inside its 9:16 card. Projects with a deck in `content/work.ts` open it in
 * the work viewer at /work/<slug>; the rest open their shot.
 *
 * YOOJ and Dorikala are stand-in cards: their shots are mockups lifted from
 * their own guideline decks until the final card art is made. `industry` is
 * what the work page's filters sort them by.
 */
export const works = {
  title: 'New perspectives. Made visible.',
  tagline: 'Identity. Digital. Experience.',
  cta: 'Explore the project',
  close: 'Close project',
  projects: [
    { slug: 'yooj', title: 'YOOJ', kind: 'Healthcare · Brand identity system', src: '/images/works/yooj.jpg', focus: '50% 50%', industry: 'Healthcare' },
    { slug: 'dorikala', title: 'Dorikala', kind: 'Fusion fashion · Brand identity system', src: '/images/works/dorikala.jpg', focus: '50% 50%', industry: 'Fashion' },
    { slug: 'kidcity', title: 'Kidcity', kind: 'Kids apparel · Identity & packaging', src: '/images/works/kidcity.jpg', focus: '50% 50%', industry: 'Kids' },
    { slug: 'fresh-feast', title: 'Fresh Feast', kind: 'Salad & juice bar · Identity & packaging', src: '/images/works/fresh-feast.jpg', focus: '50% 50%', industry: 'Food' },
    { slug: 'spring-chu', title: 'Spring Chu', kind: 'Natural spring water · Label design', src: '/images/works/spring-chu.jpg', focus: '50% 50%', industry: 'Drinks' },
    { slug: 'teddy', title: 'Teddy', kind: 'Hard cider · Label design', src: '/images/works/teddy.jpg', focus: '10% 50%', industry: 'Drinks' },
    { slug: 'zenoxa', title: 'Zenoxa', kind: 'Wellness wearable · Identity', src: '/images/works/zenoxa.jpg', focus: '50% 50%', industry: 'Wellness' },
    { slug: 'dishoom', title: 'Dishoom', kind: 'Strong brew · Label design', src: '/images/works/dishoom.jpg', focus: '50% 50%', industry: 'Drinks' },
    { slug: 'animal', title: 'Animal', kind: 'Dark beer · Label design', src: '/images/works/animal.jpg', focus: '30% 50%', industry: 'Drinks' },
    { slug: 'freighteasy', title: 'FreightEasy', kind: 'Logistics · Company deck', src: '/images/works/freighteasy.jpg', focus: '75% 50%', industry: 'Logistics' },
  ],
  /** The words of the work viewer. */
  viewer: {
    eyebrow: 'Case study',
    pages: 'pages',
    chapters: 'chapters',
    start: 'Start reading',
    index: 'Index',
    close: 'Close project',
    back: 'Back to all work',
    end: 'End of the deck',
    next: 'Next project',
    view: 'View the project',
    editions: 'Edition',
    scroll: 'Scroll',
  },
  /** The words of the system viewer, around each system's own (content/systems.ts). */
  system: {
    eyebrow: 'System',
    cta: 'Explore the system',
    brief: 'The brief',
    stack: 'Tech stack',
    journeys: 'User journeys',
    design: 'Design',
    screens: 'Screens',
    numbers: 'In numbers',
    chapter: 'Chapter',
    visit: 'Visit the live site',
    end: 'End of the case study',
    built: 'What it is built with',
    flow: 'How it fits together',
    outcome: 'Outcome',
    palette: 'Colour',
    type: 'Type',
    principles: 'Principles',
    desktop: 'On a desktop',
    phone: 'On a phone',
    highlights: 'Engineering highlights',
  },
} as const;

/**
 * The work page (/works), after Studio Mirage's: the selected work in two
 * rows — the systems the studio engineers and the identities it designs —
 * over a screening room whose screens play whatever is pointed at.
 */
export const worksPage = {
  title: 'Selected work',
  intro: 'Systems we engineer and identities we design, end to end.',
  filters: { label: 'Filters', discipline: 'Discipline', industry: 'Industry', clear: 'Clear all', none: 'Nothing matches those filters yet.' },
  nowShowing: 'Now showing',
  rows: {
    systems: {
      id: 'systems',
      number: '01',
      title: 'Systems',
      line: 'Websites, platforms and AI, engineered end to end.',
      tags: ['Tech stack', 'User journeys', 'Website plan', 'Design'],
    },
    design: {
      id: 'design',
      number: '02',
      title: 'Design',
      line: 'Identity. Digital. Experience.',
      tags: ['Brand identity', 'Packaging', 'Guidelines'],
    },
  },
  /** The torn white teaser at the foot of the page. */
  next: { overline: 'Next page', title: 'Your project, next.', cta: 'You are one click away', label: 'Book a meeting', href: '/contact' },
} as const;

/** The studio's fields, set in columns after Studio Mirage's expertise listing. */
export const practice = {
  title: ['Our areas', 'of practice'],
  columns: [
    {
      heading: 'Strategy',
      items: ['Brand positioning', 'Audience research', 'Creative concepts', 'Brand narrative', 'Verbal identity'],
    },
    {
      heading: 'Identity',
      items: ['Art direction', 'Logo design', 'Typography and colour', 'Packaging design', 'Brand guidelines', 'Visual systems'],
    },
    {
      heading: 'Digital',
      items: ['User experience', 'Interface design', 'Website design', 'Interactive prototypes', 'Digital design systems'],
    },
    {
      heading: 'Who we design for',
      items: ['Emerging brands', 'Growing businesses', 'Product teams', 'Independent founders', 'Creative organisations'],
    },
  ],
} as const;

/** Who Atlas is, in two columns: the line on the left, the story on the right. */
export const story = {
  title: ['Imagination,', 'with direction.'],
  paragraphs: [
    'Atlas is the independent design practice of Gulafsan Shaheen, bringing together research, brand identity, and digital design.',
    'An economics background shapes how we approach a brief: understanding choices, finding patterns, and asking what sits beneath the obvious.',
    'We turn that understanding into a distinct visual language. An identity with character. An interface with clarity. A system that holds everything together.',
    'From the first question to the final detail, every decision has a reason.',
  ],
} as const;

/**
 * Brands whose identities came out of the studio, as white marks in Studio
 * Mirage's logo grid. Each file is the original logo reduced to one colour.
 */
export const partners = {
  title: 'They trust us',
  logos: [
    { name: 'Aksharam Consultants', src: '/images/partners/aksharam.png', width: 804, height: 613 },
    { name: 'Bachat Karta', src: '/images/partners/bachat-karta.png', width: 433, height: 137 },
    { name: 'Jazbaat Humare', src: '/images/partners/jazbaat-humare.png', width: 267, height: 123 },
    { name: 'mistiWORK', src: '/images/partners/mistiwork.png', width: 259, height: 167 },
    { name: 'Gallaries of RRS', src: '/images/partners/rrs.png', width: 125, height: 184 },
    { name: 'Socialize Here', src: '/images/partners/socialize-here.png', width: 179, height: 191 },
    { name: 'Stay Proud', src: '/images/partners/stay-proud.png', width: 237, height: 175 },
    { name: 'The Stupid Engineer', src: '/images/partners/stupid-engineer.png', width: 289, height: 188 },
    { name: 'Wat’a’melon', src: '/images/partners/watamelon.png', width: 371, height: 324 },
    { name: 'WorkerBees', src: '/images/partners/workers-bees.png', width: 262, height: 293 },
  ],
} as const;

/**
 * How a project runs, as Studio Mirage's stacking timeline cards. (Not named
 * `process`: that would shadow Node's global wherever it is imported.)
 */
export const method = {
  title: 'How we work',
  steps: [
    {
      title: 'Understand',
      text: 'We begin with the context. Your ambition, your audience, and the challenge the work needs to answer.',
    },
    {
      title: 'Find direction',
      text: 'We connect the research to a central idea. A point of view that guides what comes next.',
    },
    {
      title: 'Explore & design',
      text: 'We try directions, develop the visual language, and make prototypes you can respond to.',
    },
    {
      title: 'Bring it together',
      text: 'We develop the chosen direction across the agreed touchpoints, building consistency into the details.',
    },
    {
      title: 'Test & resolve',
      text: 'We question the choices, gather feedback, and refine the work until it feels clear and complete.',
    },
    {
      title: 'Equip & hand over',
      text: 'We prepare the files, guidelines, and design systems your team needs to use the work confidently.',
    },
  ],
} as const;

/**
 * Placeholder testimonials in Studio Mirage's stacked glass cards — swap in
 * real client words, names and photos before this goes live.
 */
export const testimonials = {
  label: 'Testimonials',
  cards: [
    {
      quote:
        'Atlas found the idea we had been circling for months and gave it a shape. The new identity finally feels like us, and people notice it.',
      name: 'Client name',
      role: 'Founder — Company name',
      initials: 'CN',
    },
    {
      quote:
        'Every decision came with a reason. The research made the direction easy to agree on, and the design made it easy to love.',
      name: 'Client name',
      role: 'Marketing lead — Company name',
      initials: 'CN',
    },
    {
      quote:
        'From the first workshop to the final files, the process felt calm and clear. Our team uses the guidelines every single day.',
      name: 'Client name',
      role: 'Product owner — Company name',
      initials: 'CN',
    },
  ],
} as const;

/**
 * The closing scene and Studio Mirage's footer: the wordmark formed from sand
 * over the globe, then where the studio works, the ways to start a project,
 * the links and the credits.
 */
export const footer = {
  title: 'The Atlas Studio',
  locations: [
    { place: 'India', detail: 'Studio base' },
    { place: 'Asia & beyond', detail: 'Remote collaborations' },
  ],
  contact: {
    title: 'Ready to start your project?',
    /** Opens the deck on the site and downloads the PDF in the same click. */
    deck: { label: 'Get the deck', href: '/deck', pdf: '/docs/the-atlas-studio.pdf', file: 'The-Atlas-Studio.pdf' },
    line: { label: 'Drop us a line', href: `mailto:${site.email}` },
    talk: { label: 'Let’s talk', href: '/contact' },
  },
  links: [
    { label: 'Instagram', href: site.instagram },
    { label: 'LinkedIn', href: site.linkedin },
    { label: 'Email', href: `mailto:${site.email}` },
  ],
  copyright: '© 2026 The Atlas Studio. All rights reserved.',
  legal: {
    label: 'Legal notice',
    lines: [
      'This site is published by Gulafsan Shaheen, The Atlas Studio.',
      `Contact: ${site.email}`,
      'Hosted by Vercel Inc. (vercel.com).',
      'The work shown belongs to its respective owners; please ask before reproducing any of it.',
    ],
    close: 'Close',
  },
  email: site.email,
  top: 'Return to the top',
} as const;

/** The white teaser at the very foot of the page. */
export const nextPage = {
  overline: 'Next page',
  title: 'The ideas, realised.',
  /** What the travelling line says; the link itself reads as the label. */
  cta: 'You are one click away',
  label: 'Explore our work',
  href: '/works',
  /** The reel's turning carousel, played above the sheet while it's hovered. */
  clip: '/video/atlas-carousel.mp4',
} as const;

/** The deck, re-lit in the site's gradient by scripts/deck/retheme.py. */
export const deck = {
  title: 'The deck',
  overline: 'The Atlas Studio',
  intro: 'Thirteen pages on how the studio thinks and what it has made.',
  pdf: '/docs/the-atlas-studio.pdf',
  download: 'Download the PDF',
  open: 'Open the PDF',
  slides: Array.from({ length: 13 }, (_, i) => `/deck/slide-${String(i + 1).padStart(2, '0')}.webp`),
} as const;

/**
 * The booking page, after Studio Mirage's Cal.com scheduler. With a Cal.com
 * link set (NEXT_PUBLIC_CAL_LINK) the real scheduler loads; otherwise the
 * studio's own: a picked time goes on the studio's Google Calendar with a
 * Meet link, the visitor gets the invitation and the studio's inbox a note
 * (app/api/booking). Until Google is connected it falls back to email.
 */
export const booking = {
  studio: 'The Atlas Studio',
  title: 'Our next meeting',
  duration: '45m',
  minutes: 45,
  location: 'Google Meet',
  email: 'contact.theatlasstudio@gmail.com',
  /** Start times in the studio's time zone (India, UTC+5:30), shown in each visitor's own. */
  slots: ['11:00', '11:45', '12:30', '14:30', '15:15', '16:00', '16:45', '17:30'],
  studioOffsetMinutes: 330,
  /** How far ahead requests can be made, in days. */
  horizon: 60,
  form: {
    name: 'Your name',
    email: 'Email address',
    notes: 'Anything we should know?',
    back: 'Back',
    send: 'Request this time',
    sending: 'Booking your time…',
  },
  /** Booked: the meeting is on the studio's calendar and the invitation is on its way. */
  booked: {
    title: 'You’re booked',
    body: 'It’s on our calendar. A Google Meet invitation is on its way to',
    join: 'Join link',
    ics: 'Add to my calendar',
    again: 'Book another time',
  },
  /** Google not connected (or unreachable): the request opens in the visitor's email app instead. */
  sent: {
    title: 'Your request is ready to send',
    body: 'Your email app has opened with the time you picked. Send it, and we’ll confirm with a meeting link.',
    again: 'Pick another time',
  },
  errors: {
    taken: 'Someone has just booked that time. Please pick another.',
    invalid: 'Please check your name and email address.',
    limited: 'Too many requests in a row. Please try again in a few minutes.',
  },
  taken: 'Booked',
  /** Under the booker: the first once bookings reach the calendar, the second while they go by email. */
  note: { calendar: 'Bookings go straight to the studio’s calendar.', inbox: 'Requests go straight to the studio’s inbox.' },
} as const;
