/**
 * Single source of truth for every string and image on the page.
 *
 * Atlas Studios is the portfolio of Gulafsan Shaheen. Copy is drawn from her
 * Canva portfolio and her AI Studio portfolio. Project imagery comes from her
 * published decks and prototypes; the full-bleed plates in public/images are
 * composed from that same work.
 */

const work = {
  stockedgeResearch: 'https://pitch.com/public/9c92317f-4985-4a08-a5be-65e9e0d5912a',
  stockedgeDesign: 'https://pitch.com/public/ef58a11b-1859-44a2-99f2-4549149f80bb',
  cti: 'https://www.figma.com/proto/ZEl8VemUWm843WoPOwu6EC/CTI-REVAMPED-(Copy)?node-id=2007-27012&t=0F20GqNIeEnUHqAF-1&scaling=scale-down-width&content-scaling=fixed&page-id=2005%3A8578',
  youngMinds:
    'https://www.figma.com/proto/7eNGaoN0AaL35P8OrnffKL/Ux%2FUi-Case-study?node-id=1-118&scaling=scale-down-width&content-scaling=fixed&t=62e5rZhElc6J7VxF-1',
  cosmetic:
    'https://www.figma.com/proto/PPPBZN0jaLu2rdnZSGaWmG/adinewebber.com?type=design&node-id=502-455&t=muEACLRKVXNeLGRZ-1&scaling=scale-down-width&page-id=3%3A12&mode=design',
  jnvkaa:
    'https://www.figma.com/proto/tOZVcApGegIt0gKDQyjaRL/JNVKAA?type=design&node-id=3-661&t=ADEqNpw5RkGOlPr1-1&scaling=scale-down&page-id=0%3A1&starting-point-node-id=3%3A661&mode=design',
  costory: 'https://docs.google.com/presentation/d/1vdPq-9ynStE31SmSWjrk--lCe8YXLx4kpwhRVvnYnfs/edit?usp=sharing',
  xrink:
    'https://www.figma.com/proto/lBEndNxT9uM32oZb0JYhuU/XRINK?type=design&node-id=66-5&t=Xv800S9yKSgxmPQ4-1&scaling=scale-down&page-id=66%3A2&mode=design',
} as const;

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

export const nav = [
  { label: 'Home', index: '01', href: '#home' },
  { label: 'About', index: '02', href: '#about' },
  { label: 'Work', index: '03', href: '#work' },
  { label: 'Research', index: '04', href: '#blog' },
] as const;

export const images = {
  hero: '/images/aurora.jpg',
  breakWork: '/images/work-collage.jpg',
  breakMarks: '/images/identity-wall.jpg',
  breakClose: '/images/aurora-mirror.jpg',
  footer: '/images/work-collage.jpg',
  expertise: '/images/expertise.jpg',
} as const;

export const breaks = {
  work: 'Project screens from Stockedge, CTI, JNVKAA, Costory and The Young Minds',
  marks: 'Twelve identity marks designed by Gulafsan Shaheen',
  close: 'Aurora over a mountain ridge at night',
} as const;

export const hero = {
  eyebrow: site.year,
  title: site.wordmark,
  intro: ['Hi, I am Gulafsan® — an', 'economics-trained designer building', 'brands, UX and systems people remember.'],
  alt: 'Aurora breaking over a mountain ridge at night',
} as const;

export const intro = {
  label: 'Hey, Just An Intro',
  heading:
    'An economics-trained designer, passionate about building brands that leave an indelible mark on hearts and minds. From field research to identity, packaging and digital experiences.®',
  cta: { label: 'Get in touch', href: '#contact' },
  columns: [
    {
      title: 'Research Before Form',
      body: 'My background in economics lets me read the system before I shape the surface. Every identity begins as a question, a survey or a page of field notes.',
    },
    {
      title: 'Collaborate with Me',
      body: 'I’m eager to bring my creativity and passion to a new team. Whether it’s an identity, a package or a product, let’s tell visual stories together.',
    },
  ],
  gallery: [
    { alt: 'Aksharam Consultants logo', src: '/images/plates/aksharam.jpg' },
    { alt: 'mistiWORK logo', src: '/images/plates/mistiwork.jpg' },
    { alt: 'Wat’a’melon logo', src: '/images/plates/watamelon.jpg' },
  ],
} as const;

