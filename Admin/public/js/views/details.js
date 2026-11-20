import { h, withBase, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, patch, del } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session } from '../lib/session.js';
import { navigate } from '../lib/router.js';
import { button, busy, card, cardHead, confirm, empty, modal, notice, pageHead, pageSkeleton, popMenu, toast, toastError } from '../lib/ui.js';
import { dateTime, relative } from '../lib/format.js';

/**
 * Details: type in a business (and the person to talk to), or read a
 * visiting card; the admin researches it on the public web, you check what
 * it found, and it writes a two-page summary and a one-page pitch as PDFs.
 * A run moves through code checks, web searches, reading pages and checking
 * every quote; this page follows it live, then shows the facts to review and
 * finally the two documents.
 */

const INDUSTRIES = [
  ['hospital', 'Hospital, clinic or nursing home'],
  ['doctor', 'Doctor, dentist or diagnostic lab'],
  ['restaurant', 'Restaurant, café or caterer'],
  ['hotel', 'Hotel, homestay or resort'],
  ['school', 'School, college or coaching'],
  ['retail', 'Shop or showroom'],
  ['realestate', 'Builder or real estate'],
  ['manufacturer', 'Factory, manufacturer or trader'],
  ['salon', 'Salon, spa or gym'],
  ['professional', 'CA, lawyer or consultant'],
  ['ngo', 'Trust, NGO or temple'],
  ['other', 'Something else'],
];
const SECTIONS = {
  contact: 'Who to contact',
  business: 'The business',
  events: 'What’s happening',
  paperwork: 'Registrations and paperwork',
  online: 'What people find online',
  person: 'The person',
  needs: 'What they most likely need',
};
const STATUS = {
  running: ['Researching', 'brand'],
  waiting: ['Waiting', 'warning'],
  review: ['Ready to check', 'success'],
  writing: ['Writing', 'brand'],
  ready: ['Documents ready', 'success'],
  failed: ['Stopped by a problem', 'danger'],
  cancelled: ['Stopped', ''],
};
const CONFIDENCE = {
  confirmed: ['Confirmed', 'success', 'Code checked it, or the page shares a phone number, email, website or address with the business.'],
  probable: ['Probable', 'warning', 'The page matches the business by name and place only.'],
  doubtful: ['Maybe another business', 'violet', 'The page only shares the name. Left out unless you tick it.'],
  unverified: ['Quote not found', 'danger', 'The words Gemini quoted aren’t on the page. Left out unless you tick it.'],
};
const ACTIVE = ['running', 'waiting', 'writing'];

const statusPill = (status) => {
  const [label, kind] = STATUS[status] ?? [status, ''];
  return h(`span.pill${kind ? `.${kind}` : ''}.dot`, label);
};

export default async function details({ params, query }) {
  if (params.id) return runPage(params.id);
  return listPage(query);
}

/* ================================================================== The list and the form */

async function listPage(query) {
  setTitle('Details');
  show(pageSkeleton());
  let state;
  try {
    state = await get('/api/research');
  } catch (error) {
    toastError(error);
    return;
  }
  const canEdit = session.can('editor');
  const ready = state.ready.gemini && state.ready.tavily;
  const example = async (event) =>
    busy(event.currentTarget, async () => {
      const run = await post('/api/research/example', {});
      navigate(`/details/${run.id}`);
    });

  show(
    pageHead({
      title: 'Details',
      text: 'Type in a business and the person you’d talk to. The admin looks them up on the public web, you check what it found, and it writes a two-page summary and a one-page pitch.',
      actions: [canEdit && button('See an example', { glyph: 'sparkles', onClick: example })].filter(Boolean),
    }),
    !ready && setupNotice(state.ready),
    canEdit ? researchForm({ ready, query }) : null,
    runList(state.items),
  );
}

function setupNotice(ready) {
  const missing = [!ready.gemini && 'Gemini (Google AI Studio)', !ready.tavily && 'Tavily'].filter(Boolean);
  return h(
    'div',
    { style: { marginBottom: '18px' } },
    notice(
      h(
        'span',
        `To start, add the free ${missing.join(' and ')} key${missing.length > 1 ? 's' : ''} in Settings → Integrations. `,
        ready.serpapi ? '' : 'A free SerpApi key adds Google Maps ratings and review replies. ',
        session.can('owner') ? h('a', { href: '/settings/integrations' }, 'Open Settings') : 'Ask the owner to add them.',
      ),
      { kind: 'warning', glyph: 'key' },
    ),
  );
}

