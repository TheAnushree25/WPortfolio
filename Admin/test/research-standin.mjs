import http from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * Stand-ins for the three free services the Details page uses (Gemini,
 * Tavily and SerpApi) and a tiny made-up web about a made-up clinic, so the
 * whole research pipeline can be tested, and demonstrated, without keys and
 * without spending anyone's free allowance. Nothing here touches the real
 * services.
 *
 *   standinFetch(url, init)     a fetch() for tests
 *   node test/research-standin.mjs 4339
 *     serves them over HTTP; start the admin with
 *     RESEARCH_GEMINI_BASE=http://127.0.0.1:4339/gemini/v1beta
 *     RESEARCH_TAVILY_BASE=http://127.0.0.1:4339/tavily
 *     RESEARCH_SERPAPI_BASE=http://127.0.0.1:4339/serpapi
 *     and type “Sunrise Clinic (test), Testpur. Dr. Test Person, Director, 90000 11111”.
 */

export const PAGES = {
  'https://directory.example/sunrise-clinic': {
    title: 'Sunrise Clinic, Testpur – directory listing',
    text: 'Sunrise Clinic, Station Road, Testpur 700001. Call 90000 11111 for appointments. The clinic has 20 beds and 1 operation theatre. Open 24 hours.',
  },
  'https://news.example/sunrise-expansion': {
    title: 'Sunrise Clinic to open maternity ward',
    text: 'Sunrise Clinic in Testpur will open a new maternity ward in January 2027, said its director Dr. Test Person. The clinic can be reached on 90000 11111.',
  },
  'https://jobs.example/sunrise-nurses': {
    title: 'Staff nurses wanted at Sunrise Clinic',
    text: 'Sunrise Clinic is hiring staff nurses for its new ward, posted on 2 November 2026. Contact 90000 11111 with your CV.',
  },
  'https://www.facebook.com/sunriseclinic.test': {
    title: 'Sunrise Clinic Testpur | Facebook',
    text: 'Sunrise Clinic Testpur. 1,200 followers. The page intro still says an upcoming clinic in Testpur.',
  },
  'https://other.example/sunrise-clinic-othertown': {
    title: 'Sunrise Clinic, Othertown',
    text: 'Sunrise Clinic, Othertown is a dental practice with 2 chairs. Phone 98888 22222.',
  },
};

const json = (status, body) => ({ status, type: 'application/json', body: JSON.stringify(body) });

/* ------------------------------------------------------------------ Gemini */

function sectionOf(sentence) {
  if (/hiring|will open|new maternity|upcoming/i.test(sentence)) return 'events';
  if (/\b\d{5}\s?\d{5}\b|call|contact/i.test(sentence)) return 'contact';
  if (/followers|facebook|page intro/i.test(sentence)) return 'online';
  return 'business';
}

function extractFacts(prompt) {
  const facts = [];
  for (const match of prompt.matchAll(/<source id="(S\d+)" url="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/source>/g)) {
    const [, id, , body] = match;
    const sentences = body.split(/(?<=\.)\s+|\n+/).map((item) => item.trim()).filter((item) => item.length > 12).slice(0, 3);
    for (const sentence of sentences) {
      const section = sectionOf(sentence);
      facts.push({ section, label: sentence.split(/\s+/).slice(0, 3).join(' '), text: sentence, quote: sentence, sourceId: id, identity: 'strong', shareable: section !== 'events' });
    }
  }
  const first = /<source id="(S\d+)"/.exec(prompt)?.[1] ?? 'S1';
  // One made-up fact, whose quote is in no source: the cross-check must catch it.
  facts.push({ section: 'business', label: 'Helipad', text: 'The clinic has 500 beds and a helipad.', quote: 'The clinic has 500 beds and a helipad.', sourceId: first, identity: 'strong', shareable: true });
  return facts;
}

const factLines = (prompt) => [...prompt.matchAll(/^(F\d+) \[(\w+)[^\]]*\] ([^:\n]+): (.+)$/gm)].map(([, id, section, label, text]) => ({ id, section, label, text }));
const businessOf = (prompt) => /Business: ([^,.\n]+)/.exec(prompt)?.[1]?.trim() ?? 'The business';

