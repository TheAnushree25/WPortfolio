import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Reading pages from the open web, carefully. A researched business's
 * “website” is whatever someone typed, so it could point anywhere: only
 * http(s) on the usual ports, never an address inside a private network
 * (checked again on every redirect), a hard time limit, a size cap, and text
 * only. Also turns a page's HTML into plain text and the few facts the
 * research cares about (title, generator, phones, emails, social links).
 */

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const PRIVATE_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const v4 = (ip) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
const inRange = (ip, [base, bits]) => Math.floor(v4(ip) / 2 ** (32 - bits)) === Math.floor(v4(base) / 2 ** (32 - bits));

/** Whether an IP address is on the public internet (not loopback, private, link-local, shared or reserved). */
export function isPublicAddress(ip) {
  if (net.isIPv4(ip)) return !PRIVATE_V4.some((range) => inRange(ip, range));
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === '::' || lower === '::1') return false;
    return !/^(fc|fd|fe[89ab]|ff)/.test(lower);
  }
  return false;
}

export class FetchProblem extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Resolves a host and refuses it unless every address it has is public. */
async function checkHost(hostname, lookup) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new FetchProblem('private', `${host} is a private address.`);
    return;
  }
  if (!host.includes('.') || /\.(local|localhost|internal|lan|home|corp)$/i.test(host)) throw new FetchProblem('private', `${host} isn’t a public address.`);
  let addresses;
  try {
    addresses = await lookup(host);
  } catch {
    throw new FetchProblem('dns', `${host} doesn’t resolve.`);
  }
  if (!addresses.length) throw new FetchProblem('dns', `${host} doesn’t resolve.`);
  if (addresses.some((item) => !isPublicAddress(item.address ?? item))) throw new FetchProblem('private', `${host} points inside a private network.`);
}

const defaultLookup = (host) => dns.lookup(host, { all: true, verbatim: true });

/**
 * Fetches a public web page. Resolves to { status, url (after redirects),
 * contentType, text, headers } or throws a FetchProblem. Non-text answers
 * keep their status but no text.
 */
export async function safeFetch(rawUrl, { timeout = 10_000, maxBytes = 1_500_000, fetchImpl = globalThis.fetch, lookup = defaultLookup, headers = {} } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchProblem('invalid', `“${rawUrl}” isn’t a web address.`);
  }
  const signal = AbortSignal.timeout(timeout);
  for (let hop = 0; hop <= 5; hop++) {
    if (!['http:', 'https:'].includes(url.protocol)) throw new FetchProblem('invalid', 'Only web addresses (http and https) can be read.');
    if (url.port && !['80', '443'].includes(url.port)) throw new FetchProblem('invalid', 'Only the usual web ports can be read.');
    await checkHost(url.hostname, lookup);
    let response;
    try {
      response = await fetchImpl(url.href, {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'accept-language': 'en-IN,en;q=0.9', ...headers },
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new FetchProblem('timeout', `${url.hostname} took too long to answer.`);
      const code = error?.cause?.code ?? '';
      if (/CERT|SSL|TLS/i.test(code)) throw new FetchProblem('tls', `${url.hostname} has a broken security certificate (${code}).`);
      if (code === 'ENOTFOUND') throw new FetchProblem('dns', `${url.hostname} doesn’t resolve.`);
      throw new FetchProblem('network', `${url.hostname} couldn’t be reached${code ? ` (${code})` : ''}.`);
    }
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
      await response.body?.cancel().catch(() => {});
      url = new URL(response.headers.get('location'), url);
      continue;
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const textual = !contentType || /text\/|html|xml|json/.test(contentType);
    let text = '';
    if (textual && response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          chunks.push(value);
          if (size >= maxBytes) {
            await reader.cancel().catch(() => {});
            break;
          }
        }
      } catch (error) {
        if (!chunks.length) throw new FetchProblem('timeout', `${url.hostname} stopped answering (${error?.name ?? 'error'}).`);
      }
      text = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    } else {
      await response.body?.cancel().catch(() => {});
    }
    return { status: response.status, ok: response.ok, url: url.href, contentType, text, headers: response.headers };
  }
  throw new FetchProblem('redirects', 'Too many redirects.');
}