const fieldBox = (label, control, { hint = null, required = false, span = false, name = '' } = {}) =>
  h(`div.field${span ? '.span-2' : ''}`, { dataset: { name } }, h('label', label, required && h('span.req', ' *')), control, hint && h('div.field-hint', hint), h('div.field-error', { hidden: true }));

/** Reads a picture into a JPEG data address no wider or taller than 1600 pixels. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function researchForm({ ready, query }) {
  const input = (name, placeholder = '', type = 'text') => h('input.input', { type, name, placeholder, value: query?.[name] ?? '', autocomplete: 'off' });
  const fields = {
    business: input('business', 'e.g. Debayan Hospital'),
    city: input('city', 'e.g. Kashipur, Kolkata'),
    person: input('person', 'e.g. Netai Kr. Deb'),
    role: input('role', 'e.g. Director'),
    phones: input('phones', 'e.g. 94330 81123, 87774 80739'),
    emails: input('emails', 'e.g. name@gmail.com'),
    website: input('website', 'e.g. example.com'),
    address: input('address', 'Street, area, pincode'),
    links: h('textarea.textarea', { name: 'links', rows: 2, placeholder: 'Facebook, Instagram, LinkedIn or Google Maps links, one per line', value: query?.links ?? '' }),
    industry: h('select.select', { name: 'industry' }, INDUSTRIES.map(([key, label]) => h('option', { value: key, selected: key === (query?.industry ?? 'other') }, label))),
    notes: h('textarea.textarea', { name: 'notes', rows: 2, placeholder: 'Anything that helps find them, e.g. “near the police station”, or what you want to know' }),
  };
  let depth = 'quick';
  const depthToggle = h('div.segmented', { role: 'group', 'aria-label': 'How deep' });
  const drawDepth = () =>
    depthToggle.replaceChildren(
      ...[
        ['quick', 'Quick (about 12 searches)'],
        ['thorough', 'Thorough (about 22)'],
      ].map(([key, label]) => h(`button${depth === key ? '.active' : ''}`, { type: 'button', 'aria-pressed': String(depth === key), onClick: () => ((depth = key), drawDepth()) }, label)),
    );
  drawDepth();

  const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const cardButton = button('Read a visiting card', { glyph: 'image', onClick: () => fileInput.click(), disabled: !ready });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    await busy(cardButton, async () => {
      const image = await shrink(file);
      const found = await post('/api/research/read-card', { image });
      const put = (name, value) => {
        if (value && !fields[name].value.trim()) fields[name].value = value;
      };
      put('business', found.business);
      put('person', found.person);
      put('role', found.role);
      put('phones', (found.phones ?? []).join(', '));
      put('emails', (found.emails ?? []).join(', '));
      put('website', found.website);
      put('address', found.address);
      put('city', found.city);
      if (found.industry && fields.industry.value === 'other') fields.industry.value = found.industry;
      toast('Read the card. Check the fields before you start.');
    });
  });

  const form = h('form', { noValidate: true });
  const start = button('Start research', { kind: 'primary', glyph: 'search', type: 'submit', disabled: !ready });
  form.append(
    h(
      'div.form-grid.cols-2',
      fieldBox('Business or organisation', fields.business, { required: true, name: 'business' }),
      fieldBox('City or area', fields.city, { required: true, name: 'city', hint: 'Or give a phone number, website or address.' }),
      fieldBox('Person’s name', fields.person, { name: 'person' }),
      fieldBox('Their role', fields.role, { name: 'role' }),
      fieldBox('Phone numbers', fields.phones, { name: 'phones', hint: 'The surest way to find the right business. Separate with commas.' }),
      fieldBox('Email addresses', fields.emails, { name: 'emails' }),
      fieldBox('Website', fields.website, { name: 'website' }),
      fieldBox('Address or pincode', fields.address, { name: 'address' }),
      fieldBox('Links', fields.links, { span: true, name: 'links' }),
      fieldBox('Kind of business', fields.industry, { name: 'industry', hint: 'Adds the places that matter for it, like health schemes for a hospital.' }),
      h('div.field', h('label', 'How deep'), depthToggle, h('div.field-hint', 'Thorough also looks at registrations, the person’s professional profile and directories.')),
      fieldBox('Notes for the research', fields.notes, { span: true, name: 'notes', hint: 'Sent to Gemini with the details, so don’t write anything private.' }),
    ),
    h('div.row.wrap', { style: { marginTop: '18px', gap: '10px' } }, start, cardButton, fileInput),
    h('p.tiny.muted', { style: { marginTop: '12px' } }, 'Only public pages, read without signing in. Home addresses, family, personal posts and court records are left out. What you type goes to Google (Gemini), Tavily and SerpApi; on their free plans Google may use it to improve its products.'),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    for (const box of form.querySelectorAll('.field.has-error')) {
      box.classList.remove('has-error');
      box.querySelector('.field-error').hidden = true;
    }
    const body = Object.fromEntries(Object.entries(fields).map(([name, el]) => [name, el.value]));
    body.depth = depth;
    if (!body.business.trim()) return showError(form, 'business', 'Type the business’s name.');
    await busy(start, async () => {
      try {
        const run = await post('/api/research', body);
        navigate(`/details/${run.id}`);
      } catch (error) {
        if (error.data?.field && showError(form, error.data.field, error.message) !== false) return;
        throw error;
      }
    });
  });
  return card(cardHead('Who should we look up?'), h('div.card-body', form));
}

function showError(form, name, message) {
  const box = form.querySelector(`.field[data-name="${name}"]`);
  if (!box) return false;
  box.classList.add('has-error');
  const line = box.querySelector('.field-error');
  line.textContent = message;
  line.hidden = false;
  box.querySelector('input, textarea, select')?.focus();
  return true;
}

function runList(items) {
  const body = items.length
    ? h(
        'div.table-wrap',
        h(
          'table.table',
          h('thead', h('tr', h('th', 'Business'), h('th', 'Person'), h('th', 'Status'), h('th', 'Started'), h('th', 'By'))),
          h(
            'tbody',
            items.map((item) =>
              h(
                'tr.clickable',
                { onClick: () => navigate(`/details/${item.id}`) },
                h('td', h('a', { href: `/details/${item.id}` }, h('strong', item.business)), item.city && h('div.tiny.muted', item.city), item.sample && h('span.pill.violet', { style: { marginTop: '4px' } }, 'Example')),
                h('td', item.person || h('span.muted', '—')),
                h('td', statusPill(item.status)),
                h('td.nowrap', { title: dateTime(item.createdAt) }, relative(item.createdAt)),
                h('td', item.createdBy),
              ),
            ),
          ),
        ),
      )
    : h('div.card-body', empty({ glyph: 'target', title: 'Nothing looked up yet', text: 'Fill in the box above, or open the example to see what you get.' }));
  return h('div', { style: { marginTop: '18px' } }, card(cardHead('Looked up before'), body));
}

/* ================================================================== One run */

