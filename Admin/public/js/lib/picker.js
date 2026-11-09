import { h, thumbUrl, debounce } from './dom.js';
import { icon } from './icons.js';
import { get, upload } from './api.js';
import { modal, toast, toastError, empty } from './ui.js';
import { bytes } from './format.js';

/**
 * Choosing a file from the site's public folder (or uploading one) for an
 * image, video or document field. Resolves with the chosen file, or null.
 */

let cache = null;
export async function mediaLibrary({ fresh = false } = {}) {
  if (!cache || fresh) cache = await get('/api/media');
  return cache;
}
export const forgetMedia = () => (cache = null);

export function pickMedia({ kind = 'image', folder = 'images', title = 'Choose a file' } = {}) {
  return new Promise((resolve) => {
    let chosen = null;
    let library = null;
    const search = h('input.input', { type: 'search', placeholder: 'Search by name or folder', 'aria-label': 'Search files' });
    const folderSelect = h('select.select', { 'aria-label': 'Folder' });
    const grid = h('div.media-grid', h('div.skeleton', { style: { height: '160px' } }));
    const fileInput = h('input', { type: 'file', class: 'hidden', accept: kind === 'image' ? 'image/png,image/jpeg,image/webp,image/avif,image/gif' : kind === 'video' ? 'video/mp4,video/webm' : 'application/pdf' });
    const uploadButton = h('button.btn', { type: 'button' }, icon('upload'), 'Upload');
    uploadButton.addEventListener('click', () => fileInput.click());

    const draw = () => {
      if (!library) return;
      const q = search.value.trim().toLowerCase();
      const where = folderSelect.value;
      const files = library.files.filter((file) => file.kind === kind && !file.variant && (!where || file.folder === where) && (!q || file.path.toLowerCase().includes(q)));
      grid.replaceChildren(
        ...(files.length
          ? files.slice(0, 240).map((file) => {
              const tile = h(
                'button.media-tile',
                { type: 'button', title: file.path },
                h(`div.thumb${file.folder.includes('partners') || file.folder.includes('logos') ? '.contain' : ''}`, kind === 'image' ? h('img', { src: thumbUrl(file.path), alt: '', loading: 'lazy', decoding: 'async' }) : icon(kind === 'video' ? 'video' : 'file')),
                h('div.cap', h('strong', file.name), h('span', [file.width && `${file.width}×${file.height}`, bytes(file.bytes)].filter(Boolean).join(' · '))),
              );
              tile.addEventListener('click', () => {
                chosen = file;
                grid.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
                tile.classList.add('selected');
              });
              tile.addEventListener('dblclick', () => {
                chosen = file;
                dialog.close(true);
              });
              return tile;
            })
          : [empty({ glyph: 'image', title: 'No files here', text: 'Try another folder, or upload one.' })]),
      );
    };

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const target = folderSelect.value.replace(/^\//, '') || folder;
      uploadButton.disabled = true;
      try {
        const result = await upload(`/api/media/upload?folder=${encodeURIComponent(target)}&name=${encodeURIComponent(file.name)}`, file, {
          onProgress: (ratio) => (uploadButton.textContent = `Uploading ${Math.round(ratio * 100)}%`),
        });
        toast(`Uploaded ${result.path}`);
        library = await mediaLibrary({ fresh: true });
        chosen = library.files.find((item) => item.path === result.path) ?? { path: result.path, width: result.width, height: result.height };
        dialog.close(true);
      } catch (error) {
        toastError(error);
      } finally {
        uploadButton.disabled = false;
        uploadButton.replaceChildren(icon('upload'), 'Upload');
        fileInput.value = '';
      }
    });

    const dialog = modal({
      title,
      size: 'wide',
      body: h('div.stack', h('div.toolbar', h('div.input-group', icon('search'), search), folderSelect, uploadButton, fileInput), grid),
      onClose: (ok) => resolve(ok ? chosen : null),
      actions: [{ label: 'Cancel' }, { label: 'Use this file', kind: 'primary', onClick: () => (chosen ? true : (toast('Pick a file first.', { type: 'info' }), false)) }],
    });

    search.addEventListener('input', debounce(draw, 120));
    folderSelect.addEventListener('change', draw);
    mediaLibrary()
      .then((data) => {
        library = data;
        const folders = [...new Set(data.files.filter((file) => file.kind === kind && !file.variant).map((file) => file.folder))].sort();
        const preferred = `/${folder.replace(/^\/+/, '')}`;
        folderSelect.replaceChildren(h('option', { value: '' }, 'All folders'), ...folders.map((name) => h('option', { value: name, selected: name === preferred }, name)));
        if (!folders.includes(preferred) && folders.length) folderSelect.value = '';
        draw();
      })
      .catch(toastError);
  });
}
