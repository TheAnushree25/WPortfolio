import { h, mount, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, configureApi } from '../lib/api.js';
import { session } from '../lib/session.js';

/**
 * The screens before the admin: first-run setup, sign-in (with a two-step
 * code when it's on), a required new password, and, when the admin can send
 * email, a forgotten password and the page its link opens.
 */

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
      const result = await post('/api/auth/login', { email: email.value, password: password.input.value }, { quiet: true });
      if (result?.twoFactor) return renderCode(root, { challenge: result.challenge, next, email: email.value });
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
      session.features.passwordReset
        ? h('p.auth-foot', h('a', { href: '/login', onClick: (event) => (event.preventDefault(), renderForgot(root, { email: email.value, next })) }, 'Forgot your password?'))
        : session.hosted
          ? h('p.auth-foot', 'Forgot your password? Ask the studio owner to reset it from Team.')
          : h('p.auth-foot', 'Forgot your password? In the Admin folder, run ', h('code.mono', 'npm run reset-password -- you@email'), '.'),
    ),
  );
  requestAnimationFrame(() => email.focus());
}

/** The second step of signing in: the six digits from the authenticator app, or one recovery code. */
function renderCode(root, { challenge, next, email }) {
  document.title = 'Two-step sign-in · Atlas Studios Admin';
  let recovery = false;
  const input = h('input.input', { type: 'text', id: 'code', name: 'code', inputMode: 'numeric', autocomplete: 'one-time-code', required: true, placeholder: '123 456', maxLength: 12 });
  const label = h('label', { for: 'code' }, 'Code from your authenticator app');
  const error = errorBox();
  const submit = h('button.btn.primary.block', { type: 'submit' }, 'Sign in', icon('arrowRight'));
  const swapMode = h('a', { href: '/login' }, 'Use a recovery code instead');
  swapMode.addEventListener('click', (event) => {
    event.preventDefault();
    recovery = !recovery;
    label.textContent = recovery ? 'One of your recovery codes' : 'Code from your authenticator app';
    input.inputMode = recovery ? 'text' : 'numeric';
    input.placeholder = recovery ? 'abcd-efgh' : '123 456';
    swapMode.textContent = recovery ? 'Use the app’s code instead' : 'Use a recovery code instead';
    input.value = '';
    input.focus();
  });
  const form = h('form', { novalidate: true }, error, h('div.field', label, h('div.input-group', icon('shield'), input)), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.classList.add('hidden');
    if (!input.value.trim()) return showError(error, 'Enter the code.');
    submit.disabled = true;
    submit.replaceChildren(h('span.spinner'), 'Checking…');
    try {
      await post('/api/auth/login/verify', { challenge, code: input.value.trim() }, { quiet: true });
      location.href = withBase(next);
    } catch (err) {
      if (err.code === 'challenge') return renderLogin(root, { next });
      showError(error, err.message);
      submit.disabled = false;
      submit.replaceChildren('Sign in', icon('arrowRight'));
      input.select();
    }
  });
  mount(root, authFrame(h('h1', 'One more step'), h('p.muted', `${email} has two-step sign-in on. Open your authenticator app and type the code shown for Atlas Studios.`), form, h('p.auth-foot', swapMode)));
  requestAnimationFrame(() => input.focus());
}

/** Asks for a reset link by email. The answer is the same whether or not the address has an account. */
function renderForgot(root, { email = '', next = '/' } = {}) {
  document.title = 'Forgot password · Atlas Studios Admin';
  const address = h('input.input', { type: 'email', id: 'email', autocomplete: 'username', required: true, inputMode: 'email', value: email });
  const error = errorBox();
  const submit = h('button.btn.primary.block', { type: 'submit' }, 'Email me a link', icon('mail'));
  const back = h('a', { href: '/login', onClick: (event) => (event.preventDefault(), renderLogin(root, { next })) }, 'Back to sign in');
  const form = h('form', { novalidate: true }, error, field('Your email', h('div.input-group', icon('mail'), address)), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.classList.add('hidden');
    if (!address.value.trim()) return showError(error, 'Enter the email you sign in with.');
    submit.disabled = true;
    try {
      await post('/api/auth/forgot', { email: address.value }, { quiet: true });
      mount(root, authFrame(h('h1', 'Check your email'), h('p.muted', `If ${address.value.trim()} has an account here, a link to choose a new password is on its way. It works once, for an hour.`), h('p.auth-foot', back)));
    } catch (err) {
      showError(error, err.message);
      submit.disabled = false;
    }
  });
  mount(root, authFrame(h('h1', 'Forgot your password?'), h('p.muted', 'We’ll email you a link to choose a new one.'), form, h('p.auth-foot', back)));
  requestAnimationFrame(() => address.focus());
}

/** The page a reset or invitation email opens: choose a password, then sign in with it. */
export async function renderReset(root, { token }) {
  document.title = 'Choose a password · Atlas Studios Admin';
  const toLogin = () => {
    history.replaceState({}, '', withBase('/login'));
    renderLogin(root);
  };
  let link;
  try {
    link = await get(`/api/auth/reset?token=${encodeURIComponent(token)}`, { quiet: true });
  } catch (err) {
    mount(root, authFrame(h('h1', 'This link has run out'), h('p.muted', err.message), h('div', h('button.btn.primary.block', { type: 'button', onClick: toLogin }, 'Go to sign in'))));
    return;
  }
  const password = passwordInput('password', 'new-password');
  const error = errorBox();
  const submit = h('button.btn.primary.block', { type: 'submit' }, link.kind === 'invite' ? 'Save my password' : 'Save the new password');
  const form = h('form', { novalidate: true }, error, field('New password', h('div.stack.tight', password.el, strengthMeter(password.input))), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.classList.add('hidden');
    submit.disabled = true;
    try {
      await post('/api/auth/reset', { token, password: password.input.value }, { quiet: true });
      mount(root, authFrame(h('h1', 'Password saved'), h('p.muted', `Sign in as ${link.email} with your new password.`), h('div', h('button.btn.primary.block', { type: 'button', onClick: toLogin }, 'Sign in'))));
    } catch (err) {
      showError(error, err.message);
      submit.disabled = false;
    }
  });
  mount(
    root,
    authFrame(
      h('h1', link.kind === 'invite' ? `Welcome, ${link.name.split(' ')[0]}` : 'Choose a new password'),
      h('p.muted', link.kind === 'invite' ? `Choose a password for ${link.email} to finish setting up your account.` : `For ${link.email}. Every device signed in with the old one is signed out.`),
      form,
    ),
  );
  requestAnimationFrame(() => password.input.focus());
}

export function renderSetup(root, state) {
  document.title = 'Set up · Atlas Studios Admin';
  const token = new URLSearchParams(location.search).get('token') ?? '';
  if (!state.setupLocal && !(state.setupToken && token)) {
    mount(
      root,
      authFrame(
        h('h1', session.hosted ? 'Open the setup link' : 'Set up on the studio’s computer'),
        session.hosted
          ? h('p.muted', 'For safety, the first account is created from the setup link: open /admin/setup?token=… with the ADMIN_SETUP_TOKEN set for the backend.')
          : h('p.muted', 'For safety, the first account can only be created on the computer the admin runs on. Open the admin there (http://localhost:4310), or add ADMIN_SETUP_TOKEN to Admin/.env and open /setup?token=… here.'),
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