function summaryDoc(prompt) {
  const facts = factLines(prompt);
  const name = businessOf(prompt);
  const event = facts.find((fact) => fact.section === 'events') ?? facts[0];
  const sections = ['contact', 'business', 'events', 'online']
    .map((key) => ({ key, title: { contact: 'Who to contact', business: 'The clinic', events: 'What’s happening', online: 'What people find online today' }[key], bullets: facts.filter((fact) => fact.section === key).slice(0, 5).map((fact) => ({ lead: `${fact.label}:`, text: fact.text, mark: key === 'online' ? 'cross' : 'dot', factIds: [fact.id] })) }))
    .filter((section) => section.bullets.length);
  return {
    title: `${name}: the lead and the pitch`,
    keyFact: { heading: 'A new ward opens in January', text: event?.text ?? 'Nothing stands out.', factIds: event ? [event.id] : [] },
    bottomLine: { heading: 'Approach them, but start small', text: 'Their online presence trails the clinic. Offer the lead package, half upfront.' },
    tiles: [{ value: '20 beds', label: 'running' }, { value: '4.2★', label: 'Google, 87 reviews' }],
    sections,
    limits: 'A test run with stand-in services and a made-up clinic.',
    verdict: { heading: 'Yes, with a small offer', text: 'The new ward gives them a reason to fix how they look online.', need: 'high', access: 'direct', budget: 'uncertain', timing: 'now' },
    pitchSentence: 'Patients will look up your new ward before they visit; in ten days I’ll make what they find match the clinic.',
    fixes: [{ today: 'No website', fix: 'A mobile-first site', offer: 'A' }, { today: 'Facebook says upcoming', fix: 'New intro and cover', offer: 'A' }],
    steps: [{ title: 'Prepare', text: 'the health check and a homepage concept.' }, { title: 'First contact', text: 'WhatsApp the clinic’s number with the health check.' }, { title: 'Meeting', text: 'fifteen minutes at the clinic.' }, { title: 'Close', text: 'half upfront, half at launch.' }],
    objections: [{ says: 'Facebook is enough.', reply: 'Most patients search Google first.' }, { says: 'It’s too expensive.', reply: 'Start with the small package.' }, { says: 'Not now.', reply: 'The new ward opens in January; the site should be ready before.' }],
    offers: [{ code: 'A', text: 'A mobile-first site with the new ward, call buttons and Google profile.', note: '' }],
    say: [{ lead: 'First WhatsApp:', text: 'introduce yourself and attach the health check.' }, { lead: 'Call opener:', text: 'Could I show you a homepage design for the clinic?' }],
    donts: [{ text: 'Don’t promise patient numbers.', ok: false }, { text: 'Don’t call reviews bad.', ok: false }, { text: 'Take half upfront.', ok: true }],
  };
}

function onepagerDoc() {
  return {
    audience: 'patients',
    intro: 'Before visiting, most families look a clinic up on their phone. These are the things they find today, and how each can be fixed.',
    issues: [
      { title: 'No website', text: 'Search shows only directory listings and a Facebook page.', fix: 'a mobile-first website with call and WhatsApp buttons.' },
      { title: 'Facebook still says “upcoming”', text: 'The page intro calls the clinic upcoming.', fix: 'a new intro, cover and pinned post.' },
    ],
    today: ['No website', '“Upcoming” on Facebook'],
    after: ['A website with call buttons', 'Facebook up to date'],
    nextStep: 'a 15-minute walkthrough of a homepage design for the clinic, at a time that suits you.',
  };
}

/** The Details box read the way Gemini would: the first part names the business, the second the town. */
function readNote(prompt) {
  const note = (/"""\n([\s\S]*?)\n"""/.exec(prompt)?.[1] ?? prompt).replace(/\b(Dr|Mr|Mrs|Ms|St)\.\s/g, '$1 ');
  const parts = note.split(/[,\n]+|\.\s+|\.$/).map((part) => part.trim()).filter(Boolean);
  const words = parts.filter((part) => !/\d|@|\.example|www\./i.test(part));
  const person = parts.find((part) => /\b(Dr|Mr|Mrs|Ms)\b/.test(part)) ?? '';
  return {
    business: /^(it|they|the)\b/i.test(words[0] ?? '') ? '' : (words[0] ?? ''),
    city: words[1] && words[1] !== person && !/director|owner/i.test(words[1]) ? words[1] : '',
    person: person.replace(/^(Director|Owner)\s+/i, ''),
    role: /director/i.test(note) ? 'Director' : '',
    address: '',
    industry: /clinic|hospital/i.test(note) ? 'hospital' : 'other',
  };
}

