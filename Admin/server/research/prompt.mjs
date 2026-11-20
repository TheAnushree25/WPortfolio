import { INDUSTRY_KEYS, phoneDisplay, phoneKey, pincodeOf } from './input.mjs';

/**
 * The Details page's one box: everything you know about a business, typed
 * any way you like (“Debayan Hospital, Kashipur, Kolkata 700135. Director
 * Netai Kr. Deb, 94330 81123 / 87774 80739, debayanhospital@gmail.com”).
 * Code picks out what must be exact (phone numbers, email addresses, web
 * addresses, the pincode); Gemini reads the rest (the business, the person
 * and their role, the place, the kind of business). The result is the same
 * input the research has always used.
 */

const TLDS = ['com', 'in', 'co.in', 'org', 'org.in', 'net', 'net.in', 'info', 'biz', 'io', 'co', 'ai', 'app', 'dev', 'me', 'tech', 'online', 'site', 'website', 'store', 'shop', 'health', 'clinic', 'hospital', 'care', 'edu', 'ac.in', 'edu.in', 'gov.in', 'nic.in', 'res.in', 'firm.in', 'gen.in', 'ind.in', 'uk', 'co.uk', 'org.uk', 'us', 'xyz', 'live', 'life', 'studio', 'design', 'agency', 'club', 'today', 'world', 'global', 'asia', 'page', 'link', 'ngo', 'example']
  .sort((a, b) => b.length - a.length)
  .map((tld) => tld.replace(/\./g, '\\.'))
  .join('|');
const URLS = new RegExp(`\\bhttps?:\\/\\/[^\\s,;<>"'()]+|\\b(?:www\\.)?[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/[^\\s,;<>"'()]*)?`, 'gi');
const EMAILS = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
/** Pages about a business rather than its own website: these go in as links to read. */
const ELSEWHERE = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|threads\.net|youtube\.com|youtu\.be|wa\.me|whatsapp\.com|justdial\.com|practo\.com|zomato\.com|swiggy\.com|indiamart\.com|sulekha\.com|tripadvisor\.[a-z.]+|booking\.com|google\.[a-z.]+|goo\.gl|g\.page)$/i;
const PHONE_WORDS = /(ph|phone|tel|telephone|call|landline|mob|mobile|contact|whatsapp)\W{0,6}$/i;

/** Phone numbers, emails, web addresses and the pincode, read by code from what was typed. */
export function extractContacts(text) {
  let rest = String(text ?? '');
  const emails = [...new Set((rest.match(EMAILS) ?? []).map((item) => item.toLowerCase()))];
  rest = rest.replace(EMAILS, ' ');
  const urls = [];
  for (const match of rest.match(URLS) ?? []) {
    const clean = match.replace(/[.)\]]+$/, '');
    try {
      const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
      if (url.hostname.includes('.') && !urls.includes(url.href)) urls.push(url.href);
    } catch {
      /* not an address after all */
    }
  }
  rest = rest.replace(URLS, ' ');
  const pincode = pincodeOf(rest);

  const phones = [];
  for (const match of rest.matchAll(/\+?\d[\d\s().-]{6,28}\d/g)) {
    const digits = match[0].replace(/\D/g, '');
    // Two numbers written one after the other ("94330 81123 87774 80739") are read as two.
    const parts = digits.length >= 20 && digits.length % 10 === 0 ? digits.match(/\d{10}/g) : [match[0]];
    for (const part of parts) {
      const partDigits = part.replace(/\D/g, '');
      if (partDigits.length < 10) {
        // A short number counts only as a landline next to a word that says so, and never as a span of years.
        if (/^(19|20)\d\d(19|20)\d\d$/.test(partDigits) || !PHONE_WORDS.test(rest.slice(Math.max(0, match.index - 14), match.index))) continue;
      }
      const key = phoneKey(part);
      if (key && !phones.some((known) => phoneKey(known) === key)) phones.push(phoneDisplay(part));
    }
  }

  const website = urls.find((url) => !ELSEWHERE.test(new URL(url).hostname)) ?? '';
  return { phones, emails, website, links: urls.filter((url) => url !== website), pincode };
}

export const PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    business: { type: 'string', description: 'The business or organisation to look up (a hospital, shop, company…), exactly as written, without its town.' },
    city: { type: 'string', description: 'The town, city or area it is in, with the district if given, e.g. “Kashipur, Kolkata”. Empty if not given.' },
    person: { type: 'string', description: 'The person to talk to, if one is named, exactly as written.' },
    role: { type: 'string', description: 'That person’s role or title, if given.' },
    address: { type: 'string', description: 'The street address if one is given; empty when only the town is.' },
    industry: { type: 'string', enum: INDUSTRY_KEYS, description: 'The kind of business; “other” when unclear.' },
  },
  required: ['business', 'city', 'person', 'role', 'address', 'industry'],
};

export const PROMPT_SYSTEM = `You read a short note someone typed about a business they want to look up, and copy out who and where it is.
Copy names exactly as written, with the same spelling. Never guess or add anything the note doesn't say: leave a field empty when it isn't there.
The business is the organisation (a hospital, shop, company, school…), not the person. The city is the town, city or area, not the street.`;

/**
 * The note as the research's input fields: contacts by code, names and place
 * by Gemini (`ai`, a client from providers.mjs). The whole note is kept as
 * the research's notes, so nothing typed is lost.
 */
export async function readPrompt(text, ai) {
  const contacts = extractContacts(text);
  const result = await ai.generate({ system: PROMPT_SYSTEM, prompt: `The note:\n"""\n${text}\n"""`, schema: PROMPT_SCHEMA, maxTokens: 2_048, timeout: 30_000 });
  const read = result.data ?? {};
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  return {
    business: clean(read.business),
    city: clean(read.city),
    person: clean(read.person),
    role: clean(read.role),
    address: clean(read.address),
    industry: INDUSTRY_KEYS.includes(read.industry) ? read.industry : 'other',
    phones: contacts.phones,
    emails: contacts.emails,
    website: contacts.website,
    links: contacts.links,
    pincode: contacts.pincode,
    notes: String(text).trim().slice(0, 1500),
  };
}
