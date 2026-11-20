import { HttpError, badRequest, notFound } from '../http.mjs';
import { text as cleanText } from '../validate.mjs';
import { INDUSTRY_KEYS, researchInput } from './input.mjs';
import { ACTIVE, STAGES, WRITE_STAGES, advance, newRun, note, servicesFrom } from './pipeline.mjs';
import { ProviderError, gemini, serpapi, tavily } from './providers.mjs';
import { SECTION_KEYS } from './facts.mjs';
import { DEFAULT_OFFERS } from './write.mjs';
import { fileNames, onePagerHtml, summaryHtml } from './templates.mjs';
import { renderPdfs } from './pdf.mjs';
import { sampleRun } from './sample.mjs';
import { readPrompt } from './prompt.mjs';

/**
 * The Details page's work, the same for the local admin and the hosted one:
 * starting a run, moving it along, the review edits, writing, previews and
 * PDFs, the keys in Settings. Storage is the caller's (`store`); the local
 * admin keeps runs in its JSON file and runs them in the background, the
 * hosted backend keeps them in Postgres and moves each one a step whenever
 * its page asks (`mode: 'hosted'`).
 *
 * store: { list(), get(id), put(run), remove(id), lease(id) → bool, release(id) }, and
 *   optionally summaries(), countSince(iso) and sweep(cutoffIso) where a
 *   database can answer those without loading every run
 * settings: { get() → research settings, set(patch) }
 * fonts: () → CSS with the fonts embedded, for a server without the studio's
 *   fonts (a hosted runtime's Chromium has none)
 */

export const RESEARCH_DEFAULTS = { geminiKey: '', geminiModel: '', geminiModelUsed: '', tavilyKey: '', serpapiKey: '', pagespeedKey: '', offers: null, keepDays: 90, studioName: 'Atlas Studios' };

const KEY_FIELDS = ['geminiKey', 'tavilyKey', 'serpapiKey', 'pagespeedKey'];
const hint = (value) => (value ? `••••${String(value).slice(-4)}` : '');

/** A run as the browser sees it: no page texts, no internal working lists. */
export function publicRun(run) {
  if (!run) return null;
  const searchesDone = run.plan.filter((item) => item.done).length;
  const stageIndex = STAGES.findIndex(([key]) => key === run.stage);
  const researching = run.status === 'running' || (run.status === 'waiting' && !run.stage.startsWith('write'));
  const stageState = (key, index) => {
    if (run.sample || run.status === 'review' || run.status === 'writing' || run.status === 'ready') return 'done';
    if (run.status === 'failed' || run.status === 'cancelled') return index < stageIndex ? 'done' : index === stageIndex ? run.status : 'pending';
    if (index < stageIndex) return 'done';
    if (index === stageIndex) return researching ? (run.status === 'waiting' ? 'waiting' : 'active') : 'done';
    return 'pending';
  };
  return {
    id: run.id,
    sample: Boolean(run.sample),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    createdBy: run.createdBy,
    status: run.status,
    stage: run.stage,
    notBefore: run.notBefore,
    waitReason: run.waitReason,
    error: run.error,
    input: run.input,
    checks: checksView(run.checks),
    progress: {
      stages: STAGES.map(([key, label], index) => ({ key, label, state: stageState(key, index) })),
      writing: WRITE_STAGES.map(([key, label]) => ({ key, label, state: run.status === 'ready' || (run.stage === 'write-onepager' && key === 'write-summary') ? 'done' : run.stage === key ? (run.status === 'waiting' ? 'waiting' : run.status === 'failed' ? 'failed' : 'active') : 'pending' })),
      searches: { done: searchesDone, total: run.plan.length },
      batches: { done: Math.min(run.batchIndex, run.batches.length), total: run.batches.length },
      sources: run.sources.length,
    },
    sources: run.sources.map(({ id, url, title, host, via, match }) => ({ id, url, title, host, via, match })),
    facts: run.facts,
    documents: run.documents,
    usage: run.usage,
    log: (run.log ?? []).slice(-80),
  };
}

