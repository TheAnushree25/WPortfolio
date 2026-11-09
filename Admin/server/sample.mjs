import crypto from 'node:crypto';
import { dayKey } from './analytics.mjs';

/**
 * Sample enquiries, meetings and visits, offered once at setup so a new
 * admin can be explored before real clients arrive. Every sample record is
 * marked `sample: true`, shown with a “Sample” badge, and removed in one go
 * from Settings → Data. Names and companies are invented.
 */

const PEOPLE = [
  ['Ananya Iyer', 'Kiran Botanicals', 'Brand identity', 'instagram', 'Under ₹50k', 'A skincare line launching in March. We need a name check, logo and packaging for three products.'],
  ['Rohan Malhotra', 'Brewcraft Co.', 'Packaging', 'referral', '₹1.5L – ₹5L', 'Craft beer labels for a range of five, plus the cans. Loved the Animal and Dishoom labels.'],
  ['Meera Nair', 'Tidewater Stays', 'Website', 'google', '₹1.5L – ₹5L', 'Boutique homestays in Kerala. The site should feel like arriving: booking can stay with our current system.'],
  ['Kabir Sethi', 'Ledgerly', 'UX & product design', 'linkedin', '₹5L+', 'Accounting app for small traders, Hindi and English. We have a prototype that tests poorly.'],
  ['Priya Raghavan', 'Saffron Table', 'Brand identity', 'website', '₹50k – ₹1.5L', 'A South Indian café opening in Bandra. Identity, menu and signage.'],
  ['Arjun Mehta', 'Northstar Logistics', 'System / platform', 'email', '₹5L+', 'Dispatch dashboard for 40 trucks: live status, driver app and invoicing.'],
  ['Sana Qureshi', 'Mehfil Events', 'Brand identity', 'instagram', '₹50k – ₹1.5L', 'Wedding planning studio wants to look premium without losing warmth.'],
  ['Dev Khanna', 'Pulse Fitness', 'Website', 'website', '₹50k – ₹1.5L', 'Three gyms, one site, class timetables and trial sign-ups.'],
  ['Isha Kulkarni', 'Little Loom', 'Packaging', 'instagram', 'Under ₹50k', 'Handwoven baby blankets, gift box and tags.'],
  ['Vikram Rao', 'Greenfield Schools', 'Strategy', 'referral', '₹1.5L – ₹5L', 'Rebrand for a group of four schools; positioning first, then identity.'],
  ['Neha Bansal', 'Tara Jewels', 'Brand identity', 'linkedin', '₹1.5L – ₹5L', 'Demi-fine jewellery brand moving online, needs an identity system and guidelines.'],
  ['Aditya Verma', 'Cartwheel', 'UX & product design', 'website', '₹1.5L – ₹5L', 'Grocery delivery app redesign, checkout drop-off is high.'],
  ['Farah Sheikh', 'Atelier Noor', 'Website', 'calendly', '₹50k – ₹1.5L', 'Bridal couture portfolio site with an appointment form.'],
  ['Karan Gill', 'Hillside Coffee', 'Packaging', 'email', '₹50k – ₹1.5L', 'Specialty coffee from Coorg, bags and a subscription box.'],
  ['Tanvi Joshi', 'Mindspace Therapy', 'Brand identity', 'google', 'Under ₹50k', 'Calm, trustworthy identity for a counselling practice.'],
  ['Rahul Desai', 'Quantum Realty', 'Website', 'website', '₹5L+', 'Project microsites for three residential launches.'],
  ['Zoya Khan', 'Bloom & Basket', 'Brand identity', 'instagram', 'Not sure', 'Flower delivery start-up, just a name so far.'],
  ['Siddharth Pillai', 'Ferry Labs', 'System / platform', 'linkedin', '₹5L+', 'Internal tool for clinical trial scheduling.'],
  ['Aisha Thomas', 'Coastline Kitchens', 'Brand identity', 'referral', '₹1.5L – ₹5L', 'Modular kitchen brand, identity and showroom graphics.'],
  ['Manav Shah', 'Spindle', 'Website', 'calendly', '₹50k – ₹1.5L', 'Textile export house needs a catalogue site.'],
  ['Ritika Sen', 'Oak & Ember', 'Packaging', 'website', '₹50k – ₹1.5L', 'Candle brand: labels, boxes and a seasonal edition.'],
  ['Yash Agarwal', 'Trailhead Outdoors', 'Strategy', 'google', 'Not sure', 'Exploring a rebrand before raising a seed round.'],
];
const STATUSES = ['won', 'lost', 'proposal', 'won', 'meeting', 'proposal', 'contacted', 'won', 'lost', 'proposal', 'meeting', 'contacted', 'new', 'won', 'contacted', 'proposal', 'new', 'meeting', 'lost', 'new', 'contacted', 'new'];
const VALUES = { 'Under ₹50k': 40_000, '₹50k – ₹1.5L': 95_000, '₹1.5L – ₹5L': 280_000, '₹5L+': 650_000, 'Not sure': 120_000 };
const SOURCE_NAMES = { google: 'website' };