async function runPage(id) {
  setTitle('Details');
  show(pageSkeleton());
  let run;
  let timer = null;
  let alive = true;
  try {
    run = await get(`/api/research/${id}`);
  } catch (error) {
    toastError(error);
    show(empty({ glyph: 'search', title: 'That research isn’t here', text: 'It may have been deleted.', action: button('Back to Details', { href: '/details' }) }));
    return;
  }

  const poll = () => {
    clearTimeout(timer);
    if (!alive || !ACTIVE.includes(run.status)) return;
    timer = setTimeout(async () => {
      try {
        const fresh = await get(`/api/research/${id}`, { quiet: true });
        const changed = fresh.status !== run.status;
        run = fresh;
        if (changed || ACTIVE.includes(run.status)) draw();
      } catch {
        /* the next look tries again */
      }
      poll();
    }, run.status === 'waiting' ? 15_000 : 2_500);
  };

  const act = (path, { method = post, message = null } = {}) => async (event) =>
    busy(event.currentTarget, async () => {
      run = await method(`/api/research/${id}${path}`, {});
      if (message) toast(message);
      draw();
      poll();
    });

  function draw() {
    const canEdit = session.can('editor');
    const input = run.input;
    const more = h('button.icon-btn', { type: 'button', 'aria-label': 'More' }, icon('more'));
    more.addEventListener('click', () =>
      popMenu(more, [
        { label: 'Look up again with these details', icon: 'refresh', onClick: () => navigate(`/details?${new URLSearchParams(Object.fromEntries(Object.entries({ ...input, phones: input.phones.join(', '), emails: input.emails.join(', '), links: input.links.join('\n') }).filter(([, value]) => typeof value === 'string' && value)))}`) },
        canEdit && '-',
        canEdit && {
          label: 'Delete this research',
          icon: 'trash',
          danger: true,
          onClick: async () => {
            if (!(await confirm({ title: 'Delete this research?', message: `Everything found about ${input.business} goes, with its documents.`, confirmLabel: 'Delete', danger: true }))) return;
            try {
              await del(`/api/research/${id}`);
              navigate('/details');
            } catch (error) {
              toastError(error);
            }
          },
        },
      ]),
    );
    const actions = [
      statusPill(run.status),
      canEdit && ACTIVE.includes(run.status) && button('Stop', { glyph: 'stop', onClick: act('/cancel', { message: 'Stopped.' }) }),
      canEdit && ['failed', 'cancelled'].includes(run.status) && button('Carry on', { kind: 'primary', glyph: 'play', onClick: act('/retry') }),
      more,
    ].filter(Boolean);
    const subtitle = [[input.city, input.pincode].filter(Boolean).join(' '), input.person && `${input.person}${input.role ? `, ${input.role}` : ''}`, `started ${relative(run.createdAt)} by ${run.createdBy?.name ?? 'someone'}`].filter(Boolean).join(' · ');

    const blocks = [pageHead({ title: input.business, text: subtitle, crumbs: [{ label: 'Details', href: '/details' }, { label: input.business }], actions })];
    if (run.sample) blocks.push(notice('This is a made-up example: the hospital, people, numbers and pages are invented. It shows what a finished research looks like.', { glyph: 'sparkles' }));
    if (run.status === 'waiting') blocks.push(notice(h('span', h('b', 'Waiting. '), run.waitReason || 'A free limit was reached.', run.notBefore ? ` Carries on by itself at ${dateTime(run.notBefore)}.` : ''), { kind: 'warning', glyph: 'clock' }));
    if (run.status === 'failed') blocks.push(notice(h('span', h('b', 'Stopped by a problem. '), run.error), { kind: 'danger', glyph: 'alertCircle' }));
    if (run.status === 'cancelled') blocks.push(notice('Stopped. “Carry on” picks up where it left off.', { glyph: 'info' }));

    const researching = ['running', 'waiting'].includes(run.status) && !run.stage.startsWith('write');
    if (researching || (['failed', 'cancelled'].includes(run.status) && !run.facts.length)) blocks.push(progressCard(run));
    if (run.status === 'writing' || (run.status === 'waiting' && run.stage.startsWith('write'))) blocks.push(writingCard(run));
    if (run.status === 'ready' || (run.documents?.summary && run.status !== 'writing')) blocks.push(documentsCard(run, { id, canEdit, onChange: (fresh) => ((run = fresh), draw(), poll()) }));
    if (run.facts.length) {
      blocks.push(checksCard(run));
      blocks.push(factsCard(run, { id, canEdit, onChange: (fresh) => ((run = fresh), draw(), poll()) }));
      blocks.push(sourcesCard(run));
    }
    if (!researching) blocks.push(logCard(run, false));
    show(h('div.stack.loose', blocks));
  }

  draw();
  poll();
  return () => {
    alive = false;
    clearTimeout(timer);
  };
}

