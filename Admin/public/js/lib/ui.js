import { h, copyText } from './dom.js';
import { icon } from './icons.js';

/**
 * The admin's shared pieces: toasts, modals (sheets on phones), drawers,
 * pop-up menus, confirmations, empty states and loading skeletons.
 */

/* ------------------------------------------------------------------ Toasts */

let toastRoot;
export function toast(message, { type = 'success', action = null, timeout = 4200 } = {}) {
  toastRoot ??= document.body.appendChild(h('div.toasts', { role: 'status', 'aria-live': 'polite' }));
  const glyph = { success: 'checkCircle', error: 'alertCircle', info: 'info' }[type] ?? 'info';
  const el = h(
    `div.toast.${type}`,
    icon(glyph),
    h('div.grow', message),
    action && h('button.toast-action', { type: 'button', onClick: () => (action.onClick(), dismiss()) }, action.label),
  );
  const dismiss = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  toastRoot.append(el);
  if (timeout) setTimeout(dismiss, type === 'error' ? timeout + 2500 : timeout);
  return dismiss;
}

export const toastError = (error) => toast(error?.message ?? String(error), { type: 'error' });

/* ------------------------------------------------------------------ Focus handling */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

let openLayers = 0;
function lockScroll(on) {
  openLayers += on ? 1 : -1;
  document.documentElement.style.overflow = openLayers > 0 ? 'hidden' : '';
}

/* ------------------------------------------------------------------ Modal */

/**
 * `actions`: [{ label, kind, onClick }]; an onClick that returns false (or
 * a promise of false) keeps the modal open, and a thrown error is shown.
 */
export function modal({ title, body, actions = [], size = '', onClose = null, dismissable = true }) {
  const returnFocus = document.activeElement;
  const footer = actions.length ? h('div.modal-foot') : null;
  const dialog = h(
    `div.modal${size ? `.${size}` : ''}`,
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.sheet-grip'),
    h('div.modal-head', h('h2', title), dismissable && h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onClick: () => close() }, icon('x'))),
    h('div.modal-body', body),
    footer,
  );
  const overlay = h('div.overlay', dialog);
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    overlay.remove();
    lockScroll(false);
    document.removeEventListener('keydown', onKey, true);
    returnFocus?.focus?.();
    onClose?.(result);
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && dismissable) {
      event.stopPropagation();
      close();
    }
    trapFocus(dialog, event);
  };
  for (const action of actions) {
    const button = h(`button.btn${action.kind ? `.${action.kind}` : ''}`, { type: action.submit ? 'submit' : 'button' }, action.icon && icon(action.icon), action.label);
    button.addEventListener('click', async () => {
      if (!action.onClick) return close();
      await busy(button, async () => {
        const keep = await action.onClick({ close, button });
        if (keep !== false) close(true);
      });
    });
    footer.append(button);
  }
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay && dismissable) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  lockScroll(true);
  requestAnimationFrame(() => (dialog.querySelector('input, textarea, select') ?? dialog.querySelector('.modal-foot .btn.primary') ?? dialog).focus?.({ preventScroll: true }));
  return { close, el: dialog, body: dialog.querySelector('.modal-body') };
}

/** Resolves true when confirmed. With `typeToConfirm`, the word must be typed first. */
export function confirm({ title, message, confirmLabel = 'Confirm', danger = false, typeToConfirm = null, icon: glyph = null }) {
  return new Promise((resolve) => {
    let settled = false;
    const input = typeToConfirm ? h('input.input', { type: 'text', autocomplete: 'off', placeholder: typeToConfirm, 'aria-label': `Type ${typeToConfirm} to confirm` }) : null;
    const body = h(
      'div.stack',
      h('div.row.top', glyph && h('div.list-icon', { class: danger ? 'danger' : 'brand' }, icon(glyph)), h('p.grow', { style: { color: 'var(--text-2)' } }, message)),
      input && h('div.field', h('label', 'Type ', h('b', typeToConfirm), ' to confirm'), input),
    );
    const { el } = modal({
      title,
      size: 'narrow',
      body,
      onClose: () => !settled && resolve(false),
      actions: [
        { label: 'Cancel', onClick: () => ((settled = true), resolve(false)) },
        {
          label: confirmLabel,
          kind: danger ? 'danger' : 'primary',
          onClick: () => {
            if (input && input.value.trim().toLowerCase() !== typeToConfirm.toLowerCase()) {
              input.focus();
              input.closest('.field').classList.add('has-error');
              return false;
            }
            settled = true;
            resolve(true);
          },
        },
      ],
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') el.querySelector('.modal-foot .btn:last-child')?.click();
    });
  });
}

/* ------------------------------------------------------------------ Drawer */

export function drawer({ title, body, actions = null, wide = false, onClose = null }) {
  const returnFocus = document.activeElement;
  const scrim = h('div.drawer-overlay');
  const panel = h(
    `aside.drawer${wide ? '.wide' : ''}`,
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : 'Details' },
    h('div.drawer-head', h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onClick: () => close() }, icon('x')), h('h2.truncate', title), actions),
    h('div.drawer-body', body),
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    panel.remove();
    scrim.remove();
    lockScroll(false);
    document.removeEventListener('keydown', onKey, true);
    returnFocus?.focus?.();
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && !document.querySelector('.overlay')) {
      event.stopPropagation();
      close();
    }
  };
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(scrim, panel);
  lockScroll(true);
  requestAnimationFrame(() => panel.querySelector('.drawer-head .icon-btn')?.focus({ preventScroll: true }));
  return { close, el: panel, body: panel.querySelector('.drawer-body'), head: panel.querySelector('.drawer-head') };
}

