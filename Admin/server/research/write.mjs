import { SECTIONS, SECTION_KEYS } from './facts.mjs';

/**
 * Writing the two documents from the facts you approved, in the shape of
 * the studio's reference PDFs: a two-page internal summary (page 1 the lead,
 * page 2 the pitch) and a one-page online health check that is safe to send
 * to the business. Gemini writes; it only ever sees the approved facts, the
 * one-pager only the facts marked shareable, and prices only come from the
 * studio's own offers in Settings. Lengths are budgeted so each fits its pages.
 */

export const DEFAULT_OFFERS = [
  {
    code: 'A',
    name: 'Get found again',
    duration: '7–10 days',
    price: '₹25,000–40,000',
    text: 'Their domain and an info@ email in the business’s own name; a bilingual, mobile-first website with services, timings and one-tap call and WhatsApp buttons; the Google profile completed and every review answered; social pages refreshed; one phone number everywhere.',
    lead: true,
  },
  {
    code: 'B',
    name: 'Brand refresh',
    duration: '3–4 weeks',
    price: '₹40,000–80,000',
    text: 'One logo, colours and fonts in English and the local language; cards, letterhead, bills and staff IDs; signs; social media templates.',
    lead: false,
  },
  {
    code: 'C',
    name: 'Monthly care',
    duration: 'monthly',
    price: '₹8,000–15,000 a month',
    text: '12 posts a month, review replies, Google posts and website updates.',
    lead: false,
  },
];

const str = (description) => ({ type: 'string', description });
const factIds = { type: 'array', items: { type: 'string' }, description: 'Ids of the facts this rests on, e.g. ["F3"].' };

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    title: str('“<Business>: the lead and the pitch”, or a better line of at most 60 characters.'),
    keyFact: { type: 'object', properties: { heading: str('The one fact that shapes the approach, at most 60 characters.'), text: str('Two sentences, at most 230 characters, with the evidence.'), factIds }, required: ['heading', 'text', 'factIds'] },
    bottomLine: { type: 'object', properties: { heading: str('The recommendation in at most 45 characters, e.g. “Approach them, but start small”.'), text: str('Two sentences, at most 230 characters.') }, required: ['heading', 'text'] },
    tiles: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', properties: { value: str('A number or short value, at most 12 characters, e.g. “60 beds”, “3.9★”.'), label: str('What it is, at most 28 characters.') }, required: ['value', 'label'] } },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: SECTION_KEYS },
          title: str('The section heading, at most 34 characters.'),
          bullets: {
            type: 'array',
            minItems: 1,
            maxItems: 7,
            items: { type: 'object', properties: { lead: str('A bold lead-in of 1–4 words ending with a colon, or empty.'), text: str('At most 200 characters.'), mark: { type: 'string', enum: ['dot', 'cross', 'tick'], description: 'cross for a problem, tick for something good, dot otherwise.' }, factIds }, required: ['lead', 'text', 'mark', 'factIds'] },
          },
        },
        required: ['key', 'title', 'bullets'],
      },
    },
    limits: str('What this research could not check or did not open, at most 330 characters.'),
    verdict: {
      type: 'object',
      properties: {
        heading: str('Should the studio approach them? At most 40 characters, e.g. “Yes, with a small, fast offer”.'),
        text: str('At most 170 characters.'),
        need: { type: 'string', enum: ['high', 'medium', 'low'] },
        access: { type: 'string', enum: ['direct', 'through staff', 'unclear'] },
        budget: { type: 'string', enum: ['likely', 'uncertain', 'tight'] },
        timing: { type: 'string', enum: ['now', 'soon', 'later'] },
      },
      required: ['heading', 'text', 'need', 'access', 'budget', 'timing'],
    },
    pitchSentence: str('The pitch in one or two sentences the studio can say aloud, at most 260 characters.'),
    fixes: { type: 'array', minItems: 1, maxItems: 9, items: { type: 'object', properties: { today: str('What’s broken today, at most 24 characters.'), fix: str('The fix, at most 44 characters.'), offer: str('The offer code(s) that include it, e.g. “A” or “A, B”.') }, required: ['today', 'fix', 'offer'] } },
    steps: { type: 'array', minItems: 4, maxItems: 5, items: { type: 'object', properties: { title: str('At most 34 characters, e.g. “First contact, Day 0”.'), text: str('At most 230 characters.') }, required: ['title', 'text'] } },
    objections: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', properties: { says: str('What they might say, at most 60 characters.'), reply: str('The reply, at most 170 characters.') }, required: ['says', 'reply'] } },
    offers: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', properties: { code: str('The offer’s code from the studio’s list.'), text: str('What this offer would do for this business, at most 260 characters.'), note: str('When to offer it, at most 60 characters, or empty.') }, required: ['code', 'text', 'note'] } },
    say: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'object', properties: { lead: str('“First WhatsApp:” or “Call opener:”.'), text: str('At most 330 characters.') }, required: ['lead', 'text'] } },
    donts: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', properties: { text: str('At most 160 characters, starting with a bold-able phrase.'), ok: { type: 'boolean', description: 'true for a “do”, false for a “don’t”.' } }, required: ['text', 'ok'] } },
  },
  required: ['title', 'keyFact', 'bottomLine', 'tiles', 'sections', 'limits', 'verdict', 'pitchSentence', 'fixes', 'steps', 'objections', 'offers', 'say', 'donts'],
};