/* ------------------------------------------------------------------ Progress */

const stageIcon = (state) => {
  if (state === 'done') return h('div.list-icon', { style: { background: 'var(--success-soft)', color: 'var(--success)' } }, icon('check'));
  if (state === 'active') return h('div.list-icon.brand', h('span.spinner'));
  if (state === 'waiting') return h('div.list-icon', { style: { background: 'var(--warning-soft)', color: 'var(--warning)' } }, icon('clock'));
  if (state === 'failed' || state === 'cancelled') return h('div.list-icon', { style: { background: 'var(--danger-soft)', color: 'var(--danger)' } }, icon('x'));
  return h('div.list-icon', { style: { opacity: '0.5' } }, icon('clock'));
};

function progressCard(run) {
  const p = run.progress;
  const detail = {
    search: p.searches.total ? `${p.searches.done} of ${p.searches.total}` : '',
    pick: p.sources ? `${p.sources} pages` : '',
    extract: p.batches.total ? `${p.batches.done} of ${p.batches.total}` : '',
  };
  return card(
    cardHead('Researching', h('span.small.muted', `${run.usage.searches} searches · ${run.usage.ai} Gemini requests`)),
    h(
      'div.card-body.stack',
      h('div', p.stages.map((stage) => h('div.step-row', stageIcon(stage.state), h('div.step-text', h('strong', stage.label), detail[stage.key] ? h('span', detail[stage.key]) : null)))),
      logCard(run, true),
    ),
  );
}

function writingCard(run) {
  return card(cardHead('Writing the documents'), h('div.card-body', run.progress.writing.map((stage) => h('div.step-row', stageIcon(stage.state), h('div.step-text', h('strong', stage.label))))));
}

