/**
 * Single source of truth for every string and image on the page.
 *
 * Imagery currently points at the reference CDN so the build is visually
 * identical out of the box. To use your own assets, drop files into
 * `public/images/` and replace the URL — nothing else needs to change.
 */

export const site = {
  name: 'Clivelle',
  wordmark: 'Clivelle',
  brandSuffix: '*',
  year: '©2025',
  email: 'sayhi@clivelle.com',
  copyright: 'Copyright © Mandro 2025',
} as const;

export const nav = [
  { label: 'Home', index: '01', href: '#home' },
  { label: 'About', index: '02', href: '#about' },
  { label: 'Work', index: '03', href: '#work' },
  { label: 'Blog', index: '04', href: '#blog' },
] as const;

export const images = {
  logo: 'https://framerusercontent.com/images/mToTM49Spdyv2vAqZw6oAzzZ0qk.png',
  hero: 'https://framerusercontent.com/images/97l5fUQMRUy17xEIt4Qs7BnZjsg.png',
  breakManSide: 'https://framerusercontent.com/images/5VivPRjOklDZqNsQcxyPJEcXNFc.png',
  breakWomanSide: 'https://framerusercontent.com/images/4dSYhvG1qxURxYoynH7D7s4tNhA.png',
  breakWoman: 'https://framerusercontent.com/images/TTsdpz8xT1CRwKhe9SUF16GNUaQ.png',
  footer: 'https://framerusercontent.com/images/lI938j8IVRDakrPO5qLopvjOAag.png',
  expertise: 'https://framerusercontent.com/images/tFXdT1GAWfzky0TCheIFtJR4O3I.png',
} as const;

export const hero = {
  eyebrow: site.year,
  title: site.wordmark,
  intro: ['Hi, I am Clive® I’m a digital', 'designer and highly talented 3D', 'renderer with over a decade of experience in the field.'],
} as const;

export const intro = {
  label: 'Hey, Just An Intro',
  heading:
    'A digital designer based in los angeles, passionate about creating immersive visual experiences. From crafting realistic renderings to dynamic animations and interactions.®',
  cta: { label: 'Get in touch', href: '#contact' },
  columns: [
    {
      title: 'Bringing Ideas to Life',
      body: 'I specialize in transforming concepts into captivating 3D visuals. Whether it’s product renderings, or immersive environments, my portfolio is designed to tell a story.',
    },
    {
      title: 'Collaborate with Me',
      body: 'Let’s create something extraordinary together! Whether you’re looking to visualize a product, animate a concept, or build an interactive experience.',
    },
  ],
  gallery: [
    { alt: 'Fragrance Bottle', src: 'https://framerusercontent.com/images/cBeHf9yDrXWC1vk1zsjx23LkAg.jpeg' },
    { alt: 'Shoes', src: 'https://framerusercontent.com/images/k6MQlhREyen09OHgPXu2bfUHg.png' },
    { alt: 'Bag', src: 'https://framerusercontent.com/images/hm83XW45QkRTQ4F5ghwKXFl1esY.png' },
  ],
} as const;

export const wordmarks = ['Manila.', 'oslo.', 'SAVANNAH', 'Basel', 'Cactus', 'Northwind', 'Lumen', 'Atlas.'] as const;

export const approach = {
  label: 'Approach Style',
  code: '(CQ® — 02)',
  cards: [
    {
      index: '01',
      title: 'Strategy & Planning',
      chip: 'FREE',
      body: 'We start by understanding your vision and business goals. Through in-depth research and strategic planning, we define the core structure and key elements needed for your project.',
      progress: 1,
    },
    {
      index: '02',
      title: 'Design & Development',
      chip: null,
      body: 'Our team crafts a visually stunning and functional design that aligns with your brand. We focus on responsive layouts, and high-performance development to ensure a smooth experience.',
      progress: 2,
    },
    {
      index: '03',
      title: 'Launch & Growth',
      chip: null,
      body: 'Once everything is tested and refined, we launch your project with precision. Post-launch, we provide ongoing support, updates, and strategies to help you scale and maximize results.',
      progress: 3,
    },
  ],
  cta: { label: 'Contact now', href: '#contact' },
  meters: [
    { label: 'Strategy', value: 25 },
    { label: 'Design', value: 60 },
    { label: 'Launch', value: 100 },
  ],
} as const;

