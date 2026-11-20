import crypto from 'node:crypto';
import { checkArchive, checkDomain, checkEmail, checkMaps, checkSpeed, checkWebsite, factsFromChecks } from './checks.mjs';
import { anchorsFor, coreName, emailsIn, matchSource, phonesIn } from './anchors.mjs';
import { FREE_MAIL, domainOf, phoneDisplay } from './input.mjs';
import { FetchProblem, readPage, safeFetch } from './net.mjs';
import { ProviderError, gemini, serpapi, tavily } from './providers.mjs';
import { searchPlan } from './queries.mjs';
import { EXTRACT_SYSTEM, FACT_SCHEMA, SECTION_KEYS, batches, excerpt, extractPrompt, gradeFacts } from './facts.mjs';
import { DEFAULT_OFFERS, ONEPAGER_SCHEMA, SUMMARY_SCHEMA, cleanSummary, mergeOffers, onePagerPrompt, summaryPrompt, writerSystem } from './write.mjs';

/**
 * A research run as a series of short steps, each well under a minute, so
 * the same run works inside the local admin (which simply runs the steps one
 * after another) and on a serverless host (where each look at the run's page
 * moves it one step on). `advance` does the next step and changes the run
 * in place; the caller saves it. A run waits, rather than fails, when a free
 * limit is reached, and says until when.
 *
 * Steps: Google Maps → website, domain and email → speed on a phone → web
 * searches (four at a time) → choosing and reading pages → listing facts
 * (one Gemini request per batch) → checking every quote → your review.
 * After review, writing: the two-page summary, then the one-page check.
 */

export const STAGES = [
  ['maps', 'Google Maps'],
  ['checks', 'Website, domain and email'],
  ['speed', 'Speed on a phone'],
  ['search', 'Web searches'],
  ['pick', 'Choosing pages about this business'],
  ['extract', 'Reading pages and listing facts'],
  ['grade', 'Checking every quote'],
];
const ORDER = STAGES.map(([key]) => key);
export const WRITE_STAGES = [
  ['write-summary', 'Writing the two-page summary'],
  ['write-onepager', 'Writing the one-page check'],
];

export const ACTIVE = new Set(['running', 'waiting', 'writing']);
const LOGIN_WALLED = /(^|\.)(facebook|instagram|linkedin|x|twitter|threads)\.com$/;
/** Pages that are apps, not text: reading them gives nothing useful. */
const NO_TEXT = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|youtube\.com|youtu\.be)/i;
const MAX_SOURCES = { quick: 16, thorough: 26 };
const AI_GAP_MS = 7_000;

const nowIso = () => new Date().toISOString();

export function note(run, text, kind = 'info') {
  run.log = [...(run.log ?? []), { at: nowIso(), text, kind }].slice(-160);
}

/** When Gemini's free daily allowance comes back: midnight Pacific time. */
export function nextPacificMidnight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now).map((part) => [part.type, part.value]));
  const into = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000;
  return new Date(now.getTime() + 86_400_000 - into + 120_000);
}

/** A new run for the Details form's input. */
export function newRun(input, user) {
  return {
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: { id: user?.id ?? null, name: user?.name ?? 'Admin' },
    status: 'running',
    stage: 'maps',
    notBefore: null,
    waitReason: '',
    input,
    extra: { phones: [], emails: [], domains: [], links: [] },
    checks: {},
    plan: searchPlan(input).map((item) => ({ ...item, done: false, found: 0, error: '' })),
    pool: [],
    sources: [],
    batches: [],
    batchIndex: 0,
    rawFacts: [],
    facts: [],
    documents: null,
    usage: { searches: 0, maps: 0, ai: 0, tokensIn: 0, tokensOut: 0, model: '' },
    tries: 0,
    log: [{ at: nowIso(), text: `Research started for ${input.business}${input.city ? `, ${input.city}` : ''}.`, kind: 'info' }],
    error: '',
  };
}

