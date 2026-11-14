import { h, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get } from '../lib/api.js';
import { session } from '../lib/session.js';
import { show, setTitle } from '../lib/shell.js';
import { card, cardHead, codeBlock, notice, pageHead, pageSkeleton, toastError } from '../lib/ui.js';
import { bars, chart, donut } from '../lib/charts.js';
import { change, country, date, flag, number, relative } from '../lib/format.js';

/**
 * Visits to the site, counted by the admin's own cookie-free beacon: how
 * many, from where, on what, and which projects people open.
 */

const PAGE_NAMES = { '/': 'Home', '/works': 'Work page', '/contact': 'Contact & booking', '/deck': 'The deck' };

export default async function analytics({ query }) {
  setTitle('Analytics');
  show(pageSkeleton());
  let span = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
  let data;
  let projects;
  try {
    [data, projects] = await Promise.all([get(`/api/analytics?days=${span}`), get('/api/projects').catch(() => null)]);
  } catch (error) {
    toastError(error);
    return;
  }
  const titles = new Map([...(projects?.design ?? []).map((p) => [p.slug, p.title]), ...(projects?.systems ?? []).map((s) => [s.slug, s.title])]);
  const holder = h('div.stack.loose');
  const range = h('div.segmented', { role: 'group', 'aria-label': 'Range' });

  const kpi = (label, glyph, now, before, foot) => {
    const pct = change(now, before);
    return h(
      'div.card.stat',
      h('div.stat-label', icon(glyph), label),
      h('div.stat-value', number(now)),
      h('div.stat-foot', pct === null ? h('span', 'No earlier period to compare') : h('span.row', { style: { gap: '4px' } }, h(`span.delta.${pct >= 0 ? 'up' : 'down'}`, icon(pct >= 0 ? 'trendUp' : 'trendDown'), `${Math.abs(pct)}%`), foot)),
    );
  };

  const setup = () =>
    card(
      cardHead('Count visits to the site'),
      session.hosted
        ? h(
            'div.card-body.stack',
            h('p.small.muted', 'The admin counts page views itself: no cookies, no third party, and visitors aren’t followed from one day to the next.'),
            notice('No visits yet. The site counts them once it’s connected to this backend: set ADMIN_BACKEND_URL (and ADMIN_PROXY_SECRET) where the site is built and redeploy it. Its pages then load the counter, and bookings and deck downloads are counted too.', { glyph: 'info' }),
            h('p.small.muted', 'Another site can count into the same place with this tag, once its address is allowed in Settings → Integrations:'),
            codeBlock(`<script defer src="${location.origin}${withBase('/beacon.js')}"></script>`),
          )
        : h(
        'div.card-body.stack',
        h('p.small.muted', 'The admin counts page views itself: no cookies, no third party, and visitors aren’t followed from one day to the next. Add this line to the site’s <head> (in src/app/layout.tsx) once the admin is reachable from the internet:'),
        codeBlock(`<script defer src="${location.origin}${withBase('/beacon.js')}"></script>`),
        h('p.small.muted', 'Then add the site’s address to the allowed origins in Settings → Integrations, so the admin accepts its counts. Allowed now: ', data.origins.length ? data.origins.join(', ') : 'none', '.'),
        notice('Running the admin only on this computer? Visits from the live site can’t reach it here. Host the admin (see Admin/README.md), or use Cloudflare Web Analytics in the meantime.'),
      ),
    );

  const draw = () => {
    range.replaceChildren(...[7, 30, 90].map((days) => h(`button${span === days ? '.active' : ''}`, { type: 'button', onClick: () => load(days) }, `${days} days`)));
    const t = data.totals;
    const perVisitor = t.visitors ? (t.views / t.visitors).toFixed(1) : '—';
    holder.replaceChildren(
      data.sample && notice('These visits are sample data. Clear them from Settings → Data once real counting starts.', { glyph: 'sparkles' }),
      !data.hasData && setup(),
      h(
        'div.grid.four',
        kpi('Page views', 'eye', t.views, t.previousViews, `vs previous ${span} days`),
        kpi('Visitors', 'users', t.visitors, t.previousVisitors, `vs previous ${span} days`),
        h('div.card.stat', h('div.stat-label', icon('layers'), 'Pages per visitor'), h('div.stat-value', String(perVisitor)), h('div.stat-foot', 'How far people read')),
        h('div.card.stat', h('div.stat-label', icon('pulse'), 'Last visit'), h('div.stat-value', { style: { fontSize: '20px' } }, data.lastHitAt ? relative(data.lastHitAt) : '—'), h('div.stat-foot', data.lastHitAt ? date(data.lastHitAt) : 'No visits yet')),
      ),
      card(
        cardHead('Visits', h('div.legend', h('span', h('i', { style: { background: 'var(--brand)' } }), 'Page views'), h('span', h('i', { style: { background: 'var(--sky)' } }), 'Visitors'))),
        h('div.card-body', chart({ series: [{ name: 'Page views', values: data.series.map((d) => d.views) }, { name: 'Visitors', values: data.series.map((d) => d.visitors), color: 'var(--sky)' }], labels: data.series.map((d) => d.date), height: 240, labelFormat: (l) => date(l), format: number })),
      ),
      h(
        'div.grid.two',
        card(cardHead('Most-opened work'), h('div.card-body', bars(data.projects.map((p) => ({ label: titles.get(p.slug) ?? p.slug, value: p.count })), { format: number, empty: 'No project has been opened yet.' }))),
        card(cardHead('Top pages'), h('div.card-body', bars(data.pages.map((p) => ({ label: PAGE_NAMES[p.name] ?? (p.name.startsWith('/work/') ? titles.get(p.name.slice(6)) ?? p.name : p.name), hint: PAGE_NAMES[p.name] || p.name.startsWith('/work/') ? p.name : '', value: p.count })), { format: number }))),
      ),
      h(
        'div.grid.three',
        card(cardHead('Where they came from'), h('div.card-body', bars(data.referrers.map((r) => ({ label: r.name, value: r.count })), { format: number }))),
        card(cardHead('Devices'), h('div.card-body', data.devices.length ? donut(data.devices.map((d) => ({ label: d.name, value: d.count, color: { Phone: 'var(--brand)', Desktop: 'var(--sky)', Tablet: 'var(--violet)' }[d.name] }))) : h('p.muted.small', 'Nothing yet.'))),
        card(cardHead('Countries'), h('div.card-body', bars(data.countries.map((c) => ({ label: `${flag(c.name)}  ${country(c.name)}`, value: c.count })), { format: number, empty: 'Countries appear when the admin runs behind Cloudflare.' }))),
      ),
      data.events.length ? card(cardHead('Moments'), h('div.card-body', bars(data.events.map((e) => ({ label: e.name, value: e.count })), { format: number }))) : null,
    );
  };

  async function load(days) {
    span = days;
    try {
      data = await get(`/api/analytics?days=${days}`);
      history.replaceState({}, '', withBase(`/analytics?days=${days}`));
      draw();
    } catch (error) {
      toastError(error);
    }
  }

  draw();
  show(pageHead({ title: 'Analytics', text: 'How many people visit, where from, and which work they open.', actions: [range] }), holder);
}
