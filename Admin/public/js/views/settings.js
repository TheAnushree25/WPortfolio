import { h, withBase, copyText } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, patch, del, api } from '../lib/api.js';
import { show, setTitle, applyTheme } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { navigate } from '../lib/router.js';
import { button, card, cardHead, codeBlock, confirm, modal, notice, pageHead, pageSkeleton, toast, toastError, busy } from '../lib/ui.js';
import { relative, number, date } from '../lib/format.js';

/* ------------------------------ Two-step sign-in (hosted admin) ------------------------------ */

/** Recovery codes, shown once, to copy or download. */
function showRecoveryCodes(codes) {
  const text = `Atlas Studios admin: recovery codes for ${session.user.email}\nEach works once, in place of a code from your phone.\n\n${codes.join('\n')}\n`;
  modal({
    title: 'Your recovery codes',
    body: h(
      'div.stack',
      h('p', 'If your phone is lost, each of these signs you in once instead of a code. Keep them somewhere safe, away from your phone. They aren’t shown again.'),
      h('div.code-block', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 18px', fontSize: '15px', padding: '16px' } }, codes.map((code) => h('span.mono', code))),
    ),
    actions: [
      { label: 'Copy', icon: 'copy', onClick: async () => (await copyText(text), toast('Copied.'), false) },
      {
        label: 'Download',
        icon: 'download',
        onClick: () => {
          const link = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'atlas-admin-recovery-codes.txt' });
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
          return false;
        },
      },
      { label: 'I’ve kept them', kind: 'primary' },
    ],
  });
}

function twoFactorCard() {
  const holder = h('div.card-body.stack');
  const passwordField = () => h('input.input', { type: 'password', autocomplete: 'current-password' });
  const codeField = (placeholder = '123 456') => h('input.input', { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', placeholder, maxLength: 12 });

  const setUp = async () => {
    let setup;
    try {
      setup = await post('/api/auth/2fa/setup', {});
    } catch (error) {
      return toastError(error);
    }
    const code = codeField();
    const qr = h('svg', { viewBox: `0 0 ${setup.qr.size} ${setup.qr.size}`, width: '200', height: '200', role: 'img', 'aria-label': 'QR code for your authenticator app', style: { background: '#ffffff', borderRadius: '12px', display: 'block', margin: '0 auto' } }, h('path', { d: setup.qr.path, fill: '#020923' }));
    modal({
      title: 'Set up two-step sign-in',
      body: h(
        'div.stack',
        h('p', '1. Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…) and scan this code.'),
        qr,
        h('p.small.muted', 'Can’t scan? Add an account by hand with this key:'),
        h('div.code-block', { style: { textAlign: 'center', letterSpacing: '0.08em' } }, setup.secret),
        h('div.field', h('label', '2. Type the six digits the app shows'), code),
      ),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Turn on',
          kind: 'primary',
          onClick: async () => {
            const result = await post('/api/auth/2fa/enable', { code: code.value.trim() });
            session.user = result.user;
            toast('Two-step sign-in is on. Your other devices were signed out.');
            draw();
            // After this dialog has closed, so the codes' dialog keeps the page still.
            setTimeout(() => showRecoveryCodes(result.recoveryCodes), 0);
          },
        },
      ],
    });
    requestAnimationFrame(() => code.focus());
  };

  const renew = () => {
    const password = passwordField();
    modal({
      title: 'New recovery codes',
      body: h('div.stack', h('p.small.muted', 'Your old codes stop working.'), h('div.field', h('label', 'Your password'), password)),
      actions: [{ label: 'Cancel' }, { label: 'Make new codes', kind: 'primary', onClick: async () => {
            const { recoveryCodes } = await post('/api/auth/2fa/recovery', { password: password.value });
            setTimeout(() => showRecoveryCodes(recoveryCodes), 0);
          } }],
    });
  };

  const turnOff = () => {
    const password = passwordField();
    const code = codeField('Code from the app, or a recovery code');
    modal({
      title: 'Turn off two-step sign-in?',
      body: h('div.stack', h('p.small.muted', 'Signing in will need only your password again.'), h('div.field', h('label', 'Your password'), password), h('div.field', h('label', 'A current code'), code)),
      actions: [
        { label: 'Keep it on' },
        {
          label: 'Turn off',
          kind: 'danger',
          onClick: async () => {
            const result = await post('/api/auth/2fa/disable', { password: password.value, code: code.value.trim() });
            session.user = result.user;
            toast('Two-step sign-in is off.');
            draw();
          },
        },
      ],
    });
  };

  const pill = h('span.pill');
  const draw = async () => {
    try {
      const status = await get('/api/auth/2fa');
      pill.className = status.enabled ? 'pill success dot' : 'pill';
      pill.textContent = status.enabled ? 'On' : 'Off';
      holder.replaceChildren(
        ...(status.enabled
          ? [
              notice(h('span', h('b', 'On'), ` since ${date(status.since, { year: true })}. ${status.recoveryLeft} recovery code${status.recoveryLeft === 1 ? '' : 's'} left.`), { kind: 'success', glyph: 'shield' }),
              status.recoveryLeft < 3 && notice('You’re running low on recovery codes. Make new ones.', { kind: 'warning', glyph: 'alert' }),
              h('div.row.wrap', button('New recovery codes', { glyph: 'refresh', onClick: renew }), button('Turn off', { kind: 'danger', onClick: turnOff })),
            ]
          : [
              h('p.small.muted', 'After your password, signing in asks for a six-digit code from an app on your phone. Someone who learns your password still can’t get in.'),
              h('div', button('Set up two-step sign-in', { kind: 'primary', glyph: 'shield', onClick: setUp })),
            ]
        ).filter(Boolean),
      );
    } catch (error) {
      toastError(error);
    }
  };
  draw();
  return card(cardHead('Two-step sign-in', pill), holder);
}

