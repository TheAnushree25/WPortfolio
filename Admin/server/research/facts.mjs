/**
 * From sources to facts. Gemini reads a batch of sources and lists facts,
 * each with the exact words it came from; code then checks that every quote
 * really is in that source, grades each fact by how surely the source is
 * about this business, keeps personal matters out, and marks what may be
 * shown to the business itself. A fact whose quote can't be found is kept
 * for the review screen but left out of the documents.
 */

export const SECTIONS = {
  contact: 'Who to contact',
  business: 'The business',
  events: 'What’s happening',
  paperwork: 'Registrations and paperwork',
  online: 'What people find online',
  person: 'The person',
  needs: 'What they most likely need',
};
export const SECTION_KEYS = Object.keys(SECTIONS);

export const FACT_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: SECTION_KEYS },
          label: { type: 'string', description: 'A short title, at most 6 words, e.g. "Beds", "Sale listing", "Facebook page".' },
          text: { type: 'string', description: 'The fact as one plain sentence of at most 40 words, with absolute dates.' },
          quote: { type: 'string', description: 'The exact words from the source that prove the fact, copied character for character, at most 300 characters.' },
          sourceId: { type: 'string', description: 'The id of the source the quote is from, e.g. "S4".' },
          identity: { type: 'string', enum: ['strong', 'name', 'unsure'], description: 'strong: the source shares a phone, email, website or address with the business; name: same name in the same place; unsure: otherwise.' },
          shareable: { type: 'boolean', description: 'true only for things the business shows the public itself (services, facilities, listings, the state of its website and pages).' },
        },
        required: ['section', 'label', 'text', 'quote', 'sourceId', 'identity', 'shareable'],
      },
    },
  },
  required: ['facts'],
};

export const EXTRACT_SYSTEM = `You are a careful researcher preparing a sales lead file for a small branding and website studio in India. You read web sources about one business and list facts about it.

Rules you never break:
1. Use only the sources given. Never add anything from your own knowledge.
2. Every fact needs a quote: the exact words from the source that prove it, copied character for character (same spelling, numbers and punctuation), at most 300 characters. If you can't quote it, leave the fact out.
3. A source may be about a different organisation with a similar name. Use it only if it shares the business's phone number, email, website or address, or clearly describes the same business in the same place. Say how sure you are in "identity".
4. Business and professional information only. Never list home addresses, family members, religion, caste, health, politics, police or court matters, personal social media posts or anyone's personal finances.
5. Write dates as absolute dates (14 July 2026, or July 2026), never "last week" or "2 years ago".
6. Prefer specific facts (numbers, names, dates, prices, ratings) over general ones. No opinions, no advice, no duplicates.
7. Section "needs" is only for signals in the sources of what the business needs (hiring, a sale, complaints about something, a dead link), each still with its quote.`;

const SOURCE_CHARS = 9_000;
const BATCH_CHARS = 48_000;

/** The part of a long page worth reading: its opening, and the passages around anything that matches the business. */
export function excerpt(textValue, needles, max = SOURCE_CHARS) {
  const text = String(textValue ?? '').replace(/\n{3,}/g, '\n\n');
  if (text.length <= max) return text;
  const lower = text.toLowerCase();
  const windows = [[0, 1_800]];
  for (const needle of needles.filter((item) => item && item.length >= 4)) {
    let from = 0;
    for (let count = 0; count < 4; count++) {
      const at = lower.indexOf(needle.toLowerCase(), from);
      if (at < 0) break;
      windows.push([Math.max(0, at - 900), Math.min(text.length, at + 1_300)]);
      from = at + needle.length;
    }
  }
  windows.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of windows) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let out = '';
  for (const [start, end] of merged) {
    const piece = text.slice(start, end);
    if (out.length + piece.length + 5 > max) {
      out += `${out ? '\n[…]\n' : ''}${piece.slice(0, Math.max(0, max - out.length - 5))}`;
      break;
    }
    out += `${out ? '\n[…]\n' : ''}${piece}`;
  }
  return out;
}

