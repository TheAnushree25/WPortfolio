import { randomToken, sha256 } from './security.mjs';

/**
 * Privacy-first visit counting for the site. A page sends one tiny beacon per
 * page view (Admin/public/beacon.js); the admin keeps only daily totals:
 * views, visitors, pages, referring sites, device sizes and countries. A
 * visitor is counted by a hash of their address and browser salted afresh
 * each day, so nobody can be followed from one day to the next, and no
 * cookie is set.
 */

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|preview|facebookexternalhit|embedly|curl|wget|python|node-fetch/i;

export function dayKey(date = new Date(), timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const blankDay = () => ({ views: 0, visitors: 0, paths: {}, refs: {}, devices: {}, countries: {}, events: {} });
const bump = (bucket, key, by = 1) => {
  if (!key) return;
  bucket[key] = (bucket[key] ?? 0) + by;
};

function device(width, ua) {
  if (/iPad|Tablet/i.test(ua) || (width >= 600 && width < 1024 && /Mobi|Android/i.test(ua))) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(ua) || (width && width < 768)) return 'Phone';
  if (width && width < 1024) return 'Tablet';
  return 'Desktop';
}

function referrerHost(referrer, ownHosts) {
  if (!referrer) return 'Direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (ownHosts.includes(host)) return null;
    if (/(^|\.)google\./.test(host)) return 'Google';
    if (/instagram\.com$|^l\.instagram\.com$/.test(host)) return 'Instagram';
    if (/linkedin\.com$|lnkd\.in$/.test(host)) return 'LinkedIn';
    if (/(^|\.)bing\.com$/.test(host)) return 'Bing';
    if (/t\.co$|twitter\.com$|x\.com$/.test(host)) return 'X';
    if (/facebook\.com$|fb\.me$/.test(host)) return 'Facebook';
    if (/behance\.net$/.test(host)) return 'Behance';
    return host;
  } catch {
    return 'Direct';
  }
}

export class Analytics {
  constructor({ db, timeZone }) {
    this.db = db;
    this.timeZone = timeZone;
    this.seen = null;
  }

  #today() {
    const a = this.db.data.analytics;
    const today = dayKey(new Date(), this.timeZone);
    if (a.today?.date !== today) {
      a.today = { date: today, salt: randomToken(16), visitors: [] };
      this.seen = new Set();
    }
    this.seen ??= new Set(a.today.visitors);
    a.days[today] ??= blankDay();
    return { a, today, day: a.days[today] };
  }

  /** Records one page view (or a named event). Returns false when it isn't counted. */
  record({ path, referrer, width, ua = '', ip = '', country = '', event = '', ownHosts = [] }) {
    if (BOT.test(ua)) return false;
    const { a, day } = this.#today();
    if (event) {
      bump(day.events, String(event).slice(0, 40));
      this.db.save();
      return true;
    }
    const clean = typeof path === 'string' && path.startsWith('/') ? path.split(/[?#]/)[0].slice(0, 160) : null;
    if (!clean) return false;
    day.views++;
    const visitor = sha256(`${a.today.salt}|${ip}|${ua}`).slice(0, 20);
    if (!this.seen.has(visitor)) {
      this.seen.add(visitor);
      if (a.today.visitors.length < 50_000) a.today.visitors.push(visitor);
      day.visitors++;
    }
    bump(day.paths, clean);
    bump(day.refs, referrerHost(referrer, ownHosts));
    bump(day.devices, device(Number(width) || 0, ua));
    if (/^[A-Z]{2}$/.test(country) && country !== 'XX') bump(day.countries, country);
    a.lastHitAt = new Date().toISOString();
    this.#prune();
    this.db.save();
    return true;
  }

  #prune() {
    const days = Object.keys(this.db.data.analytics.days).sort();
    for (const key of days.slice(0, Math.max(0, days.length - 400))) delete this.db.data.analytics.days[key];
  }

  /** Totals, a daily series and the top lists for the last `span` days, with the span before it for comparison. */
  report(span = 30) {
    const { days, lastHitAt = null } = this.db.data.analytics;
    const keys = [];
    const now = Date.now();
    for (let i = span * 2 - 1; i >= 0; i--) keys.push(dayKey(new Date(now - i * 86_400_000), this.timeZone));
    const current = keys.slice(span);
    const previous = keys.slice(0, span);
    const sum = (list, field) => list.reduce((total, key) => total + (days[key]?.[field] ?? 0), 0);
    const merge = (field) => {
      const out = {};
      for (const key of current) for (const [name, count] of Object.entries(days[key]?.[field] ?? {})) out[name] = (out[name] ?? 0) + count;
      return Object.entries(out)
        .map(([name, count]) => ({ name, count }))
        .sort((x, y) => y.count - x.count);
    };
    const pages = merge('paths');
    return {
      span,
      series: current.map((key) => ({ date: key, views: days[key]?.views ?? 0, visitors: days[key]?.visitors ?? 0 })),
      totals: { views: sum(current, 'views'), visitors: sum(current, 'visitors'), previousViews: sum(previous, 'views'), previousVisitors: sum(previous, 'visitors') },
      pages: pages.slice(0, 12),
      projects: pages.filter((page) => page.name.startsWith('/work/')).map((page) => ({ ...page, slug: page.name.slice(6) })).slice(0, 10),
      referrers: merge('refs').slice(0, 10),
      devices: merge('devices'),
      countries: merge('countries').slice(0, 10),
      events: merge('events').slice(0, 10),
      lastHitAt,
      hasData: Object.keys(days).length > 0,
    };
  }
}

/** The script a site page loads to count its views. The admin's own address is read from the script tag, so it works wherever the admin is served. */
export const BEACON = `/* Atlas Studios visit counter: one page view per page, no cookies. */
(function () {
  var script = document.currentScript;
  if (!script || navigator.doNotTrack === '1' || window.__atlasBeacon) return;
  window.__atlasBeacon = true;
  var endpoint = new URL('api/public/collect', script.src).href;
  var last = '';
  function send() {
    if (location.pathname === last) return;
    last = location.pathname;
    var body = JSON.stringify({ p: location.pathname, r: document.referrer, w: window.innerWidth });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }));
      else fetch(endpoint, { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'text/plain' } });
    } catch (e) {}
  }
  send();
  var push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    setTimeout(send, 0);
  };
  window.addEventListener('popstate', function () { setTimeout(send, 0); });
})();
`;
