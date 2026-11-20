import assert from 'node:assert/strict';
import { test } from 'node:test';
import { researchInput, phoneKey, domainOf } from '../server/research/input.mjs';
import { anchorsFor, matchSource } from '../server/research/anchors.mjs';
import { gradeFacts, quoteFound, excerpt } from '../server/research/facts.mjs';
import { searchPlan } from '../server/research/queries.mjs';
import { isPublicAddress, readPage, safeFetch } from '../server/research/net.mjs';
import { rankModels, gemini } from '../server/research/providers.mjs';
import { factsFromChecks } from '../server/research/checks.mjs';
import { advance, newRun, servicesFrom } from '../server/research/pipeline.mjs';
import { researchService } from '../server/research/service.mjs';
import { onePagerHtml, summaryHtml, fileNames } from '../server/research/templates.mjs';
import { findBrowser, renderPdfs } from '../server/research/pdf.mjs';
import { sampleRun } from '../server/research/sample.mjs';
import { standinFetch, standinLookup } from './research-standin.mjs';

/**
 * The Details page's research: the form's checks, matching pages to the
 * business, the quote check that catches invented facts, the rules that
 * keep personal matters out, and a whole run against stand-ins for Gemini,
 * Tavily and SerpApi (test/research-standin.mjs). No real service is called.
 */

const input = (extra = {}) => researchInput({ business: 'Sunrise Clinic (test)', city: 'Testpur', phones: '90000 11111', industry: 'hospital', ...extra });

test('the form: phones, emails, website and pincode are cleaned; bad values name their field', () => {
  const value = researchInput({ business: ' Debayan Hospital ', city: 'Kolkata', phones: '+91 94330-81123, 87774 80739, 9433081123', emails: 'Info@Example.com', website: 'www.example.com/about', address: 'Kashipur, Kolkata 700135' });
  assert.deepEqual(value.phones, ['94330 81123', '87774 80739']);
  assert.deepEqual(value.emails, ['info@example.com']);
  assert.equal(value.website, 'https://www.example.com/about');
  assert.equal(value.pincode, '700135');
  assert.equal(domainOf(value.website), 'example.com');
  assert.equal(phoneKey('033 2440 1234'), '3324401234');
  assert.equal(phoneKey('2440 1234'), '24401234');
  assert.throws(() => researchInput({ business: 'X', city: 'Y', phones: 'call me' }), (error) => error.extra?.field === 'phones');
  assert.throws(() => researchInput({ business: 'X', city: 'Y', emails: 'nope' }), (error) => error.extra?.field === 'emails');
  assert.throws(() => researchInput({ business: 'X' }), (error) => error.extra?.field === 'city');
  assert.throws(() => researchInput({ city: 'Y' }), (error) => error.extra?.field === 'business');
});

test('pages are matched to the business by phone, email or website first, the name only after', () => {
  const anchors = anchorsFor(input({ emails: 'sunrise@clinic.example', website: 'clinic.example' }));
  assert.equal(matchSource({ url: 'https://x.example/a', text: 'Call 9000011111 now' }, anchors).identity, 'strong');
  assert.equal(matchSource({ url: 'https://x.example/b', text: 'Write to sunrise@clinic.example' }, anchors).identity, 'strong');
  assert.equal(matchSource({ url: 'https://www.clinic.example/about', text: 'About us' }, anchors).identity, 'strong');
  assert.equal(matchSource({ url: 'https://x.example/c', title: 'Sunrise Clinic Testpur', text: 'A clinic' }, anchors).identity, 'name');
  assert.equal(matchSource({ url: 'https://x.example/d', text: 'Sunrise Clinic, Othertown' }, anchors).identity, 'weak');
  assert.equal(matchSource({ url: 'https://x.example/e', text: 'Nothing to do with it' }, anchors).identity, 'none');
});

test('a quote counts only if it is really on the page', () => {
  const page = 'Sunrise Clinic has 20 beds and 1 operation theatre. It is open 24 hours, all week.';
  assert.ok(quoteFound('20 beds and 1 operation theatre', page));
  assert.ok(quoteFound('“Sunrise  Clinic has 20 beds”', page));
  assert.ok(quoteFound('Sunrise Clinic has 20 beds … open 24 hours', page));
  assert.ok(!quoteFound('Sunrise Clinic has 200 beds', page));
  assert.ok(!quoteFound('open 24 hours … Sunrise Clinic has 20 beds', page), 'joined parts must be in order');
});

