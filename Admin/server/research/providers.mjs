/**
 * The three free services the research uses, each a thin client over fetch:
 * Gemini (Google AI Studio's free tier) reads the sources and writes the
 * documents, Tavily searches the web, SerpApi reads Google Maps. Each says
 * what went wrong in words the Details page can show, and marks the answers
 * that mean “wait and try again”: a per-minute limit (retryAfterMs) or a
 * daily or monthly allowance that has run out (untilReset).
 */

export class ProviderError extends Error {
  constructor(provider, code, message, { retryAfterMs = 0, untilReset = false, status = 0 } = {}) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.untilReset = untilReset;
    this.status = status;
  }
}

async function request(provider, fetchImpl, url, init, timeout) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ProviderError(provider, 'timeout', `${provider} took longer than ${Math.round(timeout / 1000)} seconds to answer.`);
    throw new ProviderError(provider, 'network', `${provider} couldn’t be reached (${error?.cause?.code ?? error?.message ?? 'network error'}).`);
  }
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { response, data, raw };
}

/* ------------------------------------------------------------------ Gemini */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** JSON-Schema-like (lowercase types) to the Schema object Gemini's responseSchema takes. */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.nullable) out.nullable = true;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.maxItems !== undefined) out.maxItems = String(schema.maxItems);
  if (schema.minItems !== undefined) out.minItems = String(schema.minItems);
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]));
    out.propertyOrdering = Object.keys(schema.properties);
    if (schema.required) out.required = schema.required;
  }
  return out;
}

