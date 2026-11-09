import { h, mediaUrl } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { navigate, setGuard } from '../lib/router.js';
import { createForm, strip, clone } from '../lib/form.js';
import { button, confirm, empty, notice, pageHead, pageSkeleton, popMenu, toast, toastError, busy } from '../lib/ui.js';
import { relative } from '../lib/format.js';
import { designSchema, studySchema, systemSchema } from './schemas.js';

/**
 * The studio's work: the design cards that travel across the home page (in
 * the order they travel), their case studies and chapters, and the systems
 * on the work page. Cards can be reordered, archived (kept in the admin to
 * bring back) and added; systems can be reordered and hidden.
 */

let tab = 'design';

export default async function projects({ params, path }) {
  if (path === '/projects/new') return designEditor(null);
  if (params.slug && path.startsWith('/projects/design/')) return designEditor(params.slug);
  if (params.slug && path.startsWith('/projects/system/')) return systemEditor(params.slug);
  return list();
}

async function list() {
  setTitle('Projects');
  show(pageSkeleton());
  let data;
  try {
    data = await get('/api/projects');
  } catch (error) {
    toastError(error);
    return;
  }
  const canEdit = session.can('editor');
  const order = data.design.map((card) => card.slug);
  const systemsOrder = data.systems.filter((s) => s.visible).map((s) => s.slug);
  const hidden = new Set(data.systems.filter((s) => !s.visible).map((s) => s.slug));
  let dirty = false;
  const body = h('div');
  const savebar = h('div.savebar', icon('arrowUp'), h('span.grow', 'The order has changed.'), button('Undo', { kind: 'ghost', glyph: 'undo', onClick: () => list() }), button('Save order', { kind: 'primary', glyph: 'check', onClick: (event) => saveOrder(event.currentTarget) }));
  const markDirty = () => {
    dirty = true;
    savebar.classList.add('show');
    setGuard(() => confirm({ title: 'Leave without saving the order?', message: 'The new order hasn’t been saved.', confirmLabel: 'Leave', danger: true }));
  };

  async function saveOrder(btn) {
    await busy(btn, async () => {
      if (tab === 'design') {
        const section = await get('/api/content/works');
        const bySlug = new Map(section.value.projects.map((card, i) => [card.slug, { ...card, __i: i }]));
        await put('/api/content/works', { value: { ...section.value, projects: order.map((slug) => bySlug.get(slug)).filter(Boolean) }, version: section.version });
      } else {
        const section = await get('/api/content/systemOrder');
        await put('/api/content/systemOrder', { value: systemsOrder, version: section.version });
      }
      dirty = false;
      savebar.classList.remove('show');
      setGuard(null);
      toast('Order saved. Publish to put it live.');
      refreshBadges();
    });
  }

  const move = (listRef, from, to) => {
    if (to < 0 || to >= listRef.length) return;
    const [item] = listRef.splice(from, 1);
    listRef.splice(to, 0, item);
    markDirty();
    draw();
  };

  const draw = () => {
    if (tab === 'design') {
      const bySlug = new Map(data.design.map((card) => [card.slug, card]));
      let dragFrom = null;
      body.replaceChildren(
        h('p.muted.small', { style: { marginBottom: '14px' } }, 'In the order they travel across the home page. ', canEdit ? 'Drag a card, or use its arrows, then save the order.' : ''),
        h(
          'div.project-grid',
          order.map((slug, i) => {
            const item = bySlug.get(slug);
            const el = h(
              'a.project-card',
              { href: `/projects/design/${slug}`, draggable: canEdit ? 'true' : 'false' },
              h('img', { src: mediaUrl(item.src), alt: '', loading: 'lazy', style: { objectPosition: item.focus } }),
              h('div.tags', h('span.pill', String(i + 1).padStart(2, '0')), h('span.pill', item.hasDeck ? `${item.editions.reduce((n, e) => n + e.pages, 0)} pages` : 'Picture')),
              item.accent && h('span.accent', { style: { background: item.accent } }),
              h('div.info', h('strong', item.title), h('span', item.kind)),
              canEdit &&
                h(
                  'div.order',
                  h('button', { type: 'button', 'aria-label': `Move ${item.title} earlier`, onClick: (e) => (e.preventDefault(), move(order, i, i - 1)) }, icon('chevronLeft')),
                  h('button', { type: 'button', 'aria-label': `Move ${item.title} later`, onClick: (e) => (e.preventDefault(), move(order, i, i + 1)) }, icon('chevronRight')),
                ),
            );
            el.addEventListener('dragstart', (event) => {
              dragFrom = i;
              el.classList.add('dragging');
              event.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragend', () => el.classList.remove('dragging'));
            el.addEventListener('dragover', (event) => {
              event.preventDefault();
              el.classList.add('drop');
            });
            el.addEventListener('dragleave', () => el.classList.remove('drop'));
            el.addEventListener('drop', (event) => {
              event.preventDefault();
              el.classList.remove('drop');
              if (dragFrom !== null && dragFrom !== i) move(order, dragFrom, i);
              dragFrom = null;
            });
            return el;
          }),
        ),
        data.orphanStudies.length ? h('div', { style: { marginTop: '16px' } }, notice(`Case studies without a card: ${data.orphanStudies.join(', ')}. They stay in work.ts but nothing opens them.`, { kind: 'warning', glyph: 'alert' })) : null,
      );
    } else if (tab === 'systems') {
      const bySlug = new Map(data.systems.map((s) => [s.slug, s]));
      const row = (s, i, visible) =>
        h(
          'section.card.system-card',
          h('a.shot', { href: `/projects/system/${s.slug}` }, s.cover ? h('img', { src: mediaUrl(s.cover), alt: '', loading: 'lazy' }) : null),
          h('div.stack.tight', h('div.row.wrap', h('a', { href: `/projects/system/${s.slug}` }, h('strong', s.title)), h('span.pill', s.platform === 'app' ? 'App' : 'Web'), !visible && h('span.pill.warning', 'Hidden')), h('span.small.muted', s.kind), h('span.tiny.faint', [s.industry, s.year, `${s.screens} screens`, s.live?.label].filter(Boolean).join(' · '))),
          h(
            'div.row',
            canEdit && visible && h('button.icon-btn', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onClick: () => move(systemsOrder, i, i - 1) }, icon('arrowUp')),
            canEdit && visible && h('button.icon-btn', { type: 'button', 'aria-label': 'Move down', disabled: i === systemsOrder.length - 1, onClick: () => move(systemsOrder, i, i + 1) }, icon('arrowDown')),
            canEdit &&
              h('button.btn.small', { type: 'button', onClick: () => {
                if (visible) {
                  if (systemsOrder.length <= 1) return toast('Keep at least one system on the work page.', { type: 'error' });
                  systemsOrder.splice(systemsOrder.indexOf(s.slug), 1);
                  hidden.add(s.slug);
                } else {
                  hidden.delete(s.slug);
                  systemsOrder.push(s.slug);
                }
                markDirty();
                draw();
              } }, icon(visible ? 'eyeOff' : 'eye'), visible ? 'Hide' : 'Show'),
            h('a.btn.small', { href: `/projects/system/${s.slug}` }, icon('pencil'), 'Edit'),
          ),
        );
      body.replaceChildren(
        h('p.muted.small', { style: { marginBottom: '14px' } }, 'The systems row of /works, in order. A hidden system keeps its case study but leaves the work page.'),
        h('div.stack.tight', systemsOrder.map((slug, i) => row(bySlug.get(slug), i, true)), [...hidden].map((slug) => row(bySlug.get(slug), -1, false))),
        h('p.small.muted', { style: { marginTop: '14px' } }, 'New systems need their screens captured first: ', h('code.mono', 'node scripts/work/screens.mjs <slug>'), ' (see the site’s README).'),
      );
    } else {
      body.replaceChildren(
        data.archived.length
          ? h(
              'div.stack.tight',
              data.archived.map((entry) =>
                h(
                  'section.card.system-card',
                  h('div.shot', h('img', { src: mediaUrl(entry.card.src), alt: '', loading: 'lazy', style: { objectPosition: entry.card.focus } })),
                  h('div.stack.tight', h('strong', entry.card.title), h('span.small.muted', entry.card.kind), h('span.tiny.faint', `Archived ${relative(entry.archivedAt)} by ${entry.by}`)),
                  h(
                    'div.row',
                    canEdit && button('Restore', { small: true, glyph: 'undo', onClick: async (event) => {
                      await busy(event.currentTarget, async () => {
                        await post('/api/projects/design/restore', { slug: entry.card.slug });
                        toast(`${entry.card.title} is back in Selected work.`);
                        refreshBadges();
                        list();
                      });
                    } }),
                    session.can('owner') && button('', { small: true, glyph: 'trash', title: 'Forget for good', onClick: async () => {
                      if (!(await confirm({ title: `Forget ${entry.card.title}?`, message: 'The archived card is removed from the admin. Its picture stays in the media library.', confirmLabel: 'Forget', danger: true }))) return;
                      await del(`/api/projects/archive/${encodeURIComponent(entry.card.slug)}`);
                      list();
                    } }),
                  ),
                ),
              ),
            )
          : empty({ glyph: 'archive', title: 'Nothing archived', text: 'Archiving a card takes it off the site but keeps it here, ready to bring back.' }),
      );
    }
  };

  const tabs = h('div.tabs', { role: 'tablist' });
  const drawTabs = () =>
    tabs.replaceChildren(
      ...[
        ['design', 'Design', data.design.length],
        ['systems', 'Systems', data.systems.length],
        ['archived', 'Archived', data.archived.length],
      ].map(([id, label, n]) =>
        h(`button${tab === id ? '.active' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onClick: async () => {
          if (dirty && !(await confirm({ title: 'Switch without saving the order?', message: 'The new order will be lost.', confirmLabel: 'Switch', danger: true }))) return;
          if (dirty) return list().then(() => ((tab = id), drawTabs(), draw()));
          tab = id;
          drawTabs();
          draw();
        } }, label, h('span.n', String(n))),
      ),
    );
  drawTabs();
  draw();
  show(
    pageHead({ title: 'Projects', text: 'The work the site shows: design identities that open their decks, and the systems the studio engineers.', actions: canEdit ? [button('Add a card', { kind: 'primary', glyph: 'plus', href: '/projects/new' })] : [] }),
    tabs,
    body,
    savebar,
  );
  return () => setGuard(null);
}

/* ------------------------------------------------------------------ Design project editor */

async function designEditor(slug) {
  const isNew = !slug;
  setTitle(isNew ? 'New project card' : 'Project');
  show(pageSkeleton());
  let works;
  let studies;
  let projectsData;
  try {
    [works, studies, projectsData] = await Promise.all([get('/api/content/works'), get('/api/content/studies'), get('/api/projects')]);
  } catch (error) {
    toastError(error);
    return;
  }
  const index = isNew ? -1 : works.value.projects.findIndex((card) => card.slug === slug);
  if (!isNew && index < 0) {
    show(empty({ glyph: 'briefcase', title: 'That project isn’t in Selected work', text: 'It may have been archived or renamed.', action: button('All projects', { href: '/projects', kind: 'primary' }) }));
    return;
  }
  const canEdit = session.can('editor');
  const industries = [...new Set(works.value.projects.map((card) => card.industry))];
  const schema = designSchema({ isNew, industries, decks: projectsData.decks });
  const card = isNew ? { slug: '', title: '', kind: '', src: '', focus: '50% 50%', industry: '' } : works.value.projects[index];
  const study = !isNew ? studies.value[slug] : null;
  if (!isNew) setTitle(card.title);

  let dirty = { card: false, study: false };
  const savebar = h('div.savebar');
  const saveButton = button(isNew ? 'Add to Selected work' : 'Save', { kind: 'primary', glyph: 'check' });
  savebar.append(icon('pencil'), h('span.grow', isNew ? 'A new card, added at the end of the row.' : 'Unsaved changes'), button('Discard', { kind: 'ghost', glyph: 'undo', onClick: () => designEditor(slug) }), saveButton);
  const changed = () => {
    const any = isNew || dirty.card || dirty.study;
    savebar.classList.toggle('show', any && canEdit);
    setGuard(dirty.card || dirty.study ? () => confirm({ title: 'Leave without saving?', message: 'Your changes to this project haven’t been saved.', confirmLabel: 'Leave', danger: true }) : null);
  };
  const cardForm = createForm({ schema: schema.card, value: card, onChange: (d) => ((dirty.card = d), changed()), columns: 2 });
  const studyForm = study ? createForm({ schema: studySchema(projectsData.decks), value: study, onChange: (d) => ((dirty.study = d), changed()) }) : null;
  if (!canEdit) [cardForm.el, studyForm?.el].forEach((el) => el?.querySelectorAll('input, textarea, select, button').forEach((c) => (c.disabled = true)));
  changed();

  saveButton.addEventListener('click', async () => {
    const problems = [...cardForm.validate(), ...(studyForm?.validate() ?? [])];
    if (problems.length) return toast(problems.length === 1 ? problems[0].message : `${problems.length} things need fixing first.`, { type: 'error' });
    await busy(saveButton, async () => {
      const nextCard = cardForm.getValue();
      const projects = works.value.projects.map((item, i) => ({ ...clone(item), __i: i }));
      if (isNew) projects.push(strip(nextCard));
      else projects[index] = { ...nextCard, __i: index };
      const changes = [];
      if (isNew || dirty.card) changes.push({ id: 'works', value: { ...works.value, projects }, version: works.version });
      if (studyForm && dirty.study) changes.push({ id: 'studies', value: { ...studies.value, [slug]: studyForm.getValue() }, version: studies.version });
      try {
        await put('/api/content', { changes, summary: isNew ? `Added the ${nextCard.title} card` : `Edited the ${nextCard.title} project` });
      } catch (error) {
        if (error.data?.problems) {
          const own = error.data.problems.map((p) => ({ ...p, path: error.data.id === 'works' ? p.path.slice(2) : p.path.slice(1) }));
          (error.data.id === 'works' ? cardForm : studyForm)?.showProblems(own);
        }
        throw error;
      }
      setGuard(null);
      toast(isNew ? `${nextCard.title} added to Selected work.` : 'Project saved. Publish to put it live.');
      refreshBadges();
      if (isNew) navigate(`/projects/design/${strip(nextCard).slug}`, { force: true });
      else designEditor(slug);
    });
  });

  const actions = [];
  if (!isNew) {
    const more = h('button.btn.icon', { type: 'button', 'aria-label': 'More' }, icon('more'));
    more.addEventListener('click', () =>
      popMenu(more, [
        { label: 'Open the picture', icon: 'image', href: mediaUrl(card.src), target: '_blank' },
        canEdit && '-',
        canEdit && {
          label: 'Archive this card',
          icon: 'archive',
          danger: true,
          onClick: async () => {
            if (!(await confirm({ title: `Archive ${card.title}?`, message: 'It leaves Selected work and the work page. The card is kept under Projects → Archived, and its case study stays in work.ts.', confirmLabel: 'Archive', danger: true, icon: 'archive' }))) return;
            try {
              await post(`/api/projects/design/${encodeURIComponent(slug)}/archive`, {});
              toast(`${card.title} archived.`);
              refreshBadges();
              navigate('/projects', { force: true });
            } catch (error) {
              toastError(error);
            }
          },
        },
      ]),
    );
    actions.push(more);
  }

  show(
    pageHead({
      title: isNew ? 'New project card' : card.title,
      text: isNew ? 'A card opens its picture in the viewer. To give it a full case study, render its deck first (scripts/work/build.py), then describe it here.' : card.kind,
      crumbs: [{ label: 'Projects', href: '/projects' }, { label: isNew ? 'New card' : card.title }],
      actions,
    }),
    h('div.stack', h('section.card.card-pad', cardForm.el), studyForm ? h('section.card.card-pad', studyForm.el) : !isNew && h('section.card.card-pad', notice(h('span', h('b', 'No case study yet. '), 'This card opens its picture. Render its PDF with ', h('code.mono', 'python scripts/work/build.py'), ', import the JSON in content/projects.ts and add the study in content/work.ts; it can then be edited here.')))),
    savebar,
  );
  return () => setGuard(null);
}

/* ------------------------------------------------------------------ System editor */

async function systemEditor(slug) {
  setTitle('System');
  show(pageSkeleton());
  let systems;
  try {
    systems = await get('/api/content/systems');
  } catch (error) {
    toastError(error);
    return;
  }
  const system = systems.value[slug];
  if (!system) {
    show(empty({ glyph: 'layers', title: 'There’s no such system', action: button('All projects', { href: '/projects', kind: 'primary' }) }));
    return;
  }
  setTitle(system.title);
  const canEdit = session.can('editor');
  const computed = systems.computed.filter((path) => path[0] === slug).map((path) => path.slice(1));
  const savebar = h('div.savebar');
  const saveButton = button('Save', { kind: 'primary', glyph: 'check' });
  savebar.append(icon('pencil'), h('span.grow', 'Unsaved changes'), button('Discard', { kind: 'ghost', glyph: 'undo', onClick: () => systemEditor(slug) }), saveButton);
  const form = createForm({
    schema: systemSchema(),
    value: system,
    computed,
    columns: 2,
    onChange: (dirty) => {
      savebar.classList.toggle('show', dirty && canEdit);
      setGuard(dirty ? () => confirm({ title: 'Leave without saving?', message: `Your changes to ${system.title} haven’t been saved.`, confirmLabel: 'Leave', danger: true }) : null);
    },
  });
  if (!canEdit) form.el.querySelectorAll('input, textarea, select, button').forEach((c) => (c.disabled = true));
  saveButton.addEventListener('click', async () => {
    const problems = form.validate();
    if (problems.length) return toast(problems.length === 1 ? problems[0].message : `${problems.length} things need fixing first.`, { type: 'error' });
    await busy(saveButton, async () => {
      try {
        await put('/api/content/systems', { value: { ...systems.value, [slug]: form.getValue() }, version: systems.version });
      } catch (error) {
        if (error.data?.problems) form.showProblems(error.data.problems.map((p) => ({ ...p, path: p.path.slice(1) })));
        throw error;
      }
      setGuard(null);
      toast(`${system.title} saved. Publish to put it live.`);
      refreshBadges();
      systemEditor(slug);
    });
  });
  show(
    pageHead({
      title: system.title,
      text: system.kind,
      crumbs: [{ label: 'Projects', href: '/projects' }, { label: 'Systems' }, { label: system.title }],
      actions: [system.live && button('Live site', { glyph: 'external', href: system.live.href, target: '_blank' })].filter(Boolean),
    }),
    h('section.card.card-pad', form.el),
    savebar,
  );
  return () => setGuard(null);
}
