import { h, mediaUrl, thumbUrl } from './dom.js';
import { icon } from './icons.js';
import { pickMedia } from './picker.js';

/**
 * Forms drawn from a schema. Every content section, project and system is
 * edited through this: the schema says which fields exist and how each is
 * edited; the form holds a working copy, knows when it differs from what
 * was loaded, checks it, and points at the field a problem belongs to.
 *
 * List items carry `__i`, the index they were loaded at, so the server can
 * keep a moved item's original text. Values the site works out from others
 * (`computed` paths) are shown locked.
 *
 * Field: { key, type, label, hint, required, optional, max, counter, span, ... }
 * Types: text, textarea, email, url, link, number, color, select, toggle,
 * lines, paragraphs, chips, times, image, focus, list, group, nullable,
 * json, note, readonly, heading.
 */

const ORIGIN = '__i';
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function mark(value) {
  if (Array.isArray(value)) return value.map((item, index) => (isPlain(item) ? { ...markObject(item), [ORIGIN]: index } : mark(item)));
  if (isPlain(value)) return markObject(value);
  return value;
}
function markObject(object) {
  const out = {};
  for (const [key, item] of Object.entries(object)) out[key] = mark(item);
  return out;
}
export function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (isPlain(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) if (key !== ORIGIN && item !== undefined) out[key] = strip(item);
    return out;
  }
  return value;
}
export function equal(a, b) {
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:.]+(?:\.[^\s@<>()",;:.]+)+$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function linkOk(value) {
  if (!value) return true;
  if (/^(?:\/|#|mailto:|tel:)/.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function createForm({ schema, value, computed = [], onChange = () => {}, columns = 1 }) {
  const original = clone(value);
  const state = mark(clone(value));
  const locked = new Set(computed.map((path) => path.join('.')));
  const ctx = {
    state,
    titleUpdaters: new Set(),
    watchers: new Map(),
    invalid: new Map(),
    isLocked(orig) {
      if (!orig) return false;
      for (let i = orig.length; i >= 1; i--) if (locked.has(orig.slice(0, i).join('.'))) return true;
      return false;
    },
    changed() {
      for (const update of ctx.titleUpdaters) update();
      onChange(form.isDirty());
    },
    watch(pathKey, fn) {
      if (!ctx.watchers.has(pathKey)) ctx.watchers.set(pathKey, new Set());
      ctx.watchers.get(pathKey).add(fn);
    },
    notify(pathKey) {
      for (const fn of ctx.watchers.get(pathKey) ?? []) fn();
    },
  };

  const root = h('div.form-section');
  const form = {
    el: root,
    state,
    getValue: () => state,
    isDirty: () => !equal(state, original),
    validate() {
      clearErrors(root);
      const problems = [...ctx.invalid.values()];
      walkValidate(schema, state, [], problems);
      showProblems(root, problems);
      return problems;
    },
    showProblems: (problems) => showProblems(root, problems),
    clearErrors: () => clearErrors(root),
  };
  root.append(renderFields(schema, state, [], [], ctx, columns));
  return form;
}

function clearErrors(root) {
  root.querySelectorAll('.field.has-error').forEach((el) => el.classList.remove('has-error'));
  root.querySelectorAll('.field-error').forEach((el) => el.remove());
}

function showProblems(root, problems) {
  let first = null;
  for (const problem of problems) {
    const path = [...(problem.path ?? [])];
    let target = null;
    while (path.length && !target) {
      target = root.querySelector(`[data-path="${CSS.escape(path.join('.'))}"]`);
      if (!target) path.pop();
    }
    if (!target) continue;
    const details = target.closest('details');
    if (details) details.open = true;
    target.closest('.list-item')?.classList.add('open');
    const body = target.closest('.list-item-body');
    if (body) body.hidden = false;
    target.classList.add('has-error');
    target.append(h('div.field-error', problem.message.replace(/^.*?: /, '')));
    first ??= target;
  }
  first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function walkValidate(fields, object, path, problems) {
  for (const field of fields) {
    if (!field.key) continue;
    const value = object?.[field.key];
    const here = [...path, field.key];
    const say = (message) => problems.push({ path: here, message });
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
    if (field.required && empty) say(`${field.label ?? field.key} can’t be empty.`);
    if (empty) continue;
    if (typeof value === 'string') {
      if (field.max && value.length > field.max) say(`Keep it under ${field.max} characters (it’s ${value.length}).`);
      if (field.type === 'email' && !EMAIL.test(value)) say('That isn’t a valid email address.');
      if (field.type === 'color' && !HEX.test(value)) say('Use a colour like #095cfb.');
      if (field.type === 'url' && !/^https?:\/\/\S+$/.test(value)) say('Use a full address starting https://');
      if (field.type === 'link' && !linkOk(value)) say('Use a page (/works), an anchor (#about), mailto: or a full https:// address.');
      if (field.pattern && !new RegExp(field.pattern).test(value)) say(field.patternMessage ?? 'That isn’t in the right form.');
    }
    if (field.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) say('Enter a number.');
      else {
        if (field.min !== undefined && value < field.min) say(`It should be at least ${field.min}.`);
        if (field.max !== undefined && value > field.max) say(`It should be at most ${field.max}.`);
        if (field.integer && !Number.isInteger(value)) say('Use a whole number.');
      }
    }
    if (field.type === 'times' && Array.isArray(value)) value.forEach((slot, i) => !TIME.test(slot) && problems.push({ path: [...here, i], message: 'Use a 24-hour time like 14:30.' }));
    if ((field.type === 'group' || field.type === 'nullable') && isPlain(value)) walkValidate(field.fields, value, here, problems);
    if (field.type === 'list' && Array.isArray(value)) value.forEach((item, i) => walkValidate(field.item.fields, item, [...here, i], problems));
    if ((field.type === 'lines' || field.type === 'paragraphs') && field.required && Array.isArray(value)) {
      value.forEach((line, i) => typeof line === 'string' && !line.trim() && problems.push({ path: [...here, i], message: 'Fill this line in or remove it.' }));
    }
  }
}

/* ------------------------------------------------------------------ Rendering */

function renderFields(fields, object, path, orig, ctx, columns = 1) {
  const grid = h(`div.form-grid${columns === 2 ? '.cols-2' : ''}`);
  for (const field of fields) {
    if (field.when && !field.when(object)) continue;
    const el = renderField(field, object, path, orig, ctx);
    if (!el) continue;
    if (field.span === 2 || ['list', 'group', 'heading', 'note', 'lines', 'paragraphs', 'json', 'focus', 'nullable'].includes(field.type)) el.classList.add('span-2');
    grid.append(el);
  }
  return grid;
}

function label(field, { locked = false } = {}) {
  return h(
    'div.field-label',
    field.label,
    field.required && h('span.req', { 'aria-hidden': 'true' }, '*'),
    locked && h('span.lock', { title: 'Worked out from other content' }, icon('lock')),
  );
}

function wrap(field, path, ...children) {
  return h('div.field', { dataset: { path: path.join('.') } }, ...children);
}

function setValue(field, object, value, ctx) {
  const blank = value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length);
  if (field.optional && blank) delete object[field.key];
  else object[field.key] = value;
  ctx.changed();
}

function renderField(field, object, path, orig, ctx) {
  const here = field.key ? [...path, field.key] : path;
  const origHere = field.key && orig ? [...orig, field.key] : null;
  const value = field.key ? object?.[field.key] : undefined;
  const isLocked = field.key && ctx.isLocked(origHere);

  switch (field.type) {
    case 'heading':
      return h('div.form-heading', field.label);
    case 'note':
      return h('div.notice', icon(field.icon ?? 'info'), h('div', field.text, field.href && [' ', h('a', { href: field.href }, field.linkLabel ?? 'Open')]));
    case 'readonly':
      return wrap(field, here, label(field, { locked: true }), h('div.input', { 'aria-readonly': 'true' }, field.format ? field.format(value) : Array.isArray(value) ? `${value.length} items` : String(value ?? '—')), field.hint && h('div.field-hint', field.hint));
  }

  if (isLocked && !['list', 'group', 'lines', 'paragraphs'].includes(field.type)) {
    return wrap(field, here, label(field, { locked: true }), h('input.input', { type: 'text', value: typeof value === 'string' ? value : JSON.stringify(value), readOnly: true }), h('div.field-hint', field.lockedHint ?? 'Worked out from other content on the site, so it changes with them.'));
  }

  switch (field.type) {
    case 'text':
    case 'email':
    case 'url':
    case 'link':
    case 'number':
      return textField(field, object, here, value, ctx);
    case 'textarea':
      return textareaField(field, object, here, value, ctx);
    case 'color':
      return colorField(field, object, here, value, ctx);
    case 'select': {
      const select = h('select.select', { id: here.join('-') }, field.options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option)).map((option) => h('option', { value: option.value, selected: option.value === (value ?? '') }, option.label)));
      select.addEventListener('change', () => setValue(field, object, select.value, ctx));
      return wrap(field, here, label(field), select, field.hint && h('div.field-hint', field.hint));
    }
    case 'toggle': {
      const input = h('input', { type: 'checkbox', checked: Boolean(value) });
      input.addEventListener('change', () => setValue(field, object, input.checked, ctx));
      return wrap(field, here, h('label.row.between', h('span.field-label', field.label), h('span.switch', input, h('span'))), field.hint && h('div.field-hint', field.hint));
    }
    case 'lines':
    case 'paragraphs':
      return linesField(field, object, here, origHere, value, ctx);
    case 'chips':
      return chipsField(field, object, here, value, ctx);
    case 'times':
      return timesField(field, object, here, value, ctx);
    case 'image':
      return imageField(field, object, here, value, ctx);
    case 'focus':
      return focusField(field, object, here, path, value, ctx);
    case 'list':
      return listField(field, object, here, origHere, value, ctx);
    case 'group': {
      if (!isPlain(value)) return null;
      const body = renderFields(field.fields, value, here, origHere, ctx, field.columns ?? 1);
      if (field.flat) return h('div.stack', field.label && h('div.form-heading', field.label), body);
      return h('details.group', { open: field.open !== false }, h('summary', icon('chevronRight', { className: 'chev' }), h('span.grow', field.label, field.description && h('div.group-desc', field.description))), h('div.group-body', body));
    }
    case 'nullable':
      return nullableField(field, object, here, origHere, value, ctx);
    case 'json':
      return jsonField(field, object, here, value, ctx);
    default:
      return null;
  }
}