export const wordmarks = [
  'StockEdge',
  'Young Minds',
  'Shahidoon',
  'Workers Bee',
  'FreightEasy',
  'Kidcity',
  'Muller',
  'Dzital',
] as const;

export const approach = {
  label: 'Approach Style',
  code: '(AS® — 02)',
  cards: [
    {
      index: '01',
      title: 'Research & Decode',
      chip: 'FIRST',
      body: 'Listening before designing — field notes, user conversations and quiet observation. Patterns become evidence, translated into the structured language of systems.',
      progress: 1,
    },
    {
      index: '02',
      title: 'Position & Narrate',
      chip: null,
      body: 'Where the brand stands, and what it refuses to be. Story becomes the bridge between research and emotion — every brand is a sentence the world overhears.',
      progress: 2,
    },
    {
      index: '03',
      title: 'Design & Scale',
      chip: null,
      body: 'Form follows feeling: typography, color and rhythm encode meaning. Then the identity becomes a modular system that scales across packaging, web and space.',
      progress: 3,
    },
  ],
  cta: { label: 'Contact now', href: '#contact' },
  meters: [
    { label: 'Research', value: 25 },
    { label: 'Story', value: 60 },
    { label: 'System', value: 100 },
  ],
} as const;

export const portfolio = {
  label: 'Featured Works',
  code: '(AS® — 03)',
  badge: 'Portfolio',
  heading: 'Featured Portfolio®',
  body: 'Internships, innovations and ideations — product interfaces, research studies and brand identities, each built on an understanding of people first.',
  cta: { label: 'View resume', href: site.resume },
  partnersNote: 'Also worked with these teams and brands:',
  projects: [
    {
      title: 'Stockedge — UX Research',
      year: 'Internship · 2022',
      tags: ['Research', 'Usability'],
      progress: 1,
      src: '/images/work/stockedge-research.jpg',
      alt: 'Stockedge usability testing report',
      href: work.stockedgeResearch,
    },
    {
      title: 'Stockedge — UI Iteration',
      year: 'Internship · 2022',
      tags: ['UI/UX', 'Ideation'],
      progress: 1,
      src: '/images/work/stockedge-design.jpg',
      alt: 'Stockedge UI iteration deck',
      href: work.stockedgeDesign,
    },
    {
      title: 'CTI Website',
      year: '2024',
      tags: ['UI/UX', 'Development'],
      progress: 2,
      src: '/images/work/cti.jpg',
      alt: 'CTI website — Delivery Ki Soch? CTI Ka Approach!',
      href: work.cti,
    },
    {
      title: 'The Young Minds',
      year: 'Internship · 2022',
      tags: ['Research', 'Sustainable'],
      progress: 2,
      src: '/images/work/young-minds.jpg',
      alt: 'The Young Minds UX/UI case study',
      href: work.youngMinds,
    },
    {
      title: 'JNVKAA',
      year: 'Personal project',
      tags: ['UX/UI', 'Social'],
      progress: 2,
      src: '/images/work/jnvkaa.jpg',
      alt: 'JNVKAA social network app screens',
      href: work.jnvkaa,
    },
    {
      title: 'Costory',
      year: 'Personal project',
      tags: ['UX/UI', 'Fintech'],
      progress: 3,
      src: '/images/work/costory.jpg',
      alt: 'Costory financial tool app screens',
      href: work.costory,
    },
    {
      title: 'Cosmetic Website',
      year: 'Personal project',
      tags: ['Web', 'Ideation'],
      progress: 3,
      src: '/images/work/cosmetic-top.jpg',
      alt: 'Cosmetic website landing page',
      href: work.cosmetic,
    },
    {
      title: 'Xrink',
      year: 'Identity prototype',
      tags: ['Logo', 'Brand'],
      progress: 3,
      src: '/images/plates/xrink.jpg',
      alt: 'Xrink logo',
      href: work.xrink,
    },
  ],
} as const;