export const portfolio = {
  label: 'Featured Works',
  code: '(CQ® — 03)',
  badge: 'Portfolio',
  heading: 'Feartured Portfolio®',
  body: 'Explore a collection of high-quality, innovative designs crafted to elevate brands and captivate audiences. Each project reflects our commitment to creativity and excellence.',
  cta: { label: 'View portfolio', href: '#work' },
  partnersNote: 'Also work with these international partners:',
  projects: [
    {
      title: 'Spring Chu',
      year: '2025',
      tags: ['D2C', 'Water Brand'],
      progress: 1,
      src: 'https://framerusercontent.com/images/dQgRRDxuAKeP9A5yo1hKGKq638k.jpg',
      alt: 'Water bottle product render',
    },
    {
      title: 'Raven Claw',
      year: '2025',
      tags: ['Portfolio', 'E-Commerce'],
      progress: 1,
      src: 'https://framerusercontent.com/images/7xXiubxiOFeunZzFGtW1FUCucYc.png',
      alt: 'Soda Can',
    },
    {
      title: 'Willow Studio',
      year: '2024',
      tags: ['Photography', 'Studio'],
      progress: 2,
      src: 'https://framerusercontent.com/images/7FZC1fiWDceTZbwIDDn1Yjuc4fc.png',
      alt: 'Car Rear Side',
    },
    {
      title: 'Maison Law',
      year: '2024',
      tags: ['Branding', 'Logo Design'],
      progress: 3,
      src: 'https://framerusercontent.com/images/pk6wfyrbCU6DEuQQs4poiwij1Ik.png',
      alt: 'Man Running',
    },
  ],
} as const;

export const stats = {
  label: 'Stats & Facts',
  heading:
    'I take pride in creating solutions that are not only visually stunning® but also highly functional. Every number tells a story, and I’m excited to bring that same dedication.',
  items: [
    { value: 12, suffix: '+', title: 'Years Experience', body: 'In the web design industry field.' },
    { value: 250, suffix: '+', title: 'Projects Done', body: 'Around worldwide in last five years.' },
    { value: 98, suffix: '%', title: 'Satisfied Clients', body: 'With a great experience and results.' },
  ],
} as const;

export const services = {
  label: 'Premium Services',
  code: '(CQ® — 05)',
  heading: ['Pro', 'Services®'],
  body: 'From web design to branding, i bring your vision to life with precision and creativity',
  bullets: ['Convert More, Grow Faster', 'Future-Proof & Scalable'],
  cta: { label: 'View about', href: '#about' },
  items: [
    {
      title: 'Professional Videography',
      kicker: 'Photography',
      progress: 1,
      src: 'https://framerusercontent.com/images/xiCJ00Kts5CXFh4UrBZalxRvmM.png',
      alt: 'Man Wearing Glasses',
    },
    {
      title: 'Product Designing',
      kicker: 'Marketing',
      progress: 2,
      src: 'https://framerusercontent.com/images/jyHc2Ub4kVyasfauuodljepag.png',
      alt: 'Coffee Pack',
    },
    {
      title: 'Framer Development',
      kicker: 'Development',
      progress: 3,
      src: 'https://framerusercontent.com/images/Pmxg8hjojScAvMw4KyuHH2enxA8.png',
      alt: 'Cream',
    },
    {
      title: '3D Rendering',
      kicker: 'Modeling',
      progress: 3,
      src: 'https://framerusercontent.com/images/WvqaXbUGGMk60VWIfe7kLpYoI.png',
      alt: 'Bottle',
    },
  ],
} as const;

export const benefits = {
  label: 'Benefits of Hiring Me',
  code: '(CQ® — 06)',
  speed: {
    title: 'It takes 5.1 Minutes to launch your site.',
    body: 'Lightning-fast delivery without compromising quality',
    src: 'https://framerusercontent.com/images/mDl5kWwqr4JYD5LWJoNL9nrZPc.png',
    alt: 'Car Blur',
  },
  platform: {
    eyebrow: 'From 0 to 100 in one small step',
    title: 'All in one platform',
    src: 'https://framerusercontent.com/images/Eqld8V8kwXqNipqkfsMQUW7g8C4.png',
    alt: 'Man',
  },
  support: {
    eyebrow: 'Full time support',
    title: '24/6',
    body: 'I have a custom application for 24/6 support and you will get update anytime.',
    bg: 'https://framerusercontent.com/images/BdGR1ZDguacHWOBnWg1ptTdkcLI.jpg',
    src: 'https://framerusercontent.com/images/uGcQ6mHB0wiF8ZtXK6bQKyhvo8o.png',
    alt: 'Mobile',
  },
} as const;

