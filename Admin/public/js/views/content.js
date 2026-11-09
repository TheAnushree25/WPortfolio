import { h, mediaUrl } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, put } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { navigate, setGuard } from '../lib/router.js';
import { createForm, strip } from '../lib/form.js';
import { button, confirm, empty, notice, pageHead, pageSkeleton, toast, toastError, busy } from '../lib/ui.js';
import { initials } from '../lib/format.js';
import { SCHEMAS } from './schemas.js';

/**
 * The site's words, section by section. The index groups the sections the
 * way a visitor meets them; each editor saves straight into the site's
 * content file, and shows a preview where one helps.
 */

const GROUP_ICONS = { Studio: 'star', 'Every page': 'layers', 'Home page': 'home', 'Other pages': 'fileText' };
const SECTION_ICONS = { studio: 'star', seo: 'globe', viewport: 'palette', nav: 'menu', footer: 'columns', hero: 'sparkles', works: 'briefcase', practice: 'list', story: 'quote', partners: 'users', method: 'layers', testimonials: 'quote', nextPage: 'arrowRight', worksPage: 'grid', deck: 'file', booking: 'calendar' };
const VIEW_ON_SITE = { hero: '/', works: '/', practice: '/#expertise', story: '/#about', partners: '/#clients', method: '/#process', testimonials: '/#testimonials', nextPage: '/', worksPage: '/works', deck: '/deck', booking: '/contact', footer: '/', nav: '/', studio: '/' };

export default async function content({ params }) {
  if (params.id) return editor(params.id);
  return index();
}

