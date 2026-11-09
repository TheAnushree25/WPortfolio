import { h, debounce, store, copyText, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, patch, del } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { navigate } from '../lib/router.js';
import { button, confirm, drawer, empty, modal, pageHead, pageSkeleton, popMenu, sampleBadge, statusPill, toast, toastError, busy } from '../lib/ui.js';
import { dateTime, initials, money, moneyShort, relative, date } from '../lib/format.js';

/**
 * Enquiries, from first message to won or lost. A board to move them along
 * (drag on a desktop, the status menu anywhere), a list to search and sort,
 * and each enquiry's details, notes and meetings in a side panel.
 */

const STATUS_COLORS = { new: 'var(--brand)', contacted: 'var(--sky)', meeting: 'var(--violet)', proposal: 'var(--warning)', won: 'var(--success)', lost: 'var(--faint)' };
const SOURCE_LABELS = { website: 'Website', calendly: 'Calendly', email: 'Email', instagram: 'Instagram', linkedin: 'LinkedIn', referral: 'Referral', whatsapp: 'WhatsApp', other: 'Other' };

let lastData = null;

export default async function enquiries({ params, query }) {
  setTitle('Enquiries');
  show(pageSkeleton());
  const canEdit = session.can('editor');
  const state = { view: store.get('enquiries-view', innerWidth < 720 ? 'list' : 'board'), q: '', status: '', source: '', archived: false };
  let data;

  const load = async () => {
    const qs = new URLSearchParams({ ...(state.q && { q: state.q }), ...(state.source && { source: state.source }), ...(state.archived && { archived: '1' }) });
    data = await get(`/api/enquiries?${qs}`);
    lastData = data;
  };
  try {
    await load();
  } catch (error) {
    toastError(error);
    return;
  }
  post('/api/enquiries-seen', {}).then(refreshBadges).catch(() => {});

  const holder = h('div');
  const totals = h('div.grid.four', { style: { marginBottom: '18px' } });
  const search = h('input.input', { type: 'search', placeholder: 'Search name, company, message…', 'aria-label': 'Search enquiries' });
  const sourceSelect = h('select.select', { 'aria-label': 'Source', style: { maxWidth: '180px' } }, h('option', { value: '' }, 'All sources'), data.options.sources.map((s) => h('option', { value: s }, SOURCE_LABELS[s] ?? s)));
  const viewToggle = h('div.segmented', { role: 'group', 'aria-label': 'View' });
  const archivedToggle = h('label.filter-chip', h('input', { type: 'checkbox', style: { accentColor: 'var(--brand)' } }), 'Archived');

  const drawTotals = () => {
    const t = data.totals;
    const decided = (data.counts.won ?? 0) + (data.counts.lost ?? 0);
    totals.replaceChildren(
      h('div.card.stat', h('div.stat-label', icon('inbox'), 'Open'), h('div.stat-value', String(t.open)), h('div.stat-foot', `${t.all} in all`)),
      h('div.card.stat', h('div.stat-label', icon('rupee'), 'Open pipeline'), h('div.stat-value', moneyShort(t.pipeline)), h('div.stat-foot', 'Estimated value of open work')),
      h('div.card.stat', h('div.stat-label', icon('star'), 'Won'), h('div.stat-value', moneyShort(t.won)), h('div.stat-foot', `${data.counts.won ?? 0} projects`)),
      h('div.card.stat', h('div.stat-label', icon('trendUp'), 'Win rate'), h('div.stat-value', decided ? `${Math.round(((data.counts.won ?? 0) / decided) * 100)}%` : '—'), h('div.stat-foot', `${decided} decided`)),
    );
  };

  const drawToggle = () =>
    viewToggle.replaceChildren(
      h(`button${state.view === 'board' ? '.active' : ''}`, { type: 'button', onClick: () => ((state.view = 'board'), store.set('enquiries-view', 'board'), drawToggle(), draw()) }, icon('kanban'), 'Board'),
      h(`button${state.view === 'list' ? '.active' : ''}`, { type: 'button', onClick: () => ((state.view = 'list'), store.set('enquiries-view', 'list'), drawToggle(), draw()) }, icon('list'), 'List'),
    );

  const leadCard = (item) => {
    const overdue = item.followUpAt && Date.parse(item.followUpAt) < Date.now() && !['won', 'lost'].includes(item.status);
    const el = h(
      'button.lead-card',
      { type: 'button', draggable: canEdit ? 'true' : 'false' },
      h('div.row.between', h('strong.truncate', item.name), sampleBadge(item)),
      item.company && h('span.small.muted.truncate', item.company),
      h('div.lc-meta', h('span', item.service), item.value ? h('span.dot-sep', moneyShort(item.value)) : null),
      h('div.lc-meta', h('span', relative(item.createdAt)), overdue && h('span.pill.danger', icon('clock'), 'Follow up'), (item.tags ?? []).includes('priority') && h('span.pill.warning', 'Priority')),
    );
    el.addEventListener('click', () => openDetail(item.id));
    el.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  };

  const moveTo = async (id, status) => {
    const item = data.items.find((entry) => entry.id === id);
    if (!item || item.status === status) return;
    const before = item.status;
    item.status = status;
    draw();
    try {
      await patch(`/api/enquiries/${id}`, { status });
      toast(`${item.name} moved to ${data.options.labels[status]}.`, { action: { label: 'Undo', onClick: () => moveTo(id, before) } });
      await refresh();
    } catch (error) {
      item.status = before;
      draw();
      toastError(error);
    }
  };

  const board = () =>
    h(
      'div.board',
      data.options.statuses.map((status) => {
        const items = data.items.filter((item) => item.status === status);
        const sum = items.reduce((total, item) => total + (item.value || 0), 0);
        const column = h(
          'section.column',
          { 'aria-label': data.options.labels[status] },
          h('div.column-head', h('span.swatch', { style: { background: STATUS_COLORS[status], borderRadius: '50%' } }), h('strong', data.options.labels[status]), h('span.pill', String(items.length)), sum ? h('span.sum', moneyShort(sum)) : null),
          items.length ? items.map(leadCard) : h('p.tiny.muted.center', { style: { padding: '18px 0' } }, canEdit ? 'Drop an enquiry here' : 'None'),
        );
        if (canEdit) {
          column.addEventListener('dragover', (event) => {
            event.preventDefault();
            column.classList.add('over');
          });
          column.addEventListener('dragleave', (event) => !column.contains(event.relatedTarget) && column.classList.remove('over'));
          column.addEventListener('drop', (event) => {
            event.preventDefault();
            column.classList.remove('over');
            moveTo(event.dataTransfer.getData('text/plain'), status);
          });
        }
        return column;
      }),
    );

  const table = () => {
    const items = state.status ? data.items.filter((item) => item.status === state.status) : data.items;
    return h(
      'div',
      h(
        'div.scroll-x',
        { style: { marginBottom: '14px' } },
        h(`button.filter-chip${!state.status ? '.active' : ''}`, { type: 'button', onClick: () => ((state.status = ''), draw()) }, 'All', h('span.n', String(data.items.length))),
        data.options.statuses.map((status) => h(`button.filter-chip${state.status === status ? '.active' : ''}`, { type: 'button', onClick: () => ((state.status = status), draw()) }, data.options.labels[status], h('span.n', String(data.counts[status] ?? 0)))),
      ),
      items.length
        ? h(
            'section.card',
            h(
              'div.table-wrap',
              h(
                'table.table.responsive',
                h('thead', h('tr', ['Client', 'Service', 'Value', 'Source', 'Status', 'Received'].map((label) => h('th', label)))),
                h(
                  'tbody',
                  items.map((item) =>
                    h(
                      'tr.clickable',
                      { onClick: () => openDetail(item.id), tabindex: 0, onKeydown: (e) => e.key === 'Enter' && openDetail(item.id) },
                      h('td.lead', { 'data-label': 'Client' }, h('div.row', h('span.avatar.small', initials(item.name)), h('div.meta', h('strong.truncate', item.name), h('span.small.muted.truncate', item.company || item.email)), sampleBadge(item))),
                      h('td', { 'data-label': 'Service' }, item.service),
                      h('td.num', { 'data-label': 'Value' }, item.value ? money(item.value) : '—'),
                      h('td', { 'data-label': 'Source' }, SOURCE_LABELS[item.source] ?? item.source),
                      h('td', { 'data-label': 'Status' }, statusPill(item.status, data.options.labels)),
                      h('td', { 'data-label': 'Received' }, h('span.nowrap', relative(item.createdAt))),
                    ),
                  ),
                ),
              ),
            ),
          )
        : empty({ glyph: 'inbox', title: state.q ? 'Nothing matches that search' : 'No enquiries here', text: state.archived ? 'Archived enquiries appear here.' : 'Add one by hand, sync Calendly from Meetings, or connect the site’s form (Settings → Integrations).' }),
    );
  };

  const draw = () => {
    drawTotals();
    holder.replaceChildren(state.view === 'board' ? board() : table());
  };
  const refresh = async () => {
    await load();
    draw();
    refreshBadges();
  };

  search.addEventListener('input', debounce(async () => ((state.q = search.value.trim()), await refresh()), 220));
  sourceSelect.addEventListener('change', async () => ((state.source = sourceSelect.value), await refresh()));
  archivedToggle.querySelector('input').addEventListener('change', async (event) => ((state.archived = event.target.checked), await refresh()));

  /* ------------------------------ Detail panel ------------------------------ */

  async function openDetail(id) {
    let item;
    try {
      item = await get(`/api/enquiries/${id}`);
    } catch (error) {
      toastError(error);
      return;
    }
    history.replaceState({}, '', withBase(`/enquiries/${id}`));
    const body = h('div.stack');
    const statusSelect = h('select.select', { disabled: !canEdit, 'aria-label': 'Status', style: { maxWidth: '170px' } }, data.options.statuses.map((status) => h('option', { value: status, selected: status === item.status }, data.options.labels[status])));
    statusSelect.addEventListener('change', async () => {
      try {
        item = { ...item, ...(await patch(`/api/enquiries/${id}`, { status: statusSelect.value })) };
        toast(`Moved to ${data.options.labels[item.status]}.`);
        drawBody();
        refresh();
      } catch (error) {
        toastError(error);
      }
    });
    const more = h('button.icon-btn', { type: 'button', 'aria-label': 'More' }, icon('more'));
    more.addEventListener('click', () =>
      popMenu(more, [
        item.email && { label: 'Email them', icon: 'mail', href: `mailto:${item.email}?subject=${encodeURIComponent('Your project with The Atlas Studio')}` },
        item.email && { label: 'Copy email', icon: 'copy', onClick: async () => (await copyText(item.email), toast('Email copied.')) },
        item.phone && { label: 'Call', icon: 'call', href: `tel:${item.phone.replace(/\s+/g, '')}` },
        canEdit && { label: 'Edit details', icon: 'pencil', onClick: () => editModal(item, async (saved) => ((item = { ...item, ...saved }), drawBody(), refresh())) },
        canEdit && { label: 'Add a meeting', icon: 'calendar', onClick: () => navigate(`/meetings?new=1&enquiry=${item.id}`) },
        canEdit && '-',
        canEdit && { label: item.archived ? 'Restore from archive' : 'Archive', icon: 'archive', onClick: async () => {
          await patch(`/api/enquiries/${id}`, { archived: !item.archived });
          toast(item.archived ? 'Restored.' : 'Archived.');
          panel.close();
          refresh();
        } },
        session.can('owner') && { label: 'Delete for good', icon: 'trash', danger: true, onClick: async () => {
          if (!(await confirm({ title: `Delete ${item.name}’s enquiry?`, message: 'Their details and notes are removed for good. Archive it instead to keep the history.', confirmLabel: 'Delete', danger: true }))) return;
          await del(`/api/enquiries/${id}`);
          toast('Deleted.');
          panel.close();
          refresh();
        } },
      ]),
    );

    const noteBox = h('textarea.textarea', { rows: 3, placeholder: 'Add a note: a call, a decision, what was sent…', 'aria-label': 'New note' });
    const noteButton = button('Add note', { kind: 'primary', small: true, glyph: 'send' });
    noteButton.addEventListener('click', async () => {
      if (!noteBox.value.trim()) return noteBox.focus();
      await busy(noteButton, async () => {
        item = { ...item, ...(await post(`/api/enquiries/${id}/notes`, { text: noteBox.value })) };
        noteBox.value = '';
        drawBody();
      });
    });

    const drawBody = () => {
      statusSelect.value = item.status;
      const timeline = [
        ...(item.notes ?? []).map((note) => ({ at: note.at, kind: note.kind, text: note.text, by: note.by, id: note.id })),
        ...(item.meetings ?? []).map((m) => ({ at: m.start, kind: 'meeting', text: `${m.title} · ${dateTime(m.start)}${m.status !== 'scheduled' ? ` · ${m.status}` : ''}`, by: m.source === 'calendly' ? 'Calendly' : '' })),
        { at: item.createdAt, kind: 'created', text: `Enquiry received${item.source ? ` via ${SOURCE_LABELS[item.source] ?? item.source}` : ''}`, by: '' },
      ].sort((a, b) => (a.at < b.at ? 1 : -1));
      body.replaceChildren(
        h('div.row', h('span.avatar.large', initials(item.name)), h('div.grow', h('h3', item.name), h('div.small.muted', [item.company, item.email].filter(Boolean).join(' · '))), sampleBadge(item)),
        h('div.row.wrap', statusPill(item.status, data.options.labels), h('span.pill', item.service), h('span.pill', item.budget), item.value ? h('span.pill.success', money(item.value)) : null, (item.tags ?? []).map((tag) => h('span.pill.brand', tag))),
        item.message && h('div.card.card-pad', h('div.tiny.muted', 'Their message'), h('p', { style: { whiteSpace: 'pre-wrap', marginTop: '6px' } }, item.message)),
        h(
          'dl.kv',
          item.phone && [h('dt', 'Phone'), h('dd', h('a', { href: `tel:${item.phone.replace(/\s+/g, '')}` }, item.phone))],
          item.website && [h('dt', 'Website'), h('dd', h('a', { href: item.website, target: '_blank', rel: 'noopener', 'data-external': '' }, item.website))],
          h('dt', 'Source'),
          h('dd', SOURCE_LABELS[item.source] ?? item.source),
          h('dt', 'Received'),
          h('dd', dateTime(item.createdAt)),
          h('dt', 'Follow up'),
          h('dd', item.followUpAt ? h('span', { style: { color: Date.parse(item.followUpAt) < Date.now() ? 'var(--danger)' : '' } }, `${date(item.followUpAt)} (${relative(item.followUpAt)})`) : h('span.muted', 'Not set')),
        ),
        canEdit && h('div.stack.tight', noteBox, h('div.row', { style: { justifyContent: 'flex-end' } }, noteButton)),
        h('h3', { style: { fontSize: '15px' } }, 'Timeline'),
        h(
          'div.timeline',
          timeline.map((entry) =>
            h(
              'div.tl-item',
              h('span.tl-dot', icon({ status: 'arrowRight', meeting: 'calendar', created: 'inbox', note: 'pencil' }[entry.kind] ?? 'pencil')),
              h('div', h('div.tl-text', entry.text), h('div.tiny.muted', [entry.by, relative(entry.at)].filter(Boolean).join(' · '))),
            ),
          ),
        ),
      );
    };
    drawBody();
    const panel = drawer({ title: item.name, body, actions: h('div.row', statusSelect, more), onClose: () => history.replaceState({}, '', withBase('/enquiries')) });
  }

  /* ------------------------------ New / edit ------------------------------ */

  function editModal(existing, onSaved) {
    const v = existing ?? {};
    const input = (key, labelText, attrs = {}) => {
      const el = h('input.input', { type: attrs.type ?? 'text', value: v[key] ?? '', ...attrs });
      return { key, el, field: h('div.field', h('label', labelText), el) };
    };
    const select = (key, labelText, options, labels = {}) => {
      const el = h('select.select', options.map((option) => h('option', { value: option, selected: option === (v[key] ?? options[0]) }, labels[option] ?? option)));
      return { key, el, field: h('div.field', h('label', labelText), el) };
    };
    const fields = [
      input('name', 'Name *', { autocomplete: 'off' }),
      input('company', 'Company'),
      input('email', 'Email', { type: 'email', inputMode: 'email' }),
      input('phone', 'Phone', { type: 'tel', inputMode: 'tel' }),
      select('service', 'Service', data.options.services),
      select('budget', 'Budget', data.options.budgets),
      select('source', 'Came from', data.options.sources, SOURCE_LABELS),
      input('value', 'Estimated value (₹)', { type: 'number', inputMode: 'numeric', min: 0, step: 1000 }),
      input('followUpAt', 'Follow up on', { type: 'date', value: v.followUpAt ? v.followUpAt.slice(0, 10) : '' }),
      input('website', 'Website', { type: 'url', placeholder: 'https://' }),
    ];
    if (!existing) fields.push(select('status', 'Status', data.options.statuses, data.options.labels));
    const message = h('textarea.textarea', { rows: 4, value: v.message ?? '' });
    const tags = h('input.input', { type: 'text', value: (v.tags ?? []).join(', '), placeholder: 'priority, referral…' });
    modal({
      title: existing ? `Edit ${existing.name}` : 'New enquiry',
      size: 'wide',
      body: h('div.stack', h('div.form-grid.cols-2', fields.map((f) => f.field)), h('div.field', h('label', 'Message or brief'), message), h('div.field', h('label', 'Tags'), tags, h('div.field-hint', 'Separate with commas.'))),
      actions: [
        { label: 'Cancel' },
        {
          label: existing ? 'Save' : 'Add enquiry',
          kind: 'primary',
          onClick: async () => {
            const body = Object.fromEntries(fields.map((f) => [f.key, f.el.value]));
            body.message = message.value;
            body.tags = tags.value.split(',').map((t) => t.trim()).filter(Boolean);
            body.followUpAt = body.followUpAt ? new Date(`${body.followUpAt}T10:00:00`).toISOString() : null;
            body.value = body.value === '' ? 0 : Number(body.value);
            const saved = existing ? await patch(`/api/enquiries/${existing.id}`, body) : await post('/api/enquiries', body);
            toast(existing ? 'Saved.' : `${saved.name} added.`);
            await onSaved?.(saved);
          },
        },
      ],
    });
  }

  drawToggle();
  draw();
  show(
    pageHead({
      title: 'Enquiries',
      text: 'Every enquiry and where it stands. Values are your estimate of each project, so the pipeline adds up.',
      actions: [
        canEdit && h('a.btn', { href: '/api/enquiries-export', download: '' }, icon('download'), 'Export CSV'),
        canEdit && button('New enquiry', { kind: 'primary', glyph: 'plus', onClick: () => editModal(null, refresh) }),
      ].filter(Boolean),
    }),
    totals,
    h('div.toolbar', h('div.input-group', icon('search'), search), sourceSelect, archivedToggle, viewToggle),
    holder,
  );
  if (params.id) openDetail(params.id);
  if (query.new === '1' && canEdit) editModal(null, refresh);
}

export const enquiryCache = () => lastData;