function gemini(method, path, body) {
  if (method === 'GET' && path.endsWith('/models')) return json(200, { models: [{ name: 'models/gemini-9.9-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9.9-flash-image', supportedGenerationMethods: ['generateContent'] }] });
  if (method !== 'POST' || !/:generateContent$/.test(path)) return json(404, { error: { code: 404, message: 'not found' } });
  const parts = body.contents?.[0]?.parts ?? [];
  const prompt = parts.map((part) => part.text ?? '').join('\n');
  const props = body.generationConfig?.responseSchema?.properties ?? {};
  let answer;
  if (parts.some((part) => part.inlineData)) answer = { business: 'Sunrise Clinic (test)', person: 'Dr. Test Person', role: 'Director', phones: ['90000 11111'], emails: [], website: '', address: 'Station Road, Testpur 700001', city: 'Testpur', industry: 'hospital' };
  else if (props.ok) answer = { ok: true };
  else if (props.business && props.industry && !props.phones) answer = readNote(prompt);
  else if (props.facts) answer = { facts: extractFacts(prompt) };
  else if (props.keyFact) answer = summaryDoc(prompt);
  else if (props.issues) answer = onepagerDoc(prompt);
  else answer = {};
  return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: Math.ceil(prompt.length / 4), candidatesTokenCount: 200 } });
}

/* ------------------------------------------------------------------ Tavily and SerpApi */

function tavily(method, path) {
  if (method !== 'POST' || !path.endsWith('/search')) return json(404, { detail: 'not found' });
  return json(200, { results: Object.entries(PAGES).map(([url, page], index) => ({ url, title: page.title, content: page.text.slice(0, 160), raw_content: page.text, score: 0.9 - index / 20 })) });
}

function serp(method, path, query) {
  if (path.endsWith('/account.json')) return json(200, { total_searches_left: 248, plan_name: 'Free Plan' });
  if (query.get('engine') === 'google_maps') {
    return json(200, {
      local_results: [
        { title: 'Sunrise Clinic', data_id: '0xstandin1', place_id: 'standin-place-1', rating: 4.2, reviews: 87, address: 'Station Road, Testpur 700001', phone: '+91 90000 11111', type: 'Clinic', open_state: 'Open 24 hours' },
        { title: 'Sunrise Clinic', data_id: '0xstandin2', place_id: 'standin-place-2', rating: 4.8, reviews: 12, address: 'Market Lane, Othertown', phone: '098888 22222', type: 'Dentist' },
      ],
    });
  }
  if (query.get('engine') === 'google_maps_reviews') {
    const reviews = Array.from({ length: 8 }, (_, index) => ({
      rating: index < 3 ? 5 : index < 5 ? 2 : 4,
      date: `${index + 1} weeks ago`,
      iso_date: new Date(Date.UTC(2026, 10, 15 - index * 7)).toISOString(),
      snippet: index < 3 ? 'Good care.' : index < 5 ? 'Long wait at the counter.' : 'Clean and helpful.',
      user: { name: `Reviewer ${index + 1}`, reviews: index < 3 ? 1 : 14 },
      ...(index === 6 && { response: { iso_date: '2026-10-20T00:00:00Z', snippet: 'Thank you!' } }),
    }));
    return json(200, { place_info: { title: 'Sunrise Clinic', rating: 4.2, reviews: 87 }, reviews });
  }
  return json(400, { error: 'Unknown engine.' });
}

/* ------------------------------------------------------------------ fetch() and HTTP */

function route(method, url, body) {
  const path = url.pathname;
  if (url.hostname === 'generativelanguage.googleapis.com' || path.startsWith('/gemini/')) return gemini(method, path, body);
  if (url.hostname === 'api.tavily.com' || path.startsWith('/tavily/')) return tavily(method, path);
  if (url.hostname === 'serpapi.com' || path.startsWith('/serpapi/')) return serp(method, path, url.searchParams);
  const page = PAGES[url.href.replace(/\/$/, '')];
  if (page) return { status: 200, type: 'text/html; charset=utf-8', body: `<!doctype html><title>${page.title}</title><body><p>${page.text}</p></body>` };
  return { status: 404, type: 'text/plain', body: 'Not found' };
}

/** A fetch() that answers as the three services and the made-up web pages would. */
export async function standinFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  let body = {};
  try {
    body = init.body ? JSON.parse(init.body) : {};
  } catch {
    body = {};
  }
  const out = route(init.method ?? 'GET', url, body);
  return new Response(out.body, { status: out.status, headers: { 'content-type': out.type } });
}

/** DNS for the made-up pages: every name resolves to a public documentation address. */
export const standinLookup = async () => [{ address: '192.0.2.10', family: 4 }];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2]) || 4339;
  http
    .createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        let body = {};
        try {
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        } catch {
          body = {};
        }
        const out = route(req.method, new URL(req.url, `http://127.0.0.1:${port}`), body);
        // A real service takes a moment; the demo is easier to follow when steps don't flash past.
        setTimeout(() => {
          res.writeHead(out.status, { 'content-type': out.type });
          res.end(out.body);
        }, 700);
      });
    })
    .listen(port, '127.0.0.1', () => console.log(`Research stand-ins on http://127.0.0.1:${port} (gemini, tavily, serpapi)`));
}
