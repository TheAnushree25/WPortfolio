import { h, mount, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { post, configureApi } from '../lib/api.js';

/** The screens before the admin: first-run setup, sign-in and a required new password. */

function passwordInput(id, autocomplete, placeholder = '') {
  const input = h('input.input', { type: 'password', id, name: id, autocomplete, required: true, placeholder });
  const toggle = h('button.icon-btn.trailing', { type: 'button', 'aria-label': 'Show password' }, icon('eye'));
  toggle.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    toggle.replaceChildren(icon(showing ? 'eye' : 'eyeOff'));
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
  return { input, el: h('div.input-group', icon('lock'), input, toggle) };
}

function field(labelText, control, hint = null) {
  return h('div.field', h('label', { for: control.id || control.querySelector?.('input')?.id }, labelText), control, hint && h('div.field-hint', hint));
}

function strength(password) {
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, score);
}

function strengthMeter(input) {
  const bar = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' } }, [0, 1, 2, 3].map(() => h('i', { style: { height: '4px', borderRadius: '4px', background: 'var(--line-strong)' } })));
  const text = h('div.field-hint', 'At least 10 characters. A short sentence is easy to remember and hard to guess.');
  input.addEventListener('input', () => {
    const score = input.value ? strength(input.value) : 0;
    const colors = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--success)', 'var(--success)'];
    [...bar.children].forEach((segment, i) => (segment.style.background = i < score ? colors[score] : 'var(--line-strong)'));
    text.textContent = !input.value ? 'At least 10 characters. A short sentence is easy to remember and hard to guess.' : input.value.length < 10 ? `${10 - input.value.length} more characters.` : ['Weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score];
  });
  return h('div.stack.tight', bar, text);
}

function errorBox() {
  return h('div.notice.danger.hidden', { role: 'alert' });
}
function showError(box, message) {
  box.replaceChildren(icon('alertCircle'), h('div', message));
  box.classList.remove('hidden');
}

function authFrame(...children) {
  return h('div.auth', h('div.auth-card', h('span.logo', { role: 'img', 'aria-label': 'Atlas Studios' }), h('div.row', h('span.badge-admin', 'Admin')), ...children));
}

export function renderLogin(root, { next = '/' } = {}) {
  document.title = 'Sign in · Atlas Studios Admin';
  const email = h('input.input', { type: 'email', id: 'email', name: 'email', autocomplete: 'username', required: true, inputMode: 'email', placeholder: 'you@theatlasstudio.com' });
  const password = passwordInput('password', 'current-password');
  const error = errorBox();
  const submit = h('button.btn.primary.block', { type: 'submit' }, 'Sign in', icon('arrowRight'));
  const form = h('form', { novalidate: true }, error, field('Email', h('div.input-group', icon('mail'), email)), field('Password', password.el), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.classList.add('hidden');
    if (!email.value.trim() || !password.input.value) return showError(error, 'Enter your email and password.');
    submit.disabled = true;
    submit.replaceChildren(h('span.spinner'), 'Signing in…');
    try {
      await post('/api/auth/login', { email: email.value, password: password.input.value }, { quiet: true });
      location.href = withBase(next);
    } catch (err) {
      showError(error, err.message);
      submit.disabled = false;
      submit.replaceChildren('Sign in', icon('arrowRight'));
      password.input.select();
    }
  });
  mount(
    root,
    authFrame(
      h('h1', 'Welcome back'),
      h('p.muted', 'Sign in to run the studio: the site’s words and work, clients, meetings and publishing.'),
      form,
      h('p.auth-foot', 'Forgot your password? In the Admin folder, run ', h('code.mono', 'npm run reset-password -- you@email'), '.'),
    ),
  );
  requestAnimationFrame(() => email.focus());
}

export function renderSetup(root, state) {
  document.title = 'Set up · Atlas Studios Admin';
  const token = new URLSearchParams(location.search).get('token') ?? '';
  if (!state.setupLocal && !(state.setupToken && token)) {
    mount(
      root,
      authFrame(
        h('h1', 'Set up on the studio’s computer'),
        h('p.muted', 'For safety, the first account can only be created on the computer the admin runs on. Open the admin there (http://localhost:4310), or add ADMIN_SETUP_TOKEN to Admin/.env and open /setup?token=… here.'),
      ),
    );
    return;
  }
  const name = h('input.input', { type: 'text', id: 'name', autocomplete: 'name', required: true, placeholder: 'Gulafsan Shaheen' });
  const email = h('input.input', { type: 'email', id: 'email', autocomplete: 'username', required: true, inputMode: 'email', placeholder: 'contact.theatlasstudio@gmail.com' });
  const password = passwordInput('password', 'new-password');
  const sample = h('input', { type: 'checkbox', checked: true });
  const error = errorBox();
  const submit = h('button.btn.primary.block', { type: 'submit' }, 'Create the owner account', icon('arrowRight'));
  const form = h(
    'form',
    { novalidate: true },
    error,
    field('Your name', h('div.input-group', icon('user'), name)),
    field('Email', h('div.input-group', icon('mail'), email), 'You’ll sign in with this.'),
    field('Password', h('div.stack.tight', password.el, strengthMeter(password.input))),
    h('label.check', sample, h('span', h('b', 'Show sample data'), h('br'), h('span.small.muted', 'Invented enquiries, meetings and visits to explore with. Clear them in one click from Settings.'))),
    submit,
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.classList.add('hidden');
    submit.disabled = true;
    submit.replaceChildren(h('span.spinner'), 'Setting up…');
    try {
      const result = await post('/api/auth/setup', { name: name.value, email: email.value, password: password.input.value, sample: sample.checked, token }, { quiet: true });
      configureApi({ csrf: result.csrf });
      location.href = withBase('/');
    } catch (err) {
      showError(error, err.message);
      submit.disabled = false;
      submit.replaceChildren('Create the owner account', icon('arrowRight'));
    }
  });
  mount(root, authFrame(h('h1', 'Set up the studio’s admin'), h('p.muted', 'Create the owner account. You can invite editors and viewers once you’re in.'), form));
  requestAnimationFrame(() => name.focus());
}

export function renderPasswordChange(root) {
  document.title = 'New password · Atlas Studios Admin';
  const current = passwordInput('current', 'current-password', 'The temporary password you were given');
  const next = passwordInput('next', 'new-password');
  const error = errorBox();
  const submit = h('button.btn.primary.block', { type: 'submit' }, 'Save and continue');
  const form = h('form', { novalidate: true }, error, field('Temporary password', current.el), field('New password', h('div.stack.tight', next.el, strengthMeter(next.input))), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await post('/api/auth/password', { current: current.input.value, next: next.input.value }, { quiet: true });
      location.href = withBase('/');
    } catch (err) {
      showError(error, err.message);
      submit.disabled = false;
    }
  });
  mount(root, authFrame(h('h1', 'Choose your own password'), h('p.muted', 'You signed in with a temporary password. Pick one only you know to carry on.'), form));
}