export const stats = {
  label: 'Stats & Facts',
  heading:
    'Economics taught me to read systems; fieldwork taught me to read people. Every number here is a study, a household or a paper behind the work.®',
  items: [
    { value: 12, suffix: '+', title: 'Field Studies', body: 'Research behind every brand decision.' },
    { value: 400, suffix: '+', title: 'Households Surveyed', body: 'Across rural and semi-urban India.' },
    { value: 7, suffix: '', title: 'Published Works', body: 'Including a best-paper award.' },
  ],
} as const;

export const services = {
  label: 'Core Services',
  code: '(AS® — 05)',
  heading: ['Core', 'Services®'],
  body: 'From research to identity, I bring your brand to life with precision, empathy and a system behind every choice.',
  bullets: ['Research-Led, Never Decorative', 'Systems That Scale'],
  cta: { label: 'View about', href: '#about' },
  items: [
    {
      title: 'Brand Identity & Logos',
      kicker: 'Branding',
      progress: 1,
      src: '/images/plates/stay-proud.jpg',
      alt: 'Stay Proud logo',
    },
    {
      title: 'UX Research',
      kicker: 'Research',
      progress: 2,
      src: '/images/work/stockedge-research.jpg',
      alt: 'StockEdge usability testing report',
    },
    {
      title: 'UI/UX Design',
      kicker: 'Product',
      progress: 3,
      src: '/images/work/cti.jpg',
      alt: 'CTI website design',
    },
    {
      title: 'Web Design',
      kicker: 'Digital',
      progress: 3,
      src: '/images/work/cosmetic-top.jpg',
      alt: 'Cosmetic website design',
    },
  ],
} as const;

export const benefits = {
  label: 'Benefits of Hiring Me',
  code: '(AS® — 06)',
  speed: {
    title: 'It takes one good question to start a brand.',
    body: 'Every identity begins with research',
    src: '/images/logo-collage.jpg',
    alt: 'Logos designed by Gulafsan Shaheen',
  },
  platform: {
    eyebrow: 'From research to rollout in one mind',
    title: 'All in one designer',
    src: '/images/portrait.png',
    alt: 'Portrait of Gulafsan Shaheen',
  },
  support: {
    eyebrow: 'One method, every project',
    title: '7 Movements',
    body: 'Observe, decode, position, narrate, design, systemize and scale — from field notes to a living system.',
    bg: '/images/aurora-soft.jpg',
    src: '/images/avatar.png',
    alt: 'Illustrated self-portrait of Gulafsan Shaheen',
  },
} as const;

export const testimonials = {
  label: 'Recognition',
  code: '(AS® — 07)',
  badge: 'Awards & Milestones',
  heading: 'Quiet Wins, Loud Conviction.',
  body: 'Papers, competitions and brand selections — the milestones behind the work, from national research conferences to inter-college design stages.',
  cta: { label: 'View resume', href: site.resume },
  items: [
    {
      quote: 'Recognised as Best Paper Presenter at a national research conference on socio-economic policy.',
      name: 'Best Paper',
      role: '2023',
      company: 'National research conference',
    },
    {
      quote: 'Fieldwork on food insecurity — household sampling and policy-gap analysis — published in academic journals.',
      name: 'Published Research',
      role: '2023',
      company: 'Academic journals',
    },
    {
      quote: 'Won Confluence XVI, an inter-college competition in design and strategic systems thinking.',
      name: 'Confluence XVI',
      role: '2022',
      company: 'Winner',
    },
    {
      quote: 'Design systems for Spring Chu, Dorikala and FreightEasy selected as featured brand work.',
      name: 'Brand Selection',
      role: '2024',
      company: 'Spring Chu · Dorikala · FreightEasy',
    },
    {
      quote: 'Behavioral-finance studies and dashboard interface models at StockEdge that informed real UX product decisions.',
      name: 'StockEdge',
      role: '2023',
      company: 'UX research',
    },
  ],
} as const;

