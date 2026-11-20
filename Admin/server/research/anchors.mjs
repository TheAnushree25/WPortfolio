import { FREE_MAIL, domainOf, phoneDisplay, phoneKey } from './input.mjs';

/**
 * Proving a page is about *this* business. A name alone proves little (two
 * hospitals can share one); the same phone number, email address or website
 * does. Each source is scored by what it shares with the details typed in,
 * plus anything confirmed on the way (the business's own site, its Google
 * Maps listing), and labelled strong, name or weak.
 */

const GENERIC = new Set(['the', 'and', 'of', 'pvt', 'private', 'ltd', 'limited', 'llp', 'co', 'company', 'inc', 'india', 'enterprises', 'enterprise', 'services', 'service', 'solutions', 'group', 'hospital', 'hospitals', 'clinic', 'clinics', 'nursing', 'home', 'centre', 'center', 'restaurant', 'cafe', 'café', 'hotel', 'school', 'store', 'stores', 'shop', 'traders', 'industries', 'trust', 'foundation', 'unit', 'a']);

export const squash = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The distinctive part of a name: "Debayan" from "Debayan Hospital Pvt Ltd". */
export function coreName(name) {
  const words = squash(name).split(' ').filter(Boolean);
  const core = words.filter((word) => !GENERIC.has(word));
  return (core.length ? core : words).join(' ');
}

/** Everything the research matches pages against. `extra` adds phones, emails and domains confirmed along the way. */
export function anchorsFor(input, extra = {}) {
  const phones = new Set([...(input.phones ?? []), ...(extra.phones ?? [])].map(phoneKey).filter(Boolean));
  const emails = new Set([...(input.emails ?? []), ...(extra.emails ?? [])].map((item) => String(item).toLowerCase()).filter(Boolean));
  const domains = new Set([domainOf(input.website), ...(extra.domains ?? []).map(domainOf)].filter(Boolean));
  for (const address of emails) {
    const domain = address.split('@')[1];
    if (domain && !FREE_MAIL.has(domain)) domains.add(domain);
  }
  // “Debayan Hospital (Kashipur)”: what's in brackets helps a person, but pages rarely write it.
  const name = String(input.business ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  return {
    phones: [...phones],
    emails: [...emails],
    domains: [...domains],
    pincode: input.pincode ?? '',
    business: squash(name),
    core: coreName(name),
    person: squash(input.person),
    city: squash(input.city),
  };
}

/** Every phone-like run of digits in a text, as phoneKey values. */
export function phonesIn(textValue) {
  const found = new Set();
  for (const match of String(textValue ?? '').matchAll(/\+?\d[\d\s().-]{6,18}\d/g)) {
    const key = phoneKey(match[0]);
    if (key) found.add(key);
    // "033 2440 1234 / 98300 12345" can arrive joined; a long run is also read as its parts.
    for (const part of match[0].split(/\s{2,}|\//)) {
      const partKey = phoneKey(part);
      if (partKey) found.add(partKey);
    }
  }
  return found;
}

export const emailsIn = (textValue) => new Set([...String(textValue ?? '').matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((match) => match[0].toLowerCase()));

/**
 * How a page relates to the business: `identity` is strong (it shares a phone,
 * email or domain), name (the business's name with its city or pincode), weak
 * (the name alone) or none; `hits` says what matched, in words.
 */
export function matchSource({ url = '', title = '', text = '' }, anchors) {
  const haystack = `${title}\n${text}`;
  const flat = squash(haystack);
  const hits = [];
  let score = 0;
  const phones = phonesIn(haystack);
  for (const key of anchors.phones) {
    if (phones.has(key)) {
      hits.push(`phone ${phoneDisplay(key)}`);
      score += 6;
    }
  }
  const emails = emailsIn(haystack);
  for (const address of anchors.emails) {
    if (emails.has(address)) {
      hits.push(`email ${address}`);
      score += 6;
    }
  }
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    /* no address */
  }
  for (const domain of anchors.domains) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      hits.push(`its own website (${domain})`);
      score += 8;
    } else if (haystack.toLowerCase().includes(domain)) {
      hits.push(`mentions ${domain}`);
      score += 4;
    }
  }
  const strong = hits.length > 0;
  const hasName = Boolean(anchors.business) && (` ${flat} `.includes(` ${anchors.business} `) || (anchors.core.length >= 4 && ` ${flat} `.includes(` ${anchors.core} `)));
  if (hasName) {
    hits.push('the business’s name');
    score += 3;
  }
  const place = (anchors.pincode && haystack.includes(anchors.pincode)) || (anchors.city && ` ${flat} `.includes(` ${anchors.city} `));
  if (place) {
    hits.push(anchors.pincode && haystack.includes(anchors.pincode) ? `pincode ${anchors.pincode}` : 'the city');
    score += 1;
  }
  if (anchors.person && ` ${flat} `.includes(` ${anchors.person} `)) {
    hits.push('the person’s name');
    score += 2;
  }
  const identity = strong ? 'strong' : hasName && place ? 'name' : hasName ? 'weak' : 'none';
  return { identity, score, hits };
}
