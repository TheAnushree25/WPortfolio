import { h, mediaUrl, thumbUrl, copyText, debounce, store, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, del, upload } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { forgetMedia } from '../lib/picker.js';
import { button, confirm, drawer, empty, modal, notice, pageHead, pageSkeleton, toast, toastError, busy } from '../lib/ui.js';
import { bytes, date, relative, number } from '../lib/format.js';

/**
 * The site's public folder: every picture, video and document, where the
 * site uses it, uploads by button or by dropping files on the page, and
 * removal to a trash that can be emptied or put back.
 */

const PAGE = 120;

export default async function media({ query }) {
  setTitle('Media library');
  show(pageSkeleton());
  let library;
  let trash;
  try {
    [library, trash] = await Promise.all([get('/api/media'), get('/api/media/trash')]);
  } catch (error) {
    toastError(error);
    return;
  }
  const canEdit = session.can('editor');
  const state = {
    view: 'files',
    q: '',
    folder: query.folder ?? '',
    kind: 'all',
    filter: ['unused', 'large', 'missing', 'used'].includes(query.filter) ? query.filter : 'all',
    variants: store.get('media-variants', false),
    shown: PAGE,
    selected: null,
  };

  const search = h('input.input', { type: 'search', placeholder: 'Search files', 'aria-label': 'Search files' });
  const folderSelect = h('select.select', { 'aria-label': 'Folder', style: { maxWidth: '240px' } });
  const kindChips = h('div.scroll-x');
  const filterChips = h('div.scroll-x');
  const grid = h('div');
  const counts = h('span.small.muted');
  const fileInput = h('input', { type: 'file', class: 'hidden', multiple: true, accept: 'image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,application/pdf' });
  const tabs = h('div.tabs');

  const drawFolders = () => {
    folderSelect.replaceChildren(h('option', { value: '' }, 'All folders'), ...library.folders.map((folder) => h('option', { value: folder.path, selected: folder.path === state.folder }, `${folder.path} (${folder.files})`)));
  };

  const visible = () => {
    const q = state.q.toLowerCase();
    return library.files.filter((file) => {
      if (file.system) return false; // hosting files (public/_headers) aren't media
      if (!state.variants && file.variant) return false;
      if (state.folder && file.folder !== state.folder) return false;
      if (state.kind !== 'all' && file.kind !== state.kind) return false;
      if (state.filter === 'unused' && (file.used || file.variant)) return false;
      if (state.filter === 'used' && !file.used) return false;
      if (state.filter === 'large' && !((file.kind === 'image' && file.bytes > 1e6) || (file.kind === 'video' && file.bytes > 15e6))) return false;
      if (q && !file.path.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const chip = (label, active, onClick, n = null) => h(`button.filter-chip${active ? '.active' : ''}`, { type: 'button', onClick }, label, n !== null && h('span.n', String(n)));

  const drawChips = () => {
    const base = library.files.filter((file) => state.variants || !file.variant);
    kindChips.replaceChildren(
      ...[
        ['all', 'Everything', base.length],
        ['image', 'Pictures', base.filter((f) => f.kind === 'image').length],
        ['video', 'Video', base.filter((f) => f.kind === 'video').length],
        ['document', 'Documents', base.filter((f) => f.kind === 'document').length],
      ].map(([id, label, n]) => chip(label, state.kind === id, () => ((state.kind = id), (state.shown = PAGE), redraw()), n)),
    );
    filterChips.replaceChildren(
      chip('Any status', state.filter === 'all', () => ((state.filter = 'all'), redraw())),
      chip('Used by the site', state.filter === 'used', () => ((state.filter = 'used'), redraw())),
      chip('Unused', state.filter === 'unused', () => ((state.filter = 'unused'), redraw()), library.totals.unused),
      chip('Heavy', state.filter === 'large', () => ((state.filter = 'large'), redraw()), library.totals.large),
      h('label.filter-chip', h('input', { type: 'checkbox', checked: state.variants, onChange: (e) => ((state.variants = e.target.checked), store.set('media-variants', state.variants), redraw()), style: { accentColor: 'var(--brand)' } }), 'Show half-size renders'),
    );
  };

  const tile = (file) => {
    const contain = /partners|logos/.test(file.folder);
    const el = h(
      `button.media-tile${state.selected === file.path ? '.selected' : ''}`,
      { type: 'button', title: file.path },
      h(`div.thumb${contain ? '.contain' : ''}`, file.kind === 'image' ? h('img', { src: thumbUrl(file.path), alt: '', loading: 'lazy', decoding: 'async' }) : icon(file.kind === 'video' ? 'video' : 'file')),
      h('div.cap', h('strong', file.name), h('span', [file.width && `${file.width}×${file.height}`, bytes(file.bytes)].filter(Boolean).join(' · '))),
      !file.used && !file.variant && h('span.flag.pill.warning', 'Unused'),
    );
    el.addEventListener('click', () => details(file));
    return el;
  };

  const redraw = () => {
    drawChips();
    if (state.view === 'trash') return drawTrash();
    const files = visible();
    counts.textContent = `${number(files.length)} ${files.length === 1 ? 'file' : 'files'} · ${bytes(files.reduce((sum, f) => sum + f.bytes, 0))}`;
    grid.replaceChildren(
      files.length ? h('div.media-grid', files.slice(0, state.shown).map(tile)) : empty({ glyph: 'image', title: 'No files match', text: 'Try another folder or filter.' }),
      files.length > state.shown ? h('div.center', { style: { marginTop: '16px' } }, button(`Show ${Math.min(PAGE, files.length - state.shown)} more`, { onClick: () => ((state.shown += PAGE), redraw()) })) : null,
    );
  };

  const drawTrash = () => {
    counts.textContent = `${trash.length} in the trash`;
    grid.replaceChildren(
      trash.length
        ? h(
            'div.card',
            h(
              'div.list',
              trash.map((entry) =>
                h(
                  'div.list-row',
                  h('div.list-icon', /\.(png|jpe?g|webp|gif|avif)$/i.test(entry.path) ? h('img', { src: withBase(`/trash-media/${entry.id}`), alt: '', style: { width: '36px', height: '36px', objectFit: 'cover', borderRadius: '10px' } }) : icon('file')),
                  h('div.meta', h('strong', entry.path), h('span', `${entry.reason === 'replaced' ? 'Replaced' : 'Removed'} ${relative(entry.at)} · ${bytes(entry.bytes)}`)),
                  canEdit && button('Put back', { small: true, glyph: 'undo', onClick: async (event) => {
                    await busy(event.currentTarget, async () => {
                      await post(`/api/media/trash/${entry.id}/restore`, {});
                      toast(`${entry.path} is back.`);
                      await reload();
                    });
                  } }),
                  session.can('owner') && button('', { small: true, glyph: 'trash', title: 'Delete for good', onClick: async () => {
                    if (!(await confirm({ title: 'Delete for good?', message: `${entry.path} will be gone and can’t be recovered.`, confirmLabel: 'Delete', danger: true }))) return;
                    await del(`/api/media/trash/${entry.id}`);
                    await reload();
                  } }),
                ),
              ),
            ),
          )
        : empty({ glyph: 'trash', title: 'The trash is empty', text: 'Removed and replaced files wait here until they are put back or deleted.' }),
    );
  };

  const reload = async () => {
    forgetMedia();
    [library, trash] = await Promise.all([get('/api/media'), get('/api/media/trash')]);
    drawFolders();
    drawTabs();
    redraw();
    refreshBadges();
  };

  function details(file) {
    state.selected = file.path;
    redraw();
    const previewEl = file.kind === 'image' ? h('img', { src: mediaUrl(file.path), alt: file.name }) : file.kind === 'video' ? h('video', { src: mediaUrl(file.path), controls: true, playsInline: true, preload: 'metadata' }) : h('div.empty', icon('file'), h('a', { href: mediaUrl(file.path), target: '_blank', rel: 'noopener', 'data-external': '' }, 'Open the document'));
    const replaceInput = h('input', { type: 'file', class: 'hidden', accept: file.kind === 'image' ? 'image/*' : file.kind === 'video' ? 'video/*' : 'application/pdf' });
    replaceInput.addEventListener('change', async () => {
      const chosen = replaceInput.files?.[0];
      if (!chosen) return;
      if (!(await confirm({ title: 'Replace this file?', message: `${file.path} will be swapped for ${chosen.name}. Everywhere the site uses it shows the new one; the old file goes to the trash.`, confirmLabel: 'Replace' }))) return;
      try {
        const ext = file.name.slice(file.name.lastIndexOf('.'));
        await upload(`/api/media/upload?folder=${encodeURIComponent(file.folder.slice(1))}&name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, '') + (chosen.name.slice(chosen.name.lastIndexOf('.')).toLowerCase() === ext.toLowerCase() ? ext : chosen.name.slice(chosen.name.lastIndexOf('.'))))}&replace=1`, chosen);
        toast('Replaced.');
        panel.close();
        await reload();
      } catch (error) {
        toastError(error);
      }
    });
    const panel = drawer({
      title: file.name,
      body: h(
        'div.stack',
        h('div.media-preview', previewEl),
        h(
          'dl.kv',
          h('dt', 'Path'),
          h('dd.mono', file.path),
          file.width && [h('dt', 'Size'), h('dd', `${file.width} × ${file.height} px`)],
          h('dt', 'File size'),
          h('dd', bytes(file.bytes)),
          h('dt', 'Changed'),
          h('dd', date(file.modified, { year: true })),
          h('dt', 'Used by'),
          h('dd', file.usedBy.length ? h('div.stack.tight', file.usedBy.map((where) => h('span', where))) : file.system ? 'The site’s hosting' : h('span.muted', 'Nothing on the site')),
        ),
        file.variant && notice('A half-size render the deck viewer serves to phones. It belongs to its full-size page.'),
        h(
          'div.row.wrap',
          button('Copy path', { glyph: 'copy', onClick: async () => (await copyText(file.path), toast('Path copied.')) }),
          button('Open', { glyph: 'external', href: mediaUrl(file.path), target: '_blank' }),
          canEdit && !file.system && button('Replace', { glyph: 'refresh', onClick: () => replaceInput.click() }),
          canEdit && !file.used && !file.system && button('Remove', { kind: 'danger', glyph: 'trash', onClick: async () => {
            if (!(await confirm({ title: 'Move to the trash?', message: `${file.path} isn’t used by the site. It goes to the trash, where it can be put back.`, confirmLabel: 'Move to trash', danger: true }))) return;
            try {
              await post('/api/media/remove', { path: file.path });
              toast('Moved to the trash.', { action: { label: 'View trash', onClick: () => ((state.view = 'trash'), drawTabs(), redraw()) } });
              panel.close();
              await reload();
            } catch (error) {
              toastError(error);
            }
          } }),
          replaceInput,
        ),
        file.used && !file.system && canEdit && h('p.tiny.muted', 'Files the site uses can’t be removed. Point those places at another file first, or use Replace.'),
      ),
      onClose: () => {
        state.selected = null;
        redraw();
      },
    });
  }

  async function uploadFiles(files) {
    if (!canEdit || !files.length) return;
    const folders = library.folders.map((folder) => folder.path.slice(1)).filter(Boolean);
    const target = h('select.select', folders.map((folder) => h('option', { value: folder, selected: `/${folder}` === (state.folder || '/images') }, `/${folder}`)));
    const progress = h('div.stack.tight', [...files].map((file) => h('div.row.between.small', { dataset: { name: file.name } }, h('span.truncate', file.name), h('span.muted', bytes(file.size)))));
    modal({
      title: `Upload ${files.length} ${files.length === 1 ? 'file' : 'files'}`,
      body: h('div.stack', h('div.field', h('label', 'Into folder'), target, h('div.field-hint', session.hosted ? 'Names are tidied to lowercase-with-hyphens. Pictures up to 15 MB, video and PDFs up to 95 MB (GitHub’s limit for one file). Each upload is saved as a draft until you publish.' : 'Names are tidied to lowercase-with-hyphens. Pictures up to 15 MB, video 300 MB, PDFs 120 MB.')), progress),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Upload',
          kind: 'primary',
          onClick: async () => {
            let done = 0;
            for (const file of files) {
              const row = progress.querySelector(`[data-name="${CSS.escape(file.name)}"] .muted`);
              try {
                const result = await upload(`/api/media/upload?folder=${encodeURIComponent(target.value)}&name=${encodeURIComponent(file.name)}`, file, { onProgress: (r) => row && (row.textContent = `${Math.round(r * 100)}%`) });
                if (row) row.textContent = `✓ ${result.path}`;
                done++;
              } catch (error) {
                if (row) {
                  row.textContent = error.message;
                  row.style.color = 'var(--danger)';
                }
              }
            }
            if (done) {
              toast(`Uploaded ${done} ${done === 1 ? 'file' : 'files'}.`);
              await reload();
            }
            return done === files.length;
          },
        },
      ],
    });
  }

  fileInput.addEventListener('change', () => {
    uploadFiles([...fileInput.files]);
    fileInput.value = '';
  });
  search.addEventListener('input', debounce(() => ((state.q = search.value), (state.shown = PAGE), redraw()), 120));
  folderSelect.addEventListener('change', () => ((state.folder = folderSelect.value), (state.shown = PAGE), redraw()));

  const drawTabs = () =>
    tabs.replaceChildren(
      h(`button${state.view === 'files' ? '.active' : ''}`, { type: 'button', onClick: () => ((state.view = 'files'), drawTabs(), redraw()) }, 'Files', h('span.n', number(library.totals.files))),
      h(`button${state.view === 'trash' ? '.active' : ''}`, { type: 'button', onClick: () => ((state.view = 'trash'), drawTabs(), redraw()) }, 'Trash', h('span.n', String(trash.length))),
    );

  // Dropping files anywhere on the page uploads them.
  const veil = h('div.drop-veil.hidden', 'Drop to upload');
  let depth = 0;
  const onEnter = (event) => {
    if (!canEdit || !event.dataTransfer?.types?.includes('Files')) return;
    depth++;
    veil.classList.remove('hidden');
  };
  const onLeave = () => {
    depth = Math.max(0, depth - 1);
    if (!depth) veil.classList.add('hidden');
  };
  const onOver = (event) => event.dataTransfer?.types?.includes('Files') && event.preventDefault();
  const onDrop = (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    depth = 0;
    veil.classList.add('hidden');
    uploadFiles([...event.dataTransfer.files]);
  };
  document.addEventListener('dragenter', onEnter);
  document.addEventListener('dragleave', onLeave);
  document.addEventListener('dragover', onOver);
  document.addEventListener('drop', onDrop);
  document.body.append(veil);

  drawFolders();
  drawTabs();
  redraw();
  const t = library.totals;
  show(
    pageHead({
      title: 'Media library',
      text: `${number(t.files)} files, ${bytes(t.bytes)}, in the site’s public folder. ${t.unused ? `${t.unused} aren’t used anywhere (${bytes(t.unusedBytes)}).` : 'Everything here is in use.'}`,
      actions: canEdit ? [button('Upload', { kind: 'primary', glyph: 'upload', onClick: () => fileInput.click() })] : [],
    }),
    library.missing.length ? h('div', { style: { marginBottom: '16px' } }, notice(h('span', h('b', `${library.missing.length} missing: `), library.missing.join(', '), '. The site points at these but they aren’t in the public folder.'), { kind: 'danger', glyph: 'alertCircle' })) : null,
    tabs,
    h('div.toolbar', h('div.input-group', icon('search'), search), folderSelect, counts),
    h('div.stack.tight', { style: { marginBottom: '16px' } }, kindChips, filterChips),
    grid,
    fileInput,
  );
  if (query.upload === '1' && canEdit) setTimeout(() => fileInput.click(), 300);
  return () => {
    document.removeEventListener('dragenter', onEnter);
    document.removeEventListener('dragleave', onLeave);
    document.removeEventListener('dragover', onOver);
    document.removeEventListener('drop', onDrop);
    veil.remove();
  };
}
