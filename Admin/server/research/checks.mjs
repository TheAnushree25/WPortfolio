import dns from 'node:dns/promises';
import { FREE_MAIL, domainOf, phoneDisplay, phoneKey } from './input.mjs';
import { FetchProblem, readPage, safeFetch } from './net.mjs';
import { coreName, squash } from './anchors.mjs';

/**
 * The checks code can do without any AI, all free: is the domain still
 * registered (RDAP, the public registry lookup), does the website open and
 * what is it built with, how long has the Internet Archive known it, does
 * email run on the business's own domain, how fast is the site on a phone
 * (Google PageSpeed), and what Google Maps shows (through SerpApi). Each
 * check returns what it found plus the facts it proves, labelled confirmed.
 */

const DAY = 86_400_000;
const isoDay = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const monthYear = (value) => (value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

async function json(fetchImpl, url, timeout) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json, application/rdap+json' }, signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

const resolverDefault = { resolveNs: (host) => dns.resolveNs(host), resolveMx: (host) => dns.resolveMx(host) };

/** Whether a domain is registered, since when and until when (RDAP), and its name servers. */
export async function checkDomain(domain, { fetchImpl = globalThis.fetch, resolver = resolverDefault } = {}) {
  const out = { domain, registered: null, created: '', expires: '', registrar: '', nameservers: [], url: `https://rdap.org/domain/${domain}` };
  try {
    out.nameservers = (await resolver.resolveNs(domain)).map((item) => String(item).toLowerCase()).sort();
  } catch {
    out.nameservers = [];
  }
  try {
    const { status, data } = await json(fetchImpl, out.url, 12_000);
    if (status === 200 && data) {
      out.registered = true;
      const event = (action) => (data.events ?? []).find((item) => item.eventAction === action)?.eventDate ?? '';
      out.created = isoDay(event('registration'));
      out.expires = isoDay(event('expiration'));
      const registrar = (data.entities ?? []).find((item) => (item.roles ?? []).includes('registrar'));
      out.registrar = String(registrar?.vcardArray?.[1]?.find?.((row) => row[0] === 'fn')?.[3] ?? '');
    } else if (status === 404) {
      out.registered = out.nameservers.length > 0 ? true : false;
    }
  } catch {
    out.registered = out.nameservers.length > 0 ? true : null;
  }
  return out;
}

/** Opens the website the way a visitor would and reads what it says about itself. */
export async function checkWebsite(url, { fetchImpl = globalThis.fetch, lookup } = {}) {
  const domain = domainOf(url);
  const attempts = [/^http:\/\//i.test(url) ? url.replace(/^http:/i, 'https:') : url];
  attempts.push(attempts[0].replace(/^https:/i, 'http:'));
  let problem = null;
  for (const attempt of attempts) {
    try {
      const page = await safeFetch(attempt, { fetchImpl, ...(lookup && { lookup }), timeout: 12_000 });
      const read = page.text && /html|text/.test(page.contentType || 'text/html') ? readPage(page.text, page.url) : null;
      return {
        url: attempt,
        domain,
        opens: page.ok,
        status: page.status,
        finalUrl: page.url,
        https: page.url.startsWith('https:'),
        movedTo: domainOf(page.url) !== domain ? domainOf(page.url) : '',
        title: read?.title ?? '',
        description: read?.description ?? '',
        builder: read?.builder ?? '',
        viewport: read?.viewport ?? false,
        parked: read?.parked ?? false,
        copyrightYears: read?.copyrightYears ?? [],
        socials: read?.socials ?? {},
        tel: read?.tel ?? [],
        mail: read?.mail ?? [],
        links: (read?.links ?? []).filter((link) => /^https?:/i.test(link) && domainOf(link) === domainOf(page.url)).slice(0, 120),
        text: (read?.text ?? '').slice(0, 30_000),
        problem: page.ok ? null : `answers ${page.status}`,
      };
    } catch (error) {
      problem = error instanceof FetchProblem ? error.message : String(error?.message ?? error);
      if (error instanceof FetchProblem && ['private', 'invalid'].includes(error.code)) break;
    }
  }
  return { url, domain, opens: false, status: 0, finalUrl: '', https: false, problem, title: '', builder: '', viewport: false, parked: false, copyrightYears: [], socials: {}, tel: [], mail: [], text: '' };
}

/** How many times the Internet Archive saved the site, and when first and last. */
export async function checkArchive(domain, { fetchImpl = globalThis.fetch } = {}) {
  const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp&filter=statuscode:200&collapse=digest&limit=5000`;
  try {
    const { status, data } = await json(fetchImpl, url, 20_000);
    if (status !== 200 || !Array.isArray(data)) return { domain, snapshots: null };
    const rows = data.slice(1).map((row) => String(row[0]));
    const stamp = (value) => (value ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : '');
    return { domain, snapshots: rows.length, first: stamp(rows[0]), last: stamp(rows.at(-1)), url: rows.length ? `https://web.archive.org/web/${rows.at(-1)}/${domain}` : `https://web.archive.org/web/*/${domain}` };
  } catch {
    return { domain, snapshots: null };
  }
}

/** Whether each email address is on a free provider or on a domain with its own mail servers. */
export async function checkEmail(emails, { resolver = resolverDefault } = {}) {
  const list = [];
  for (const address of emails) {
    const domain = address.split('@')[1] ?? '';
    const free = FREE_MAIL.has(domain);
    let mx = null;
    if (!free && domain) {
      try {
        mx = (await resolver.resolveMx(domain)).length > 0;
      } catch {
        mx = false;
      }
    }
    list.push({ address, domain, free, mx });
  }
  return { list, freeOnly: list.length > 0 && list.every((item) => item.free) };
}

/** Google PageSpeed on a phone: the performance score and how long the main content takes to show. */
export async function checkSpeed(url, { fetchImpl = globalThis.fetch, key = '' } = {}) {
  const query = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', ...(key && { key }) });
  try {
    const { status, data } = await json(fetchImpl, `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, 50_000);
    if (status !== 200 || !data?.lighthouseResult) return { url, score: null, problem: data?.error?.message ? String(data.error.message).slice(0, 160) : `PageSpeed answered ${status}` };
    const audits = data.lighthouseResult.audits ?? {};
    return { url, score: Math.round((data.lighthouseResult.categories?.performance?.score ?? 0) * 100), lcp: String(audits['largest-contentful-paint']?.displayValue ?? '').replace(/ /g, ' ') };
  } catch (error) {
    return { url, score: null, problem: error?.name === 'TimeoutError' ? 'PageSpeed took too long' : 'PageSpeed couldn’t be reached' };
  }
}

/** Finds the business on Google Maps (SerpApi) and reads its newest reviews and the owner's replies. Two searches at most. */
export async function checkMaps(input, anchors, serp) {
  const where = input.pincode || input.city || '';
  const query = [input.business, where].filter(Boolean).join(' ');
  const listings = await serp.maps(query);
  const core = anchors.core || coreName(input.business);
  let match = null;
  let matchedBy = '';
  for (const item of listings) {
    if (item.phone && anchors.phones.includes(phoneKey(item.phone))) [match, matchedBy] = [item, 'phone'];
    else if (!match && item.website && anchors.domains.includes(domainOf(item.website))) [match, matchedBy] = [item, 'website'];
  }
  if (!match) {
    const named = listings.filter((item) => ` ${squash(item.title)} `.includes(` ${core} `));
    const placed = named.find((item) => (input.pincode && item.address.includes(input.pincode)) || (input.city && squash(item.address).includes(squash(input.city))));
    if (placed) [match, matchedBy] = [placed, 'name and place'];
    else if (named.length === 1 && listings.length <= 3) [match, matchedBy] = [named[0], 'name'];
  }
  if (!match) return { found: false, query, candidates: listings.length, names: listings.slice(0, 4).map((item) => `${item.title}, ${item.address}`) };
  const out = { found: true, query, matchedBy, listing: match, candidates: listings.length, reviews: null };
  if (match.dataId) {
    const { reviews } = await serp.reviews(match.dataId);
    const recent = reviews.slice(0, 10);
    const fiveStar = recent.filter((item) => item.rating === 5);
    out.reviews = {
      read: recent.length,
      replied: recent.filter((item) => item.reply?.text).length,
      negative: recent.filter((item) => item.rating && item.rating <= 2).length,
      fiveStar: fiveStar.length,
      fiveStarOneReview: fiveStar.filter((item) => item.authorReviews === 1).length,
      newest: recent[0]?.date ?? '',
      oldest: recent.at(-1)?.date ?? '',
      samples: recent.slice(0, 6).map((item) => ({ rating: item.rating, when: item.when, text: item.text.slice(0, 280), replied: Boolean(item.reply?.text) })),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ Checks as facts */

/**
 * Turns the checks into facts for the review screen and the documents. Every
 * one is proven by code, so it is confirmed; `shareable` marks what may go
 * on the one page sent to the business.
 */
export function factsFromChecks(checks, input, now = new Date()) {
  const facts = [];
  const add = (section, label, textValue, url, { shareable = true, flag = '' } = {}) => facts.push({ section, label, text: textValue, quote: '', url, sourceId: 'check', origin: 'check', confidence: 'confirmed', identity: 'strong', verified: true, shareable, include: true, flag });
  const domain = checks.domain;
  const site = checks.website;
  if (domain?.registered === false) add('online', 'Website domain lapsed', `${domain.domain} is no longer registered, so anyone can buy it.`, domain.url, { flag: 'problem' });
  else if (domain?.registered && domain.expires) {
    const days = Math.round((Date.parse(domain.expires) - now.getTime()) / DAY);
    if (days < 0) add('online', 'Website domain expired', `${domain.domain} expired on ${domain.expires} and is in its grace period.`, domain.url, { flag: 'problem' });
    else if (days < 75) add('online', 'Domain expires soon', `${domain.domain} expires on ${domain.expires}, in ${days} days.`, domain.url, { flag: 'problem' });
    else add('online', 'Domain registered', `${domain.domain} is registered until ${domain.expires}${domain.registrar ? ` (registrar: ${domain.registrar})` : ''}.`, domain.url, { shareable: false });
  }
  if (site) {
    if (!site.opens && domain?.registered !== false) add('online', 'Website doesn’t open', `${site.domain} doesn’t open: ${site.problem ?? 'no answer'}.`, site.url, { flag: 'problem' });
    if (site.opens && site.parked) add('online', 'Parked domain', `${site.domain} shows a parked or “domain for sale” page instead of the business.`, site.finalUrl, { flag: 'problem' });
    if (site.opens && !site.parked) {
      const year = site.copyrightYears.at(-1);
      add('online', 'Website', `The website opens${site.builder ? ` and is built with ${site.builder}` : ''}${site.https ? '' : ', without a secure (https) connection'}${year && year < now.getFullYear() - 1 ? `; its copyright line still says ${year}` : ''}.`, site.finalUrl, { flag: site.https && !(year && year < now.getFullYear() - 1) ? '' : 'problem' });
      if (!site.viewport) add('online', 'Not built for phones', 'The website isn’t set up for phone screens (it has no mobile viewport).', site.finalUrl, { flag: 'problem' });
      if (site.movedTo) add('online', 'Website redirects', `${site.domain} sends visitors on to ${site.movedTo}.`, site.finalUrl, { shareable: false });
    }
  }
  if (checks.archive?.snapshots) add('online', 'Website history', `The Internet Archive holds ${checks.archive.snapshots} saved copies of ${checks.archive.domain}, from ${monthYear(checks.archive.first)} to ${monthYear(checks.archive.last)}.`, checks.archive.url, { shareable: false });
  if (checks.email?.freeOnly) add('online', 'No email on its own domain', `Email runs on ${[...new Set(checks.email.list.map((item) => item.domain))].join(' and ')} (${checks.email.list.map((item) => item.address).join(', ')}); there’s no address on the business’s own domain.`, '', { flag: 'problem' });
  const speed = checks.speed;
  if (speed?.score !== null && speed?.score !== undefined) add('online', 'Speed on phones', `Google PageSpeed gives the site ${speed.score}/100 on a phone${speed.lcp ? `; the main content takes ${speed.lcp} to appear` : ''}.`, `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(speed.url)}&form_factor=mobile`, { flag: speed.score < 50 ? 'problem' : '' });
  const maps = checks.maps;
  if (maps?.found) {
    const l = maps.listing;
    add('online', 'Google Maps', `Google Maps: ${l.rating ? `${l.rating}★ from ${l.reviews} reviews` : 'no rating yet'}${l.website ? `; website linked (${domainOf(l.website)})` : '; no website linked'}${l.hours ? `; ${l.hours}` : ''}.`, l.url, { flag: l.website ? '' : 'problem' });
    if (l.phone) add('contact', 'Phone on Google Maps', `Google Maps lists ${phoneDisplay(l.phone)}${input.phones.length && !input.phones.some((item) => phoneKey(item) === phoneKey(l.phone)) ? ', a number not among the ones you typed' : ''}.`, l.url, { shareable: false });
    if (l.address) add('business', 'Address on Google Maps', l.address, l.url, { shareable: false });
    const r = maps.reviews;
    if (r?.read) {
      add('online', 'Review replies', `${r.replied} of the ${r.read} newest Google reviews have a reply from the business.`, l.url, { flag: r.replied < r.read / 2 ? 'problem' : '' });
      if (r.negative >= 2) add('online', 'Recent complaints', `${r.negative} of the ${r.read} newest reviews give one or two stars.`, l.url, { shareable: false });
      if (r.fiveStar >= 3 && r.fiveStarOneReview / r.fiveStar >= 0.5) add('online', 'Thin five-star reviews', `${r.fiveStarOneReview} of the ${r.fiveStar} newest five-star ratings come from accounts with a single review.`, l.url, { shareable: false });
    }
  } else if (maps && !maps.error) {
    add('online', 'Not found on Google Maps', `A Google Maps search for “${maps.query}” didn’t show this business${maps.candidates ? ` (it found ${maps.candidates} other places)` : ''}.`, '', { flag: 'problem', shareable: false });
  }
  if (site?.socials && Object.keys(site.socials).length) add('online', 'Social links on the website', `The website links to ${Object.keys(site.socials).join(', ')}.`, site.finalUrl, { shareable: false });
  return facts;
}