function textField(field, object, path, value, ctx) {
  const type = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
  const input = h('input.input', {
    type,
    id: path.join('-'),
    value: value ?? '',
    placeholder: field.placeholder ?? '',
    inputMode: field.type === 'number' ? 'decimal' : field.type === 'email' ? 'email' : field.type === 'url' || field.type === 'link' ? 'url' : undefined,
    autocomplete: 'off',
    spellcheck: field.type === 'text',
    min: field.min,
    max: field.type === 'number' ? field.max : undefined,
    step: field.step,
    readOnly: Boolean(field.readOnly),
  });
  const counter = field.counter ? h('span.field-counter') : null;
  const updateCounter = () => {
    if (!counter) return;
    const length = input.value.length;
    counter.textContent = `${length}/${field.counter}`;
    counter.classList.toggle('over', length > field.counter);
  };
  updateCounter();
  input.addEventListener('input', () => {
    const previous = object[field.key];
    let next = input.value;
    if (field.type === 'number') next = input.value === '' ? null : Number(input.value);
    setValue(field, object, next, ctx);
    updateCounter();
    // A field can fill in a neighbour (initials from a name); the neighbour redraws on notify.
    field.onInput?.({ value: next, previous, item: object, notify: (key) => ctx.notify([...path.slice(0, -1), key].join('.')) });
  });
  ctx.watch(path.join('.'), () => {
    const current = object[field.key];
    if (document.activeElement !== input) input.value = current ?? '';
    updateCounter();
  });
  return wrap(field, path, h('div.row', label(field), counter), input, field.hint && h('div.field-hint', field.hint));
}