/** Sources grouped into requests of a size Gemini's free tier answers quickly. */
export function batches(sources, maxChars = BATCH_CHARS, maxCount = 8) {
  const out = [];
  let current = [];
  let size = 0;
  for (const source of sources) {
    const length = source.excerpt.length + 200;
    if (current.length && (size + length > maxChars || current.length >= maxCount)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(source.id);
    size += length;
  }
  if (current.length) out.push(current);
  return out;
}

export function extractPrompt(input, sources, now = new Date()) {
  const known = [
    `Business: ${input.business}`,
    input.city && `City or area: ${input.city}`,
    input.address && `Address: ${input.address}`,
    input.pincode && `Pincode: ${input.pincode}`,
    input.person && `Person: ${input.person}${input.role ? ` (${input.role})` : ''}`,
    input.phones.length && `Phone numbers: ${input.phones.join(', ')}`,
    input.emails.length && `Email: ${input.emails.join(', ')}`,
    input.website && `Website: ${input.website}`,
    input.notes && `Notes from the studio: ${input.notes}`,
  ].filter(Boolean);
  const blocks = sources.map((source) => `<source id="${source.id}" url="${source.url}" title="${source.title.replace(/"/g, "'")}" matches="${source.match.hits.join('; ') || 'nothing'}">\n${source.excerpt}\n</source>`);
  return `Today is ${now.toISOString().slice(0, 10)}.

What the studio knows about the business:
${known.join('\n')}

Sections: ${Object.entries(SECTIONS).map(([key, label]) => `${key} (${label})`).join(', ')}.

List the facts these sources prove about this business, following the rules. The "matches" attribute says what each source shares with the business, found by code.

${blocks.join('\n\n')}`;
}

/* ------------------------------------------------------------------ Checking quotes */

export const normalise = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** Whether a quote is really in a source: as a whole, or (when Gemini joined passages with “…”) each part in order. */
export function quoteFound(quote, sourceText) {
  const q = normalise(quote).replace(/^["']|["']$/g, '');
  const t = normalise(sourceText);
  if (q.length < 6) return false;
  if (t.includes(q)) return true;
  const parts = q.split(/\s*(?:\.\.\.|…|\[…\]|\[\.\.\.\])\s*/).filter((part) => part.length >= 8);
  if (parts.length < 2) return false;
  let from = 0;
  for (const part of parts) {
    const at = t.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

const PERSONAL = /\b(wife|husband|son of|daughter of|his son|her son|his daughter|her daughter|married|divorc\w*|religio\w*|caste|politic\w*|party worker|election|court case|high court|supreme court|court order|case no|fir no|arrest\w*|police case|police complaint|jail|lawsuit|criminal|illness|disease|diagnos\w*|pregnan\w*|home address|residence|resides at|salary|loan default|bankrupt\w*)\b/i;
const NOT_SHAREABLE = /\b(for sale|sale|takeover|selling|asking price|crore|lakh|valuation|loan|debt|investor|broker|complaint|one-review|director id|din\b|cin\b|other compan)/i;

/**
 * Checks and grades Gemini's facts. `sources` are the run's sources with
 * their excerpts and code matches. Returns the facts kept, with
 * confidence: confirmed, probable, doubtful (maybe another business) or
 * unverified (the quote isn't in the source).
 */
export function gradeFacts(raw, sources) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const out = [];
  for (const fact of raw) {
    const source = byId.get(String(fact.sourceId ?? '').trim());
    const section = SECTION_KEYS.includes(fact.section) ? fact.section : 'business';
    const textValue = String(fact.text ?? '').trim().slice(0, 400);
    if (!textValue) continue;
    const quote = String(fact.quote ?? '').trim().slice(0, 400);
    const verified = Boolean(source && quote && quoteFound(quote, source.excerpt));
    const identity = source?.match?.identity ?? 'none';
    // How sure the page is about this business is decided by code (what it shares with the details), never by Gemini's say-so.
    let confidence = 'unverified';
    if (verified) confidence = identity === 'strong' ? 'confirmed' : identity === 'name' ? 'probable' : 'doubtful';
    const personal = PERSONAL.test(`${fact.label} ${textValue}`);
    out.push({
      section,
      label: String(fact.label ?? '').trim().slice(0, 80) || SECTIONS[section],
      text: textValue,
      quote,
      sourceId: source?.id ?? '',
      url: source?.url ?? '',
      origin: 'source',
      identity,
      verified,
      confidence,
      shareable: Boolean(fact.shareable) && !NOT_SHAREABLE.test(textValue) && section !== 'person' && section !== 'events',
      include: verified && !personal && confidence !== 'doubtful',
      flag: personal ? 'personal' : !verified ? 'quote' : confidence === 'doubtful' ? 'identity' : '',
    });
  }
  return dedupe(out);
}

const RANK = { confirmed: 0, probable: 1, doubtful: 2, unverified: 3 };

/** One fact per statement: the surest copy is kept, and the other sources are noted on it. */
export function dedupe(facts) {
  const seen = new Map();
  for (const fact of facts) {
    const key = normalise(fact.text).replace(/[^a-z0-9₹ ]/g, '');
    const known = seen.get(key);
    if (!known) {
      seen.set(key, { ...fact, also: [] });
      continue;
    }
    if (RANK[fact.confidence] < RANK[known.confidence]) seen.set(key, { ...fact, also: [...known.also, known.url].filter(Boolean) });
    else if (fact.url && fact.url !== known.url) known.also.push(fact.url);
  }
  return [...seen.values()];
}
