import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, patch, del } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { button, card, cardHead, confirm, empty, modal, notice, pageHead, pageSkeleton, popMenu, sampleBadge, toast, toastError, busy } from '../lib/ui.js';
import { dayLabel, relative, time, zones } from '../lib/format.js';

/**
 * Meetings: what's coming up, what happened, a month calendar, the studio's
 * bookable times as visitors see them, and the Calendly sync.
 */

const STATES = { scheduled: 'Scheduled', completed: 'Done', cancelled: 'Cancelled', 'no-show': 'No-show' };
const STATE_KIND = { scheduled: 'brand', completed: 'success', cancelled: '', 'no-show': 'danger' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default async function meetings({ query }) {
  setTitle('Meetings');
  show(pageSkeleton());
  const canEdit = session.can('editor');
  let data;
  let rules;
  let enquiries;
  try {
    [data, rules, enquiries] = await Promise.all([get('/api/meetings'), get('/api/booking-rules'), get('/api/enquiries')]);
  } catch (error) {
    toastError(error);
    return;
  }
  let view = 'upcoming';
  let month = new Date();
  month.setDate(1);
  let selectedDay = null;
  const holder = h('div');
  const tabs = h('div.tabs');

  const meetingRow = (m) => {
    const sameZone = zones.sameAsStudio;
    const row = h(
      'div.list-row',
      h('div.date-chip', h('span', new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(m.start))), h('b', new Date(m.start).getDate())),
      h('div.meta', h('strong', m.attendeeName || m.title), h('span', `${time(m.start)}–${time(m.end)}${sameZone ? '' : ` · ${time(m.start, zones.studio)} India`} · ${m.title}`), h('span', [m.location, m.attendeeEmail].filter(Boolean).join(' · '))),
      sampleBadge(m),
      h(`span.pill${STATE_KIND[m.status] ? `.${STATE_KIND[m.status]}` : ''}`, STATES[m.status] ?? m.status),
      m.joinUrl && m.status === 'scheduled' && h('a.btn.small', { href: m.joinUrl, target: '_blank', rel: 'noopener', 'data-external': '' }, icon('video'), 'Join'),
    );
    const more = h('button.icon-btn', { type: 'button', 'aria-label': 'More' }, icon('more'));
    more.addEventListener('click', () =>
      popMenu(more, [
        m.enquiryId && { label: 'Open the enquiry', icon: 'inbox', href: `/enquiries/${m.enquiryId}` },
        canEdit && { label: 'Edit', icon: 'pencil', onClick: () => editMeeting(m) },
        canEdit && m.status === 'scheduled' && { label: 'Mark as done', icon: 'check', onClick: () => setStatus(m, 'completed') },
        canEdit && m.status === 'scheduled' && { label: 'Mark as no-show', icon: 'alert', onClick: () => setStatus(m, 'no-show') },
        canEdit && m.status === 'scheduled' && { label: 'Mark as cancelled', icon: 'x', onClick: () => setStatus(m, 'cancelled') },
        canEdit && '-',
        canEdit && { label: 'Remove', icon: 'trash', danger: true, onClick: async () => {
          if (!(await confirm({ title: 'Remove this meeting?', message: m.source === 'calendly' ? 'It is removed here only; Calendly still has it, and the next sync brings it back.' : 'It is removed from the admin.', confirmLabel: 'Remove', danger: true }))) return;
          await del(`/api/meetings/${m.id}`);
          await reload();
        } },
      ]),
    );
    row.append(more);
    return row;
  };

  async function setStatus(m, status) {
    try {
      await patch(`/api/meetings/${m.id}`, { status });
      toast(`Marked as ${STATES[status].toLowerCase()}.`);
      await reload();
    } catch (error) {
      toastError(error);
    }
  }

  const grouped = (items) => {
    const groups = new Map();
    for (const m of items) {
      const key = dayLabel(m.start);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return [...groups.entries()].map(([day, list]) => h('section.card', { style: { marginBottom: '12px' } }, h('div.card-head', h('h3', day), h('span.small.muted', `${list.length} ${list.length === 1 ? 'meeting' : 'meetings'}`)), h('div.list', { style: { marginTop: '8px' } }, list.map(meetingRow))));
  };

  const calendar = () => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);
    const days = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const byDay = new Map();
    for (const m of data.items) {
      const k = key(new Date(m.start));
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(m);
    }
    const today = key(new Date());
    const chosen = selectedDay ? byDay.get(key(selectedDay)) ?? [] : [];
    return h(
      'div.stack',
      h(
        'section.card.card-pad',
        h('div.row.between', { style: { marginBottom: '12px' } }, h('h3', new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(month)), h('div.row', button('', { glyph: 'chevronLeft', small: true, title: 'Previous month', onClick: () => (month.setMonth(month.getMonth() - 1), draw()) }), button('Today', { small: true, onClick: () => ((month = new Date()), month.setDate(1), (selectedDay = new Date()), draw()) }), button('', { glyph: 'chevronRight', small: true, title: 'Next month', onClick: () => (month.setMonth(month.getMonth() + 1), draw()) }))),
        h(
          'div.calendar',
          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div.dow', d)),
          days.map((d) => {
            const list = byDay.get(key(d)) ?? [];
            const classes = ['day', d.getMonth() !== month.getMonth() && 'out', key(d) === today && 'today', selectedDay && key(d) === key(selectedDay) && 'selected'].filter(Boolean).join('.');
            return h(`button.${classes}`, { type: 'button', 'aria-label': `${d.toDateString()}, ${list.length} meetings`, onClick: () => ((selectedDay = d), draw()) }, h('span.n', d.getDate()), list.slice(0, 2).map((m) => h(`span.ev${Date.parse(m.end) < Date.now() ? '.past' : ''}`, `${time(m.start)} ${m.attendeeName || m.title}`)), list.length > 2 && h('span.tiny.muted', `+${list.length - 2}`));
          }),
        ),
      ),
      selectedDay && h('section.card', h('div.card-head', h('h3', dayLabel(selectedDay.toISOString()))), chosen.length ? h('div.list', { style: { marginTop: '8px' } }, chosen.map(meetingRow)) : h('div.card-body', h('p.muted.small', 'Nothing on this day.'))),
    );
  };

  const availability = () => {
    // The studio's start times on its weekdays, shown in India time and in the viewer's own.
    const toViewer = (slot) => {
      const [hh, mm] = slot.split(':').map(Number);
      const at = new Date(Date.UTC(2026, 0, 5, hh, mm) - rules.offset * 60_000);
      return time(at.toISOString());
    };
    return h(
      'div.stack',
      card(
        cardHead('Bookable times', canEdit && h('a.btn.small', { href: '/content/booking' }, icon('pencil'), 'Edit times')),
        h(
          'div.card-body.stack',
          h('p.small.muted', `${rules.title}, ${rules.duration} on ${rules.location}. Monday to Friday, up to ${rules.horizon} days ahead, at these India-time starts${zones.sameAsStudio ? '' : ` (your time shown underneath)`}:`),
          h('div.slots', h('div'), WEEKDAYS.map((d) => h('div.h', d)), rules.slots.map((slot) => [h('div.t', slot), WEEKDAYS.map(() => h('div.s', zones.sameAsStudio ? slot : h('span', slot, h('br'), h('span.tiny', toViewer(slot)))))])),
          notice('When Calendly is connected to /contact, Calendly’s own availability decides what visitors can book; these times are used by the studio’s own booker.'),
        ),
      ),
    );
  };

  const calendlyCard = () =>
    card(
      cardHead('Calendly'),
      h(
        'div.card-body.stack',
        data.calendly.connected
          ? h('div.stack.tight', h('div.row', h('span.pill.success.dot', 'Connected'), data.calendly.user && h('span.small.muted', `${data.calendly.user.name} · ${data.calendly.user.email}`)), h('p.small.muted', data.calendly.lastSync ? `Last synced ${relative(data.calendly.lastSync)}.` : 'Not synced yet.'))
          : h('p.small.muted', 'Connect Calendly in Settings → Integrations to bring every booking, and each person who books, into the admin.'),
        h(
          'div.row.wrap',
          data.calendly.connected && canEdit
            ? button('Sync now', { kind: 'primary', glyph: 'refresh', onClick: async (event) => {
                await busy(event.currentTarget, async () => {
                  const result = await post('/api/meetings/sync', {});
                  toast(`Synced: ${result.added} new, ${result.updated} updated${result.enquiries ? `, ${result.enquiries} new enquiries` : ''}.`);
                  await reload();
                });
              } })
            : session.can('owner') && h('a.btn', { href: '/settings/integrations' }, icon('link'), 'Connect Calendly'),
        ),
      ),
    );

  const draw = () => {
    const now = Date.now();
    tabs.replaceChildren(
      ...[
        ['upcoming', 'Upcoming', data.items.filter((m) => Date.parse(m.end) >= now && m.status === 'scheduled').length],
        ['past', 'Past', data.items.filter((m) => Date.parse(m.end) < now || m.status !== 'scheduled').length],
        ['calendar', 'Calendar', null],
        ['times', 'Bookable times', null],
      ].map(([id, label, n]) => h(`button${view === id ? '.active' : ''}`, { type: 'button', onClick: () => ((view = id), draw()) }, label, n !== null && h('span.n', String(n)))),
    );
    if (view === 'upcoming') {
      const items = data.items.filter((m) => Date.parse(m.end) >= now && m.status === 'scheduled');
      holder.replaceChildren(h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr)' } }, items.length ? grouped(items) : empty({ glyph: 'calendar', title: 'Nothing coming up', text: 'Bookings from Calendly and meetings you add appear here.', action: canEdit && button('Add a meeting', { kind: 'primary', glyph: 'plus', onClick: () => editMeeting(null) }) })), calendlyCard());
    } else if (view === 'past') {
      const items = data.items.filter((m) => Date.parse(m.end) < now || m.status !== 'scheduled').reverse();
      holder.replaceChildren(items.length ? h('div', grouped(items)) : empty({ glyph: 'history', title: 'No past meetings yet' }));
    } else if (view === 'calendar') holder.replaceChildren(calendar());
    else holder.replaceChildren(availability());
  };

  const reload = async () => {
    data = await get('/api/meetings');
    draw();
    refreshBadges();
  };

  function editMeeting(existing, preset = {}) {
    const v = existing ?? { title: rules.title, location: rules.location, ...preset };
    const pad = (n) => String(n).padStart(2, '0');
    const local = (iso) => {
      const d = iso ? new Date(iso) : new Date(Date.now() + 86_400_000);
      if (!iso) d.setHours(11, 0, 0, 0);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const start = h('input.input', { type: 'datetime-local', value: local(v.start) });
    const minutes = h('input.input', { type: 'number', min: 5, step: 5, value: existing ? Math.round((Date.parse(v.end) - Date.parse(v.start)) / 60000) : rules.minutes });
    const title = h('input.input', { type: 'text', value: v.title ?? '' });
    const enquiry = h('select.select', h('option', { value: '' }, 'Not linked'), enquiries.items.map((e) => h('option', { value: e.id, selected: e.id === v.enquiryId }, `${e.name}${e.company ? ` · ${e.company}` : ''}`)));
    const name = h('input.input', { type: 'text', value: v.attendeeName ?? '' });
    const email = h('input.input', { type: 'email', value: v.attendeeEmail ?? '' });
    const location = h('input.input', { type: 'text', value: v.location ?? '' });
    const join = h('input.input', { type: 'url', value: v.joinUrl ?? '', placeholder: 'https://meet.google.com/…' });
    const notes = h('textarea.textarea', { rows: 3, value: v.notes ?? '' });
    enquiry.addEventListener('change', () => {
      const e = enquiries.items.find((item) => item.id === enquiry.value);
      if (e) {
        if (!name.value) name.value = e.name;
        if (!email.value) email.value = e.email;
      }
    });
    const f = (label, el, hint) => h('div.field', h('label', label), el, hint && h('div.field-hint', hint));
    modal({
      title: existing ? 'Edit meeting' : 'Add a meeting',
      size: 'wide',
      body: h('div.form-grid.cols-2', f('Starts', start, `Your time${zones.sameAsStudio ? '' : ` (${zones.viewer})`}`), f('Length (minutes)', minutes), f('Title', title), f('Enquiry', enquiry), f('With', name), f('Their email', email), f('Where', location), f('Join link', join), h('div.span-2', f('Notes', notes))),
      actions: [
        { label: 'Cancel' },
        {
          label: existing ? 'Save' : 'Add meeting',
          kind: 'primary',
          onClick: async () => {
            const startIso = new Date(start.value).toISOString();
            const body = { start: startIso, end: new Date(Date.parse(startIso) + Number(minutes.value || rules.minutes) * 60_000).toISOString(), title: title.value, enquiryId: enquiry.value || null, attendeeName: name.value, attendeeEmail: email.value, location: location.value, joinUrl: join.value, notes: notes.value };
            if (existing) await patch(`/api/meetings/${existing.id}`, body);
            else await post('/api/meetings', body);
            toast(existing ? 'Meeting saved.' : 'Meeting added.');
            await reload();
          },
        },
      ],
    });
  }

  draw();
  show(pageHead({ title: 'Meetings', text: 'Discovery calls and client meetings, in your own time zone.', actions: canEdit ? [button('Add a meeting', { kind: 'primary', glyph: 'plus', onClick: () => editMeeting(null) })] : [] }), tabs, holder);
  if (query.new === '1' && canEdit) {
    const e = enquiries.items.find((item) => item.id === query.enquiry);
    editMeeting(null, e ? { enquiryId: e.id, attendeeName: e.name, attendeeEmail: e.email } : {});
  }

  // With Calendly connected, bookings made since the last look are brought in quietly on opening the page.
  const stale = !data.calendly.lastSync || Date.now() - Date.parse(data.calendly.lastSync) > 15 * 60_000;
  if (canEdit && data.calendly.connected && stale) {
    post('/api/meetings/sync', {}, { quiet: true })
      .then(async (result) => {
        if (!result.added && !result.updated && !result.enquiries) return;
        await reload();
        if (result.added || result.enquiries) toast(`Calendly: ${result.added} new booking${result.added === 1 ? '' : 's'}${result.enquiries ? `, ${result.enquiries} new ${result.enquiries === 1 ? 'person' : 'people'} in Enquiries` : ''}.`);
      })
      .catch(() => {
        /* Sync now on the Calendly card says why, if it's asked */
      });
  }
}
