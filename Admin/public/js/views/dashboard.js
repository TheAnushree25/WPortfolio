import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session } from '../lib/session.js';
import { card, cardHead, empty, pageSkeleton, sampleBadge, statusPill, toastError } from '../lib/ui.js';
import { chart, funnel, ring, sparkline } from '../lib/charts.js';
import { change, dateTime, dueLabel, greeting, initials, moneyShort, number, relative, time, zones, date } from '../lib/format.js';

const STATUS_COLORS = { new: 'var(--brand)', contacted: 'var(--sky)', meeting: 'var(--violet)', proposal: 'var(--warning)', won: 'var(--success)', lost: 'var(--faint)' };
const LEVEL_ICON = { error: 'alertCircle', warning: 'alert', info: 'info', ok: 'checkCircle' };

function delta(now, before, { suffix = 'vs last week' } = {}) {
  const pct = change(now, before);
  if (pct === null) return h('span', 'New this week');
  if (pct === 0) return h('span', `Same as last week`);
  return h('span.row', { style: { gap: '4px' } }, h(`span.delta.${pct > 0 ? 'up' : 'down'}`, icon(pct > 0 ? 'trendUp' : 'trendDown'), `${Math.abs(pct)}%`), suffix);
}

function stat({ label, glyph, value, foot, spark = null, href = null }) {
  const body = [h('div.stat-label', icon(glyph), label), h('div.stat-value', value), h('div.stat-foot', foot), spark];
  return href ? h('a.card.stat', { href, style: { color: 'inherit', textDecoration: 'none' } }, body) : h('div.card.stat', body);
}