/** A small seeded generator, so the sample looks the same every time. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function loadSample(db, { timeZone = 'Asia/Kolkata', now = Date.now() } = {}) {
  clearSample(db);
  const random = seeded(2026);
  const DAY = 86_400_000;
  const enquiries = PEOPLE.map(([name, company, service, source, budget, message], index) => {
    const age = Math.round((PEOPLE.length - index) * 3.1 + random() * 2);
    const created = new Date(now - age * DAY - random() * 8 * 3_600_000).toISOString();
    const status = STATUSES[index];
    const email = `${name.split(' ')[0].toLowerCase()}@${company.toLowerCase().replace(/[^a-z]+/g, '')}.example`;
    const notes = [];
    if (status !== 'new') notes.push({ id: crypto.randomUUID(), at: new Date(Date.parse(created) + DAY).toISOString(), by: 'Sample', kind: 'note', text: 'Replied with the studio deck and a few questions about timelines.' });
    if (['proposal', 'won', 'lost'].includes(status)) notes.push({ id: crypto.randomUUID(), at: new Date(Date.parse(created) + 4 * DAY).toISOString(), by: 'Sample', kind: 'note', text: 'Proposal sent: research, two directions, guidelines.' });
    if (status === 'lost') notes.push({ id: crypto.randomUUID(), at: new Date(Date.parse(created) + 9 * DAY).toISOString(), by: 'Sample', kind: 'note', text: 'Went with an in-house designer for budget reasons. Keep in touch for packaging.' });
    return {
      id: crypto.randomUUID(),
      createdAt: created,
      updatedAt: created,
      name,
      email,
      phone: index % 3 === 0 ? `+91 98${String(10_000_000 + Math.floor(random() * 89_999_999)).slice(0, 8)}` : '',
      company,
      website: '',
      service,
      budget,
      source: SOURCE_NAMES[source] ?? source,
      message,
      status,
      value: Math.round((VALUES[budget] * (0.8 + random() * 0.5)) / 1000) * 1000,
      followUpAt: ['new', 'contacted', 'proposal'].includes(status) ? new Date(now + Math.round(random() * 6 - 1) * DAY).toISOString() : null,
      tags: index % 4 === 0 ? ['priority'] : [],
      notes,
      archived: false,
      sample: true,
    };
  });

  const meetingFor = (enquiry, offsetDays, hour, status) => {
    const start = new Date(now + offsetDays * DAY);
    start.setUTCHours(hour - 5, 30, 0, 0);
    return {
      id: crypto.randomUUID(),
      title: 'Discussion Meeting',
      start: start.toISOString(),
      end: new Date(start.getTime() + 45 * 60_000).toISOString(),
      attendeeName: enquiry.name,
      attendeeEmail: enquiry.email,
      location: 'Google Meet',
      joinUrl: 'https://meet.google.com/sample-only',
      status,
      source: 'manual',
      enquiryId: enquiry.id,
      notes: '',
      sample: true,
    };
  };
  const meetings = [
    meetingFor(enquiries[17], 1, 11, 'scheduled'),
    meetingFor(enquiries[10], 2, 15, 'scheduled'),
    meetingFor(enquiries[4], 4, 12, 'scheduled'),
    meetingFor(enquiries[12], 6, 16, 'scheduled'),
    meetingFor(enquiries[5], -3, 14, 'completed'),
    meetingFor(enquiries[9], -6, 11, 'completed'),
    meetingFor(enquiries[1], -12, 16, 'completed'),
    meetingFor(enquiries[8], -15, 12, 'no-show'),
    meetingFor(enquiries[18], -20, 15, 'cancelled'),
  ];

  // Visits: weekday rhythm, a slow climb, and the site's real routes.
  const pages = ['/', '/works', '/contact', '/deck', '/work/yooj', '/work/dorikala', '/work/maple-furnishers', '/work/kidcity', '/work/shoku', '/work/fresh-feast', '/work/saaj', '/work/spring-chu', '/work/keeri', '/work/zenoxa', '/work/freighteasy'];
  const pageWeights = [30, 14, 8, 5, 6, 5, 6, 4, 4, 3, 3, 2, 2, 2, 2];
  const refs = [['Direct', 34], ['Instagram', 26], ['LinkedIn', 14], ['Google', 15], ['Behance', 5], ['dribbble.com', 3], ['WhatsApp', 3]];
  const devices = [['Phone', 58], ['Desktop', 35], ['Tablet', 7]];
  const countries = [['IN', 71], ['AE', 8], ['US', 7], ['GB', 5], ['SG', 4], ['CA', 3], ['AU', 2]];
  const share = (total, weights) => {
    const sum = weights.reduce((acc, [, weight]) => acc + weight, 0);
    const out = {};
    for (const [name, weight] of weights) {
      const count = Math.round((total * weight * (0.85 + random() * 0.3)) / sum);
      if (count > 0) out[name] = count;
    }
    return out;
  };
  const sampleDays = [];
  for (let i = 59; i >= 0; i--) {
    const date = new Date(now - i * DAY);
    const key = dayKey(date, timeZone);
    if (db.data.analytics.days[key]) continue;
    const weekday = date.getUTCDay();
    const base = 70 + (59 - i) * 1.6;
    const views = Math.round(base * (weekday === 0 || weekday === 6 ? 0.7 : 1) * (0.8 + random() * 0.45));
    db.data.analytics.days[key] = {
      views,
      visitors: Math.round(views * (0.55 + random() * 0.12)),
      paths: share(views, pages.map((page, index) => [page, pageWeights[index]])),
      refs: share(views * 0.62, refs),
      devices: share(views * 0.62, devices),
      countries: share(views * 0.62, countries),
      events: { 'Booked a meeting': Math.round(random() * 2), 'Downloaded the deck': Math.round(random() * 4) },
    };
    sampleDays.push(key);
  }

  db.data.enquiries.push(...enquiries);
  db.data.meetings.push(...meetings);
  db.data.sampleDays = sampleDays;
  db.data.sample = true;
  db.save();
  return { enquiries: enquiries.length, meetings: meetings.length, days: sampleDays.length };
}

export function clearSample(db) {
  const before = db.data.enquiries.length + db.data.meetings.length;
  db.data.enquiries = db.data.enquiries.filter((item) => !item.sample);
  db.data.meetings = db.data.meetings.filter((item) => !item.sample);
  for (const key of db.data.sampleDays ?? []) delete db.data.analytics.days[key];
  db.data.sampleDays = [];
  db.data.sample = false;
  db.save();
  return before - db.data.enquiries.length - db.data.meetings.length;
}