async function index() {
  setTitle('Pages & copy');
  show(pageSkeleton());
  let sections;
  let health;
  try {
    [sections, health] = await Promise.all([get('/api/content'), get('/api/health')]);
  } catch (error) {
    toastError(error);
    return;
  }
  const flagged = new Map();
  for (const check of health.checks) {
    const id = check.href?.match(/^\/content\/(\w+)/)?.[1];
    if (id && check.level !== 'ok') flagged.set(id, check);
  }
  const groups = new Map();
  for (const section of sections) {
    if (!groups.has(section.group)) groups.set(section.group, []);
    groups.get(section.group).push(section);
  }
  show(
    pageHead({ title: 'Pages & copy', text: 'Every word on the site, where a visitor meets it. Changes save into the site’s own content files; publish when you’re ready for visitors to see them.' }),
    h(
      'div.stack.loose',
      [...groups.entries()].map(([group, list]) =>
        h(
          'section',
          h('div.section-title', h('h2.row', icon(GROUP_ICONS[group] ?? 'fileText'), group)),
          h(
            'div.content-index',
            list.map((section) => {
              const flag = flagged.get(section.id);
              return h(
                'a.card.content-link',
                { href: `/content/${section.id}` },
                h('div.list-icon.brand', icon(SECTION_ICONS[section.id] ?? 'fileText')),
                h('div.grow', h('strong', section.label), h('span', section.description), flag && h('div', { style: { marginTop: '8px' } }, h(`span.pill.${flag.level === 'error' ? 'danger' : flag.level === 'warning' ? 'warning' : 'brand'}`, icon(flag.level === 'info' ? 'info' : 'alert'), flag.title))),
                icon('chevronRight'),
              );
            }),
          ),
        ),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ Previews */

function preview(id, value) {
  if (id === 'testimonials') {
    const first = value.cards?.[0];
    return h(
      'div.preview-pane',
      h('div.preview-label', 'Front card'),
      first
        ? h('div.quote-card', h('p', `“${first.quote || '…'}”`), h('div.who', h('span.avatar.small', first.initials || initials(first.name)), h('div', h('b', first.name || 'Name'), h('div', { style: { opacity: 0.7 } }, first.role))))
        : h('p', 'No testimonials.'),
      h('div.preview-label', { style: { marginTop: '16px' } }, `${value.cards?.length ?? 0} cards in the deck`),
    );
  }
  if (id === 'partners') {
    return h('div.preview-pane', h('div.preview-label', value.title), h('div.partner-preview', (value.logos ?? []).map((logo) => h('div', logo.src ? h('img', { src: mediaUrl(logo.src), alt: logo.name, loading: 'lazy' }) : logo.name))));
  }
  if (id === 'seo') {
    const image = value.openGraph?.images?.[0];
    return h(
      'div.stack',
      h('div.serp', h('div.site', 'theatlasstudio.com'), h('div.t', value.title || 'Page title'), h('div.d', (value.description ?? '').length > 158 ? `${value.description.slice(0, 155)}…` : value.description)),
      h('div.share-card', h('div.img', image ? { style: { backgroundImage: `url("${mediaUrl(image)}")` } } : {}, image ? '' : 'No preview image'), h('div.txt', h('b', value.openGraph?.title || value.title), h('span', value.openGraph?.description || value.description))),
    );
  }
  if (id === 'hero') {
    return h('div.preview-pane', h('div.preview-label', 'Studio slide'), h('div', { style: { fontSize: '24px', lineHeight: '1.15', fontWeight: '500' } }, (value.statement ?? []).map((line) => h('div', line))), h('p', { style: { marginTop: '14px', opacity: 0.8, fontSize: '14px' } }, value.mission));
  }
  if (id === 'method') {
    return h('div.preview-pane', h('div.preview-label', value.title), h('div.stack.tight', (value.steps ?? []).map((step, i) => h('div.quote-card', { style: { padding: '12px 14px' } }, h('b', `${String(i + 1).padStart(2, '0')} · ${step.title}`), h('p', { style: { fontSize: '13px', opacity: 0.8, marginTop: '4px' } }, step.text)))));
  }
  if (id === 'viewport') {
    return h('div.preview-pane', { style: { background: value.themeColor } }, h('div.preview-label', 'Browser bar'), h('p', value.themeColor));
  }
  return null;
}

/* ------------------------------------------------------------------ Editor */

async function editor(id) {
  show(pageSkeleton());
  let section;
  try {
    section = await get(`/api/content/${encodeURIComponent(id)}`);
  } catch (error) {
    setTitle('Content');
    show(empty({ glyph: 'fileText', title: 'That section isn’t here', text: error.message, action: button('All sections', { href: '/content', kind: 'primary' }) }));
    return;
  }
  setTitle(section.label);
  const schema = SCHEMAS[id];
  if (!schema) {
    show(empty({ glyph: 'fileText', title: 'This section is edited elsewhere', action: button('Projects', { href: '/projects', kind: 'primary' }) }));
    return;
  }
  const canEdit = session.can('editor');
  let current = section;
  const savebar = h('div.savebar');
  const previewCol = h('div.preview-col');
  const status = h('span.grow', 'Unsaved changes');
  const discardButton = button('Discard', { kind: 'ghost', glyph: 'undo' });
  const saveButton = button('Save', { kind: 'primary', glyph: 'check' });
  savebar.append(icon('pencil'), status, discardButton, saveButton);

  let form;
  const drawPreview = () => {
    const pane = preview(id, strip(form.getValue()));
    previewCol.replaceChildren(...(pane ? [h('div.preview-label', { style: { color: 'var(--faint)' } }, 'Preview'), pane] : []));
  };
  const onChange = (dirty) => {
    savebar.classList.toggle('show', dirty && canEdit);
    setGuard(dirty ? () => confirm({ title: 'Leave without saving?', message: `Your changes to ${section.label} haven’t been saved.`, confirmLabel: 'Leave', danger: true }) : null);
    drawPreview();
  };
  const build = () => {
    form = createForm({ schema, value: current.value, computed: current.computed, onChange, columns: 2 });
    if (!canEdit) form.el.querySelectorAll('input, textarea, select, button').forEach((el) => (el.disabled = true));
    return form.el;
  };

  const host = h('div', build());
  drawPreview();

  const save = async () => {
    const problems = form.validate();
    if (problems.length) {
      toast(problems.length === 1 ? problems[0].message : `${problems.length} things need fixing first.`, { type: 'error' });
      return;
    }
    await busy(saveButton, async () => {
      try {
        current = await put(`/api/content/${encodeURIComponent(id)}`, { value: form.getValue(), version: current.version });
      } catch (error) {
        if (error.data?.problems) form.showProblems(error.data.problems.map((p) => ({ path: p.path, message: p.message })));
        if (error.code === 'conflict') {
          toast(error.message, { type: 'error', action: { label: 'Reload', onClick: () => location.reload() } });
          return;
        }
        throw error;
      }
      host.replaceChildren(build());
      onChange(false);
      toast(`${section.label} saved. Publish to put it live.`, { action: { label: 'Publish', onClick: () => navigate('/publish') } });
      refreshBadges();
    });
  };
  saveButton.addEventListener('click', save);
  discardButton.addEventListener('click', async () => {
    if (!(await confirm({ title: 'Discard your changes?', message: 'The section goes back to how it was when you opened it.', confirmLabel: 'Discard', danger: true }))) return;
    host.replaceChildren(build());
    onChange(false);
  });
  const onKey = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && savebar.classList.contains('show')) {
      event.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', onKey);

  const onSite = VIEW_ON_SITE[id];
  show(
    pageHead({
      title: section.label,
      text: section.description,
      crumbs: [{ label: 'Pages & copy', href: '/content' }, { label: section.label }],
      actions: [h('span.pill', { title: section.path }, icon('fileText'), section.path)],
    }),
    !canEdit && notice('You can look but not change: your role is Viewer.', { kind: 'warning', glyph: 'lock' }),
    current.computed.length ? h('div', { style: { marginBottom: '16px' } }, notice(h('span', 'Fields with a ', icon('lock', { size: 13 }), ' follow other content (the footer’s email link follows the studio’s email, for example), so they change when that does.'))) : null,
    h('div.editor-layout.with-preview', h('section.card.card-pad', host), previewCol),
    savebar,
    onSite && h('p.small.muted', { style: { marginTop: '18px' } }, 'On the site: ', h('code.mono', onSite), '. Start the local preview from Publish to see it before it goes live.'),
  );
  return () => {
    document.removeEventListener('keydown', onKey);
    setGuard(null);
  };
}