export const shots = {
  label: 'Logofolio',
  code: '(AS® — 08)',
  badge: 'Identity Design',
  heading: 'Every Mark Considered.',
  body: 'Identity marks for small brands, studios and causes — each drawn to be recognised at a glance and remembered long after.',
  cta: { label: 'Commission a mark', href: '#contact' },
  gallery: [
    { src: '/images/logos/aksharam.png', alt: 'Aksharam Consultants logo' },
    { src: '/images/logos/workers-bees.png', alt: 'WorkerBees logo' },
    { src: '/images/logos/mistiwork.png', alt: 'mistiWORK logo' },
    { src: '/images/logos/stay-proud.png', alt: 'Stay Proud logo' },
    { src: '/images/logos/socialize-here.png', alt: 'Socialize Here logo' },
    { src: '/images/logos/watamelon.png', alt: 'Wat’a’melon logo' },
    { src: '/images/logos/bachat-karta.png', alt: 'Bachat Karta logo' },
    { src: '/images/logos/rrs.png', alt: 'Gallaries of RRS logo' },
    { src: '/images/logos/jazbaat-humare.png', alt: 'Jazbaat Humare logo' },
    { src: '/images/logos/ta-monogram.png', alt: 'Monogram study' },
    { src: '/images/logos/xrink.png', alt: 'Xrink logo' },
  ],
} as const;

export const expertise = {
  label: 'Designer & Researcher',
  code: '(AS® — 09)',
  badge: 'Economics × Design',
  heading: ['Expertise in', 'Brand Systems.'],
  subheading: 'Research Made Visible®',
  body: 'Trained in econometric analysis and toughened in raw fieldwork, I turn behavior into brand strategy — then into identities, packaging and interfaces people feel.',
  cta: { label: 'View portfolio', href: '#work' },
  rating: '12+ Field Studies',
  alt: 'Stockedge, JNVKAA and CTI project covers',
} as const;

export const pricing = {
  label: 'Experience',
  badge: 'Trajectory',
  heading: 'A Working Timeline.',
  body: [
    'From economics fieldwork to brand systems — every role added',
    'a new way of seeing people, products and stories.',
  ],
  cta: { label: 'View resume', href: site.resume },
  /** The switch flips each card between the role held and the years it ran. */
  cycles: { monthly: 'Role', annual: 'Years' },
  includedLabel: 'What I did',
  plans: [
    {
      name: 'Independent Practice',
      monthly: 'Systems Designer',
      annual: '2024 — Now',
      tag: 'NOW',
      progress: 3,
      body: 'Structuring luxury brand platforms, modular packaging and native platforms across India and Asia.',
      cta: { label: 'See the work', href: '#work' },
      features: [
        'Luxury brand platforms',
        'Modular packaging systems',
        'Native digital platforms',
        'Spring Chu · Dorikala · FreightEasy',
        'Research-led strategy',
        'India & Asia',
      ],
    },
    {
      name: 'StockEdge',
      monthly: 'UX Researcher',
      annual: '2023 — 2024',
      tag: null,
      progress: 2,
      body: 'Leading behavioral-finance studies and data-dashboard interface models.',
      cta: { label: 'Open the study', href: work.stockedgeResearch },
      features: [
        'Behavioral-finance studies',
        'Usability testing report',
        'Payment-journey research',
        'UI iteration deck',
        'Data-dashboard models',
        'Cognitive-bias mapping',
      ],
    },
    {
      name: 'The Young Minds',
      monthly: 'Creative Designer',
      annual: '2022 — 2023',
      tag: null,
      progress: 1,
      body: 'Reframing online learning environments and playful editorial systems.',
      cta: { label: 'Open the case', href: work.youngMinds },
      features: [
        'UX/UI research',
        'Interface design',
        'Sustainable-design ideation',
        'Online learning environments',
        'Playful editorial systems',
        'Internship case study',
      ],
    },
  ],
} as const;

