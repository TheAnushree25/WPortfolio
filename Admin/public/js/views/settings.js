import { h, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, patch, del, api } from '../lib/api.js';
import { show, setTitle, applyTheme } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { navigate } from '../lib/router.js';
import { button, card, cardHead, codeBlock, confirm, notice, pageHead, pageSkeleton, toast, toastError, busy } from '../lib/ui.js';
import { relative, number } from '../lib/format.js';

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
              'First-run setup only works on the computer the admin runs on.',
              'Edits to the site are checked, backed up first, and recorded in Activity.',
              `The admin listens on ${data.system.host}${data.system.host === '127.0.0.1' ? ', so only this computer can reach it' : ''}.`,
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
          field('Personal Access Token', token, 'Stored in the admin’s own data on this computer, never shown again in full.'),
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
          field('Sites allowed to send to the admin', origins, `One per line. The enquiry form and visit counter only accept these. Always allowed (from Admin/.env): ${data.envOrigins.join(', ') || 'none'}.`),
          isOwner && h('div', button('Save', { kind: 'primary', onClick: async (event) => busy(event.currentTarget, async () => (await patch('/api/settings', { siteUrl: siteUrl.value, siteOrigins: origins.value }), toast('Saved.'))) })),
        ),
      ),
      card(
        cardHead('Collect enquiries from any form'),
        h(
          'div.card-body.stack',
          h('p.small.muted', 'A form on the site (or anywhere allowed above) can post an enquiry straight into the admin. Fields: name, email, company, phone, service, budget, message. Leave the hidden website_url field empty: bots fill it in and are ignored.'),
          codeBlock(`fetch('${endpoint}', {\n  method: 'POST',\n  headers: { 'content-type': 'application/json' },\n  body: JSON.stringify({ name, email, company, service, budget, message, website_url: '' }),\n});`),
        ),
      ),
      card(cardHead('Count visits'), h('div.card-body.stack', h('p.small.muted', 'Add to the site’s <head> to see visits in Analytics. No cookies.'), codeBlock(`<script defer src="${location.origin}${withBase('/beacon.js')}"></script>`))),
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
      isOwner && card(cardHead('Content backups'), h('div.card-body.stack', h('p.small.muted', 'Before every edit, the admin keeps a copy of the site file it changes (the last 40 of each) in Admin/data/backups.'), h('div', button('Browse backups', { glyph: 'history', onClick: () => backupsModal() })))),
    );
  }

  if (tab === 'system') {
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
                h('div.meta', h('strong', b.path), h('span', `${relative(b.at)}${b.actor ? ` · before an edit by ${b.actor}` : ''}`)),
                button('Restore', { small: true, onClick: async () => {
                  if (!(await confirm({ title: `Restore ${b.path}?`, message: 'The file goes back to this copy. The current version is backed up first, so this can be undone.', confirmLabel: 'Restore', danger: true }))) return;
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