/* ------------------------------------------------------------------ Pop-up menu */

let openMenu = null;
export function popMenu(anchor, items, { align = 'end' } = {}) {
  openMenu?.();
  const menu = h('div.menu', { role: 'menu' });
  for (const item of items) {
    if (!item) continue;
    if (item === '-') {
      menu.append(h('div.menu-sep'));
      continue;
    }
    if (item.node) {
      menu.append(item.node);
      continue;
    }
    const tag = item.href ? 'a' : 'button';
    const el = h(`${tag}.menu-item${item.danger ? '.danger' : ''}`, { role: 'menuitem', type: item.href ? undefined : 'button', href: item.href, target: item.target }, item.icon && icon(item.icon), h('span.grow', item.label), item.hint && h('span.tiny.muted', item.hint));
    el.addEventListener('click', () => {
      close();
      item.onClick?.();
    });
    menu.append(el);
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = align === 'end' ? rect.right - width : rect.left;
  left = Math.max(12, Math.min(left, innerWidth - width - 12));
  let top = rect.bottom + 6;
  if (top + height > innerHeight - 12) top = Math.max(12, rect.top - height - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const onDown = (event) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) close();
  };
  const onKey = (event) => event.key === 'Escape' && close();
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    openMenu = null;
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
  });
  openMenu = close;
  menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  return close;
}

/* ------------------------------------------------------------------ Small pieces */

/** Runs `work` with the button showing a spinner, and reports a failure as a toast. */
export async function busy(button, work) {
  const label = [...button.childNodes];
  const width = button.offsetWidth;
  button.disabled = true;
  button.style.minWidth = `${width}px`;
  button.replaceChildren(h('span.spinner'));
  try {
    return await work();
  } catch (error) {
    toastError(error);
    return undefined;
  } finally {
    if (button.isConnected) {
      button.replaceChildren(...label);
      button.disabled = false;
      button.style.minWidth = '';
    }
  }
}

export function empty({ glyph = 'sparkles', title, text, action = null }) {
  return h('div.empty', h('div.empty-icon', icon(glyph)), h('h3', title), text && h('p', text), action);
}

export function skeleton(lines = 3, { height = 18, gap = 12 } = {}) {
  return h(
    'div.stack',
    { style: { gap: `${gap}px` }, 'aria-busy': 'true', 'aria-label': 'Loading' },
    Array.from({ length: lines }, (_, i) => h('div.skeleton', { style: { height: `${height}px`, width: `${100 - ((i * 17) % 40)}%` } })),
  );
}

export function pageSkeleton() {
  return h(
    'div.stack.loose',
    h('div.skeleton', { style: { height: '38px', width: '40%' } }),
    h('div.grid.four', Array.from({ length: 4 }, () => h('div.skeleton', { style: { height: '108px' } }))),
    h('div.skeleton', { style: { height: '280px' } }),
  );
}

export function pageHead({ title, text = null, actions = [], crumbs = null }) {
  return h(
    'div.page-head',
    h(
      'div',
      crumbs && h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, crumbs.map((crumb, i) => [i > 0 && icon('chevronRight'), crumb.href ? h('a', { href: crumb.href }, crumb.label) : h('span', crumb.label)])),
      h('h1', title),
      text && h('p', text),
    ),
    actions.length ? h('div.page-actions', actions) : null,
  );
}

export function button(label, { kind = '', glyph = null, onClick = null, href = null, small = false, title = null, type = 'button', disabled = false, target = null } = {}) {
  const classes = ['btn', kind, small && 'small', !label && 'icon'].filter(Boolean).join('.');
  if (href) return h(`a.${classes}`, { href, title, target, rel: target ? 'noopener' : undefined }, glyph && icon(glyph), label);
  return h(`button.${classes}`, { type, title, 'aria-label': label ? undefined : title, onClick, disabled }, glyph && icon(glyph), label);
}

export function statusPill(status, labels) {
  return h(`span.pill.status-${status}`, labels?.[status] ?? status);
}

export function card(...children) {
  return h('section.card', ...children);
}

export function cardHead(title, ...extra) {
  return h('div.card-head', h('h2', title), extra.length ? h('div.row', extra) : null);
}

export function sampleBadge(record) {
  return record?.sample ? h('span.pill.violet', { title: 'Sample record, removed with “Clear sample data” in Settings' }, 'Sample') : null;
}

export function notice(text, { kind = '', glyph = 'info' } = {}) {
  return h(`div.notice${kind ? `.${kind}` : ''}`, icon(glyph), h('div', text));
}

export function codeBlock(text, copyLabel = 'Copy') {
  const btn = h('button.btn.small.copy', { type: 'button' }, icon('copy'), copyLabel);
  btn.addEventListener('click', async () => {
    await copyText(text);
    toast('Copied.');
  });
  return h('div.code-block', text, btn);
}