test('grading: invented quotes are left out, personal matters are kept out, a sale is never for the client', () => {
  const sources = [
    { id: 'S1', url: 'https://a.example', excerpt: 'Sunrise Clinic has 20 beds. The owner’s wife runs the pharmacy. The building is for sale at ₹4 crore.', match: { identity: 'strong', hits: [] } },
    { id: 'S2', url: 'https://b.example', excerpt: 'Sunrise Clinic has a lab.', match: { identity: 'weak', hits: [] } },
  ];
  const facts = gradeFacts(
    [
      { section: 'business', label: 'Beds', text: 'It has 20 beds.', quote: 'Sunrise Clinic has 20 beds', sourceId: 'S1', identity: 'strong', shareable: true },
      { section: 'business', label: 'Helipad', text: 'It has a helipad.', quote: 'a helipad on the roof', sourceId: 'S1', identity: 'strong', shareable: true },
      { section: 'person', label: 'Family', text: 'The owner’s wife runs the pharmacy.', quote: 'The owner’s wife runs the pharmacy', sourceId: 'S1', identity: 'strong', shareable: false },
      { section: 'business', label: 'Sale', text: 'The building is for sale at ₹4 crore.', quote: 'The building is for sale at ₹4 crore', sourceId: 'S1', identity: 'strong', shareable: true },
      { section: 'business', label: 'Lab', text: 'It has a lab.', quote: 'Sunrise Clinic has a lab', sourceId: 'S2', identity: 'unsure', shareable: true },
    ],
    sources,
  );
  const by = (label) => facts.find((fact) => fact.label === label);
  assert.equal(by('Beds').confidence, 'confirmed');
  assert.equal(by('Beds').include, true);
  assert.equal(by('Helipad').confidence, 'unverified');
  assert.equal(by('Helipad').include, false);
  assert.equal(by('Family').include, false);
  assert.equal(by('Family').flag, 'personal');
  assert.equal(by('Sale').shareable, false);
  assert.equal(by('Lab').confidence, 'doubtful');
  assert.equal(by('Lab').include, false);
});

test('the search plan looks up every phone number and email on its own', () => {
  const plan = searchPlan(input({ phones: '94330 81123, 87774 80739', emails: 'a@b.example', person: 'Test Person' }));
  const queries = plan.map((item) => item.q);
  assert.ok(queries.includes('"94330 81123"') && queries.includes('"9433081123"') && queries.includes('"87774 80739"'));
  assert.ok(queries.includes('"a@b.example"'));
  assert.ok(queries.some((q) => q.includes('Swasthya Sathi')), 'a hospital gets its industry searches');
  assert.ok(plan.length <= 13);
  assert.ok(searchPlan(input({ depth: 'thorough', person: 'Test Person' })).length > plan.length);
});

test('the page reader refuses private addresses and reads what a page says about itself', async () => {
  assert.equal(isPublicAddress('8.8.8.8'), true);
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  await assert.rejects(safeFetch('http://localhost/'), (error) => error.code === 'private');
  await assert.rejects(safeFetch('http://127.0.0.1/'), (error) => error.code === 'private');
  await assert.rejects(safeFetch('http://localhost:4310/'), (error) => error.code === 'invalid', 'other ports are refused too');
  await assert.rejects(safeFetch('http://169.254.169.254/latest/meta-data'), (error) => error.code === 'private');
  await assert.rejects(safeFetch('https://inside.example/', { lookup: async () => [{ address: '10.0.0.5' }] }), (error) => error.code === 'private');
  const page = readPage('<html><head><title>Clinic &amp; Co</title><meta name="viewport" content="width=device-width"><meta name="generator" content="Wix.com Website Builder"></head><body><a href="tel:+919000011111">Call</a> <a href="https://www.facebook.com/clinic">FB</a><p>© 2021 Clinic</p></body></html>', 'https://clinic.example/');
  assert.equal(page.title, 'Clinic & Co');
  assert.equal(page.builder, 'Wix');
  assert.equal(page.viewport, true);
  assert.deepEqual(page.tel, ['+919000011111']);
  assert.equal(page.socials.facebook, 'https://www.facebook.com/clinic');
  assert.deepEqual(page.copyrightYears, [2021]);
});