/** The services a run needs, from the saved settings. Missing keys leave a service out. */
export function servicesFrom(settings = {}, { fetchImpl = globalThis.fetch, onModel = null, bases = {} } = {}) {
  const ai = settings.geminiKey ? gemini({ key: settings.geminiKey, model: settings.geminiModel || '', prefer: settings.geminiModelUsed || '', fetchImpl, ...(bases.gemini && { base: bases.gemini }) }) : null;
  return {
    ai,
    search: settings.tavilyKey ? tavily({ key: settings.tavilyKey, fetchImpl, ...(bases.tavily && { base: bases.tavily }) }) : null,
    maps: settings.serpapiKey ? serpapi({ key: settings.serpapiKey, fetchImpl, ...(bases.serpapi && { base: bases.serpapi }) }) : null,
    pagespeedKey: settings.pagespeedKey || '',
    offers: Array.isArray(settings.offers) && settings.offers.length ? settings.offers : DEFAULT_OFFERS,
    studio: settings.studioName || 'Atlas Studios',
    fetchImpl,
    onModel,
  };
}

const goTo = (run, stage) => {
  run.stage = stage;
  run.tries = 0;
};

const nextStage = (run) => {
  const index = ORDER.indexOf(run.stage);
  goTo(run, ORDER[index + 1] ?? 'grade');
};

/**
 * Does the run's next step. `env` holds the services (servicesFrom), and in
 * tests stand-ins for fetch, DNS and the clock. Never throws: problems end
 * up on the run (waiting, or failed with a message).
 */
export async function advance(run, env) {
  if (!ACTIVE.has(run.status)) return run;
  const now = env.now?.() ?? new Date();
  if (run.notBefore && Date.parse(run.notBefore) > now.getTime()) return run;
  if (run.status === 'waiting') {
    run.status = run.stage.startsWith('write') ? 'writing' : 'running';
    run.waitReason = '';
    note(run, 'Carrying on.');
  }
  run.notBefore = null;
  try {
    await STEP[run.stage](run, env, now);
  } catch (error) {
    handleProblem(run, error, now);
  }
  run.updatedAt = nowIso();
  return run;
}

function handleProblem(run, error, now) {
  if (error instanceof ProviderError) {
    if (error.code === 'limit' || error.code === 'busy') {
      run.status = 'waiting';
      run.notBefore = new Date(now.getTime() + Math.max(error.retryAfterMs, 15_000)).toISOString();
      run.waitReason = error.message;
      note(run, `${error.message} Waiting ${Math.round(Math.max(error.retryAfterMs, 15_000) / 1000)} seconds.`, 'warn');
      return;
    }
    if (error.code === 'quota' && error.provider === 'Gemini') {
      run.status = 'waiting';
      run.notBefore = nextPacificMidnight(now).toISOString();
      run.waitReason = error.message;
      note(run, `${error.message} The run carries on by itself after that.`, 'warn');
      return;
    }
    if (error.code === 'timeout' || error.code === 'network') {
      run.tries = (run.tries ?? 0) + 1;
      if (run.tries < 4) {
        run.notBefore = new Date(now.getTime() + 10_000 * run.tries).toISOString();
        note(run, `${error.message} Trying again.`, 'warn');
        return;
      }
    }
    run.status = 'failed';
    run.error = error.message;
    note(run, error.message, 'error');
    return;
  }
  run.status = 'failed';
  run.error = `Something went wrong in step “${run.stage}”: ${error?.message ?? error}`;
  note(run, run.error, 'error');
  console.error('[research]', error);
}

const anchorsOf = (run) => anchorsFor(run.input, run.extra);

/* ------------------------------------------------------------------ The steps */