export const ONEPAGER_SCHEMA = {
  type: 'object',
  properties: {
    audience: str('Who looks the business up, in one plural word: patients, customers, guests, parents, families, clients.'),
    intro: str('Two sentences, at most 230 characters, ending by saying these are what people find today and how each can be fixed.'),
    issues: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', properties: { title: str('The problem as a short headline, at most 40 characters.'), text: str('What people see, at most 150 characters, with the specific facts.'), fix: str('The fix, at most 110 characters.') }, required: ['title', 'text', 'fix'] } },
    today: { type: 'array', minItems: 3, maxItems: 5, items: str('A short phrase, at most 32 characters.') },
    after: { type: 'array', minItems: 3, maxItems: 5, items: str('A short phrase, at most 48 characters, matching the “today” list in order.') },
    nextStep: str('An inviting next step, at most 170 characters, e.g. a 15-minute walkthrough of a homepage design.'),
  },
  required: ['audience', 'intro', 'issues', 'today', 'after', 'nextStep'],
};

const factLine = (fact) => `${fact.id} [${fact.section}${fact.confidence === 'confirmed' ? '' : `, ${fact.confidence}`}] ${fact.label}: ${fact.text}`;

export function writerSystem(studio) {
  return `You write sales documents for ${studio}, a branding and website studio in India that builds websites and brands for local businesses. Plain, warm, direct English; short sentences; no jargon; no exclamation marks.

Rules you never break:
1. Use only the facts listed (by their ids). Never invent numbers, names, dates, prices, results or quotes. If something isn't known, say it isn't known or leave it out.
2. Prices and offer names come only from the studio's offers list. Lead with the offer marked "lead".
3. Never promise rankings, customer or patient numbers, sales or a sale price.
4. Call reviews “unanswered”, never “bad”. Don't judge the owner.
5. If a fact is sensitive (a sale, money trouble, a dispute, the person's other companies), the internal document says how to handle it, usually: don't open with it, let them raise it.
6. Probable facts are written as probable (“probably”, “seems”), never as certain.`;
}

/** The request for the internal two-page summary. */
export function summaryPrompt({ input, facts, offers, checksNote, date }) {
  return `Write the internal two-page summary (page 1 the lead, page 2 the pitch) for this business. Today is ${date}.

Business: ${input.business}${input.city ? `, ${input.city}` : ''}${input.person ? `. Person: ${input.person}${input.role ? `, ${input.role}` : ''}` : ''}.
Industry: ${input.industry}.

Facts (approved by the studio):
${facts.map(factLine).join('\n')}

${checksNote ? `Not checked or not found: ${checksNote}\n\n` : ''}The studio's offers:
${offers.map((offer) => `${offer.code} · ${offer.name} · ${offer.duration} · ${offer.price}${offer.lead ? ' · LEAD' : ''}: ${offer.text}`).join('\n')}

Page 1 sections use these keys, in this order where there are facts for them: ${SECTION_KEYS.map((key) => `${key} (${SECTIONS[key]})`).join(', ')}. In "online", mark each problem with a cross. Keep every length budget: the document must fit exactly two A4 pages.`;
}

/** The request for the one-page health check sent to the business: only shareable facts. */
export function onePagerPrompt({ input, facts, offers, date }) {
  const lead = offers.find((offer) => offer.lead) ?? offers[0];
  return `Write the one-page “online health check” the studio sends to ${input.business}. It is read by the owner, so it is polite and specific, mentions nothing internal, and shows what their ${input.industry === 'hospital' || input.industry === 'doctor' ? 'patients' : 'customers'} see when they look the business up online, with a fix for each problem. Today is ${date}.

Facts you may use (all public):
${facts.map(factLine).join('\n')}

The studio's lead offer: ${lead ? `${lead.name}, ${lead.duration}: ${lead.text}` : 'a short website and listings package'}.

List only real problems the facts show, biggest first, at most six; fewer is fine, never pad. The “today” and “after” lists show what changes with the lead offer${lead?.duration ? ` (${lead.duration})` : ''}. Keep every length budget: it must fit one A4 page.`;
}

/** Ids that exist, so a document never points at a fact that isn't there. */
export function cleanSummary(doc, facts) {
  const known = new Set(facts.map((fact) => fact.id));
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => known.has(id)) : []);
  return {
    ...doc,
    keyFact: { ...doc.keyFact, factIds: ids(doc.keyFact?.factIds) },
    sections: (doc.sections ?? []).map((section) => ({ ...section, title: section.title || SECTIONS[section.key] || '', bullets: (section.bullets ?? []).map((bullet) => ({ ...bullet, factIds: ids(bullet.factIds) })) })),
  };
}

/** The offers as the documents show them: the studio's own names and prices, Gemini's tailored description. */
export function mergeOffers(written, offers) {
  const byCode = new Map(offers.map((offer) => [offer.code, offer]));
  const out = [];
  for (const item of written ?? []) {
    const offer = byCode.get(String(item.code).trim());
    if (offer && !out.some((known) => known.code === offer.code)) out.push({ ...offer, text: item.text || offer.text, note: item.note || '' });
  }
  for (const offer of offers) if (!out.some((known) => known.code === offer.code) && offer.lead) out.unshift({ ...offer, note: '' });
  return out;
}