/* ------------------------------------------------------------------ HTML to text */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', trade: '™', rupee: '₹', bull: '•', middot: '·' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(value) ? String.fromCodePoint(value) : match;
      } catch {
        return match;
      }
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** The readable text of an HTML page, one block per line. */
export function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|li|ul|ol|h[1-6]|tr|table|blockquote|address|nav|main|aside|figure|figcaption|dd|dt)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
}

const attr = (tag, name) => {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? '') : '';
};

const SOCIAL_HOSTS = { facebook: /(^|\.)facebook\.com$|(^|\.)fb\.com$/, instagram: /(^|\.)instagram\.com$/, linkedin: /(^|\.)linkedin\.com$/, youtube: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, x: /(^|\.)twitter\.com$|(^|\.)x\.com$/, whatsapp: /(^|\.)wa\.me$|(^|\.)whatsapp\.com$/ };

/** What a page says about itself: title, description, the site builder, links out, phones, emails, copyright years. */
export function readPage(html, pageUrl) {
  const source = String(html);
  const head = source.slice(0, 200_000);
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '').replace(/\s+/g, ' ').trim());
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key) => {
    const found = metas.find((tag) => new RegExp(`(name|property)\\s*=\\s*["']?${key}["']?`, 'i').test(tag));
    return found ? attr(found, 'content').trim() : '';
  };
  const links = [];
  for (const tag of source.match(/<a\b[^>]*href\s*=[^>]*>/gi) ?? []) {
    const href = attr(tag, 'href');
    if (!href) continue;
    try {
      links.push(new URL(href, pageUrl).href);
    } catch {
      /* a broken link is skipped */
    }
  }
  const socials = {};
  for (const link of links) {
    let host;
    try {
      host = new URL(link).hostname.toLowerCase();
    } catch {
      continue;
    }
    for (const [name, re] of Object.entries(SOCIAL_HOSTS)) if (re.test(host) && !socials[name]) socials[name] = link;
  }
  const text = htmlToText(source);
  const builder = detectBuilder(source, meta('generator'));
  const years = [...new Set([...text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d\d|19\d\d)/gi)].map((match) => Number(match[1])))].sort();
  return {
    title,
    description: meta('description') || meta('og:description'),
    generator: meta('generator'),
    builder,
    viewport: Boolean(meta('viewport')),
    links,
    socials,
    tel: [...new Set(links.filter((link) => link.startsWith('tel:')).map((link) => decodeURIComponent(link.slice(4))))],
    mail: [...new Set(links.filter((link) => link.startsWith('mailto:')).map((link) => decodeURIComponent(link.slice(7).split('?')[0]).toLowerCase()))],
    copyrightYears: years,
    parked: /domain (is )?(for sale|may be for sale)|buy this domain|this domain (has expired|is parked)|parked (free|domain)|sedo|dan\.com|afternic|hugedomains/i.test(text.slice(0, 5000)),
    text,
  };
}

function detectBuilder(html, generator) {
  const sample = html.slice(0, 400_000);
  if (/wix\.com|wixstatic\.com|_wixCIDX|X-Wix/i.test(sample)) return 'Wix';
  if (/wp-content|wp-includes|wordpress/i.test(sample) || /wordpress/i.test(generator)) return 'WordPress';
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(sample)) return 'Shopify';
  if (/squarespace/i.test(sample)) return 'Squarespace';
  if (/webflow/i.test(sample)) return 'Webflow';
  if (/blogger\.com|blogspot/i.test(sample)) return 'Blogger';
  if (/godaddy|websitebuilder/i.test(sample)) return 'GoDaddy Website Builder';
  if (/sites\.google\.com/i.test(sample)) return 'Google Sites';
  if (/__next|_next\/static/i.test(sample)) return 'Next.js';
  if (/joomla/i.test(sample) || /joomla/i.test(generator)) return 'Joomla';
  return generator ? generator.split(/\s+/)[0] : '';
}