function checksView(checks = {}) {
  const site = checks.website;
  return {
    domain: checks.domain ? { domain: checks.domain.domain, registered: checks.domain.registered, created: checks.domain.created, expires: checks.domain.expires, registrar: checks.domain.registrar, url: checks.domain.url } : null,
    website: site ? { url: site.finalUrl || site.url, opens: site.opens, problem: site.problem, builder: site.builder, https: site.https, viewport: site.viewport, parked: site.parked, title: site.title, copyrightYears: site.copyrightYears, socials: site.socials } : null,
    archive: checks.archive ?? null,
    email: checks.email ?? null,
    speed: checks.speed ?? null,
    maps: checks.maps ? (checks.maps.found ? { found: true, matchedBy: checks.maps.matchedBy, listing: checks.maps.listing, reviews: checks.maps.reviews } : { found: false, skipped: Boolean(checks.maps.skipped), error: checks.maps.error ?? '', query: checks.maps.query ?? '', names: checks.maps.names ?? [] }) : null,
  };
}

/** A short line per run for the list on the Details page. */
const summaryOf = (run) => ({
  id: run.id,
  sample: Boolean(run.sample),
  business: run.input.business,
  city: run.input.city,
  person: run.input.person,
  status: run.status,
  stage: run.stage,
  createdAt: run.createdAt,
  createdBy: run.createdBy?.name ?? '',
  facts: run.facts.length,
  ready: Boolean(run.documents?.summary),
});

