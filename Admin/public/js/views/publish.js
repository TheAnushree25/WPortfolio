import { h, withBase } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post } from '../lib/api.js';
import { show, setTitle } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { button, card, cardHead, confirm, empty, modal, notice, pageHead, pageSkeleton, toast, toastError, busy } from '../lib/ui.js';
import { date, relative } from '../lib/format.js';

/**
 * Publishing. Edits made in the admin land in the site's files straight
 * away; this page shows those changes, lets each be checked or dropped, and
 * takes the site through its steps: check it compiles, preview it locally,
 * keep a version (a git commit), then build and deploy to Cloudflare.
 */

const STATE_PILL = { modified: ['Changed', 'brand'], new: ['New', 'success'], added: ['New', 'success'], deleted: ['Removed', 'danger'], renamed: ['Renamed', 'warning'], conflicted: ['Conflict', 'danger'] };
const JOB_PILL = { running: ['Running', 'brand'], succeeded: ['Passed', 'success'], failed: ['Failed', 'danger'], stopped: ['Stopped', 'warning'] };

export default async function publish() {
  setTitle('Publish');
  show(pageSkeleton());
  let data;
  try {
    data = await get('/api/publish');
  } catch (error) {
    toastError(error);
    return;
  }
  // The hosted admin publishes through GitHub and the hosting provider instead of local builds.
  if (data.mode === 'hosted') return (await import('./publish-hosted.js')).default(data);
  const canEdit = session.can('editor');
  const isOwner = session.can('owner');
  let stream = null;
  const consoleEl = h('div.console', { role: 'log', 'aria-live': 'polite' });
  const jobTitle = h('div.row.wrap');
  const jobPanel = card(cardHead('Output'), h('div.card-body.stack', jobTitle, consoleEl));
  jobPanel.classList.add('hidden');
  const holder = h('div.stack.loose');

  const watch = (job) => {
    stream?.close();
    jobPanel.classList.remove('hidden');
    consoleEl.replaceChildren();
    const status = h('span.pill', '…');
    const stop = canEdit && button('Stop', { small: true, glyph: 'stop', kind: 'danger', onClick: async () => {
      try {
        await post(`/api/jobs/${job.id}/stop`, {});
      } catch (error) {
        toastError(error);
      }
    } });
    jobTitle.replaceChildren(h('strong', job.label), status, h('span.tiny.muted.mono', job.command ?? ''), stop);
    const setStatus = (value) => {
      const [label, kind] = JOB_PILL[value] ?? [value, ''];
      status.className = `pill ${kind}`;
      status.textContent = label;
      if (value !== 'running') stop?.remove();
    };
    setStatus(job.status);
    const line = (text) => {
      const atBottom = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 40;
      const kind = /^\$ /.test(text) ? 'cmd' : /error|failed|✗|ERR!/i.test(text) ? 'err' : /✓|compiled|ready|success|done in/i.test(text) ? 'ok' : '';
      consoleEl.append(h(`div${kind ? `.${kind}` : ''}`, text));
      if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
    };
    stream = new EventSource(withBase(`/api/jobs/${job.id}/stream`));
    stream.addEventListener('line', (event) => line(JSON.parse(event.data).text));
    stream.addEventListener('ready', (event) => {
      const { url } = JSON.parse(event.data);
      toast('The preview is ready.', { action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener') } });
      reload(false);
    });
    stream.addEventListener('end', (event) => {
      const { status: final } = JSON.parse(event.data);
      setStatus(final);
      stream.close();
      stream = null;
      if (final === 'succeeded') toast(`${job.label}: done.`);
      else if (final === 'failed') toast(`${job.label} failed. The output says why.`, { type: 'error' });
      reload(false);
    });
    stream.onerror = () => {
      stream?.close();
      stream = null;
    };
    jobPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const run = async (type, btn, extra = {}) => {
    await busy(btn, async () => {
      const job = await post('/api/jobs', { type, ...extra });
      watch(job);
      await reload(false);
    });
  };

  const showDiff = async (change, target) => {
    if (target.firstChild) return target.replaceChildren();
    try {
      const result = await get(`/api/publish/diff?file=${encodeURIComponent(change.file)}`);
      if (result.binary) return target.replaceChildren(h('p.small.muted', `${result.state === 'new' ? 'A new file' : 'A changed file'} that can’t be shown as text${result.bytes ? ` (${Math.round(result.bytes / 1024)} KB)` : ''}.`));
      const lines = result.diff.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l));
      target.replaceChildren(h('div.diff', lines.map((l) => h(`div${l.startsWith('+') ? '.add' : l.startsWith('-') ? '.del' : l.startsWith('@@') ? '.hunk' : l.startsWith('\\') ? '.meta' : ''}`, l || ' '))));
    } catch (error) {
      toastError(error);
    }
  };

  const changesCard = () =>
    card(
      cardHead(data.changes.length ? `${data.changes.length} ${data.changes.length === 1 ? 'change' : 'changes'} not live yet` : 'Changes', data.changes.length > 0 && canEdit && button('Save a version', { small: true, glyph: 'commit', onClick: commitModal })),
      data.changes.length
        ? h(
            'div.list',
            { style: { marginTop: '10px' } },
            data.changes.map((change) => {
              const diffBox = h('div', { style: { width: '100%' } });
              const [label, kind] = STATE_PILL[change.state] ?? [change.state, ''];
              return h(
                'div.change-row',
                h('div.list-icon.brand', icon(change.file.startsWith('public/') ? 'image' : 'fileText')),
                h('div.meta.grow', h('strong', change.label), h('span.mono.tiny', change.file)),
                h(`span.pill.${kind}`, label),
                button('Diff', { small: true, kind: 'ghost', glyph: 'eye', onClick: () => showDiff(change, diffBox) }),
                canEdit && button('', { small: true, kind: 'ghost', glyph: 'undo', title: 'Discard this change', onClick: async () => {
                  if (!(await confirm({ title: 'Discard this change?', message: change.state === 'new' ? `${change.file} is new; it goes to the media trash.` : `${change.file} goes back to how it was at the last saved version. Backups of every admin edit are kept in Admin/data/backups.`, confirmLabel: 'Discard', danger: true }))) return;
                  try {
                    await post('/api/publish/discard', { file: change.file });
                    toast('Discarded.');
                    await reload();
                  } catch (error) {
                    toastError(error);
                  }
                } }),
                diffBox,
              );
            }),
          )
        : h('div.card-body', empty({ glyph: 'checkCircle', title: 'Everything is saved as a version', text: 'Edits you make in the admin appear here until they’re kept as a version and deployed.' })),
    );

  const stepsCard = () => {
    const ready = data.site.packages;
    const busyJob = data.busy;
    const step = (glyph, title, text, action) => h('div.step-row', h('div.list-icon.brand', icon(glyph)), h('div.step-text', h('strong', title), h('span', text)), action);
    return card(
      cardHead('Take it live'),
      h(
        'div.card-body',
        !ready && h('div', { style: { marginBottom: '14px' } }, notice(h('span', h('b', 'The site’s packages aren’t installed. '), 'Checks, builds and the preview need them (npm ci, a few minutes the first time).'), { kind: 'warning', glyph: 'alert' })),
        busyJob && h('div', { style: { marginBottom: '14px' } }, notice(h('span', h('b', `${busyJob.label} is running. `), h('button.btn.small.ghost', { type: 'button', onClick: () => watch(busyJob) }, 'Show output')))),
        !ready && step('download', 'Install the site’s packages', 'Runs npm ci in the site folder.', isOwner ? button('Install', { kind: 'primary', glyph: 'download', onClick: (e) => run('install', e.currentTarget) }) : h('span.small.muted', 'Owner only')),
        step('shield', '1 · Check it compiles', 'TypeScript reads every file, so a broken edit is caught before visitors see it.', canEdit && button('Run check', { glyph: 'play', disabled: !ready || Boolean(busyJob), onClick: (e) => run('typecheck', e.currentTarget) })),
        data.site.mounted
          ? step('monitor', '2 · Preview locally', 'This admin is part of the running site, so the site you open from here already shows every saved change.', h('a.btn', { href: `${location.origin}/`, target: '_blank', rel: 'noopener' }, icon('external'), 'Open the site'))
          : step(
          'monitor',
          '2 · Preview locally',
          data.preview ? h('span', 'Running at ', h('a', { href: data.preview.url, target: '_blank', rel: 'noopener', 'data-external': '' }, data.preview.url), data.preview.ready ? '' : ' (starting…)') : `Opens the site with your changes at localhost:${data.site.previewPort}, on this computer.`,
          canEdit && (data.preview
            ? h('div.row', button('Open', { glyph: 'external', href: data.preview.url, target: '_blank' }), button('Stop', { kind: 'danger', glyph: 'stop', onClick: async () => (await post(`/api/jobs/${data.preview.id}/stop`, {}).catch(toastError), reload(false)) }))
            : button('Start preview', { glyph: 'play', disabled: !ready, onClick: async (e) => {
                await busy(e.currentTarget, async () => {
                  try {
                    const job = await post('/api/jobs', { type: 'preview' });
                    watch(job);
                    await reload(false);
                  } catch (error) {
                    if (error.code === 'preview_running') toast(error.message, { action: { label: 'Open', onClick: () => window.open(error.data.url, '_blank', 'noopener') } });
                    else throw error;
                  }
                });
              } })),
        ),
        step('commit', '3 · Save a version', data.git.available ? `Commits the content and media changes on ${data.git.branch}. Nothing is pushed to GitHub.` : data.git.reason, canEdit && data.git.available && button('Save a version', { glyph: 'commit', disabled: !data.changes.length, onClick: commitModal })),
        data.site.mounted
          ? step('rocket', '4 · Build and deploy', h('span', 'A build would rewrite the files the running site is using, so it happens outside it: stop ', h('code.mono', 'npm run dev'), ' and run ', h('code.mono', 'npm run deploy'), ', or run the admin on its own (', h('code.mono', 'npm start'), ' in Admin) and deploy from here.'), null)
          : step('rocket', '4 · Build and deploy', `Builds the site and deploys it to ${data.site.hosting} (npm run deploy). Needs Wrangler signed in on this computer.`, isOwner ? button('Deploy…', { kind: 'primary', glyph: 'rocket', disabled: !ready || Boolean(busyJob), onClick: deployModal }) : h('span.small.muted', 'Owner only')),
      ),
    );
  };

  const statusCard = () =>
    card(
      cardHead('The site'),
      h(
        'dl.card-body.kv',
        h('dt', 'Folder'),
        h('dd.mono.tiny', data.site.root),
        h('dt', 'Hosting'),
        h('dd', data.site.hosting),
        h('dt', 'Branch'),
        h('dd', data.git.available ? h('span', h('code.mono', data.git.branch), data.git.ahead ? h('span.pill.warning', { style: { marginLeft: '8px' } }, `${data.git.ahead} not pushed`) : null) : '—'),
        h('dt', 'Last version'),
        h('dd', data.git.head ? h('span', data.git.head.subject, h('div.tiny.muted', `${data.git.head.hash} · ${relative(data.git.head.at)}`)) : '—'),
        h('dt', 'Bookings'),
        h('dd', data.site.calendly ? h('span.pill.success.dot', 'Calendly') : h('span.pill.warning', 'By email')),
        data.otherChanges ? [h('dt', 'Code changes'), h('dd', h('span.pill.warning', `${data.otherChanges} outside the admin`), h('div.tiny.muted', 'A deploy builds them too.'))] : null,
      ),
    );

  const historyCard = () =>
    card(
      cardHead('History'),
      h(
        'div.list',
        { style: { marginTop: '8px' } },
        [
          ...data.jobs.slice(0, 6).map((job) => ({ at: job.startedAt, el: h('button.list-row', { type: 'button', onClick: async () => watch(await get(`/api/jobs/${job.id}`)) }, h('div.list-icon', icon(job.type === 'deploy' ? 'rocket' : job.type === 'preview' ? 'monitor' : 'terminal')), h('div.meta', h('strong', job.label), h('span', `${job.by} · ${relative(job.startedAt)}`)), h(`span.pill.${(JOB_PILL[job.status] ?? [])[1] ?? ''}`, (JOB_PILL[job.status] ?? [job.status])[0])) })),
          ...data.history.slice(0, 8).map((commit) => ({ at: commit.at, el: h('div.list-row', h('div.list-icon', icon('commit')), h('div.meta', h('strong', commit.subject), h('span', `${commit.short} · ${commit.author} · ${date(commit.at)}`))) })),
        ]
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .slice(0, 12)
          .map((row) => row.el),
      ),
    );

  function commitModal() {
    const labels = [...new Set(data.changes.map((c) => c.label.replace(/^Media · .*/, 'media')))];
    const message = h('input.input', { type: 'text', value: `Update ${labels.join(', ').toLowerCase()} from the admin`.slice(0, 120), maxLength: 200 });
    const boxes = data.changes.map((change) => ({ change, box: h('input', { type: 'checkbox', checked: true }) }));
    modal({
      title: 'Save a version',
      body: h(
        'div.stack',
        h('div.field', h('label', 'What changed'), message, h('div.field-hint', 'A short note for the history.')),
        h('div.stack.tight', boxes.map(({ change, box }) => h('label.check', box, h('span', h('b', change.label), h('br'), h('span.mono.tiny.muted', change.file))))),
        notice(`Committed on ${data.git.branch} as ${session.user.name}. Pushing to GitHub stays a separate, deliberate step.`),
      ),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Save version',
          kind: 'primary',
          onClick: async () => {
            const files = boxes.filter((b) => b.box.checked).map((b) => b.change.file);
            if (!files.length) return toast('Choose at least one change.', { type: 'error' }), false;
            const result = await post('/api/publish/commit', { message: message.value, files });
            toast(`Saved as version ${result.hash}.`);
            await reload();
          },
        },
      ],
    });
  }

  async function deployModal(event) {
    const button = event.currentTarget;
    const ok = await confirm({
      title: 'Deploy to the live site?',
      message: `This builds the site from ${data.site.root} as it is now${data.changes.length ? `, including ${data.changes.length} change${data.changes.length > 1 ? 's' : ''} not yet saved as a version` : ''}${data.otherChanges ? ` and ${data.otherChanges} code change${data.otherChanges > 1 ? 's' : ''}` : ''}, and publishes it on Cloudflare for every visitor.`,
      confirmLabel: 'Deploy',
      typeToConfirm: 'deploy',
      icon: 'rocket',
    });
    if (ok) run('deploy', button, { confirm: 'deploy' });
  }

  async function reload(full = true) {
    try {
      data = await get('/api/publish');
      draw();
      if (full) refreshBadges();
    } catch (error) {
      toastError(error);
    }
  }

  const draw = () => {
    holder.replaceChildren(h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 1fr)' } }, changesCard()), h('div.grid.two', stepsCard(), h('div.stack', statusCard(), historyCard())), jobPanel);
  };
  draw();
  show(pageHead({ title: 'Publish', text: 'Admin edits are saved in the site’s files at once; visitors see them after a build and deploy.' }), holder);
  const running = data.busy ?? data.preview;
  if (running) watch(running);
  return () => stream?.close();
}