export default async function dashboard() {
  setTitle('Dashboard');
  show(pageSkeleton());
  let data;
  try {
    data = await get('/api/dashboard');
  } catch (error) {
    toastError(error);
    return;
  }
  const k = data.kpis;
  const can = session.can('editor');

  const hello = h(
    'div.page-head.hello',
    h('div', h('h1', greeting(session.user.name)), h('p', new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), ' · ', k.openCount ? `${k.openCount} open ${k.openCount === 1 ? 'enquiry' : 'enquiries'}, ${k.upcoming} upcoming ${k.upcoming === 1 ? 'meeting' : 'meetings'}.` : 'No open enquiries right now.')),
    h('div.page-actions', can && h('a.btn', { href: '/enquiries?new=1' }, icon('plus'), 'Enquiry'), h('a.btn.primary', { href: '/publish' }, icon('rocket'), k.changes ? `Publish ${k.changes} ${k.changes === 1 ? 'change' : 'changes'}` : 'Publish')),
  );

  const stats = h(
    'div.grid.four',
    stat({ label: 'New enquiries · 7 days', glyph: 'inbox', value: number(k.newEnquiries), foot: delta(k.newEnquiries, k.newEnquiriesBefore), href: '/enquiries', spark: sparkline(data.series.slice(-14).map((d) => d.count)) }),
    stat({ label: 'Open pipeline', glyph: 'rupee', value: moneyShort(k.pipeline), foot: h('span', `${k.openCount} open${k.winRate !== null ? ` · ${k.winRate}% won` : ''}`), href: '/enquiries' }),
    stat({ label: 'Upcoming meetings', glyph: 'calendar', value: number(k.upcoming), foot: h('span', data.upcoming[0] ? `Next: ${dateTime(data.upcoming[0].start)}` : 'Nothing booked'), href: '/meetings' }),
    stat({ label: 'Site visits · 7 days', glyph: 'chart', value: data.visits.hasData ? number(k.visits) : '—', foot: data.visits.hasData ? delta(k.visits, k.visitsBefore) : h('span', 'Not counting yet'), href: '/analytics', spark: data.visits.hasData ? sparkline(data.visits.series.map((d) => d.views), { color: 'var(--sky)' }) : null }),
  );

  const enquiriesChart = card(
    cardHead('Enquiries, last 30 days', h('a.btn.small.ghost', { href: '/enquiries' }, 'Open', icon('arrowRight'))),
    h('div.card-body', data.series.some((d) => d.count) ? chart({ kind: 'bars', series: [{ name: 'Enquiries', values: data.series.map((d) => d.count) }], labels: data.series.map((d) => d.date), height: 170, labelFormat: (l) => date(l) }) : empty({ glyph: 'inbox', title: 'No enquiries in the last month', text: 'New ones from the site or Calendly appear here.' })),
  );

  const pipeline = card(
    cardHead('Pipeline'),
    h('div.card-body', funnel(data.pipeline.map((row) => ({ ...row, color: STATUS_COLORS[row.status] })), { format: (row) => (row.value ? `${row.count} · ${moneyShort(row.value)}` : String(row.count)) })),
  );

  const health = card(
    cardHead('Site health', h('a.btn.small.ghost', { href: '/content' }, 'Content', icon('arrowRight'))),
    h(
      'div.card-body.stack',
      h('div.row', ring(data.health.score, { label: 'of 100' }), h('p.muted.small', data.health.checks.length ? 'Things a visitor would notice, and housekeeping. Fix them from here.' : 'Nothing needs attention. The site is in good shape.')),
      h(
        'div',
        data.health.checks.map((check) =>
          h('a.health-item', { href: check.href ?? '/' }, h(`span.lvl-${check.level}`, icon(LEVEL_ICON[check.level])), h('div.grow', h('strong.small', check.title), h('div.tiny.muted', check.detail))),
        ),
      ),
    ),
  );

  const upcoming = card(
    cardHead('Coming up', h('a.btn.small.ghost', { href: '/meetings' }, 'Calendar', icon('arrowRight'))),
    data.upcoming.length
      ? h(
          'div.list',
          data.upcoming.map((m) => {
            const d = new Date(m.start);
            return h(
              'a.list-row',
              { href: m.enquiryId ? `/enquiries/${m.enquiryId}` : '/meetings' },
              h('div.date-chip', h('span', new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(d)), h('b', d.getDate())),
              h('div.meta', h('strong', m.attendeeName || m.title), h('span', `${time(m.start)}${zones.sameAsStudio ? '' : ` (${time(m.start, zones.studio)} India)`} · ${m.location || 'Online'}`)),
              sampleBadge(m),
            );
          }),
        )
      : h('div.card-body', empty({ glyph: 'calendar', title: 'Nothing booked yet', text: 'Meetings from Calendly or added by hand appear here.' })),
  );

  const followUps = card(
    cardHead('Follow up'),
    data.followUps.length
      ? h(
          'div.list',
          data.followUps.map((item) =>
            h('a.list-row', { href: `/enquiries/${item.id}` }, h('span.avatar.small', initials(item.name)), h('div.meta', h('strong', item.name), h('span', item.company || '—')), h(`span.pill.${Date.parse(item.followUpAt) < Date.now() ? 'danger' : 'warning'}`, dueLabel(item.followUpAt))),
          ),
        )
      : h('div.card-body', h('p.muted.small', 'No follow-ups due in the next two days.')),
  );

  const latest = card(
    cardHead('Latest enquiries', h('a.btn.small.ghost', { href: '/enquiries' }, 'All', icon('arrowRight'))),
    data.latest.length
      ? h(
          'div.list',
          data.latest.map((item) =>
            h('a.list-row', { href: `/enquiries/${item.id}` }, h('span.avatar.small', initials(item.name)), h('div.meta', h('strong', item.name), h('span', [item.company, item.service].filter(Boolean).join(' · '))), statusPill(item.status, { new: 'New', contacted: 'Contacted', meeting: 'Meeting', proposal: 'Proposal', won: 'Won', lost: 'Lost' }), h('span.when', relative(item.createdAt))),
          ),
        )
      : h('div.card-body', empty({ glyph: 'inbox', title: 'No enquiries yet', text: 'Add one by hand, or connect Calendly in Settings.' })),
  );

  const activity = card(
    cardHead('Recent activity', h('a.btn.small.ghost', { href: '/activity' }, 'All', icon('arrowRight'))),
    data.activity.length
      ? h('div.list', data.activity.map((item) => h('div.list-row', h('span.avatar.small', initials(item.userName)), h('div.meta', h('strong', item.summary), h('span', item.userName)), h('span.when', relative(item.at)))))
      : h('div.card-body', h('p.muted.small', 'Nothing has happened here yet.')),
  );

  const quick = h(
    'div.quick',
    [
      can && { href: '/content/testimonials', glyph: 'quote', title: 'Testimonials', text: 'Client words on the home page' },
      can && { href: '/projects', glyph: 'briefcase', title: 'Projects', text: 'Cards, order, case studies' },
      can && { href: '/media?upload=1', glyph: 'upload', title: 'Upload media', text: 'Pictures, video, PDFs' },
      { href: '/analytics', glyph: 'chart', title: 'Analytics', text: 'Visits and popular work' },
    ]
      .filter(Boolean)
      .map((item) => h('a', { href: item.href }, h('span', icon(item.glyph)), item.title, h('small', item.text))),
  );

  show(
    h(
      'div.stack.loose',
      hello,
      stats,
      h('div.grid.two', enquiriesChart, pipeline),
      quick,
      h('div.grid.three', health, upcoming, followUps),
      h('div.grid.two', latest, activity),
    ),
  );
}