export function researchService({ store, settings, audit: record = () => {}, mode = 'local', fetchImpl = globalThis.fetch, pdfLaunch = null, fonts = null, aiTimeout = null, bases = {}, lookup = null, resolver = null }) {
  const hosted = mode === 'hosted';
  // The activity log is a record, never a reason for the work itself to fail.
  const audit = (...args) => {
    try {
      Promise.resolve(record(...args)).catch(() => {});
    } catch {
      /* not recorded */
    }
  };
  const timers = [];
  const driving = new Set();
  let closed = false;
  const pdfCache = new Map();

  const config = async () => ({ ...RESEARCH_DEFAULTS, ...((await settings.get()) ?? {}) });
  const env = async () => {
    const values = await config();
    return {
      ...servicesFrom(values, {
        fetchImpl,
        bases,
        onModel: (model) => {
          if (model !== values.geminiModelUsed) Promise.resolve(settings.set({ geminiModelUsed: model })).catch(() => {});
        },
      }),
      aiTimeout: aiTimeout ?? (hosted ? 45_000 : 90_000),
      ...(lookup && { lookup }),
      ...(resolver && { resolver }),
    };
  };

  const find = async (id) => {
    const run = await store.get(id);
    if (!run) throw notFound('That research isn’t here any more.');
    return run;
  };

  /* -------------------------------------------- Moving runs along -------------------------------------------- */

  /** Local: run every step in turn, in the background, pausing for waits under five minutes; longer waits are picked up by the sweep. */
  async function drive(id) {
    if (hosted || driving.has(id) || closed) return;
    driving.add(id);
    try {
      for (let guard = 0; guard < 400 && !closed; guard++) {
        const run = await store.get(id);
        if (!run || !ACTIVE.has(run.status)) break;
        const wait = run.notBefore ? Date.parse(run.notBefore) - Date.now() : 0;
        if (wait > 0) {
          if (wait > 5 * 60_000) break;
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, wait + 50);
            timer.unref?.();
          });
          continue;
        }
        await advance(run, await env());
        await store.put(run);
      }
    } catch (error) {
      console.error('[research] the run stopped:', error);
    } finally {
      driving.delete(id);
    }
  }

  /** Hosted: one step per look, under a lease so two open tabs don't do the same step twice. */
  async function step(run) {
    if (!ACTIVE.has(run.status)) return run;
    if (run.notBefore && Date.parse(run.notBefore) > Date.now()) return run;
    if (!(await store.lease(run.id))) return run;
    try {
      const fresh = (await store.get(run.id)) ?? run;
      await advance(fresh, await env());
      await store.put(fresh);
      return fresh;
    } finally {
      await store.release(run.id);
    }
  }

  /** Deletes research older than the kept days; locally, also picks up runs whose wait is over. */
  async function sweep() {
    const values = await config();
    const cutoff = Date.now() - Math.max(7, Number(values.keepDays) || 90) * 86_400_000;
    if (store.sweep) {
      const removed = await store.sweep(new Date(cutoff).toISOString());
      if (hosted) return { removed };
    }
    for (const run of await store.list()) {
      if (Date.parse(run.createdAt) < cutoff && !ACTIVE.has(run.status)) await store.remove(run.id);
      else if (!hosted && ACTIVE.has(run.status) && (!run.notBefore || Date.parse(run.notBefore) <= Date.now())) drive(run.id);
    }
  }

  if (!hosted) {
    const timer = setInterval(() => sweep().catch(() => {}), 60_000);
    timer.unref?.();
    timers.push(timer);
    setTimeout(() => sweep().catch(() => {}), 1_500).unref?.();
  }

  /** A Gemini client for one quick request made while the person waits (reading the box or a card). */
  const geminiFor = (values) => gemini({ key: values.geminiKey, model: values.geminiModel || '', prefer: values.geminiModelUsed || '', fetchImpl, ...(bases.gemini && { base: bases.gemini }) });

  /** A service's problem as an answer the page can show. */
  const asHttp = (error) => {
    if (!(error instanceof ProviderError)) return error;
    if (error.code === 'key') return new HttpError(400, 'gemini', error.message);
    if (error.code === 'limit' || error.code === 'busy') return new HttpError(429, 'gemini_limit', 'Gemini asked to wait a moment. Try again in a minute.', { retryAfter: Math.ceil((error.retryAfterMs || 30_000) / 1000) });
    if (error.code === 'quota') return new HttpError(429, 'gemini_quota', error.message);
    return new HttpError(502, 'gemini', error.message);
  };

  async function settingsView() {
    const values = await config();
    return {
      gemini: { connected: Boolean(values.geminiKey), hint: hint(values.geminiKey), model: values.geminiModel, used: values.geminiModelUsed },
      tavily: { connected: Boolean(values.tavilyKey), hint: hint(values.tavilyKey) },
      serpapi: { connected: Boolean(values.serpapiKey), hint: hint(values.serpapiKey) },
      pagespeed: { connected: Boolean(values.pagespeedKey), hint: hint(values.pagespeedKey) },
      offers: values.offers ?? DEFAULT_OFFERS,
      customOffers: Array.isArray(values.offers),
      keepDays: values.keepDays,
      studioName: values.studioName,
    };
  }

  /* -------------------------------------------- What the routes call -------------------------------------------- */

  return {
    settingsView,

    drive,

    sweep,

    async state() {
      const values = await config();
      const items = store.summaries ? await store.summaries() : (await store.list()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(summaryOf);
      return {
        items,
        ready: { gemini: Boolean(values.geminiKey), tavily: Boolean(values.tavilyKey), serpapi: Boolean(values.serpapiKey) },
        industries: INDUSTRY_KEYS,
      };
    },

    /**
     * Starts a run. `body.prompt` is the Details page's one box (everything
     * known, typed any way); the separate fields of `researchInput` work too.
     */
    async create(body, user) {
      const values = await config();
      if (!values.geminiKey || !values.tavilyKey) throw new HttpError(400, 'not_ready', 'Add the free Gemini and Tavily keys in Settings → Integrations first.');
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const recent = store.countSince ? await store.countSince(since) : (await store.list()).filter((run) => !run.sample && run.createdAt > since).length;
      if (recent >= 25) throw new HttpError(429, 'limited', 'That’s 25 research runs in a day, enough to use up the free allowances. Try again tomorrow.');
      let input;
      if (typeof body.prompt === 'string') {
        const text = cleanText(body.prompt, { field: 'prompt', max: 3000, required: true, multiline: true });
        let fields;
        try {
          fields = await readPrompt(text, geminiFor(values));
        } catch (error) {
          throw asHttp(error);
        }
        try {
          input = researchInput({ ...fields, depth: body.depth });
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 400) throw error;
          const field = error.extra?.field;
          const message = field === 'business' ? 'Couldn’t tell which business to look up. Start with its name, e.g. “Debayan Hospital, Kashipur, Kolkata”.' : field === 'city' ? 'Add where it is (the town or area), or a phone number or website, so the right business is found.' : error.message;
          throw badRequest(message, { field: 'prompt', understood: fields });
        }
        input.prompt = text;
      } else input = researchInput(body);
      const run = newRun(input, user);
      await store.put(run);
      audit(user, 'research.create', `Started researching ${run.input.business}`, { target: run.id });
      drive(run.id);
      return publicRun(hosted ? await step(run) : run);
    },

    async sample(user) {
      const run = sampleRun(user);
      await store.put(run);
      return publicRun(run);
    },

    async get(id) {
      let run = await find(id);
      if (hosted) run = await step(run);
      else if (ACTIVE.has(run.status) && !driving.has(run.id) && (!run.notBefore || Date.parse(run.notBefore) <= Date.now())) drive(run.id);
      return publicRun(run);
    },

    async cancel(id, user) {
      const run = await find(id);
      if (!ACTIVE.has(run.status)) return publicRun(run);
      run.status = 'cancelled';
      note(run, `Stopped by ${user?.name ?? 'someone'}.`, 'warn');
      await store.put(run);
      return publicRun(run);
    },

    async retry(id, user) {
      const run = await find(id);
      if (!['failed', 'cancelled'].includes(run.status)) throw badRequest('Only a stopped or failed run can be carried on.');
      run.status = run.stage.startsWith('write') ? 'writing' : 'running';
      run.error = '';
      run.notBefore = null;
      run.tries = 0;
      note(run, `Carried on by ${user?.name ?? 'someone'}.`);
      await store.put(run);
      drive(run.id);
      return publicRun(hosted ? await step(run) : run);
    },

    async remove(id, user) {
      const run = await find(id);
      await store.remove(id);
      audit(user, 'research.delete', `Deleted the research on ${run.input.business}`, { target: id });
      return { ok: true };
    },

    /** The review screen's changes: which facts to use, which may be shown to the business, corrected wording, and facts you add. */
    async updateFacts(id, body, user) {
      const run = await find(id);
      if (ACTIVE.has(run.status)) throw new HttpError(409, 'busy', 'Wait until the research is finished.');
      for (const change of Array.isArray(body.changes) ? body.changes.slice(0, 300) : []) {
        const fact = run.facts.find((item) => item.id === change.id);
        if (!fact) continue;
        if ('include' in change) fact.include = Boolean(change.include);
        if ('shareable' in change) fact.shareable = Boolean(change.shareable);
        if ('text' in change) {
          const value = cleanText(change.text, { field: 'text', max: 400, required: true });
          if (value !== fact.text) Object.assign(fact, { text: value, edited: true });
        }
      }
      for (const added of Array.isArray(body.add) ? body.add.slice(0, 20) : []) {
        const section = SECTION_KEYS.includes(added.section) ? added.section : 'business';
        const value = cleanText(added.text, { field: 'text', max: 400, required: true });
        const next = Math.max(0, ...run.facts.map((item) => Number(item.id.slice(1)) || 0)) + 1;
        run.facts.push({ id: `F${next}`, section, label: cleanText(added.label, { field: 'label', max: 80 }) || 'Added by you', text: value, quote: '', url: cleanText(added.url, { field: 'url', max: 500 }), sourceId: 'you', origin: 'you', identity: 'strong', verified: true, confidence: 'confirmed', shareable: Boolean(added.shareable), include: true, flag: '', also: [], addedBy: user?.name ?? '' });
      }
      run.updatedAt = new Date().toISOString();
      await store.put(run);
      return publicRun(run);
    },

    /** Small wording changes to the written documents (headlines, the pitch line, the next step). */
    async updateDocuments(id, body) {
      const run = await find(id);
      if (!run.documents?.summary) throw badRequest('Write the documents first.');
      const s = run.documents.summary;
      const o = run.documents.onepager;
      const set = (target, key, value, max) => {
        if (target && value !== undefined) target[key] = cleanText(value, { field: key, max, multiline: false });
      };
      set(s, 'title', body.title, 120);
      if (body.keyFact) {
        set(s.keyFact, 'heading', body.keyFact.heading, 100);
        set(s.keyFact, 'text', body.keyFact.text, 400);
      }
      if (body.bottomLine) {
        set(s.bottomLine, 'heading', body.bottomLine.heading, 100);
        set(s.bottomLine, 'text', body.bottomLine.text, 400);
      }
      set(s, 'pitchSentence', body.pitchSentence, 400);
      set(o, 'intro', body.intro, 400);
      set(o, 'nextStep', body.nextStep, 300);
      run.documents.editedAt = new Date().toISOString();
      run.updatedAt = run.documents.editedAt;
      await store.put(run);
      return publicRun(run);
    },

    async write(id, user) {
      const run = await find(id);
      if (!['review', 'ready', 'failed'].includes(run.status) || (run.status === 'failed' && !run.stage.startsWith('write'))) throw badRequest('The research has to finish before the documents are written.');
      if (run.sample) throw badRequest('This is the example; its documents are already written.');
      if (!run.facts.some((fact) => fact.include)) throw badRequest('Tick at least one fact to write from.');
      run.status = 'writing';
      run.stage = 'write-summary';
      run.error = '';
      run.notBefore = null;
      run.tries = 0;
      note(run, `${user?.name ?? 'Someone'} asked for the documents.`);
      await store.put(run);
      audit(user, 'research.write', `Wrote the summary and pitch for ${run.input.business}`, { target: run.id });
      drive(run.id);
      return publicRun(hosted ? await step(run) : run);
    },

    /** The document as HTML: the preview on the page, or (`print`) a page to save with the browser's “Save as PDF”. */
    async preview(id, kind, { print = false } = {}) {
      const run = await find(id);
      const doc = run.documents?.[kind === 'onepager' ? 'onepager' : 'summary'];
      if (!doc) throw notFound('That document hasn’t been written yet.');
      const date = run.documents.date;
      const css = fonts ? await fonts() : '';
      return kind === 'onepager' ? onePagerHtml({ input: run.input, doc, date, fonts: css, print, scale: run.documents.fit?.onepager?.scale ?? 1 }) : summaryHtml({ input: run.input, doc, date, fonts: css, print, scale: run.documents.fit?.summary?.scale ?? 1 });
    },

    /** Both PDFs are printed together and kept for ten minutes, so “Download both” prints once. */
    async pdf(id, kind) {
      const run = await find(id);
      if (!run.documents?.summary) throw notFound('The documents haven’t been written yet.');
      const which = kind === 'onepager' ? 'onepager' : 'summary';
      if (which === 'onepager' && !run.documents.onepager) throw notFound('There is no one-page check: no facts were marked as fine to show the business.');
      const version = `${run.id}:${run.documents.writtenAt}:${run.documents.editedAt ?? ''}`;
      let entry = pdfCache.get(version);
      if (!entry || Date.now() - entry.at > 10 * 60_000) {
        // The promise is kept at once, so a second download asked for meanwhile waits for this printing instead of starting another.
        entry = {
          at: Date.now(),
          files: (async () => {
            const date = run.documents.date;
            const css = fonts ? await fonts() : '';
            const jobs = [{ key: 'summary', pages: 2, html: (scale) => summaryHtml({ input: run.input, doc: run.documents.summary, date, fonts: css, scale }) }];
            if (run.documents.onepager) jobs.push({ key: 'onepager', pages: 1, html: (scale) => onePagerHtml({ input: run.input, doc: run.documents.onepager, date, fonts: css, scale }) });
            const printed = await renderPdfs(jobs, { launch: typeof pdfLaunch === 'function' ? await pdfLaunch() : pdfLaunch });
            const files = Object.fromEntries(jobs.map((job, index) => [job.key, printed[index]]));
            const fit = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { scale: file.scale, pages: file.pages, overflow: file.overflow }]));
            if (JSON.stringify(fit) !== JSON.stringify(run.documents.fit ?? null)) {
              const fresh = (await store.get(run.id)) ?? run;
              if (fresh.documents) {
                fresh.documents.fit = fit;
                await store.put(fresh);
              }
            }
            return files;
          })(),
        };
        entry.files.catch(() => pdfCache.delete(version));
        pdfCache.set(version, entry);
        for (const key of [...pdfCache.keys()].slice(0, -6)) pdfCache.delete(key);
      }
      const file = (await entry.files)[which];
      return { buffer: file.pdf, filename: fileNames(run.input.business)[which], overflow: file.overflow };
    },

    /** Reads a photo of a visiting card into the form's fields (Gemini reads the image). */
    async readCard(body) {
      const values = await config();
      if (!values.geminiKey) throw new HttpError(400, 'not_ready', 'Add the free Gemini key in Settings → Integrations to read cards.');
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image ?? ''));
      if (!match) throw badRequest('Send the card as a JPEG, PNG or WebP picture.');
      if (match[2].length > 7_000_000) throw badRequest('That picture is too large; try a smaller one.');
      const ai = geminiFor(values);
      const schema = {
        type: 'object',
        properties: {
          business: { type: 'string' },
          person: { type: 'string' },
          role: { type: 'string' },
          phones: { type: 'array', items: { type: 'string' } },
          emails: { type: 'array', items: { type: 'string' } },
          website: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          industry: { type: 'string', enum: INDUSTRY_KEYS },
        },
        required: ['business', 'person', 'role', 'phones', 'emails', 'website', 'address', 'city', 'industry'],
      };
      try {
        const result = await ai.generate({
          parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: 'This is a business or visiting card. Copy exactly what it says into the fields; leave a field empty when the card doesn’t show it. Phone numbers as printed. "city" is the town or city in the address.' }],
          schema,
          maxTokens: 2_048,
          timeout: 40_000,
        });
        return result.data ?? {};
      } catch (error) {
        throw asHttp(error);
      }
    },

    /* -------------------------------------------- Settings -------------------------------------------- */

    async updateSettings(body, user) {
      const patch = {};
      for (const field of KEY_FIELDS) {
        if (!(field in body)) continue;
        const value = String(body[field] ?? '').trim();
        if (value && !/^[\w.:-]{12,300}$/.test(value)) throw badRequest('That doesn’t look like an API key (no spaces, at least 12 characters).', { field });
        patch[field] = value;
        if (field === 'geminiKey') patch.geminiModelUsed = '';
      }
      if ('geminiModel' in body) {
        const value = String(body.geminiModel ?? '').trim();
        if (value && !/^gemini-[\w.-]{1,80}$/.test(value)) throw badRequest('A model name looks like gemini-2.5-flash.', { field: 'geminiModel' });
        patch.geminiModel = value;
      }
      if ('keepDays' in body) {
        const days = Number(body.keepDays);
        if (!Number.isInteger(days) || days < 7 || days > 730) throw badRequest('Keep research between 7 and 730 days.', { field: 'keepDays' });
        patch.keepDays = days;
      }
      if ('studioName' in body) patch.studioName = cleanText(body.studioName, { field: 'studioName', max: 80 }) || 'Atlas Studios';
      if ('offers' in body) {
        if (body.offers === null) patch.offers = null;
        else {
          if (!Array.isArray(body.offers) || !body.offers.length || body.offers.length > 6) throw badRequest('Add between one and six offers.', { field: 'offers' });
          const codes = new Set();
          patch.offers = body.offers.map((offer, index) => {
            const code = cleanText(offer.code, { field: 'code', max: 3, required: true }).toUpperCase();
            if (codes.has(code)) throw badRequest(`Two offers share the code ${code}.`, { field: 'offers' });
            codes.add(code);
            return {
              code,
              name: cleanText(offer.name, { field: 'name', max: 40, required: true }),
              duration: cleanText(offer.duration, { field: 'duration', max: 30 }),
              price: cleanText(offer.price, { field: 'price', max: 40, required: true }),
              text: cleanText(offer.text, { field: 'text', max: 400, required: true }),
              lead: Boolean(offer.lead) || (index === 0 && !body.offers.some((item) => item.lead)),
            };
          });
        }
      }
      await settings.set(patch);
      audit(user, 'settings.update', `Changed the research settings: ${Object.keys(patch).filter((key) => key !== 'geminiModelUsed').map((key) => (KEY_FIELDS.includes(key) ? key.replace('Key', ' key') : key)).join(', ')}`);
      return settingsView();
    },

    /** Tries each saved key; Tavily's test uses one search, the others nothing. */
    async testKeys() {
      const values = await config();
      const out = {};
      const attempt = async (name, fn) => {
        try {
          out[name] = { ok: true, ...(await fn()) };
        } catch (error) {
          out[name] = { ok: false, message: error?.message ?? String(error) };
        }
      };
      await Promise.all([
        values.geminiKey && attempt('gemini', async () => {
          const result = await gemini({ key: values.geminiKey, model: values.geminiModel || '', prefer: values.geminiModelUsed || '', fetchImpl, ...(bases.gemini && { base: bases.gemini }) }).test();
          if (result.model && result.model !== values.geminiModelUsed) await settings.set({ geminiModelUsed: result.model });
          return result;
        }),
        values.tavilyKey && attempt('tavily', () => tavily({ key: values.tavilyKey, fetchImpl, ...(bases.tavily && { base: bases.tavily }) }).test()),
        values.serpapiKey && attempt('serpapi', () => serpapi({ key: values.serpapiKey, fetchImpl, ...(bases.serpapi && { base: bases.serpapi }) }).test()),
      ].filter(Boolean));
      return out;
    },

    close() {
      closed = true;
      for (const timer of timers) clearInterval(timer);
    },
  };
}