test('Gemini: the best free flash model is chosen, and a model without free allowance is skipped', async () => {
  assert.deepEqual(rankModels(['models/gemini-2.5-flash', 'models/gemini-3.6-flash', 'models/gemini-3.6-flash-lite', 'models/gemini-3.6-flash-image', 'models/gemini-4-pro', 'models/gemini-3.8-flash-preview']), ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.8-flash-preview', 'gemini-3.6-flash-lite']);
  let calls = 0;
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/models?pageSize=1000')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
    calls++;
    if (String(url).includes('gemini-3.6-flash')) return new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded … limit: 0, model: gemini-3.6-flash', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] }));
  };
  const result = await gemini({ key: 'test-key-123456', fetchImpl }).generate({ prompt: 'hi', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.deepEqual(result.data, { ok: true });
  assert.equal(calls, 2);
});

test('code checks become confirmed facts: a lapsed domain, Gmail only, unanswered reviews', () => {
  const facts = factsFromChecks(
    {
      domain: { domain: 'clinic.example', registered: false, url: 'https://rdap.org/domain/clinic.example' },
      email: { freeOnly: true, list: [{ address: 'clinic@gmail.com', domain: 'gmail.com', free: true }] },
      maps: { found: true, listing: { title: 'Clinic', rating: 3.9, reviews: 56, website: '', phone: '+91 90000 11111', address: 'Road', url: 'https://maps.example' }, reviews: { read: 10, replied: 1, negative: 4, fiveStar: 4, fiveStarOneReview: 3 } },
    },
    input(),
  );
  const texts = facts.map((fact) => fact.text).join('\n');
  assert.match(texts, /clinic\.example is no longer registered/);
  assert.match(texts, /no address on the business’s own domain/);
  assert.match(texts, /3\.9★ from 56 reviews; no website linked/);
  assert.match(texts, /1 of the 10 newest Google reviews have a reply/);
  assert.match(texts, /3 of the 4 newest five-star ratings come from accounts with a single review/);
  assert.ok(facts.every((fact) => fact.confidence === 'confirmed' && fact.verified));
  assert.equal(facts.find((fact) => /five-star/.test(fact.text)).shareable, false);
});

test('a whole run with stand-in services: research, review, then both documents', async () => {
  const env = { ...servicesFrom({ geminiKey: 'gemini-test-key', tavilyKey: 'tavily-test-key', serpapiKey: 'serpapi-test-key' }, { fetchImpl: standinFetch }), lookup: standinLookup, resolver: { resolveNs: async () => [], resolveMx: async () => [] } };
  const run = newRun(input({ person: 'Dr. Test Person', role: 'Director' }), { id: 'u1', name: 'Tester' });
  for (let step = 0; step < 60 && run.status === 'running'; step++) {
    run.notBefore = null;
    await advance(run, env);
  }
  assert.equal(run.status, 'review', run.error || run.log.at(-1)?.text);
  assert.equal(run.checks.maps.found, true);
  assert.equal(run.checks.maps.matchedBy, 'phone', 'the listing with the same phone is chosen, not the namesake');
  assert.ok(run.sources.some((source) => source.url.includes('directory.example') && source.match.identity === 'strong'));
  const helipad = run.facts.find((fact) => /helipad/.test(fact.text));
  assert.equal(helipad.confidence, 'unverified');
  assert.equal(helipad.include, false);
  assert.ok(run.facts.some((fact) => /20 beds/.test(fact.text) && fact.confidence === 'confirmed' && fact.include));
  assert.ok(!run.facts.some((fact) => /Othertown/.test(fact.text) && fact.include), 'the namesake in another town is never used');
  assert.ok(run.facts.some((fact) => fact.origin === 'check' && /reply from the business/.test(fact.text)));
  assert.ok(run.sources.every((source) => !('excerpt' in source)), 'page texts are dropped after grading');

  run.status = 'writing';
  run.stage = 'write-summary';
  for (let step = 0; step < 6 && run.status === 'writing'; step++) {
    run.notBefore = null;
    await advance(run, env);
  }
  assert.equal(run.status, 'ready', run.error);
  assert.ok(run.documents.summary.sections.length > 0);
  assert.equal(run.documents.summary.offers[0].price, '₹25,000–40,000', 'prices come from the studio’s offers, not the AI');
  assert.ok(run.documents.onepager.issues.length > 0);
  const summary = summaryHtml({ input: run.input, doc: run.documents.summary, date: run.documents.date });
  assert.match(summary, /Sunrise Clinic \(test\): the lead and the pitch/);
  assert.match(summary, /Content-Security-Policy/);
  assert.doesNotMatch(summary, /<script/i);
  assert.match(onePagerHtml({ input: run.input, doc: run.documents.onepager, date: run.documents.date }), /What patients see when they look you up online/);
});

test('a free limit makes the run wait, not fail; a bad key stops it with a clear message', async () => {
  const limited = async (url) => (String(url).includes('/models?') ? new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }] })) : new Response(JSON.stringify({ error: { code: 429, message: 'Resource exhausted', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' }] } }), { status: 429 }));
  const run = newRun(input(), null);
  Object.assign(run, { stage: 'extract', sources: [{ id: 'S1', url: 'https://a.example', title: 'A', excerpt: 'Sunrise Clinic has 20 beds.', match: { identity: 'strong', hits: [] } }], batches: [['S1']] });
  await advance(run, { ...servicesFrom({ geminiKey: 'gemini-test-key', tavilyKey: 't' }, { fetchImpl: limited }) });
  assert.equal(run.status, 'waiting');
  assert.ok(Date.parse(run.notBefore) - Date.now() > 25_000);
  const badKey = async () => new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 });
  const other = newRun(input(), null);
  Object.assign(other, { stage: 'extract', sources: run.sources, batches: [['S1']] });
  await advance(other, { ...servicesFrom({ geminiKey: 'gemini-test-key', geminiModel: 'gemini-3.6-flash' }, { fetchImpl: badKey }) });
  assert.equal(other.status, 'failed');
  assert.match(other.error, /doesn’t accept this Gemini API key/);
});