/**
 * Settings: your account and devices, the look of the admin, the
 * integrations (Calendly, the site's own form and visit counter), the
 * admin's data, and what it runs on.
 */

const TABS = [
  ['account', 'Account', 'user'],
  ['security', 'Security', 'shield'],
  ['appearance', 'Appearance', 'palette'],
  ['integrations', 'Integrations', 'link'],
  ['data', 'Data', 'database'],
  ['system', 'System', 'monitor'],
];

const field = (label, control, hint) => h('div.field', h('label', label), control, hint && h('div.field-hint', hint));

export default async function settings({ params }) {
  const tab = TABS.some(([id]) => id === params.tab) ? params.tab : 'account';
  setTitle('Settings');
  show(pageSkeleton());
  let data;
  try {
    data = await get('/api/settings');
  } catch (error) {
    toastError(error);
    return;
  }
  const isOwner = session.can('owner');
  const tabs = h('div.tabs', TABS.map(([id, label, glyph]) => h(`a${tab === id ? '.active' : ''}`, { href: `/settings/${id}` }, icon(glyph, { size: 16 }), label)));
  const body = h('div.stack.loose');

  if (tab === 'account') {
    const name = h('input.input', { type: 'text', value: session.user.name, autocomplete: 'name' });
    const email = h('input.input', { type: 'email', value: session.user.email, autocomplete: 'username' });
    const current = h('input.input', { type: 'password', autocomplete: 'current-password' });
    const next = h('input.input', { type: 'password', autocomplete: 'new-password' });
    body.append(
      card(
        cardHead('Profile'),
        h(
          'div.card-body.stack',
          h('div.form-grid.cols-2', field('Name', name), field('Email', email, 'You sign in with this.')),
          h('div', button('Save profile', { kind: 'primary', onClick: async (event) => {
            await busy(event.currentTarget, async () => {
              const { user } = await patch('/api/auth/profile', { name: name.value, email: email.value });
              session.user = user;
              toast('Profile saved.');
            });
          } })),
        ),
      ),
      card(
        cardHead('Password'),
        h(
          'div.card-body.stack',
          h('div.form-grid.cols-2', field('Current password', current), field('New password', next, 'At least 10 characters. Your other devices are signed out.')),
          h('div', button('Change password', { onClick: async (event) => {
            await busy(event.currentTarget, async () => {
              await post('/api/auth/password', { current: current.value, next: next.value });
              current.value = '';
              next.value = '';
              toast('Password changed. Other devices were signed out.');
            });
          } })),
        ),
      ),
    );
  }

  if (tab === 'security') {
    const list = h('div.list', { style: { marginTop: '8px' } });
    const drawSessions = async () => {
      const sessions = await get('/api/auth/sessions');
      list.replaceChildren(
        ...sessions.map((s) => {
          const phone = /Mobi|Android|iPhone/i.test(s.agent);
          const browser = /Edg\//.test(s.agent) ? 'Edge' : /Chrome\//.test(s.agent) ? 'Chrome' : /Firefox\//.test(s.agent) ? 'Firefox' : /Safari\//.test(s.agent) ? 'Safari' : 'A browser';
          const os = /Windows/.test(s.agent) ? 'Windows' : /Mac OS X/.test(s.agent) && !/iPhone|iPad/.test(s.agent) ? 'macOS' : /iPhone|iPad/.test(s.agent) ? 'iOS' : /Android/.test(s.agent) ? 'Android' : /Linux/.test(s.agent) ? 'Linux' : '';
          return h(
            'div.list-row',
            h('div.list-icon', icon(phone ? 'phone' : 'monitor')),
            h('div.meta', h('strong', `${browser}${os ? ` on ${os}` : ''}`, s.current ? h('span.pill.success', { style: { marginLeft: '8px' } }, 'This device') : ''), h('span', `${s.ip || 'unknown address'} · active ${relative(s.lastSeenAt)} · signed in ${relative(s.createdAt)}`)),
            !s.current && button('Sign out', { small: true, onClick: async () => (await del(`/api/auth/sessions/${encodeURIComponent(s.id)}`), toast('Signed out.'), drawSessions()) }),
          );
        }),
      );
    };
    await drawSessions().catch(toastError);
    body.append(
      session.features.twoFactor ? twoFactorCard() : '',
      card(cardHead('Signed-in devices', button('Sign out all others', { small: true, onClick: async () => (await post('/api/auth/sessions/revoke-others', {}), toast('Every other device is signed out.'), drawSessions()) })), list),
      card(
        cardHead('How the admin keeps itself safe'),
        h(
          'div.card-body',
          h(
            'ul.stack.tight',
            { style: { margin: 0, paddingLeft: '18px', color: 'var(--text-2)' } },
            [
              'Passwords are stretched with scrypt; only a hash is stored.',
              'Sign-in is limited to 5 tries per 15 minutes per address, then paused.',
              `Sessions last ${data.system.sessionHours} hours, live in a cookie scripts can’t read, and are never sent to other sites.`,
              'Every change needs a token tied to your session, so another site can’t act for you.',
              ...(session.hosted
                ? [
                    'Two-step sign-in, when it’s on, asks for a code from your phone after the password.',
                    'First-run setup needs the setup token from the backend’s settings.',
                    'The Calendly token and two-step keys are stored sealed (AES-256-GCM); a copy of the database alone can’t open them.',
                    'Edits to the site are checked, saved as commits on GitHub, and recorded in Activity.',
                  ]
                : [
                    'First-run setup only works on the computer the admin runs on.',
                    'Edits to the site are checked, backed up first, and recorded in Activity.',
                    `The admin listens on ${data.system.host}${data.system.host === '127.0.0.1' ? ', so only this computer can reach it' : ''}.`,
                  ]),
            ].map((line) => h('li.small', line)),
          ),
        ),
      ),
    );
  }

  if (tab === 'appearance') {
    const choice = document.documentElement.dataset.themeChoice || 'system';
    body.append(
      card(
        cardHead('Theme'),
        h(
          'div.card-body.stack',
          h(
            'div.segmented',
            [
              ['system', 'Match the device', 'monitor'],
              ['dark', 'Night', 'moon'],
              ['light', 'Paper', 'sun'],
            ].map(([value, label, glyph]) => h(`button${choice === value ? '.active' : ''}`, { type: 'button', onClick: () => (applyTheme(value), settings({ params })) }, icon(glyph), label)),
          ),
          h('p.small.muted', 'Night follows the site’s own palette; Paper is easier in bright rooms.'),
        ),
      ),
    );
  }

  if (tab === 'integrations') {
    const token = h('input.input', { type: 'password', placeholder: data.calendly.connected ? `Saved (${data.calendly.hint}). Paste a new one to replace it.` : 'Paste a Personal Access Token', autocomplete: 'off', disabled: !isOwner });
    const origins = h('textarea.textarea', { rows: 3, value: data.siteOrigins.join('\n'), disabled: !isOwner, placeholder: 'https://theatlasstudio.com' });
    const siteUrl = h('input.input', { type: 'url', value: data.siteUrl, placeholder: 'https://theatlasstudio.com', disabled: !isOwner });
    const endpoint = `${location.origin}${withBase('/api/public/enquiry')}`;
    body.append(
      card(
        cardHead('Calendly', data.calendly.connected ? h('span.pill.success.dot', 'Connected') : h('span.pill', 'Not connected')),
        h(
          'div.card-body.stack',
          h('p.small.muted', 'Brings every booking from /contact into Meetings, and each new person into Enquiries. In Calendly: Integrations → API & Webhooks → Personal Access Tokens → Create.'),
          data.calendly.user && notice(h('span', 'Connected as ', h('b', data.calendly.user.name), ` (${data.calendly.user.email})${data.calendly.lastSync ? `, last synced ${relative(data.calendly.lastSync)}` : ''}.`), { kind: 'success', glyph: 'checkCircle' }),
          field('Personal Access Token', token, session.hosted ? 'Stored sealed in the admin’s database, never shown again in full.' : 'Stored in the admin’s own data on this computer, never shown again in full.'),
          isOwner &&
            h(
              'div.row.wrap',
              button('Save token', { kind: 'primary', onClick: async (event) => {
                await busy(event.currentTarget, async () => {
                  if (!token.value.trim()) return toast('Paste a token first.', { type: 'error' });
                  await patch('/api/settings', { calendlyToken: token.value.trim() });
                  const user = await post('/api/settings/test-calendly', {});
                  toast(`Connected to Calendly as ${user.name}.`);
                  settings({ params });
                });
              } }),
              data.calendly.connected && button('Test', { onClick: async (event) => busy(event.currentTarget, async () => toast(`Calendly answers: ${(await post('/api/settings/test-calendly', {})).name}.`)) }),
              data.calendly.connected && button('Disconnect', { kind: 'danger', onClick: async () => {
                if (!(await confirm({ title: 'Disconnect Calendly?', message: 'Meetings already synced stay.', confirmLabel: 'Disconnect', danger: true }))) return;
                await patch('/api/settings', { calendlyToken: '' });
                settings({ params });
              } }),
            ),
        ),
      ),
      card(
        cardHead('The live site'),
        h(
          'div.card-body.stack',
          field('Live address', siteUrl, 'Used for “view on the site” links.'),
          field('Sites allowed to send to the admin', origins, `One per line. The enquiry form and visit counter only accept these${session.hosted ? ' and the admin’s own address' : ''}. Always allowed (from ${session.hosted ? 'the backend’s settings' : 'Admin/.env'}): ${data.envOrigins.join(', ') || 'none'}.`),
          isOwner && h('div', button('Save', { kind: 'primary', onClick: async (event) => busy(event.currentTarget, async () => (await patch('/api/settings', { siteUrl: siteUrl.value, siteOrigins: origins.value }), toast('Saved.'))) })),
        ),
      ),
      session.hosted && emailCard(),
      card(
        cardHead('Collect enquiries from any form'),
        h(
          'div.card-body.stack',
          h('p.small.muted', 'A form on the site (or anywhere allowed above) can post an enquiry straight into the admin. Fields: name, email, company, phone, service, budget, message. Leave the hidden website_url field empty: bots fill it in and are ignored.'),
          codeBlock(`fetch('${endpoint}', {\n  method: 'POST',\n  headers: { 'content-type': 'application/json' },\n  body: JSON.stringify({ name, email, company, service, budget, message, website_url: '' }),\n});`),
        ),
      ),
      card(
        cardHead('Count visits'),
        h(
          'div.card-body.stack',
          session.hosted
            ? notice('Once the site is connected to this backend (its ADMIN_BACKEND_URL), its pages load the counter themselves, and bookings and deck downloads are counted too. Another site can use the tag below.', { glyph: 'checkCircle' })
            : h('p.small.muted', 'Add to the site’s <head> to see visits in Analytics. No cookies.'),
          codeBlock(`<script defer src="${location.origin}${withBase('/beacon.js')}"></script>`),
        ),
      ),
    );
  }

  if (tab === 'data') {
    const fileInput = h('input', { type: 'file', accept: 'application/json', class: 'hidden' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const result = await api('/api/settings/import', { method: 'POST', raw: await file.text(), headers: { 'content-type': 'application/json' } });
        toast(`Imported ${result.enquiries} enquiries and ${result.meetings} meetings.`);
      } catch (error) {
        toastError(error);
      }
      fileInput.value = '';
    });
    body.append(
      card(
        cardHead('Export and import'),
        h(
          'div.card-body.stack',
          h('p.small.muted', 'Download the admin’s records (enquiries, meetings, visit counts, the activity log and settings) as one JSON file. Passwords and the Calendly token are left out.'),
          isOwner ? h('div.row.wrap', h('a.btn', { href: '/api/settings/export', download: '' }, icon('download'), 'Export everything'), button('Import a file', { glyph: 'upload', onClick: () => fileInput.click() }), fileInput) : notice('Only the owner can export or import.', { kind: 'warning', glyph: 'lock' }),
          h('p.tiny.muted', 'Importing adds records the admin doesn’t already have; nothing is overwritten.'),
        ),
      ),
      card(
        cardHead('Sample data', data.sample ? h('span.pill.violet', 'Showing') : null),
        h(
          'div.card-body.stack',
          h('p.small.muted', 'Invented enquiries, meetings and visits, to see the admin at work before real ones arrive. They’re marked “Sample” everywhere.'),
          isOwner &&
            h(
              'div.row.wrap',
              data.sample
                ? button('Clear sample data', { kind: 'danger', glyph: 'trash', onClick: async () => {
                    if (!(await confirm({ title: 'Clear the sample data?', message: 'Every record marked Sample is removed. Your own records stay.', confirmLabel: 'Clear', danger: true }))) return;
                    const { removed } = await del('/api/settings/sample');
                    toast(`Removed ${removed} sample records.`);
                    await refreshBadges();
                    settings({ params });
                  } })
                : button('Load sample data', { glyph: 'sparkles', onClick: async () => (await post('/api/settings/sample', {}), toast('Sample data loaded.'), await refreshBadges(), settings({ params })) }),
            ),
        ),
      ),
      isOwner &&
        card(
          cardHead(session.hosted ? 'Earlier versions' : 'Content backups'),
          h(
            'div.card-body.stack',
            h('p.small.muted', session.hosted ? 'Every save is a commit on GitHub, so each content file’s history is its backup. Any earlier version can be brought back (as a new draft to publish).' : 'Before every edit, the admin keeps a copy of the site file it changes (the last 40 of each) in Admin/data/backups.'),
            h('div', button(session.hosted ? 'Browse versions' : 'Browse backups', { glyph: 'history', onClick: () => backupsModal() })),
          ),
        ),
    );
  }

  if (tab === 'system' && data.system.mode === 'hosted') {
    const s = data.system;
    body.append(
      card(
        cardHead('This admin', h('span.pill.brand', 'Hosted')),
        h(
          'dl.card-body.kv',
          h('dt', 'Version'),
          h('dd', s.version),
          h('dt', 'Node.js'),
          h('dd', s.node),
          h('dt', 'Address'),
          h('dd.mono.tiny', s.publicUrl || location.origin + withBase('/')),
          h('dt', 'Database'),
          h('dd.mono.tiny', s.database),
          h('dt', 'Site on GitHub'),
          h('dd', s.repoUrl ? h('a', { href: s.repoUrl, target: '_blank', rel: 'noopener', 'data-external': '' }, s.repo) : '—'),
          h('dt', 'Publishing'),
          h('dd', s.direct ? h('span', 'Every save goes live on ', h('code.mono', s.liveBranch)) : h('span', 'Saves wait on ', h('code.mono', s.draftBranch), ', publishing moves them to ', h('code.mono', s.liveBranch))),
          h('dt', 'GitHub allowance'),
          h('dd', s.github ? `${number(s.github.remaining)} of ${number(s.github.limit)} requests left this hour` : '—'),
          h('dt', 'Email'),
          h('dd', data.mail.configured ? `${data.mail.kind === 'smtp' ? 'SMTP' : data.mail.kind === 'resend' ? 'Resend' : data.mail.kind}${data.mail.from ? ` · from ${data.mail.from}` : ''}` : 'Not set up'),
          h('dt', 'Time zone'),
          h('dd', s.timeZone),
          h('dt', 'Records'),
          h('dd', `${number(s.counts.users)} accounts · ${number(s.counts.enquiries)} enquiries · ${number(s.counts.meetings)} meetings · ${number(s.counts.activity)} log entries`),
        ),
      ),
      notice(h('span', 'These come from the backend’s environment variables (', h('code.mono', 'backend/.env.example'), ' lists them all). Redeploy the backend after changing one.')),
    );
  } else if (tab === 'system') {
    const s = data.system;
    body.append(
      card(
        cardHead('This admin'),
        h(
          'dl.card-body.kv',
          h('dt', 'Version'),
          h('dd', s.version),
          h('dt', 'Node.js'),
          h('dd', s.node),
          h('dt', 'Address'),
          h('dd.mono', `${s.host}:${s.port}`),
          h('dt', 'Site folder'),
          h('dd.mono.tiny', s.siteRoot),
          h('dt', 'Admin data'),
          h('dd.mono.tiny', s.dataDir),
          h('dt', 'Time zone'),
          h('dd', s.timeZone),
          h('dt', 'Records'),
          h('dd', `${number(s.counts.users)} accounts · ${number(s.counts.enquiries)} enquiries · ${number(s.counts.meetings)} meetings · ${number(s.counts.activity)} log entries`),
        ),
      ),
      notice(h('span', 'Settings such as the port, the site folder and the allowed origins live in ', h('code.mono', 'Admin/.env'), ' (see .env.example). Restart the admin after changing them.')),
    );
  }

  /** Where new-enquiry alerts go, and a test send (hosted admin). */
  function emailCard() {
    const notify = h('input.input', { type: 'email', value: data.notifyEmail ?? '', placeholder: 'contact.theatlasstudio@gmail.com', disabled: !isOwner || !data.mail.configured, autocomplete: 'off' });
    return card(
      cardHead('Email alerts', data.mail.configured ? h('span.pill.success.dot', 'Email works') : h('span.pill', 'Not set up')),
      h(
        'div.card-body.stack',
        data.mail.configured
          ? h('p.small.muted', 'Each enquiry from the site’s form is emailed here as it arrives; replying writes straight back to the person. Password-reset and invitation emails also come from the admin.')
          : notice(h('span', 'Email isn’t set up for the backend yet. Set ', h('code.mono', 'SMTP_URL'), ' (a Gmail app password works) or ', h('code.mono', 'RESEND_API_KEY'), ', and ', h('code.mono', 'MAIL_FROM'), ', then redeploy.'), { kind: 'warning', glyph: 'mail' }),
        field('Send new enquiries to', notify, 'Leave empty to stop the alerts.'),
        isOwner &&
          data.mail.configured &&
          h(
            'div.row.wrap',
            button('Save', { kind: 'primary', onClick: async (event) => busy(event.currentTarget, async () => (await patch('/api/settings', { notifyEmail: notify.value.trim() }), toast(notify.value.trim() ? 'Alerts will go there.' : 'Alerts are off.'))) }),
            button('Send a test', { glyph: 'send', onClick: async (event) => busy(event.currentTarget, async () => toast(`Sent a test to ${(await post('/api/settings/test-email', {})).to}.`)) }),
          ),
      ),
    );
  }

  async function backupsModal() {
    const { modal } = await import('../lib/ui.js');
    const backups = await get('/api/content-backups');
    modal({
      title: 'Content backups',
      size: 'wide',
      body: backups.length
        ? h(
            'div.list',
            backups.slice(0, 80).map((b) =>
              h(
                'div.list-row',
                h('div.list-icon', icon('fileText')),
                h('div.meta', h('strong', b.path), h('span', `${relative(b.at)}${b.subject ? ` · before “${b.subject}”` : ''}${b.actor ? `${b.subject ? ' by' : ' · before an edit by'} ${b.actor}` : ''}`)),
                button('Restore', { small: true, onClick: async () => {
                  const message = session.hosted ? 'The file goes back to how it was then, as a new draft. The live site doesn’t change until you publish, and this can be undone the same way.' : 'The file goes back to this copy. The current version is backed up first, so this can be undone.';
                  if (!(await confirm({ title: `Restore ${b.path}?`, message, confirmLabel: 'Restore', danger: true }))) return;
                  try {
                    await post('/api/content-backups/restore', { file: b.file, name: b.name });
                    toast(`${b.path} restored. Review it on the publish page.`);
                    navigate('/publish');
                  } catch (error) {
                    toastError(error);
                  }
                } }),
              ),
            ),
          )
        : h('p.muted', 'No backups yet: they’re made the first time content is edited here.'),
    });
  }

  show(pageHead({ title: 'Settings' }), tabs, body);
}