function logCard(run, inline) {
  const lines = [...run.log].reverse().map((line) => h(`div${line.kind === 'error' ? '.err' : line.kind === 'ok' ? '.ok' : ''}`, `${new Date(line.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${line.text}`));
  const box = h('div.console', { role: 'log', style: { height: inline ? '200px' : '260px' } }, lines);
  if (inline) return box;
  return card(h('details', h('summary.card-head', { style: { cursor: 'pointer', paddingBottom: '16px' } }, h('h2', 'Activity'), h('span.small.muted', `${run.log.length} steps`)), h('div.card-body', box)));
}

/* ------------------------------------------------------------------ What code checked */

function checksCard(run) {
  const c = run.checks ?? {};
  const rows = [];
  const row = (level, title, textValue, url = '') =>
    rows.push(
      h(
        'div.health-item',
        h(`span.lvl-${level}`, icon(level === 'ok' ? 'checkCircle' : level === 'info' ? 'info' : level === 'error' ? 'alertCircle' : 'alert')),
        h('div.grow', h('strong', title), h('div.small.muted', textValue)),
        url && h('a.small', { href: url, target: '_blank', rel: 'noopener', dataset: { external: '' }, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', flex: 'none' } }, 'Open', icon('external', { size: 13 })),
      ),
    );
  if (c.domain) row(c.domain.registered === false ? 'error' : c.domain.registered ? 'ok' : 'info', `Domain: ${c.domain.domain}`, c.domain.registered === false ? 'Not registered any more: anyone can buy it.' : c.domain.registered ? `Registered${c.domain.created ? ` since ${c.domain.created}` : ''}${c.domain.expires ? `, until ${c.domain.expires}` : ''}${c.domain.registrar ? ` (${c.domain.registrar})` : ''}.` : 'Couldn’t tell.', c.domain.url);
  if (c.website) row(c.website.opens && !c.website.parked ? (c.website.viewport && c.website.https ? 'ok' : 'warning') : 'error', 'Website', c.website.opens ? [c.website.parked ? 'Shows a parked or for-sale page' : 'Opens', c.website.builder && `built with ${c.website.builder}`, !c.website.https && 'no https', !c.website.viewport && 'no phone layout', c.website.copyrightYears?.length && `© ${c.website.copyrightYears.at(-1)}`].filter(Boolean).join(' · ') : `Doesn’t open: ${c.website.problem}`, c.website.url);
  if (c.speed?.score !== null && c.speed?.score !== undefined) row(c.speed.score >= 70 ? 'ok' : c.speed.score >= 45 ? 'warning' : 'error', 'Speed on a phone', `PageSpeed ${c.speed.score}/100${c.speed.lcp ? `; main content in ${c.speed.lcp}` : ''}.`);
  if (c.email) row(c.email.freeOnly ? 'warning' : 'ok', 'Email', c.email.list.map((item) => `${item.address}${item.free ? ' (free provider)' : item.mx ? ' (own domain)' : ' (domain has no mail servers)'}`).join(', '));
  if (c.maps) {
    if (c.maps.found) {
      const l = c.maps.listing;
      const r = c.maps.reviews;
      row(l.website ? 'ok' : 'warning', `Google Maps: ${l.title}`, [l.rating ? `${l.rating}★ from ${l.reviews} reviews` : 'No rating yet', l.website ? 'website linked' : 'no website linked', r?.read ? `${r.replied} of ${r.read} newest reviews answered` : '', `matched by ${c.maps.matchedBy}`].filter(Boolean).join(' · '), l.url);
    } else row(c.maps.skipped ? 'info' : 'warning', 'Google Maps', c.maps.skipped ? c.maps.error || 'Skipped: no SerpApi key.' : `Not found for “${c.maps.query}”${c.maps.names?.length ? `. It showed: ${c.maps.names.join('; ')}` : ''}.`);
  }
  if (c.archive?.snapshots) row('info', 'Internet Archive', `${c.archive.snapshots} saved copies, ${c.archive.first} to ${c.archive.last}.`, c.archive.url);
  if (!rows.length) return null;
  return card(cardHead('Checked by code', h('span.small.muted', 'free, exact')), h('div.card-body', rows));
}

/* ------------------------------------------------------------------ The facts to review */

function factsCard(run, { id, canEdit, onChange }) {
  const editable = canEdit && !ACTIVE.includes(run.status);
  const pending = new Map();
  const counter = h('span.small.muted');
  const drawCounter = () => {
    const used = run.facts.filter((fact) => (pending.get(fact.id)?.include ?? fact.include)).length;
    const shown = run.facts.filter((fact) => (pending.get(fact.id)?.include ?? fact.include) && (pending.get(fact.id)?.shareable ?? fact.shareable)).length;
    counter.textContent = `${used} of ${run.facts.length} used · ${shown} may go to the business`;
  };
  /** Saves the ticks and wording changed so far; also called right before writing, so nothing is lost. */
  const send = async () => {
    if (!pending.size) return;
    const changes = [...pending.values()];
    pending.clear();
    try {
      const fresh = await patch(`/api/research/${id}/facts`, { changes });
      run.facts = fresh.facts;
    } catch (error) {
      toastError(error);
    }
  };
  const flush = debounce(send, 400);
  const change = (factId, values) => {
    pending.set(factId, { ...(pending.get(factId) ?? { id: factId }), ...values });
    drawCounter();
    flush();
  };

  const factRow = (fact) => {
    const [label, kind, why] = CONFIDENCE[fact.confidence] ?? CONFIDENCE.probable;
    const include = h('input', { type: 'checkbox', checked: fact.include, disabled: !editable, 'aria-label': 'Use this fact', style: { accentColor: 'var(--brand)', width: '18px', height: '18px', marginTop: '2px' } });
    include.addEventListener('change', () => change(fact.id, { include: include.checked }));
    const share = h('input', { type: 'checkbox', checked: fact.shareable, disabled: !editable });
    share.addEventListener('change', () => change(fact.id, { shareable: share.checked }));
    const textEl = h('div', fact.text);
    const edit =
      editable &&
      h('button.icon-btn', {
        type: 'button',
        'aria-label': 'Edit the wording',
        title: 'Edit the wording',
        onClick: () => {
          const area = h('textarea.textarea', { rows: 2, value: textEl.textContent });
          const save = button('Save', { kind: 'primary', small: true, onClick: () => {
            const value = area.value.trim();
            if (!value) return;
            textEl.replaceChildren(value);
            change(fact.id, { text: value });
            editor.replaceWith(textEl);
          } });
          const editor = h('div.stack.tight', area, h('div.row', save, button('Cancel', { small: true, onClick: () => editor.replaceWith(textEl) })));
          textEl.replaceWith(editor);
          area.focus();
        },
      }, icon('pencil', { size: 15 }));
    const source = fact.origin === 'check' ? h('span.tiny.muted', 'Checked by code') : fact.origin === 'you' ? h('span.tiny.muted', `Added by ${fact.addedBy || 'you'}`) : null;
    const link = fact.url ? h('a.tiny', { href: fact.url, target: '_blank', rel: 'noopener', dataset: { external: '' }, style: { display: 'inline-flex', alignItems: 'center', gap: '3px' } }, hostOf(fact.url), icon('external', { size: 12 })) : null;
    const quote = fact.quote ? h('details.tiny', h('summary.muted', { style: { cursor: 'pointer' } }, 'The words on the page'), h('blockquote', { style: { margin: '6px 0 0', paddingLeft: '10px', borderLeft: '2px solid var(--line-strong)', color: 'var(--text-2)' } }, `“${fact.quote}”`)) : null;
    const flag = fact.flag === 'personal' ? h('span.pill.danger', 'Personal: left out') : null;
    return h(
      'div.list-row',
      { style: { alignItems: 'flex-start', padding: '12px 0' } },
      include,
      h('div.grow', { style: { minWidth: '0' } }, h('div.row.wrap', { style: { gap: '6px', marginBottom: '4px' } }, h('strong.small', fact.label), h(`span.pill.${kind}`, { title: why }, label), flag, fact.edited && h('span.pill', 'Edited')), textEl, h('div.row.wrap', { style: { gap: '10px', marginTop: '4px' } }, source, link, fact.also?.length ? h('span.tiny.muted', `also on ${fact.also.length} other page${fact.also.length > 1 ? 's' : ''}`) : null), quote),
      h('div.stack.tight', { style: { alignItems: 'flex-end', flex: 'none' } }, h('label.row.tiny.muted', { title: 'May appear on the one-page check sent to the business', style: { gap: '6px', cursor: 'pointer' } }, h('span', 'Client can see'), h('span.switch', share, h('span'))), edit),
    );
  };

  const groups = Object.entries(SECTIONS)
    .map(([key, title]) => {
      const facts = run.facts.filter((fact) => fact.section === key);
      if (!facts.length && !editable) return null;
      return h(
        'div',
        { style: { marginTop: '14px' } },
        h('div.row.between', h('h3', { style: { margin: '0', fontSize: '15px' } }, title), editable && button('Add', { small: true, glyph: 'plus', onClick: () => addFact(key) })),
        facts.length ? h('div', facts.map(factRow)) : h('p.small.muted', { style: { margin: '6px 0 0' } }, 'Nothing found.'),
      );
    })
    .filter(Boolean);

  const addFact = (section) => {
    const textArea = h('textarea.textarea', { rows: 3, placeholder: 'One plain sentence' });
    const url = h('input.input', { type: 'url', placeholder: 'Where it came from (optional)' });
    const share = h('input', { type: 'checkbox' });
    modal({
      title: `Add to “${SECTIONS[section]}”`,
      body: h('div.stack', h('div.field', h('label', 'The fact'), textArea), h('div.field', h('label', 'Link'), url), h('label.row', { style: { gap: '8px' } }, share, 'The business may see this (it can go on the one-page check)')),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Add',
          kind: 'primary',
          onClick: async () => {
            if (!textArea.value.trim()) return false;
            await send();
            onChange(await patch(`/api/research/${id}/facts`, { add: [{ section, text: textArea.value, url: url.value, shareable: share.checked }] }));
          },
        },
      ],
    });
  };

  const write = editable && !run.sample && ['review', 'ready', 'failed'].includes(run.status)
    ? button(run.documents?.summary ? 'Rewrite the documents' : 'Write the two documents', {
        kind: run.documents?.summary ? '' : 'primary',
        glyph: 'wand',
        onClick: async (event) => {
          if (run.documents?.summary && !(await confirm({ title: 'Rewrite both documents?', message: 'They’ll be written again from the ticked facts. Wording you changed in the documents is replaced.', confirmLabel: 'Rewrite' }))) return;
          await busy(event.currentTarget, async () => {
            await send();
            onChange(await post(`/api/research/${id}/write`, {}));
          });
        },
      })
    : null;
  drawCounter();
  return card(
    cardHead('What we found', counter),
    h(
      'div.card-body',
      run.status === 'review' && notice('Untick anything wrong, fix wording, and switch off “Client can see” for anything the business shouldn’t read. Then write the documents.', { glyph: 'info' }),
      groups,
      write && h('div.row', { style: { marginTop: '18px' } }, write),
    ),
  );
}