test('the service: keys are needed to start, the example needs none, review edits are kept', async () => {
  const runs = new Map();
  let saved = {};
  const service = researchService({
    store: { list: () => [...runs.values()], get: (id) => runs.get(id) ?? null, put: (run) => runs.set(run.id, run), remove: (id) => runs.delete(id), lease: () => true, release: () => {} },
    settings: { get: () => saved, set: (patch) => (saved = { ...saved, ...patch }) },
    mode: 'hosted',
    fetchImpl: standinFetch,
    lookup: standinLookup,
  });
  try {
    await assert.rejects(service.create({ business: 'Sunrise Clinic (test)', city: 'Testpur' }, null), (error) => error.code === 'not_ready');
    const example = await service.sample({ id: 'u1', name: 'Tester' });
    assert.equal(example.status, 'ready');
    assert.ok(example.documents.summary && example.documents.onepager);
    await service.updateSettings({ geminiKey: 'gemini-test-key-123', tavilyKey: 'tavily-test-key-123' }, null);
    const view = await service.settingsView();
    assert.equal(view.gemini.connected, true);
    assert.equal(view.gemini.hint, '••••-123');
    assert.ok(!JSON.stringify(view).includes('gemini-test-key-123'), 'keys are never sent back');
    const edited = await service.updateFacts(example.id, { changes: [{ id: 'F1', include: false }, { id: 'F2', text: 'Corrected wording.' }], add: [{ section: 'needs', text: 'They asked about a new logo.', shareable: true }] }, { name: 'Tester' });
    assert.equal(edited.facts.find((fact) => fact.id === 'F1').include, false);
    assert.equal(edited.facts.find((fact) => fact.id === 'F2').text, 'Corrected wording.');
    assert.ok(edited.facts.some((fact) => fact.origin === 'you' && fact.section === 'needs'));
    await assert.rejects(service.updateSettings({ geminiKey: 'has spaces in it' }, null), (error) => error.extra?.field === 'geminiKey');
  } finally {
    service.close();
  }
});

test('the example prints to two pages and one page', { skip: !findBrowser() && 'no Edge or Chrome on this computer' }, async () => {
  const run = sampleRun(null);
  const [summary, one] = await renderPdfs([
    { pages: 2, html: (scale) => summaryHtml({ input: run.input, doc: run.documents.summary, date: run.documents.date, scale }) },
    { pages: 1, html: (scale) => onePagerHtml({ input: run.input, doc: run.documents.onepager, date: run.documents.date, scale }) },
  ]);
  assert.equal(summary.pages, 2);
  assert.equal(one.pages, 1);
  assert.equal(summary.pdf.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(fileNames('Debayan Hospital'), { summary: 'Debayan-Hospital-Two-Page-Summary.pdf', onepager: 'Debayan-Hospital-Online-Health-Check.pdf' });
});

test('long pages are cut to the passages about the business', () => {
  const long = `${'Filler text. '.repeat(2000)}Call 90000 11111 for Sunrise Clinic.${' More filler.'.repeat(2000)}`;
  const cut = excerpt(long, ['9000011111', '90000 11111', 'Sunrise Clinic'], 4000);
  assert.ok(cut.length <= 4000);
  assert.match(cut, /Call 90000 11111 for Sunrise Clinic/);
});