const STEP = {
  async maps(run, env) {
    if (!env.maps) {
      run.checks.maps = { skipped: true };
      note(run, 'Google Maps skipped: add a free SerpApi key in Settings to include ratings and review replies.', 'warn');
      return nextStage(run);
    }
    try {
      const maps = await checkMaps(run.input, anchorsOf(run), env.maps);
      run.usage.maps += maps.found && maps.listing?.dataId ? 2 : 1;
      run.checks.maps = maps;
      if (maps.found) {
        const l = maps.listing;
        if (l.phone) run.extra.phones.push(l.phone);
        if (l.website && !run.input.website) run.extra.domains.push(domainOf(l.website));
        note(run, `Found on Google Maps (matched by ${maps.matchedBy}): ${l.title}${l.rating ? `, ${l.rating}★ from ${l.reviews} reviews` : ''}.`, 'ok');
      } else note(run, `Not found on Google Maps for “${maps.query}”.`, 'warn');
    } catch (error) {
      if (error instanceof ProviderError && ['quota', 'key'].includes(error.code)) {
        run.checks.maps = { skipped: true, error: error.message };
        note(run, `Google Maps skipped: ${error.message}`, 'warn');
      } else throw error;
    }
    nextStage(run);
  },

  async checks(run, env) {
    const input = run.input;
    const mapsSite = run.checks.maps?.listing?.website;
    const website = input.website || (mapsSite ? (/^https?:/i.test(mapsSite) ? mapsSite : `https://${mapsSite}`) : '');
    const ownEmailDomain = input.emails.map((item) => item.split('@')[1]).find((domain) => domain && !FREE_MAIL.has(domain)) ?? '';
    const domain = domainOf(website) || ownEmailDomain;
    const tasks = [
      website ? checkWebsite(website, { fetchImpl: env.fetchImpl, lookup: env.lookup }) : null,
      domain ? checkDomain(domain, { fetchImpl: env.fetchImpl, resolver: env.resolver }) : null,
      domain ? checkArchive(domain, { fetchImpl: env.fetchImpl }) : null,
      input.emails.length ? checkEmail(input.emails, { resolver: env.resolver }) : null,
    ];
    const [site, registry, archive, email] = await Promise.all(tasks);
    Object.assign(run.checks, { website: site, domain: registry, archive, email });
    if (registry) note(run, registry.registered === false ? `${domain} is not registered any more.` : registry.registered ? `${domain} is registered${registry.expires ? ` until ${registry.expires}` : ''}.` : `Couldn’t tell whether ${domain} is registered.`, registry.registered === false ? 'warn' : 'ok');
    if (site) {
      note(run, site.opens ? `The website opens${site.builder ? ` (built with ${site.builder})` : ''}.` : `The website doesn’t open: ${site.problem}.`, site.opens ? 'ok' : 'warn');
      if (site.opens && !site.parked) {
        // The business's own site: its phones and emails become anchors too.
        for (const tel of site.tel) run.extra.phones.push(tel);
        for (const key of [...phonesIn(site.text)].slice(0, 6)) run.extra.phones.push(key);
        for (const address of [...new Set([...site.mail, ...emailsIn(site.text)])].slice(0, 6)) run.extra.emails.push(address);
        run.extra.links.push(...Object.values(site.socials).slice(0, 4));
      }
    }
    if (archive?.snapshots) note(run, `The Internet Archive has ${archive.snapshots} copies of ${domain}.`);
    if (email?.freeOnly) note(run, 'Email is only on free addresses (no email on the business’s own domain).');
    nextStage(run);
  },

  async speed(run, env) {
    const site = run.checks.website;
    if (!site?.opens || site.parked) return nextStage(run);
    run.checks.speed = await checkSpeed(site.finalUrl || site.url, { fetchImpl: env.fetchImpl, key: env.pagespeedKey });
    note(run, run.checks.speed.score !== null ? `PageSpeed on a phone: ${run.checks.speed.score}/100.` : `PageSpeed couldn’t measure the site (${run.checks.speed.problem}).`, run.checks.speed.score !== null ? 'ok' : 'warn');
    nextStage(run);
  },

  async search(run, env) {
    if (!env.search) {
      note(run, 'Web search skipped: add a free Tavily key in Settings.', 'warn');
      return nextStage(run);
    }
    const next = run.plan.filter((item) => !item.done).slice(0, 4);
    if (!next.length) return nextStage(run);
    const results = await Promise.allSettled(next.map((item) => env.search.search(item.q, { maxResults: 7, raw: true })));
    let stop = null;
    results.forEach((result, index) => {
      const item = next[index];
      if (result.status === 'fulfilled') {
        item.done = true;
        item.found = result.value.length;
        run.usage.searches++;
        for (const found of result.value) addToPool(run, { ...found, query: item.q });
        note(run, `Searched ${item.why}: ${result.value.length} results.`);
      } else if (result.reason instanceof ProviderError && ['quota', 'key'].includes(result.reason.code)) {
        stop = result.reason;
      } else if (result.reason instanceof ProviderError && ['limit', 'busy'].includes(result.reason.code)) {
        stop ??= result.reason;
      } else {
        item.done = true;
        item.error = String(result.reason?.message ?? result.reason);
        note(run, `A search failed (${item.why}): ${item.error}`, 'warn');
      }
    });
    if (stop && ['quota', 'key'].includes(stop.code)) {
      for (const item of run.plan) if (!item.done) Object.assign(item, { done: true, error: 'skipped' });
      note(run, `${stop.message} Carrying on with what was found.`, 'warn');
      return nextStage(run);
    }
    if (stop) throw stop;
    if (run.plan.every((item) => item.done)) nextStage(run);
  },

  async pick(run, env) {
    const anchors = anchorsOf(run);
    const input = run.input;
    const site = run.checks.website;
    const candidates = [];
    if (site?.opens && !site.parked && site.text) candidates.push({ url: site.finalUrl || site.url, title: site.title || site.domain, text: site.text, via: 'website' });

    // A few pages of the business's own site (about, contact, services) and the links you gave.
    const own = site?.opens && !site.parked ? siteLinks(site).slice(0, 2) : [];
    const typed = [...input.links, ...run.extra.links].filter((link, index, list) => list.indexOf(link) === index).slice(0, 6);
    const fetches = [...own.map((url) => ({ url, via: 'website' })), ...typed.map((url) => ({ url, via: 'link' }))];
    const fetched = await Promise.all(fetches.map(async ({ url, via }) => {
      const host = hostOf(url);
      const pooled = run.pool.find((item) => sameUrl(item.url, url));
      if (pooled) return { url, title: pooled.title, text: pooled.raw || pooled.snippet, via };
      if (LOGIN_WALLED.test(host) || NO_TEXT.test(url)) return null;
      const page = await readUrl(url, env);
      return page ? { ...page, via } : null;
    }));
    for (const page of fetched) if (page?.text) candidates.push(page);

    for (const item of run.pool) candidates.push({ url: item.url, title: item.title, text: item.raw && item.raw.length > item.snippet.length ? item.raw : item.snippet, snippet: item.snippet, query: item.query, via: 'search' });

    const seen = new Set();
    const scored = [];
    for (const candidate of candidates) {
      const key = urlKey(candidate.url);
      if (!candidate.url || seen.has(key)) continue;
      seen.add(key);
      const match = candidate.via === 'search' ? matchSource(candidate, anchors) : { ...matchSource(candidate, anchors), identity: 'strong' };
      if (candidate.via !== 'search' && !match.hits.length) match.hits.push(candidate.via === 'website' ? 'its own website' : 'a link you added');
      if (match.identity === 'none') continue;
      scored.push({ ...candidate, match });
    }
    const rank = { strong: 0, name: 1, weak: 2 };
    scored.sort((a, b) => rank[a.match.identity] - rank[b.match.identity] || b.match.score - a.match.score);
    const limit = MAX_SOURCES[input.depth] ?? 16;
    const chosen = [...scored.filter((item) => item.match.identity === 'strong').slice(0, Math.ceil(limit * 0.7)), ...scored.filter((item) => item.match.identity === 'name').slice(0, 8), ...scored.filter((item) => item.match.identity === 'weak').slice(0, 4)].slice(0, limit);

    // Search results that came without their page's text are read directly, a few at a time.
    const thin = chosen.filter((item) => item.via === 'search' && (item.text ?? '').length < 500 && !LOGIN_WALLED.test(hostOf(item.url))).slice(0, 5);
    await Promise.all(thin.map(async (item) => {
      const page = await readUrl(item.url, env);
      if (page?.text && page.text.length > (item.text ?? '').length) {
        item.text = page.text;
        item.match = matchSource({ url: item.url, title: item.title, text: page.text }, anchors);
      }
    }));

    const needles = [...anchors.phones.flatMap((key) => [key, phoneDisplay(key)]), ...anchors.emails, ...anchors.domains, input.business, coreName(input.business), input.person, input.pincode].filter(Boolean);
    run.sources = chosen.map((item, index) => ({
      id: `S${index + 1}`,
      url: item.url,
      title: (item.title || hostOf(item.url)).slice(0, 200),
      host: hostOf(item.url),
      via: item.via,
      query: item.query ?? '',
      match: item.match,
      excerpt: excerpt(item.text ?? '', needles),
    })).filter((source) => source.excerpt.trim().length > 40);
    run.batches = batches(run.sources);
    run.batchIndex = 0;
    run.pool = [];
    const strong = run.sources.filter((item) => item.match.identity === 'strong').length;
    note(run, `Chose ${run.sources.length} pages: ${strong} share a phone, email or website with the business${run.sources.length - strong ? `, ${run.sources.length - strong} match by name` : ''}.`, run.sources.length ? 'ok' : 'warn');
    nextStage(run);
  },

  async extract(run, env) {
    if (!run.sources.length || run.batchIndex >= run.batches.length) return nextStage(run);
    if (!env.ai) throw new ProviderError('Gemini', 'key', 'Add a free Gemini API key in Settings → Integrations to read the pages.');
    const ids = run.batches[run.batchIndex];
    const sources = run.sources.filter((source) => ids.includes(source.id));
    try {
      const result = await env.ai.generate({ system: EXTRACT_SYSTEM, prompt: extractPrompt(run.input, sources), schema: FACT_SCHEMA, timeout: env.aiTimeout ?? 45_000 });
      countAi(run, result, env);
      const facts = Array.isArray(result.data?.facts) ? result.data.facts : [];
      run.rawFacts.push(...facts);
      note(run, `Read ${sources.length} pages (${run.batchIndex + 1} of ${run.batches.length}): ${facts.length} facts.`, 'ok');
      run.batchIndex++;
      run.notBefore = new Date(Date.now() + AI_GAP_MS).toISOString();
    } catch (error) {
      if (error instanceof ProviderError && ['too_long', 'timeout'].includes(error.code) && ids.length > 1) {
        const half = Math.ceil(ids.length / 2);
        run.batches.splice(run.batchIndex, 1, ids.slice(0, half), ids.slice(half));
        note(run, 'That batch was too much for one request; splitting it.', 'warn');
        return;
      }
      if (error instanceof ProviderError && ['too_long', 'timeout', 'blocked', 'bad_response'].includes(error.code)) {
        note(run, `Skipped ${sources.map((source) => source.host).join(', ')}: ${error.message}`, 'warn');
        run.batchIndex++;
        return;
      }
      throw error;
    }
    if (run.batchIndex >= run.batches.length) nextStage(run);
  },

  async grade(run) {
    const fromSources = gradeFacts(run.rawFacts, run.sources);
    const fromChecks = factsFromChecks(run.checks, run.input);
    const order = (fact) => SECTION_KEYS.indexOf(fact.section) * 10 + { confirmed: 0, probable: 1, doubtful: 2, unverified: 3 }[fact.confidence] + (fact.origin === 'check' ? 0 : 0.5);
    run.facts = [...fromChecks, ...fromSources].sort((a, b) => order(a) - order(b)).map((fact, index) => ({ id: `F${index + 1}`, ...fact }));
    // Keep what the review screen needs; the pages' text is no longer needed.
    run.sources = run.sources.map(({ id, url, title, host, via, match }) => ({ id, url, title, host, via, match }));
    run.rawFacts = [];
    const count = (fn) => run.facts.filter(fn).length;
    note(run, `Found ${run.facts.length} facts: ${count((fact) => fact.confidence === 'confirmed')} confirmed, ${count((fact) => fact.confidence === 'probable')} probable; ${count((fact) => !fact.include)} left out until you check them.`, 'ok');
    run.status = 'review';
    run.stage = 'review';
  },

  async 'write-summary'(run, env) {
    if (!env.ai) throw new ProviderError('Gemini', 'key', 'Add a free Gemini API key in Settings → Integrations to write the documents.');
    const facts = run.facts.filter((fact) => fact.include);
    if (!facts.length) throw new ProviderError('Gemini', 'bad_request', 'No facts are ticked. Tick the facts the documents should use.');
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const result = await env.ai.generate({ system: writerSystem(env.studio), prompt: summaryPrompt({ input: run.input, facts, offers: env.offers, checksNote: notChecked(run), date }), schema: SUMMARY_SCHEMA, temperature: 0.4, timeout: env.aiTimeout ?? 45_000 });
    countAi(run, result, env);
    const summary = cleanSummary(result.data ?? {}, facts);
    const monthly = env.offers.find((offer) => /month/i.test(`${offer.duration} ${offer.price}`));
    summary.offers = mergeOffers(summary.offers, env.offers.filter((offer) => offer !== monthly));
    summary.monthly = monthly ? `${monthly.name}, ${monthly.price}: ${monthly.text}` : '';
    run.documents = { ...(run.documents ?? {}), summary, date, writtenAt: nowIso() };
    note(run, 'Wrote the two-page summary.', 'ok');
    goTo(run, 'write-onepager');
    run.notBefore = new Date(Date.now() + AI_GAP_MS).toISOString();
  },

  async 'write-onepager'(run, env) {
    const facts = run.facts.filter((fact) => fact.include && fact.shareable);
    if (!facts.length) {
      run.documents.onepager = null;
      note(run, 'No facts are marked as fine to show the business, so there is no one-page check.', 'warn');
    } else {
      const date = run.documents?.date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const result = await env.ai.generate({ system: writerSystem(env.studio), prompt: onePagerPrompt({ input: run.input, facts, offers: env.offers, date }), schema: ONEPAGER_SCHEMA, temperature: 0.4, timeout: env.aiTimeout ?? 45_000 });
      countAi(run, result, env);
      const lead = env.offers.find((offer) => offer.lead) ?? env.offers[0];
      run.documents.onepager = { ...(result.data ?? {}), leadDuration: lead?.duration ?? '' };
      note(run, 'Wrote the one-page check.', 'ok');
    }
    run.status = 'ready';
    run.stage = 'ready';
  },
};