export const testimonials = {
  label: 'Voices About Me',
  code: '(CQ® — 07)',
  badge: 'Testimonial',
  heading: 'Trusted By Experts.',
  body: 'Real stories from real clients. See how our designs have transformed international and elevated businesses, and created lasting impressions.',
  cta: { label: 'Become a partner', href: '#contact' },
  items: [
    {
      quote:
        "With clive user-friendly CRM, our sales team can now work smarter, not harder. Deal tracking, reports, traffic - it's all automated and accessible in one place and faster.",
      name: 'Eddie Brock',
      role: 'CEO',
      company: 'Royal Kingdope',
      avatar: 'https://framerusercontent.com/images/seEwpz5cPd217YXOWnnDJmEN9cc.jpg',
    },
    {
      quote:
        "I was amazed by how intuitive and user-friendly everything felt. It's clear their designers obsess over every pixel, every transition, to create experiences that delight.",
      name: 'John Fitzgerald',
      role: 'Manager',
      company: 'Microsoft Solutions',
      avatar: 'https://framerusercontent.com/images/P6Tae0pFNV2UBfyIDQHr6TDv9o.jpg',
    },
    {
      quote:
        "I hired clive to redesign my company's website. The process was smooth and easy. They listened to all my needs and delivered a site that exceeded my ideas and works.",
      name: 'Ellie sattler',
      role: 'Designer',
      company: 'Nvidia Graphics',
      avatar: 'https://framerusercontent.com/images/kIBiy2xM79Ac692vRBBeMc3YFw8.jpg',
    },
    {
      quote:
        "We've seen increase in site traffic, lead generation, and sales. I can't recommend clive enough. he truly transformed our website and design into a masterpice of class!",
      name: 'Kate Mccalilster',
      role: 'Home Advisor',
      company: 'Apple Inc.',
      avatar: 'https://framerusercontent.com/images/e093yDlfYFnLTqd4LFCwKmuQ7fY.jpg',
    },
    {
      quote:
        'Clive expert developer took my Photoshop files and turned them into pixel-perfect, responsive websites. The clean, made my designs really shine and best look.',
      name: 'Tina Rossell',
      role: 'Founder',
      company: 'Reindeer Hub',
      avatar: 'https://framerusercontent.com/images/3H1oi68O9SQYJGq1kE0qE33ld0.jpg',
    },
  ],
} as const;

export const shots = {
  label: 'Shots By Me',
  code: '(CQ® — 08)',
  badge: 'Photography',
  heading: 'Every Pixel Clicked.',
  body: 'Capturing moments, creating memories. Through my lens, i capture stunning visuals that bring your brand to life with clarity, emotion, and impact.',
  cta: { label: 'Book an appointment', href: '#contact' },
  gallery: [
    { src: 'https://framerusercontent.com/images/cBeHf9yDrXWC1vk1zsjx23LkAg.jpeg', alt: 'Fragrance Bottle' },
    { src: 'https://framerusercontent.com/images/7xXiubxiOFeunZzFGtW1FUCucYc.png', alt: 'Soda Can' },
    { src: 'https://framerusercontent.com/images/k6MQlhREyen09OHgPXu2bfUHg.png', alt: 'Shoes' },
    { src: 'https://framerusercontent.com/images/7FZC1fiWDceTZbwIDDn1Yjuc4fc.png', alt: 'Car Rear Side' },
    { src: 'https://framerusercontent.com/images/hm83XW45QkRTQ4F5ghwKXFl1esY.png', alt: 'Bag' },
    { src: 'https://framerusercontent.com/images/pk6wfyrbCU6DEuQQs4poiwij1Ik.png', alt: 'Man Running' },
  ],
} as const;

export const expertise = {
  label: 'Framer Developer',
  code: '(CQ® — 09)',
  badge: 'Website Expert',
  heading: ['Expertise in', 'Framer Templates.'],
  subheading: 'Bringing Your Ideas to Life®',
  body: "As expert in Framer, we specialize in turning your ideas into functional websites. Whether it's a custom template, i ensure every project meets your vision and exceeds expectations.",
  cta: { label: 'View portfolio', href: '#work' },
  rating: '299+ People Rated',
} as const;

export const pricing = {
  label: 'Pricing Structure',
  badge: 'Premium Plans',
  heading: 'Feasible Plans.',
  body: ['Transparent pricing tailored to your needs. Let’s discuss your', 'project and find a plan that works for you.'],
  cta: { label: 'Contact now', href: '#contact' },
  features: [
    'All templates unlocked',
    'Unlimited requests',
    'Unlimited revisions',
    'Project management',
    'Access to all services',
    'Pause or cancel anytime',
  ],
  plans: [
    {
      name: 'Starter Plan',
      monthly: '$2,999',
      annual: '$4,999',
      tag: 'MOST PICK',
      progress: 1,
      body: 'Our basic pricing plan is designed to offer extra-ordinary value and features.',
    },
    {
      name: 'Growth Plan',
      monthly: '$3,999',
      annual: '$6,999',
      tag: null,
      progress: 2,
      body: 'Our pro pricing plan is designed for a businesses with advanced features.',
    },
    {
      name: 'Premium Plan',
      monthly: '$4,999',
      annual: '$8,999',
      tag: null,
      progress: 3,
      body: 'Our plus pricing plan is designed for a corporate with premium support.',
    },
  ],
} as const;