export const faq = {
  label: 'FAQ',
  items: [
    {
      index: '01',
      question: 'What do you design?',
      answer:
        'Brand identities and logos, packaging, UX research and product interfaces — for brands that want to be understood before they are designed.',
    },
    {
      index: '02',
      question: 'How does economics shape the work?',
      answer:
        'It taught me to see the invisible architecture of social and financial systems. I use that lens to find the behavior a brand has to answer to, then design for it.',
    },
    {
      index: '03',
      question: 'What does a project look like?',
      answer:
        'Seven movements: observe, decode, position, narrate, design, systemize and scale — from field notes and interviews to an identity that works across every touchpoint.',
    },
    {
      index: '04',
      question: 'Do you run user research?',
      answer:
        'Yes — from household surveys and ethnography to usability testing. At StockEdge that meant behavioral-finance studies, a usability report and UI iterations.',
    },
    {
      index: '05',
      question: 'Where have you worked?',
      answer:
        'StockEdge as a UX researcher, The Young Minds as a creative designer, Shahidoon Softech as a digital designer, and in independent practice since 2024.',
    },
    {
      index: '06',
      question: 'Which tools do you use?',
      answer: 'Figma for interfaces and prototypes; Pitch, Google Slides and Canva for research decks and brand stories.',
    },
    {
      index: '07',
      question: 'Are you open to new opportunities?',
      answer:
        'Yes. I’m eager to bring my creativity and passion to a new team, and confident I can make a meaningful contribution to it.',
    },
    {
      index: '08',
      question: 'How do I get in touch?',
      answer: 'Email gulafsan.shaheen@gmail.com, message me on LinkedIn, or find me on Instagram at @a.gulafsan.',
    },
  ],
} as const;

export const blog = {
  label: 'Research Archive',
  code: '(AS® — 12)',
  badge: 'Field Research',
  heading: 'Understanding People.',
  body: [
    'Good design starts with understanding people. Trained in econometric analysis and toughened in raw',
    'fieldwork — every brand begins as a question, a survey or a set of coded transcripts.',
  ],
  cta: { label: 'View resume', href: site.resume },
  posts: [
    {
      title: 'Mapping Food Insecurity',
      date: 'District-level econometric study',
      tag: 'Policy',
      src: '/images/plates/r-01.jpg',
      alt: 'R-01 — Mapping Food Insecurity',
      href: `mailto:${site.email}?subject=${encodeURIComponent('Research: Mapping Food Insecurity')}`,
    },
    {
      title: 'Women, Work & Empowerment',
      date: 'Fieldwork across semi-urban India',
      tag: 'Ethnography',
      src: '/images/plates/r-02.jpg',
      alt: 'R-02 — Women, Work & Empowerment',
      href: `mailto:${site.email}?subject=${encodeURIComponent('Research: Women, Work & Empowerment')}`,
    },
    {
      title: 'Behavior in Retail Investing',
      date: 'Cognitive-bias mapping for UX',
      tag: 'UX Research',
      src: '/images/plates/r-03.jpg',
      alt: 'R-03 — Behavioral Patterns in Retail Investing',
      href: `mailto:${site.email}?subject=${encodeURIComponent('Research: Behavioral Patterns in Retail Investing')}`,
    },
  ],
} as const;

export const contact = {
  label: "Let's Work Together",
  code: '(AS® — 13)',
  badge: 'Contact Now',
  heading: 'Let’s Tell Visual Stories.',
  body: 'Let’s build something people remember. Reach out — I’d love to hear about your team, your brand and the questions behind it.',
  bullets: ['Open to new roles & collaborations', 'Working across India & Asia'],
  cta: { label: 'Open LinkedIn', href: site.linkedin },
  submit: 'Submit Now',
  sent: 'Your mail app is opening…',
} as const;

export const footer = {
  heading: 'Stay connected®',
  body: 'Building brands that leave an indelible mark on hearts and minds. Let’s stay connected — reach out anytime.',
  cta: { label: 'View resume', href: site.resume },
  badge: 'Brand & UX Designer',
  links: [
    { index: '01 /', label: 'Home', href: '#home' },
    { index: '02 /', label: 'About', href: '#about' },
    { index: '03 /', label: 'Work', href: '#work' },
    { index: '04 /', label: 'Research', href: '#blog' },
    { index: '05 /', label: 'Contact', href: '#contact' },
  ],
  backToTop: '©Back to top',
} as const;