/** Ranks Gemini models for this work: the newest general “flash” model first, then “flash-lite”, never image, audio or live ones. */
export function rankModels(names) {
  const usable = names
    .map((name) => name.replace(/^models\//, ''))
    .filter((name) => /^gemini-/.test(name) && /flash/.test(name) && !/(image|tts|audio|live|transcribe|embedding|vision|robotics|computer|native|exp-\d|thinking)/.test(name));
  const version = (name) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);
  const rank = (name) => (name.includes('lite') ? 1 : 0) * 1000 + (name.includes('preview') ? 1 : 0) * 100 - version(name) * 10 + (/-\d{3}$|-\d{2}-\d{2}/.test(name) ? 1 : 0);
  return [...new Set(usable)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function geminiProblem(status, data, raw) {
  const error = data?.error ?? {};
  const message = String(error.message ?? raw ?? '').slice(0, 400);
  const details = Array.isArray(error.details) ? error.details : [];
  const retry = details.find((item) => String(item['@type'] ?? '').includes('RetryInfo'))?.retryDelay;
  const retryMs = retry ? Math.ceil(parseFloat(retry) * 1000) : 0;
  const violations = details.flatMap((item) => item.violations ?? []);
  if (status === 400 && /api key not valid|API_KEY_INVALID/i.test(message)) return new ProviderError('Gemini', 'key', 'Google doesn’t accept this Gemini API key. Check it in Settings → Integrations.', { status });
  if (status === 401 || status === 403) {
    if (/not available|not supported|free tier/i.test(message)) return new ProviderError('Gemini', 'model', `This Gemini model isn’t open to this key: ${message}`, { status });
    return new ProviderError('Gemini', 'key', `Google refused the Gemini key (${status}): ${message}`, { status });
  }
  if (status === 404) return new ProviderError('Gemini', 'model', `That Gemini model isn’t available: ${message}`, { status });
  if (status === 429) {
    const zero = /limit:\s*0\b/.test(message) || violations.some((item) => String(item.quotaValue) === '0');
    if (zero) return new ProviderError('Gemini', 'model', 'This Gemini model has no free allowance on this key.', { status });
    const daily = violations.some((item) => /PerDay/i.test(String(item.quotaId ?? ''))) || /per day|daily/i.test(message);
    if (daily) return new ProviderError('Gemini', 'quota', 'Gemini’s free daily allowance is used up. It resets at midnight Pacific time (about 1:30 pm India time).', { status, untilReset: true });
    return new ProviderError('Gemini', 'limit', 'Gemini’s free per-minute limit was reached.', { status, retryAfterMs: Math.max(retryMs, 15_000) });
  }
  if (status >= 500) return new ProviderError('Gemini', 'busy', `Gemini had a problem (${status}). Trying again shortly.`, { status, retryAfterMs: 20_000 });
  return new ProviderError('Gemini', 'bad_request', `Gemini refused the request (${status}): ${message}`, { status });
}

export function gemini({ key, model = '', prefer = '', fetchImpl = globalThis.fetch, base = GEMINI_BASE } = {}) {
  if (!key) throw new ProviderError('Gemini', 'key', 'Add a Gemini API key in Settings → Integrations (free from Google AI Studio).');
  const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' };
  // A model chosen in Settings is used alone; otherwise the best free one, starting with the last that worked.
  let candidates = model ? [model] : null;

  async function listModels() {
    const { response, data, raw } = await request('Gemini', fetchImpl, `${base}/models?pageSize=1000`, { headers }, 20_000);
    if (!response.ok) throw geminiProblem(response.status, data, raw);
    return (data?.models ?? []).filter((item) => (item.supportedGenerationMethods ?? []).includes('generateContent')).map((item) => item.name);
  }

  async function models() {
    if (!candidates) {
      candidates = rankModels(await listModels());
      if (prefer && candidates.includes(prefer)) candidates = [prefer, ...candidates.filter((item) => item !== prefer)];
      if (!candidates.length) throw new ProviderError('Gemini', 'model', 'No Gemini “flash” model is open to this key.');
    }
    return candidates;
  }

  /**
   * One request. `schema` asks for JSON in that shape; `parts` may carry an
   * image. Resolves to { data, text, model, usage }. When a model turns out
   * to have no free allowance, the next one is tried.
   */
  async function generate({ system = '', prompt = '', parts = null, schema = null, temperature = 0.2, maxTokens = 32_768, timeout = 45_000 } = {}) {
    const body = {
      ...(system && { systemInstruction: { parts: [{ text: system }] } }),
      contents: [{ role: 'user', parts: parts ?? [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, ...(schema && { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) }) },
    };
    const list = await models();
    let lastError = null;
    for (const name of [...list]) {
      const { response, data, raw } = await request('Gemini', fetchImpl, `${base}/models/${encodeURIComponent(name)}:generateContent`, { method: 'POST', headers, body: JSON.stringify(body) }, timeout);
      if (!response.ok) {
        lastError = geminiProblem(response.status, data, raw);
        // Free allowances are per model: when one model has none (or none left today), the next one may.
        if ((lastError.code === 'model' || lastError.code === 'quota') && !model) {
          candidates = candidates.filter((item) => item !== name);
          continue;
        }
        throw lastError;
      }
      if (data?.promptFeedback?.blockReason) throw new ProviderError('Gemini', 'blocked', `Gemini declined to read this (${data.promptFeedback.blockReason}).`);
      const candidate = data?.candidates?.[0];
      const finish = candidate?.finishReason ?? '';
      const text = (candidate?.content?.parts ?? []).filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('');
      if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST') throw new ProviderError('Gemini', 'blocked', `Gemini stopped for safety reasons (${finish}).`);
      if (finish === 'MAX_TOKENS') throw new ProviderError('Gemini', 'too_long', 'Gemini’s answer ran past its length limit.');
      const usage = { input: data?.usageMetadata?.promptTokenCount ?? 0, output: (data?.usageMetadata?.candidatesTokenCount ?? 0) + (data?.usageMetadata?.thoughtsTokenCount ?? 0) };
      if (!schema) return { text, data: null, model: name, usage };
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      try {
        return { text, data: JSON.parse(cleaned), model: name, usage };
      } catch {
        throw new ProviderError('Gemini', 'bad_response', 'Gemini’s answer wasn’t valid JSON.');
      }
    }
    throw lastError ?? new ProviderError('Gemini', 'model', 'No Gemini model answered.');
  }

  async function test() {
    const result = await generate({ prompt: 'Reply with the JSON {"ok": true}.', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, maxTokens: 256, timeout: 30_000 });
    return { model: result.model };
  }

  return { generate, test, models, listModels };
}

/* ------------------------------------------------------------------ Tavily */

export function tavily({ key, fetchImpl = globalThis.fetch, base = 'https://api.tavily.com' } = {}) {
  if (!key) throw new ProviderError('Tavily', 'key', 'Add a Tavily API key in Settings → Integrations (free at tavily.com).');
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

  const problem = (status, data, raw) => {
    const message = String(data?.detail?.error ?? data?.detail ?? data?.error ?? raw ?? '').slice(0, 300);
    if (status === 401 || status === 403) return new ProviderError('Tavily', 'key', 'Tavily doesn’t accept this API key. Check it in Settings → Integrations.', { status });
    if (status === 432 || status === 433) return new ProviderError('Tavily', 'quota', 'Tavily’s free searches for this month are used up. They renew on the 1st.', { status, untilReset: true });
    if (status === 429) return new ProviderError('Tavily', 'limit', 'Tavily asked to slow down.', { status, retryAfterMs: 20_000 });
    if (status >= 500) return new ProviderError('Tavily', 'busy', `Tavily had a problem (${status}).`, { status, retryAfterMs: 20_000 });
    return new ProviderError('Tavily', 'bad_request', `Tavily refused the search (${status}): ${message}`, { status });
  };

  /** One web search: up to `maxResults` pages, each with Tavily's cleaned copy of its text when `raw`. One credit. */
  async function search(query, { maxResults = 8, raw = true, timeout = 25_000 } = {}) {
    const { response, data, raw: body } = await request('Tavily', fetchImpl, `${base}/search`, { method: 'POST', headers, body: JSON.stringify({ query, search_depth: 'basic', max_results: maxResults, include_raw_content: raw, include_answer: false, include_images: false }) }, timeout);
    if (!response.ok) throw problem(response.status, data, body);
    return (data?.results ?? []).map((item) => ({ url: String(item.url ?? ''), title: String(item.title ?? ''), snippet: String(item.content ?? ''), raw: String(item.raw_content ?? ''), score: Number(item.score) || 0 })).filter((item) => /^https?:\/\//.test(item.url));
  }

  async function test() {
    const results = await search('Kolkata', { maxResults: 1, raw: false, timeout: 20_000 });
    return { results: results.length };
  }

  return { search, test };
}

/* ------------------------------------------------------------------ SerpApi (Google Maps) */

export function serpapi({ key, fetchImpl = globalThis.fetch, base = 'https://serpapi.com' } = {}) {
  if (!key) throw new ProviderError('SerpApi', 'key', 'Add a SerpApi key in Settings → Integrations (free at serpapi.com).');

  const call = async (params, timeout = 30_000) => {
    const query = new URLSearchParams({ ...params, api_key: key });
    const { response, data } = await request('SerpApi', fetchImpl, `${base}/search.json?${query}`, {}, timeout);
    const message = String(data?.error ?? '').slice(0, 300);
    if (response.status === 401 || /invalid api key/i.test(message)) throw new ProviderError('SerpApi', 'key', 'SerpApi doesn’t accept this key. Check it in Settings → Integrations.', { status: response.status });
    if (/run out of searches|plan.*limit|exceeded/i.test(message)) throw new ProviderError('SerpApi', 'quota', 'SerpApi’s free searches for this month are used up.', { status: response.status, untilReset: true });
    if (response.status === 429) throw new ProviderError('SerpApi', 'limit', 'SerpApi asked to slow down.', { status: 429, retryAfterMs: 30_000 });
    if (!response.ok && !/hasn't returned any results|no results/i.test(message)) throw new ProviderError('SerpApi', 'bad_request', `SerpApi refused the search (${response.status}): ${message}`, { status: response.status });
    return data ?? {};
  };

  const place = (item = {}) => ({
    title: String(item.title ?? ''),
    dataId: String(item.data_id ?? ''),
    placeId: String(item.place_id ?? ''),
    rating: Number(item.rating) || null,
    reviews: Number(item.reviews) || 0,
    address: String(item.address ?? ''),
    phone: String(item.phone ?? ''),
    website: String(item.website ?? ''),
    type: String(item.type ?? (Array.isArray(item.types) ? item.types[0] : '') ?? ''),
    hours: String(item.open_state ?? item.hours ?? ''),
    description: String(item.description ?? ''),
    url: item.place_id ? `https://www.google.com/maps/place/?q=place_id:${item.place_id}` : '',
  });

  /** Google Maps listings for a query (one search). */
  async function maps(query) {
    const data = await call({ engine: 'google_maps', type: 'search', q: query, hl: 'en' });
    if (data.place_results) return [place(data.place_results)];
    return (data.local_results ?? []).slice(0, 8).map(place);
  }

  /** The newest reviews of a listing, with the owner's replies (one search). */
  async function reviews(dataId) {
    const data = await call({ engine: 'google_maps_reviews', data_id: dataId, hl: 'en', sort_by: 'newestFirst' });
    return {
      place: { title: String(data.place_info?.title ?? ''), rating: Number(data.place_info?.rating) || null, reviews: Number(data.place_info?.reviews) || 0 },
      reviews: (data.reviews ?? []).map((item) => ({
        rating: Number(item.rating) || 0,
        date: String(item.iso_date ?? item.date ?? ''),
        when: String(item.date ?? ''),
        text: String(item.snippet ?? item.extracted_snippet?.original ?? ''),
        authorReviews: Number(item.user?.reviews) || 0,
        reply: item.response ? { date: String(item.response.iso_date ?? item.response.date ?? ''), text: String(item.response.snippet ?? '') } : null,
      })),
    };
  }

  /** The account's remaining searches; free, uses none. */
  async function test() {
    const query = new URLSearchParams({ api_key: key });
    const { response, data } = await request('SerpApi', fetchImpl, `${base}/account.json?${query}`, {}, 20_000);
    if (!response.ok || data?.error) throw new ProviderError('SerpApi', 'key', 'SerpApi doesn’t accept this key. Check it in Settings → Integrations.', { status: response.status });
    return { left: data.total_searches_left ?? data.plan_searches_left ?? null, plan: data.plan_name ?? '' };
  }

  return { maps, reviews, test };
}
