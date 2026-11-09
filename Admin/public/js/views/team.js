import { h, copyText } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, patch, del } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, ROLE_INFO } from '../lib/session.js';
import { button, card, cardHead, confirm, empty, modal, notice, pageHead, pageSkeleton, popMenu, toast, toastError } from '../lib/ui.js';
import { initials, relative } from '../lib/format.js';

/**
 * The people who can sign in, and what each may do. New accounts get a
 * temporary password, shown once, and must choose their own on first sign-in.
 */

function passwordReveal(name, password) {
  return modal({
    title: 'Share this password once',
    body: h(
      'div.stack',
      h('p', `Give ${name} this temporary password. They’ll be asked to choose their own the first time they sign in. It isn’t shown again.`),
      h('div.code-block', { style: { fontSize: '18px', textAlign: 'center', padding: '16px' } }, password),
      notice('Send it somewhere private, like a message to them directly, not a shared channel.', { glyph: 'shield' }),
    ),
    actions: [{ label: 'Copy password', kind: 'primary', icon: 'copy', onClick: async () => (await copyText(password), toast('Copied.'), false) }, { label: 'Done' }],
  });
}

export default async function team() {
  setTitle('Team');
  if (!session.can('owner')) {
    show(empty({ glyph: 'lock', title: 'Only the owner manages the team', text: 'Ask the studio owner to add or change accounts.' }));
    return;
  }
  show(pageSkeleton());
  let users;
  try {
    users = await get('/api/users');
  } catch (error) {
    toastError(error);
    return;
  }
  const holder = h('div');

  const roleSelect = (user) => {
    const select = h('select.select', { 'aria-label': `${user.name}’s role`, style: { maxWidth: '150px' }, disabled: user.id === session.user.id }, Object.entries(ROLE_INFO).map(([role, info]) => h('option', { value: role, selected: role === user.role }, info.label)));
    select.addEventListener('change', async () => {
      try {
        await patch(`/api/users/${user.id}`, { role: select.value });
        toast(`${user.name} is now ${ROLE_INFO[select.value].label.toLowerCase()}.`);
        await reload();
      } catch (error) {
        select.value = user.role;
        toastError(error);
      }
    });
    return select;
  };

  const draw = () => {
    holder.replaceChildren(
      card(
        cardHead(`${users.length} ${users.length === 1 ? 'person' : 'people'}`),
        h(
          'div.list',
          { style: { marginTop: '8px' } },
          users.map((user) => {
            const more = h('button.icon-btn', { type: 'button', 'aria-label': `More for ${user.name}` }, icon('more'));
            more.addEventListener('click', () =>
              popMenu(more, [
                { label: 'Reset password', icon: 'key', onClick: async () => {
                  if (!(await confirm({ title: `Reset ${user.name}’s password?`, message: 'They’re signed out everywhere and get a temporary password to change on their next sign-in.', confirmLabel: 'Reset' }))) return;
                  const { password } = await post(`/api/users/${user.id}/reset`, {});
                  passwordReveal(user.name, password);
                } },
                user.id !== session.user.id && { label: user.disabled ? 'Turn on' : 'Turn off', icon: user.disabled ? 'check' : 'lock', onClick: async () => {
                  try {
                    await patch(`/api/users/${user.id}`, { disabled: !user.disabled });
                    toast(user.disabled ? `${user.name} can sign in again.` : `${user.name} is turned off and signed out.`);
                    await reload();
                  } catch (error) {
                    toastError(error);
                  }
                } },
                user.id !== session.user.id && '-',
                user.id !== session.user.id && { label: 'Remove', icon: 'trash', danger: true, onClick: async () => {
                  if (!(await confirm({ title: `Remove ${user.name}?`, message: 'Their account is deleted. What they did stays in the activity log.', confirmLabel: 'Remove', danger: true }))) return;
                  try {
                    await del(`/api/users/${user.id}`);
                    await reload();
                  } catch (error) {
                    toastError(error);
                  }
                } },
              ]),
            );
            return h(
              'div.list-row',
              { style: { flexWrap: 'wrap' } },
              h('span.avatar', initials(user.name)),
              h('div.meta', h('strong', user.name, user.id === session.user.id ? h('span.muted', ' (you)') : ''), h('span', `${user.email} · ${user.lastLoginAt ? `signed in ${relative(user.lastLoginAt)}` : 'hasn’t signed in yet'}`)),
              user.disabled && h('span.pill.danger', 'Off'),
              user.mustChangePassword && h('span.pill.warning', 'Temporary password'),
              roleSelect(user),
              more,
            );
          }),
        ),
      ),
      h('div.grid.three', { style: { marginTop: '18px' } }, Object.entries(ROLE_INFO).map(([role, info]) => h('div.role-card', h('div.row', icon(role === 'owner' ? 'key' : role === 'editor' ? 'pencil' : 'eye'), h('strong', info.label)), h('p.small.muted', { style: { marginTop: '6px' } }, info.text)))),
    );
  };

  const reload = async () => {
    users = await get('/api/users');
    draw();
  };

  const addPerson = () => {
    const name = h('input.input', { type: 'text', autocomplete: 'off' });
    const email = h('input.input', { type: 'email', inputMode: 'email', autocomplete: 'off' });
    const role = h('select.select', Object.entries(ROLE_INFO).map(([value, info]) => h('option', { value, selected: value === 'editor' }, `${info.label} — ${info.text}`)));
    modal({
      title: 'Add a person',
      body: h('div.stack', h('div.field', h('label', 'Name'), name), h('div.field', h('label', 'Email'), email, h('div.field-hint', 'They sign in with this.')), h('div.field', h('label', 'Role'), role)),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Add',
          kind: 'primary',
          onClick: async () => {
            const result = await post('/api/users', { name: name.value, email: email.value, role: role.value });
            await reload();
            passwordReveal(result.user.name, result.password);
          },
        },
      ],
    });
  };

  draw();
  show(pageHead({ title: 'Team', text: 'Who can sign in to the admin, and what each person may do.', actions: [button('Add a person', { kind: 'primary', glyph: 'plus', onClick: addPerson })] }), holder);
}
