import { domainOf, phoneDisplay, phoneKey } from './input.mjs';

/**
 * The searches a research run makes, written by rules rather than by the AI
 * so every run looks in the same places: the name with its place, each
 * phone number and email on its own (the surest way to find what else
 * carries them, like a listing or a poster), the person in a professional
 * capacity, reviews and social pages, news (a sale, an expansion, hiring),
 * public registrations, and a few places specific to the industry. A quick
 * run makes about 12 searches; a thorough one about 22.
 */

const INDUSTRY_SEARCHES = {
  hospital: (b, c) => [`"${b}" ${c} Swasthya Sathi OR Ayushman Bharat empanelled`, `"${b}" ${c} NABH OR insurance network hospital`, `"${b}" ${c} doctors OPD timings`],
  doctor: (b, c) => [`"${b}" ${c} practo OR justdial`, `"${b}" ${c} doctor timings appointment`],
  restaurant: (b, c) => [`"${b}" ${c} zomato OR swiggy`, `"${b}" ${c} menu`],
  hotel: (b, c) => [`"${b}" ${c} booking.com OR makemytrip OR tripadvisor`, `"${b}" ${c} rooms tariff`],
  school: (b, c) => [`"${b}" ${c} CBSE OR ICSE OR affiliation`, `"${b}" ${c} admission fees`],
  retail: (b, c) => [`"${b}" ${c} justdial OR indiamart`, `"${b}" ${c} products`],
  realestate: (b, c) => [`"${b}" ${c} RERA registration`, `"${b}" ${c} project flats`],
  manufacturer: (b, c) => [`"${b}" ${c} indiamart OR tradeindia`, `"${b}" ${c} GST manufacturer`],
  salon: (b, c) => [`"${b}" ${c} justdial OR instagram`, `"${b}" ${c} price list`],
  professional: (b, c) => [`"${b}" ${c} firm partners`, `"${b}" ${c} justdial OR linkedin`],
  ngo: (b, c) => [`"${b}" ${c} trust registration 12A 80G`, `"${b}" ${c} donation`],
  other: () => [],
};

/** The run's searches, most telling first. Each has a `why` the progress page shows. */
export function searchPlan(input) {
  const b = input.business;
  const c = input.city || input.pincode || '';
  const where = [input.city, input.pincode].filter(Boolean).join(' ');
  const plan = [];
  const add = (q, why) => {
    const query = q.replace(/\s+/g, ' ').trim();
    if (query && !plan.some((item) => item.q.toLowerCase() === query.toLowerCase())) plan.push({ q: query, why });
  };

  add(`"${b}" ${where}`, 'the business by name and place');
  for (const phone of input.phones.slice(0, 3)) {
    const key = phoneKey(phone);
    add(`"${phoneDisplay(key)}"`, `pages carrying ${phoneDisplay(key)}`);
    if (key.length === 10) add(`"${key}"`, `pages carrying ${key} written without a space`);
  }
  for (const email of input.emails.slice(0, 2)) add(`"${email}"`, `pages carrying ${email}`);
  const domain = domainOf(input.website);
  if (domain) add(`"${domain}"`, `pages mentioning ${domain}`);
  if (input.person) add(`"${input.person}" "${b}"`, 'the person with the business');
  add(`"${b}" ${c} reviews`, 'reviews');
  add(`"${b}" ${c} facebook OR instagram`, 'social pages');
  add(`"${b}" ${c} news`, 'news');
  add(`"${b}" ${c} for sale OR takeover OR lease`, 'a sale or lease');
  add(`"${b}" ${c} hiring OR vacancy OR jobs`, 'hiring');
  for (const q of (INDUSTRY_SEARCHES[input.industry] ?? INDUSTRY_SEARCHES.other)(b, c).slice(0, input.depth === 'thorough' ? 3 : 1)) add(q, 'places specific to the industry');

  if (input.depth === 'thorough') {
    add(`"${b}" udyam OR GSTIN OR CIN`, 'public registrations');
    if (input.person) {
      add(`"${input.person}" director company ${input.city}`, 'the person’s other companies (public registers)');
      add(`"${input.person}" ${input.role || ''} ${input.city} linkedin`, 'the person’s professional profile');
    }
    add(`"${b}" justdial OR sulekha OR indiamart`, 'business directories');
    add(`"${b}" ${c} complaint OR problem`, 'complaints');
    add(`"${b}" ${c} award OR inaugurated OR opened`, 'milestones');
    if (input.address) add(`"${b}" "${input.address.split(',')[0]}"`, 'the address');
    for (const link of input.links.slice(0, 2)) add(`"${domainOf(link)}" "${b}"`, 'the links you added');
  }
  return plan.slice(0, input.depth === 'thorough' ? 24 : 13);
}
