import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { button, empty, pageHead, pageSkeleton, toastError } from '../lib/ui.js';
import { dayLabel, initials, time } from '../lib/format.js';

/** Who did what, and when: every change made through the admin, and every sign-in. */

const CATEGORIES = [
  ['', 'Everything'],
  ['content', 'Content'],
  ['project', 'Projects'],
  ['media', 'Media'],
  ['enquiry', 'Enquiries'],
  ['meeting', 'Meetings'],
  ['publish', 'Publishing'],
  ['job', 'Checks & deploys'],
  ['user', 'Team'],
  ['settings', 'Settings'],
  ['auth', 'Sign-ins'],
];
const ICONS = { content: 'fileText', project: 'briefcase', media: 'image', enquiry: 'inbox', meeting: 'calendar', publish: 'commit', job: 'terminal', user: 'users', settings: 'settings', auth: 'key' };
const TONE = { content: 'brand', project: 'brand', media: 'violet', enquiry: 'success', meeting: 'violet', publish: 'warning', job: 'warning', user: '', settings: '', auth: '' };

export default async function activity({ query }) {
  setTitle('Activity');
  show(pageSkeleton());
  let category = CATEGORIES.some(([id]) => id === query.category) ? query.category : '';
  let items = [];
  let more = false;
  const holder = h('div');
  const chips = h('div.scroll-x', { style: { marginBottom: '18px' } });

  const load = async (append = false) => {
    const before = append && items.length ? items[items.length - 1].at : '';
    const qs = new URLSearchParams({ limit: '60', ...(category && { category }), ...(before && { before }) });
    const data = await get(`/api/activity?${qs}`);
    items = append ? [...items, ...data.items] : data.items;
    more = data.more;
  };

  const draw = () => {
    chips.replaceChildren(...CATEGORIES.map(([id, label]) => h(`button.filter-chip${category === id ? '.active' : ''}`, { type: 'button', onClick: async () => ((category = id), await load(), draw()) }, label)));
    if (!items.length) {
      holder.replaceChildren(empty({ glyph: 'history', title: 'Nothing here yet', text: 'Changes made through the admin are recorded here as they happen.' }));
      return;
    }
    const groups = new Map();
    for (const item of items) {
      const key = dayLabel(item.at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    holder.replaceChildren(
      ...[...groups.entries()].map(([day, list]) =>
        h(
          'section.card',
          { style: { marginBottom: '12px' } },
          h('div.card-head', h('h3', day)),
          h(
            'div.list',
            { style: { marginTop: '8px' } },
            list.map((item) => {
              const kind = item.action.split('.')[0];
              return h('div.list-row', h(`div.list-icon${TONE[kind] ? `.${TONE[kind]}` : ''}`, icon(item.action === 'auth.failed' ? 'alert' : ICONS[kind] ?? 'pulse')), h('div.meta', h('strong', { style: { whiteSpace: 'normal' } }, item.summary), h('span', h('span.avatar.small', { style: { width: '18px', height: '18px', fontSize: '9px', display: 'inline-grid', marginRight: '6px', verticalAlign: '-4px' } }, initials(item.userName)), item.userName)), h('span.when', time(item.at)));
            }),
          ),
        ),
      ),
      more ? h('div.center', button('Show older', { onClick: async (event) => (event.currentTarget.disabled = true, await load(true), draw()) })) : null,
    );
  };

  try {
    await load();
  } catch (error) {
    toastError(error);
    return;
  }
  draw();
  show(pageHead({ title: 'Activity', text: 'A record of every change made through the admin, by whom, and every sign-in.' }), chips, holder);
}
