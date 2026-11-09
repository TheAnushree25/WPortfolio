/** Numbers, money, sizes and dates, the way the studio reads them (Indian grouping, India time). */

export const STUDIO_ZONE = 'Asia/Kolkata';
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('en-IN');

export const money = (value) => inr.format(Math.round(value || 0));
export const number = (value) => plain.format(value || 0);

/** ₹2.8L, ₹1.2Cr, ₹45k */
export function moneyShort(value) {
  const n = Math.round(value || 0);
  if (n >= 1e7) return `₹${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `₹${trim(n / 1e5)}L`;
  if (n >= 1e3) return `₹${trim(n / 1e3)}k`;
  return `₹${n}`;
}
const trim = (n) => (n >= 100 ? Math.round(n) : Number(n.toFixed(1))).toString();

export function bytes(value) {
  const n = value || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function percent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

/** Change from `before` to `now`, as a whole percentage, or null when there's nothing to compare. */
export function change(now, before) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 100);
}

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function relative(iso) {
  if (!iso) return '';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return diff < 0 ? 'just now' : 'in a moment';
  const units = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2629800],
    ['year', 31557600],
  ];
  let unit = 'minute';
  let size = 60;
  for (const [name, seconds] of units) {
    if (abs >= seconds) {
      unit = name;
      size = seconds;
    }
  }
  return relativeFormat.format(Math.round(diff / size), unit);
}

export function date(iso, options = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: options.year ? 'numeric' : undefined, timeZone: options.zone ?? viewerZone }).format(new Date(iso));
}

export function dateTime(iso, { zone = viewerZone, weekday = true } = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', { weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(new Date(iso));
}

export function time(iso, zone = viewerZone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(new Date(iso));
}

export function dayLabel(iso, zone = viewerZone) {
  const d = new Date(iso);
  const key = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(value);
  const today = key(new Date());
  const tomorrow = key(new Date(Date.now() + 86_400_000));
  const yesterday = key(new Date(Date.now() - 86_400_000));
  const k = key(d);
  if (k === today) return 'Today';
  if (k === tomorrow) return 'Tomorrow';
  if (k === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(d);
}

// Browsers name India's zone Asia/Kolkata or the older Asia/Calcutta; compare the clocks, not the names.
const studioOffset = (() => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: STUDIO_ZONE, timeZoneName: 'shortOffset' }).formatToParts(new Date());
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(parts.find((p) => p.type === 'timeZoneName')?.value ?? '');
  return match ? -(Number(match[1]) * 60 + Math.sign(Number(match[1])) * Number(match[2] ?? 0)) : -330;
})();
export const zones = { studio: STUDIO_ZONE, viewer: viewerZone, sameAsStudio: new Date().getTimezoneOffset() === studioOffset };

/** “Due today”, “Overdue 3 days”, “Tomorrow”, “in 4 days”. */
export function dueLabel(iso) {
  const days = Math.floor((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days < -1) return `Overdue ${-days - 1 || 1} day${-days - 1 > 1 ? 's' : ''}`;
  if (days === -1 || days === 0) return Date.parse(iso) < Date.now() ? 'Due today' : 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function greeting(name = '') {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: viewerZone }).format(new Date()));
  const part = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export function plural(count, one, many = `${one}s`) {
  return `${number(count)} ${count === 1 ? one : many}`;
}

/** A regional-indicator flag for a two-letter country code. */
export function flag(code = '') {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
export const country = (code) => {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

export function slugify(text = '') {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