function textareaField(field, object, path, value, ctx) {
  const area = h('textarea.textarea', { id: path.join('-'), rows: field.rows ?? 3, placeholder: field.placeholder ?? '', value: value ?? '' });
  const counter = field.counter ? h('span.field-counter') : null;
  const grow = () => {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight + 2, 520)}px`;
    if (counter) {
      counter.textContent = `${area.value.length}/${field.counter}`;
      counter.classList.toggle('over', area.value.length > field.counter);
    }
  };
  area.addEventListener('input', () => {
    setValue(field, object, area.value, ctx);
    grow();
  });
  requestAnimationFrame(grow);
  return wrap(field, path, h('div.row', label(field), counter), area, field.hint && h('div.field-hint', field.hint));
}

function colorField(field, object, path, value, ctx) {
  const picker = h('input', { type: 'color', value: HEX.test(value ?? '') && value.length === 7 ? value : '#095cfb', 'aria-label': `${field.label} picker` });
  const text = h('input.input.mono', { type: 'text', value: value ?? '', maxLength: 7, placeholder: '#095cfb', 'aria-label': field.label });
  picker.addEventListener('input', () => {
    text.value = picker.value;
    setValue(field, object, picker.value, ctx);
  });
  text.addEventListener('input', () => {
    if (HEX.test(text.value) && text.value.length === 7) picker.value = text.value;
    setValue(field, object, text.value.trim(), ctx);
  });
  return wrap(field, path, label(field), h('div.color-field', picker, text), field.hint && h('div.field-hint', field.hint));
}

function moveButtons(onUp, onDown, onRemove, { first, last, removable = true }) {
  return h(
    'div.item-actions',
    h('button.icon-btn', { type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: first, onClick: onUp }, icon('arrowUp')),
    h('button.icon-btn', { type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: last, onClick: onDown }, icon('arrowDown')),
    removable && h('button.icon-btn', { type: 'button', title: 'Remove', 'aria-label': 'Remove', onClick: onRemove }, icon('trash')),
  );
}

function linesField(field, object, path, orig, value, ctx) {
  if (!Array.isArray(object[field.key])) object[field.key] = [];
  const list = object[field.key];
  // Which loaded line each line came from, so a worked-out line stays locked wherever it moves.
  let origins = list.map((_, i) => i);
  const box = h('div.list-editor');
  const draw = () => {
    box.replaceChildren(
      ...list.map((line, i) => {
        const locked = origins[i] !== null && ctx.isLocked(orig ? [...orig, origins[i]] : null);
        const control = locked
          ? h('input.input', { type: 'text', value: line, readOnly: true, title: 'Worked out from other content' })
          : field.type === 'paragraphs'
            ? h('textarea.textarea', { rows: 3, value: line, 'aria-label': `${field.itemLabel ?? 'Line'} ${i + 1}` })
            : h('input.input', { type: 'text', value: line, placeholder: field.placeholder ?? '', 'aria-label': `${field.itemLabel ?? 'Line'} ${i + 1}` });
        if (!locked) {
          control.addEventListener('input', () => {
            list[i] = control.value;
            ctx.changed();
          });
        }
        const move = (to) => {
          if (to < 0 || to >= list.length) return;
          [list[i], list[to]] = [list[to], list[i]];
          [origins[i], origins[to]] = [origins[to], origins[i]];
          ctx.changed();
          draw();
        };
        return h(
          'div.field',
          { dataset: { path: [...path, i].join('.') } },
          h('div.line-row', locked ? h('span.handle', { title: 'Worked out from other content' }, icon('lock')) : null, control, moveButtons(() => move(i - 1), () => move(i + 1), () => (list.splice(i, 1), origins.splice(i, 1), ctx.changed(), draw()), { first: i === 0, last: i === list.length - 1, removable: !field.min || list.length > field.min })),
        );
      }),
      (!field.maxItems || list.length < field.maxItems) &&
        h('button.btn.small.ghost.add-row', { type: 'button', onClick: () => (list.push(''), origins.push(null), ctx.changed(), draw(), box.querySelectorAll('input, textarea')[list.length - 1]?.focus()) }, icon('plus'), `Add ${(field.itemLabel ?? 'line').toLowerCase()}`),
    );
  };
  draw();
  return h('div.field', { dataset: { path: path.join('.') } }, label(field), field.hint && h('div.field-hint', field.hint), box);
}

function chipsField(field, object, path, value, ctx) {
  if (!Array.isArray(object[field.key])) object[field.key] = [];
  const list = object[field.key];
  const input = h('input.chip-input', { type: 'text', placeholder: field.placeholder ?? 'Type and press Enter', 'aria-label': field.label });
  const box = h('div.chip-box');
  const draw = () => {
    box.replaceChildren(
      ...list.map((item, i) => h('span.chip', item, h('button', { type: 'button', 'aria-label': `Remove ${item}`, onClick: () => (list.splice(i, 1), ctx.changed(), draw(), input.focus()) }, icon('x')))),
      input,
    );
  };
  const add = () => {
    const parts = input.value.split(',').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) if (!list.includes(part)) list.push(part);
    input.value = '';
    if (parts.length) {
      ctx.changed();
      draw();
      input.focus();
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && !input.value && list.length) {
      list.pop();
      ctx.changed();
      draw();
      input.focus();
    }
  });
  input.addEventListener('blur', add);
  box.addEventListener('click', (event) => event.target === box && input.focus());
  draw();
  return wrap(field, path, label(field), box, field.hint && h('div.field-hint', field.hint));
}

function timesField(field, object, path, value, ctx) {
  if (!Array.isArray(object[field.key])) object[field.key] = [];
  const list = object[field.key];
  const time = h('input.input', { type: 'time', step: 300, style: { maxWidth: '150px' }, 'aria-label': 'New time' });
  const chips = h('div.chips');
  const draw = () => {
    chips.replaceChildren(...list.map((slot, i) => h('span.chip.mono', slot, h('button', { type: 'button', 'aria-label': `Remove ${slot}`, onClick: () => (list.splice(i, 1), ctx.changed(), draw()) }, icon('x')))));
  };
  const add = () => {
    if (!TIME.test(time.value) || list.includes(time.value)) return;
    list.push(time.value);
    list.sort();
    time.value = '';
    ctx.changed();
    draw();
  };
  time.addEventListener('keydown', (event) => event.key === 'Enter' && (event.preventDefault(), add()));
  draw();
  return wrap(field, path, label(field), chips, h('div.row', time, h('button.btn.small', { type: 'button', onClick: add }, icon('plus'), 'Add time')), field.hint && h('div.field-hint', field.hint));
}

function imageField(field, object, path, value, ctx) {
  const kind = field.kind ?? 'image';
  const preview = h(`div.preview${field.dark ? '.dark' : ''}`);
  const pathText = h('input.input.mono', { type: 'text', value: value ?? '', placeholder: '/images/…', 'aria-label': `${field.label} path` });
  const draw = () => {
    const current = object[field.key];
    if (!current) preview.replaceChildren(icon(kind === 'video' ? 'video' : kind === 'document' ? 'file' : 'image'));
    else if (kind === 'image') preview.replaceChildren(h('img', { src: thumbUrl(current), alt: '', loading: 'lazy' }));
    else if (kind === 'video') preview.replaceChildren(h('video', { src: mediaUrl(current), muted: true, preload: 'metadata', playsInline: true }));
    else preview.replaceChildren(icon('file'));
  };
  const commit = (next, file = null) => {
    setValue(field, object, next, ctx);
    if (file && field.dims && file.width && file.height) {
      object[field.dims[0]] = file.width;
      object[field.dims[1]] = file.height;
      for (const key of field.dims) ctx.notify([...path.slice(0, -1), key].join('.'));
      ctx.changed();
    }
    draw();
    ctx.notify(path.join('.'));
  };
  pathText.addEventListener('change', () => commit(pathText.value.trim()));
  const choose = h('button.btn.small', { type: 'button' }, icon(kind === 'image' ? 'image' : 'folder'), 'Choose');
  choose.addEventListener('click', async () => {
    const file = await pickMedia({ kind, folder: field.folder ?? 'images', title: `Choose ${field.label.toLowerCase()}` });
    if (!file) return;
    pathText.value = file.path;
    commit(file.path, file);
  });
  draw();
  return wrap(field, path, label(field), h('div.image-field', preview, h('div.stack.tight.grow', pathText, h('div.row', choose, value && h('a.btn.small.ghost', { href: mediaUrl(value), target: '_blank', rel: 'noopener', 'data-external': '' }, icon('external'), 'Open')))), field.hint && h('div.field-hint', field.hint));
}

function focusField(field, object, path, parentPath, value, ctx) {
  const stage = h('div.focus-stage', { role: 'slider', tabindex: 0, 'aria-label': `${field.label}: drag to place, arrow keys to nudge` });
  const dot = h('div.focus-dot');
  const card = h('div.focus-card');
  const readout = h('span.mono.small.muted');
  const parse = () => {
    const match = /^(\d{1,3})% (\d{1,3})%$/.exec(object[field.key] ?? '50% 50%');
    return match ? [Number(match[1]), Number(match[2])] : [50, 50];
  };
  const draw = () => {
    const src = object[field.image];
    const [x, y] = parse();
    stage.replaceChildren(src ? h('img', { src: mediaUrl(src), alt: '' }) : h('div.empty', 'Choose a picture first'), dot);
    card.replaceChildren(src ? h('img', { src: mediaUrl(src), alt: '', style: { objectPosition: `${x}% ${y}%` } }) : '');
    dot.style.left = `${x}%`;
    dot.style.top = `${y}%`;
    readout.textContent = `${x}% ${y}%`;
  };
  const place = (x, y) => {
    const value = `${Math.round(Math.min(100, Math.max(0, x)))}% ${Math.round(Math.min(100, Math.max(0, y)))}%`;
    setValue(field, object, value, ctx);
    const [nx, ny] = parse();
    dot.style.left = `${nx}%`;
    dot.style.top = `${ny}%`;
    const img = card.querySelector('img');
    if (img) img.style.objectPosition = `${nx}% ${ny}%`;
    readout.textContent = value;
  };
  const fromPointer = (event) => {
    const rect = stage.getBoundingClientRect();
    place(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  };
  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    fromPointer(event);
    const move = (e) => fromPointer(e);
    const up = () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
  });
  stage.addEventListener('keydown', (event) => {
    const [x, y] = parse();
    const step = event.shiftKey ? 10 : 2;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!moves[event.key]) return;
    event.preventDefault();
    place(x + moves[event.key][0], y + moves[event.key][1]);
  });
  ctx.watch([...parentPath, field.image].join('.'), draw);
  draw();
  return wrap(field, path, h('div.row.between', label(field), readout), h('div.focus-field', stage, h('div.stack.tight', card, h('span.tiny.muted.center', 'As the card shows it'))), field.hint && h('div.field-hint', field.hint));
}

function listField(field, object, path, orig, value, ctx) {
  if (!Array.isArray(object[field.key])) object[field.key] = [];
  const list = object[field.key];
  const spec = field.item;
  const box = h('div.list-editor');
  const openSet = new WeakSet();
  let dragFrom = null;

  const draw = () => {
    for (const fn of [...ctx.titleUpdaters]) if (fn.list === box) ctx.titleUpdaters.delete(fn);
    box.replaceChildren(
      ...list.map((item, i) => {
        const origItem = isPlain(item) && Number.isInteger(item[ORIGIN]) && orig ? [...orig, item[ORIGIN]] : null;
        const titleEl = h('strong');
        const subEl = h('span');
        const thumbEl = spec.thumb ? h('img.list-item-thumb', { alt: '', loading: 'lazy' }) : null;
        const updateTitle = () => {
          titleEl.textContent = (spec.title?.(item, i) || '').toString().trim() || `${spec.label ?? 'Item'} ${i + 1}`;
          subEl.textContent = spec.subtitle?.(item, i) ?? '';
          if (thumbEl) {
            const src = spec.thumb(item, object);
            if (src) thumbEl.src = src;
            thumbEl.hidden = !src;
          }
        };
        updateTitle.list = box;
        ctx.titleUpdaters.add(updateTitle);
        updateTitle();
        const startOpen = openSet.has(item) || (spec.open ?? list.length <= 2);
        const body = h('div.list-item-body', { hidden: !startOpen }, renderFields(spec.fields, item, [...path, i], origItem, ctx, spec.columns ?? 1));
        const toggle = () => {
          body.hidden = !body.hidden;
          if (body.hidden) openSet.delete(item);
          else openSet.add(item);
        };
        const move = (to) => {
          if (to < 0 || to >= list.length) return;
          const [moved] = list.splice(i, 1);
          list.splice(to, 0, moved);
          ctx.changed();
          draw();
        };
        const handle = h('span.handle', { title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip'));
        const row = h(
          'div.list-item',
          { dataset: { path: [...path, i].join('.') } },
          h(
            'div.list-item-head',
            handle,
            thumbEl,
            h('div.list-item-title', { role: 'button', tabindex: 0, 'aria-expanded': String(!body.hidden), onClick: toggle, onKeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()) }, titleEl, subEl),
            h(
              'div.item-actions',
              h('button.icon-btn', { type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onClick: () => move(i - 1) }, icon('arrowUp')),
              h('button.icon-btn', { type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === list.length - 1, onClick: () => move(i + 1) }, icon('arrowDown')),
              spec.duplicate !== false && h('button.icon-btn', { type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate', disabled: Boolean(field.maxItems && list.length >= field.maxItems), onClick: () => {
                const copy = strip(clone(item));
                list.splice(i + 1, 0, copy);
                openSet.add(copy);
                ctx.changed();
                draw();
              } }, icon('copy')),
              h('button.icon-btn', { type: 'button', title: 'Remove', 'aria-label': 'Remove', disabled: Boolean(field.min && list.length <= field.min), onClick: () => {
                list.splice(i, 1);
                ctx.changed();
                draw();
              } }, icon('trash')),
            ),
          ),
          body,
        );
        // Drag by the handle on a desktop; the arrows do the same everywhere.
        handle.addEventListener('pointerdown', () => (row.draggable = true));
        row.addEventListener('dragstart', (event) => {
          dragFrom = i;
          row.classList.add('dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(i));
        });
        row.addEventListener('dragend', () => {
          row.draggable = false;
          row.classList.remove('dragging');
          box.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
        });
        row.addEventListener('dragover', (event) => {
          if (dragFrom === null) return;
          event.preventDefault();
          const rect = row.getBoundingClientRect();
          const after = event.clientY > rect.top + rect.height / 2;
          row.classList.toggle('drop-after', after);
          row.classList.toggle('drop-before', !after);
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          if (dragFrom === null) return;
          const rect = row.getBoundingClientRect();
          let to = event.clientY > rect.top + rect.height / 2 ? i + 1 : i;
          const [moved] = list.splice(dragFrom, 1);
          if (dragFrom < to) to--;
          list.splice(to, 0, moved);
          dragFrom = null;
          ctx.changed();
          draw();
        });
        return row;
      }),
      (!field.maxItems || list.length < field.maxItems) &&
        h('button.btn.small.add-row', { type: 'button', onClick: () => {
          const item = spec.create ? spec.create(list) : {};
          list.push(item);
          openSet.add(item);
          ctx.changed();
          draw();
          box.lastElementChild?.previousElementSibling?.querySelector('input, textarea')?.focus();
        } }, icon('plus'), field.addLabel ?? `Add ${(spec.label ?? 'item').toLowerCase()}`),
    );
  };
  draw();
  return h('div.field', { dataset: { path: path.join('.') } }, h('div.row.between', label(field), h('span.tiny.muted', `${list.length} ${list.length === 1 ? (spec.label ?? 'item').toLowerCase() : `${(spec.label ?? 'item').toLowerCase()}s`}`)), field.hint && h('div.field-hint', field.hint), box);
}

function nullableField(field, object, path, orig, value, ctx) {
  const holder = h('div');
  const input = h('input', { type: 'checkbox', checked: isPlain(value) });
  let last = isPlain(value) ? value : null;
  const draw = () => {
    holder.replaceChildren(isPlain(object[field.key]) ? renderFields(field.fields, object[field.key], path, orig, ctx, field.columns ?? 1) : '');
  };
  input.addEventListener('change', () => {
    if (input.checked) object[field.key] = last ?? (field.create ? field.create() : {});
    else {
      last = object[field.key];
      object[field.key] = null;
    }
    ctx.changed();
    draw();
  });
  draw();
  return h('div.field', { dataset: { path: path.join('.') } }, h('label.row.between', h('span.field-label', field.label), h('span.switch', input, h('span'))), field.hint && h('div.field-hint', field.hint), holder);
}

function jsonField(field, object, path, value, ctx) {
  const key = path.join('.');
  const area = h('textarea.textarea.mono', { rows: field.rows ?? 12, spellcheck: false, value: JSON.stringify(strip(value) ?? null, null, 2) });
  const status = h('div.field-hint');
  area.addEventListener('input', () => {
    try {
      const parsed = JSON.parse(area.value);
      object[field.key] = parsed;
      ctx.invalid.delete(key);
      status.textContent = 'Valid JSON.';
      status.className = 'field-hint';
      ctx.changed();
    } catch (error) {
      ctx.invalid.set(key, { path, message: `This isn’t valid JSON yet: ${error.message}` });
      status.textContent = `Not valid JSON yet: ${error.message}`;
      status.className = 'field-error';
    }
  });
  return wrap(field, path, label(field), field.hint && h('div.field-hint', field.hint), area, status);
}
