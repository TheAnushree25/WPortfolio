import { badRequest } from '../http.mjs';
import { EMAIL, oneOf, text } from '../validate.mjs';

/**
 * What the Details form sends: checked, cleaned and normalised. Phone
 * numbers, email addresses, the website's domain and the pincode matter most,
 * because they are how the research proves a page is about this business and
 * not another one with a similar name.
 */

export const INDUSTRIES = [
  ['hospital', 'Hospital, clinic or nursing home'],
  ['doctor', 'Doctor, dentist or diagnostic lab'],
  ['restaurant', 'Restaurant, café or caterer'],
  ['hotel', 'Hotel, homestay or resort'],
  ['school', 'School, college or coaching'],
  ['retail', 'Shop or showroom'],
  ['realestate', 'Builder or real estate'],
  ['manufacturer', 'Factory, manufacturer or trader'],
  ['salon', 'Salon, spa or gym'],
  ['professional', 'CA, lawyer or consultant'],
  ['ngo', 'Trust, NGO or temple'],
  ['other', 'Something else'],
];
export const INDUSTRY_KEYS = INDUSTRIES.map(([key]) => key);
export const DEPTHS = ['quick', 'thorough'];

/** Free email providers: an address there says nothing about the business's own domain. */
export const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rediffmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'yandex.com']);

const split = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(/[\n,;]+/))
    .map((item) => String(item).trim())
    .filter(Boolean);

/** The last ten digits of a phone number (or the whole number when shorter, for landlines), as the research compares them. */
export function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length >= 8 ? digits : '';
}

/** A ten-digit Indian mobile as people write it (87774 80739); anything else as typed. */
export function phoneDisplay(value) {
  const key = phoneKey(value);
  return key.length === 10 && /^[6-9]/.test(key) ? `${key.slice(0, 5)} ${key.slice(5)}` : String(value).trim();
}

/** example.com from https://www.example.com/about, or '' */
export function domainOf(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

export const pincodeOf = (value) => /\b[1-9]\d{5}\b/.exec(String(value ?? ''))?.[0] ?? '';

/** The Details form, cleaned. Throws a 400 naming the field when something can't be used. */
export function researchInput(body = {}) {
  const business = text(body.business, { field: 'business', max: 160, required: true });
  const city = text(body.city, { field: 'city', max: 120 });
  const person = text(body.person, { field: 'person', max: 120 });
  const role = text(body.role, { field: 'role', max: 80 });
  const address = text(body.address, { field: 'address', max: 300 });
  const notes = text(body.notes, { field: 'notes', max: 1500, multiline: true });

  const phones = [];
  for (const item of split(body.phones).slice(0, 6)) {
    if (!phoneKey(item)) throw badRequest(`“${item}” doesn’t look like a phone number.`, { field: 'phones' });
    if (!phones.some((known) => phoneKey(known) === phoneKey(item))) phones.push(phoneDisplay(item));
  }
  const emails = [];
  for (const item of split(body.emails).slice(0, 4)) {
    const address_ = item.toLowerCase();
    if (!EMAIL.test(address_)) throw badRequest(`“${item}” isn’t an email address.`, { field: 'emails' });
    if (!emails.includes(address_)) emails.push(address_);
  }
  let website = text(body.website, { field: 'website', max: 300 });
  if (website) {
    const domain = domainOf(website);
    if (!domain || !domain.includes('.')) throw badRequest('The website should be an address like example.com.', { field: 'website' });
    website = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  }
  const links = [];
  for (const item of split(body.links).slice(0, 10)) {
    const href = /^https?:\/\//i.test(item) ? item : `https://${item}`;
    try {
      const parsed = new URL(href);
      if (!parsed.hostname.includes('.')) throw new Error();
      links.push(parsed.href);
    } catch {
      throw badRequest(`“${item}” isn’t a web address.`, { field: 'links' });
    }
  }
  if (!city && !website && !phones.length && !address) throw badRequest('Add the city or area (or a phone number or website), so the right business is found.', { field: 'city' });

  return {
    business,
    city,
    person,
    role,
    phones,
    emails,
    website,
    address,
    pincode: pincodeOf(body.pincode) || pincodeOf(address),
    links,
    industry: oneOf(body.industry, INDUSTRY_KEYS, { field: 'industry', fallback: 'other' }),
    depth: oneOf(body.depth, DEPTHS, { field: 'depth', fallback: 'quick' }),
    notes,
  };
}