/* ------------------------------------------------------------------ Pages read */

function sourcesCard(run) {
  if (!run.sources.length) return null;
  const pill = (identity) => (identity === 'strong' ? h('span.pill.success', 'Same phone, email or site') : identity === 'name' ? h('span.pill.warning', 'Same name and place') : h('span.pill', 'Name only'));
  return card(
    h(
      'details',
      h('summary.card-head', { style: { cursor: 'pointer', paddingBottom: '16px' } }, h('h2', `Pages read (${run.sources.length})`), h('span.small.muted', 'what each shares with the business')),
      h(
        'div.card-body',
        run.sources.map((source) =>
          h(
            'div.health-item',
            h('div.grow', { style: { minWidth: '0' } }, h('a', { href: source.url, target: '_blank', rel: 'noopener', dataset: { external: '' } }, h('strong', source.title || source.host)), h('div.tiny.muted.truncate', source.url), h('div.tiny.muted', source.match?.hits?.join(' · ') || '')),
            pill(source.match?.identity),
          ),
        ),
      ),
    ),
  );
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/* ------------------------------------------------------------------ The documents */

function documentsCard(run, { id, canEdit, onChange }) {
  const docs = run.documents;
  const fit = docs.fit ?? {};
  const LABELS = { summary: 'the two-page summary', onepager: 'the one-page check' };

  /** Fetches one printed PDF and saves it under the name the server gives it. */
  const savePdf = async (kind) => {
    const response = await fetch(withBase(`/api/research/${id}/pdf/${kind}`), { credentials: 'same-origin' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.message || `The PDF couldn’t be printed (${response.status}).`);
      error.code = data.error;
      throw error;
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? `${kind}.pdf`;
    const url = URL.createObjectURL(await response.blob());
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  /** Where the server can't print (the live admin, for now): the browser's own “Save as PDF”, same pages. */
  const printInstead = (kinds) =>
    modal({
      title: 'Save the PDFs from your browser',
      body: h(
        'div.stack',
        h('p', 'This admin can’t print PDFs by itself yet. Open each document: it shows how to save it (Ctrl+P, then “Save as PDF”), and it comes out on A4 exactly as in the preview.'),
        h('div.row.wrap', kinds.map((kind) => button(`Open ${LABELS[kind]}`, { glyph: 'external', href: `/api/research/${id}/preview/${kind}?print=1`, target: '_blank' }))),
      ),
      actions: [{ label: 'Done' }],
    });

  const savePdfs = async (kinds) => {
    try {
      for (const kind of kinds) await savePdf(kind);
    } catch (error) {
      if (error.code === 'no_printer') return printInstead(kinds);
      throw error;
    }
    if (kinds.length > 1) toast('Downloaded. If the browser asks, allow it to download two files.');
  };
  const download = (kind) => savePdfs([kind]).catch(toastError);
  const both = button('Download both PDFs', {
    kind: 'primary',
    glyph: 'download',
    onClick: async (event) => busy(event.currentTarget, () => savePdfs(docs.onepager ? ['summary', 'onepager'] : ['summary'])),
  });

  const frame = (kind, title, pages, available) => {
    const wrap = h('div.doc-frame');
    if (available) {
      const iframe = h('iframe', { src: withBase(`/api/research/${id}/preview/${kind}`), title, loading: 'lazy', style: { height: `${pages * 1123}px` } });
      wrap.append(iframe);
      const fitFrame = () => (iframe.style.zoom = String(Math.max(0.3, (wrap.clientWidth - 2) / 820)));
      new ResizeObserver(fitFrame).observe(wrap);
    } else wrap.append(h('div.card-body', empty({ glyph: 'fileText', title: 'No one-page check', text: 'No facts are marked “Client can see”. Switch some on and rewrite.' })));
    const over = fit[kind]?.overflow;
    return h(
      'div.stack.tight',
      h('div.row.between', h('strong', title), available && h('div.row', { style: { gap: '6px' } }, button('', { small: true, glyph: 'external', title: 'Open full size', href: `/api/research/${id}/preview/${kind}`, target: '_blank' }), button('PDF', { small: true, glyph: 'download', onClick: (event) => busy(event.currentTarget, () => download(kind)) }))),
      over && notice(`Longer than ${pages === 1 ? 'one page' : 'two pages'} even at small type. Untick a few facts or shorten wording, then rewrite.`, { kind: 'warning', glyph: 'alert' }),
      wrap,
    );
  };

  const editButton =
    canEdit &&
    !run.sample &&
    button('Edit headlines', {
      glyph: 'pencil',
      onClick: () => {
        const s = docs.summary;
        const o = docs.onepager;
        const input = (value) => h('input.input', { value: value ?? '' });
        const area = (value) => h('textarea.textarea', { rows: 3, value: value ?? '' });
        const f = {
          keyHeading: input(s.keyFact?.heading),
          keyText: area(s.keyFact?.text),
          bottomHeading: input(s.bottomLine?.heading),
          bottomText: area(s.bottomLine?.text),
          pitch: area(s.pitchSentence),
          intro: o && area(o.intro),
          next: o && area(o.nextStep),
        };
        const row = (label, control) => control && h('div.field', h('label', label), control);
        modal({
          title: 'Edit the headlines',
          size: 'wide',
          body: h('div.stack', row('The fact that shapes everything', f.keyHeading), row('…its explanation', f.keyText), row('Bottom line', f.bottomHeading), row('…its explanation', f.bottomText), row('Your pitch in one sentence', f.pitch), row('One-page check: opening lines', f.intro), row('One-page check: next step', f.next)),
          actions: [
            { label: 'Cancel' },
            {
              label: 'Save',
              kind: 'primary',
              onClick: async () => {
                const body = { keyFact: { heading: f.keyHeading.value, text: f.keyText.value }, bottomLine: { heading: f.bottomHeading.value, text: f.bottomText.value }, pitchSentence: f.pitch.value };
                if (o) Object.assign(body, { intro: f.intro.value, nextStep: f.next.value });
                onChange(await patch(`/api/research/${id}/documents`, body));
                toast('Saved. The PDFs use the new wording.');
              },
            },
          ],
        });
      },
    });

  return card(
    cardHead('Your two documents', h('div.row', { style: { gap: '8px' } }, editButton, both)),
    h(
      'div.card-body.stack',
      h('p.small.muted', `Written ${relative(docs.writtenAt)}${docs.editedAt ? `, edited ${relative(docs.editedAt)}` : ''} · facts as of ${docs.date}. The one-page check is safe to send; the summary is for you.`),
      h('div.doc-grid', frame('summary', 'Two-page summary (internal)', 2, true), frame('onepager', 'One-page online health check (to send)', 1, Boolean(docs.onepager))),
    ),
  );
}