function countAi(run, result, env) {
  run.usage.ai++;
  run.usage.tokensIn += result.usage?.input ?? 0;
  run.usage.tokensOut += result.usage?.output ?? 0;
  if (result.model && result.model !== run.usage.model) {
    run.usage.model = result.model;
    env.onModel?.(result.model);
  }
}

function notChecked(run) {
  const out = [];
  if (run.checks.maps?.skipped) out.push('Google Maps (no SerpApi key or no searches left)');
  else if (run.checks.maps && !run.checks.maps.found) out.push('the Google Maps listing (not found)');
  if (!run.checks.website) out.push('a website (none given or found)');
  if (run.plan.some((item) => item.error === 'skipped')) out.push('some web searches (Tavily’s free searches ran out)');
  out.push('Facebook, Instagram and LinkedIn beyond what search engines show (they need signing in)', 'personal accounts and court records (left out on purpose)');
  return out.join('; ');
}

/* ------------------------------------------------------------------ Pages */

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

function urlKey(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|refid$|__)/i.test(key)) parsed.searchParams.delete(key);
    parsed.hash = '';
    return `${parsed.hostname.replace(/^www\.|^m\./, '')}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`.toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}
const sameUrl = (a, b) => urlKey(a) === urlKey(b);

function addToPool(run, item) {
  if (!item.url) return;
  const known = run.pool.find((pooled) => sameUrl(pooled.url, item.url));
  if (known) {
    if ((item.raw ?? '').length > (known.raw ?? '').length) known.raw = item.raw;
    return;
  }
  run.pool.push({ url: item.url, title: item.title ?? '', snippet: (item.snippet ?? '').slice(0, 2_000), raw: (item.raw ?? '').slice(0, 40_000), query: item.query ?? '' });
}

async function readUrl(url, env) {
  try {
    const page = await safeFetch(url, { fetchImpl: env.fetchImpl, ...(env.lookup && { lookup: env.lookup }), timeout: 10_000 });
    if (!page.ok || !page.text) return null;
    const read = /html|xml/.test(page.contentType || 'text/html') ? readPage(page.text, page.url) : { title: '', text: page.text };
    return { url: page.url, title: read.title, text: read.text.slice(0, 60_000) };
  } catch (error) {
    if (!(error instanceof FetchProblem)) throw error;
    return null;
  }
}

/** Pages of the business's own site worth reading: about, contact, services, team. */
function siteLinks(site) {
  const domain = site.domain;
  const wanted = (site.links ?? []).filter((link) => {
    const host = hostOf(link);
    if (host !== domain && !host.endsWith(`.${domain}`)) return false;
    try {
      return /about|contact|director|team|doctor|services|department|facilit/i.test(new URL(link).pathname);
    } catch {
      return false;
    }
  });
  return [...new Set(wanted.map((link) => link.split('#')[0]))].filter((link) => !sameUrl(link, site.finalUrl || site.url));
}