export const faq = {
  label: 'FAQ',
  items: [
    {
      index: '01',
      question: 'What does a project look like?',
      answer:
        'Every engagement starts with a discovery call, then moves through strategy, design, build and launch. You get a shared board, weekly checkpoints and a live preview link from day one.',
    },
    {
      index: '02',
      question: 'How is the pricing structure?',
      answer:
        'Flat monthly subscriptions with no hidden fees. Pick the plan that matches your volume, pause whenever you like, and scale up or down between cycles.',
    },
    {
      index: '03',
      question: 'Are all projects fixed scope?',
      answer:
        'No. Subscription plans are intentionally open-ended — you queue requests and I work through them one at a time, so the scope flexes with your roadmap.',
    },
    {
      index: '04',
      question: 'What is the ROI?',
      answer:
        'Clients typically see a measurable lift in conversion within the first two months, driven by faster load times, clearer hierarchy and a stronger narrative.',
    },
    {
      index: '05',
      question: 'How do we measure success?',
      answer:
        'We agree on three north-star metrics before kickoff — usually conversion rate, time-to-launch and qualified inbound — and review them at every milestone.',
    },
    {
      index: '06',
      question: 'What do I need to get started?',
      answer:
        'Just a brief and any brand assets you already have. If you don’t have either, the first week of the engagement covers positioning and art direction.',
    },
    {
      index: '07',
      question: 'How easy is it to edit for beginners?',
      answer:
        'Everything ships with a documented component library and a CMS, so copy, imagery and case studies can be updated without touching a line of code.',
    },
    {
      index: '08',
      question: 'Do I need to know how to code?',
      answer:
        'Not at all. You get a fully managed handover including a walkthrough recording, and I stay on call for 30 days after launch.',
    },
  ],
} as const;

export const blog = {
  label: 'Latest Updates',
  code: '(CQ® — 12)',
  badge: 'Latest Blogs',
  heading: 'Latest Insights.',
  body: ['Explore my blog for design tips, industry insights, and creative inspiration. From', 'tutorials to thought pieces, there’s something for every curious mind.'],
  cta: { label: 'View articles', href: '#blog' },
  posts: [
    {
      title: 'Polestar New EV',
      date: 'Mar 12, 3025',
      tag: 'Launch Event',
      src: 'https://framerusercontent.com/images/qlT5uGGUhGeJr9oG9H28uoUab9s.png',
      alt: 'Woman In White Background',
    },
    {
      title: 'Audemars Piguet',
      date: 'Apr 1, 2024',
      tag: 'Classic',
      src: 'https://framerusercontent.com/images/dP6MHfBLig8cUKuvoJeRJF5Z8.png',
      alt: 'Watch Back Side',
    },
    {
      title: 'Global Nikon Meetup',
      date: 'Sep 14, 2024',
      tag: 'Photography',
      src: 'https://framerusercontent.com/images/SYOEDtfhsKnjB9LTTEmMU0ANsI.png',
      alt: 'Man Sitting',
    },
  ],
} as const;

export const contact = {
  label: "Let's Work Together",
  code: '(CQ® — 13)',
  badge: 'Contact Now',
  heading: 'Contact Me!',
  body: 'Let’s create something amazing together! Reach out I’d love to hear about your project and ideas.',
  bullets: ['24/7 Full Time Support', 'Available Worldwide'],
  cta: { label: 'Contact now', href: `mailto:${site.email}` },
  submit: 'Submit Now',
} as const;

export const footer = {
  heading: 'Stay connected®',
  body: 'Crafted with creativity and passion. Let’s stay connected reach out anytime!',
  cta: { label: 'Contact Now', href: `mailto:${site.email}` },
  badge: 'Framer Expert',
  links: [
    { index: '01 /', label: 'Home', href: '#home' },
    { index: '02 /', label: 'About', href: '#about' },
    { index: '03 /', label: 'Work', href: '#work' },
    { index: '04 /', label: 'Insights', href: '#blog' },
    { index: '05 /', label: 'Contact', href: '#contact' },
  ],
  backToTop: '©Back to top',
} as const;
