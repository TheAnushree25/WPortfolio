import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post } from '../lib/api.js';
import { show } from '../lib/shell.js';
import { session, refreshBadges } from '../lib/session.js';
import { button, card, cardHead, confirm, empty, modal, notice, pageHead, toast, toastError } from '../lib/ui.js';
import { date, relative } from '../lib/format.js';

/**
 * Publishing on the hosted admin. Every save is already a commit on the
 * drafts branch, which the hosting provider builds as a preview. This page
 * shows what's waiting and each change's diff, puts a change back, links the
 * preview, and publishes: everything waiting goes onto the live branch as one
 * commit, which the provider deploys to visitors. While a build runs, the
 * page checks back on it.
 */

const STATE_PILL = { modified: ['Changed', 'brand'], new: ['New', 'success'], added: ['New', 'success'], deleted: ['Removed', 'danger'], renamed: ['Renamed', 'warning'] };
const DEPLOY = { success: ['Ready', 'success'], pending: ['Building…', 'brand'], failure: ['Failed', 'danger'], unknown: ['No report yet', ''] };

const deployPill = (deploy) => {
  const [label, kind] = DEPLOY[deploy?.state ?? 'unknown'] ?? DEPLOY.unknown;
  return h(`span.pill${kind ? `.${kind}` : ''}${deploy?.state === 'success' ? '.dot' : ''}`, label);
};

export default function publishHosted(initial) {
  let data = initial;
  let timer = null;
  let gone = false;
  const canEdit = session.can('editor');
  const isOwner = session.can('owner');
  const holder = h('div.stack.loose');
  const host = () => data.site.hosting;
  /** The provider's name at the start of a sentence. */
  const Host = () => host().charAt(0).toUpperCase() + host().slice(1);

  const showDiff = async (change, target) => {
    if (target.firstChild) return target.replaceChildren();
    try {
      const result = await get(`/api/publish/diff?file=${encodeURIComponent(change.file)}`);
      if (result.binary) return target.replaceChildren(h('p.small.muted', `${result.state === 'new' ? 'A new file' : 'A changed file'} that can’t be shown as text${result.bytes ? ` (${Math.round(result.bytes / 1024)} KB)` : ''}.`));
      const lines = result.diff.split('\n');
      target.replaceChildren(h('div.diff', lines.map((line) => h(`div${line.startsWith('+') ? '.add' : line.startsWith('-') ? '.del' : line.startsWith('@@') ? '.hunk' : line.startsWith('\\') ? '.meta' : ''}`, line || ' '))));
    } catch (error) {
      toastError(error);
    }
  };

  const changesCard = () =>
    card(
      cardHead(data.changes.length ? `${data.changes.length} ${data.changes.length === 1 ? 'change' : 'changes'} waiting to go live` : 'Changes', data.changes.length > 0 && isOwner && button('Publish…', { small: true, kind: 'primary', glyph: 'rocket', onClick: publishModal })),
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
                change.additions || change.deletions ? h('span.tiny.muted.mono', `+${change.additions} −${change.deletions}`) : null,
                h(`span.pill.${kind}`, label),
                button('Diff', { small: true, kind: 'ghost', glyph: 'eye', onClick: () => showDiff(change, diffBox) }),
                canEdit &&
                  button('', {
                    small: true,
                    kind: 'ghost',
                    glyph: 'undo',
                    title: 'Put this back as it is live',
                    onClick: async () => {
                      const message = change.state === 'new' || change.state === 'added' ? `${change.file} is new; it leaves the drafts and waits in the media trash.` : `${change.file} goes back to how it is on the live site. The draft stays in GitHub’s history.`;
                      if (!(await confirm({ title: 'Put this change back?', message, confirmLabel: 'Put back', danger: true }))) return;
                      try {
                        await post('/api/publish/discard', { file: change.file });
                        toast('Put back.');
                        await reload();
                      } catch (error) {
                        toastError(error);
                      }
                    },
                  }),
                diffBox,
              );
            }),
          )
        : h('div.card-body', empty({ glyph: 'checkCircle', title: 'Nothing waiting', text: data.repo.direct ? 'Every save goes live straight away here.' : 'Edits you make in the admin are saved as drafts and listed here until they’re published.' })),
    );

  const step = (glyph, title, text, action) => h('div.step-row', h('div.list-icon.brand', icon(glyph)), h('div.step-text', h('strong', title), h('span', text)), action);

  const stepsCard = () => {
    const draft = data.draft;
    const preview = draft?.deploy;
    return card(
      cardHead('Take it live'),
      h(
        'div.card-body',
        data.repo.direct
          ? step('commit', '1 · Saved', h('span', 'Every save is a commit on ', h('code.mono', data.repo.live), ', so it goes live as soon as ', host(), ' has built it.'), null)
          : step('commit', '1 · Saved as drafts', h('span', 'Every save is a commit on ', h('code.mono', data.repo.draft), ' on GitHub, in your name. Nothing reaches visitors yet.'), null),
        !data.repo.direct &&
          step(
            'monitor',
            '2 · Preview',
            !data.changes.length
              ? 'Once something is waiting, its preview build appears here.'
              : preview?.state === 'success'
                ? `${Host()} built the drafts as a preview${preview.at ? ` ${relative(preview.at)}` : ''}.`
                : preview?.state === 'pending'
                  ? `${Host()} is building the drafts as a preview…`
                  : preview?.state === 'failure'
                    ? `${Host()}’s preview build failed${preview.description ? `: ${preview.description}` : ''}. Publishing now would fail the same way; check the build on ${host()}.`
                    : `${Host()} hasn’t reported a preview for the newest drafts yet (it can take a minute, or its GitHub link may not report to this repository).`,
            data.changes.length ? h('div.row', deployPill(preview), preview?.url ? button('Open', { glyph: 'external', href: preview.url, target: '_blank' }) : null) : null,
          ),
        !data.repo.direct &&
          step(
            'rocket',
            '3 · Publish',
            h('span', 'Puts everything waiting onto ', h('code.mono', data.repo.live), ' as one commit; ', host(), ' then deploys it for every visitor.'),
            isOwner ? button('Publish…', { kind: 'primary', glyph: 'rocket', disabled: !data.changes.length, onClick: publishModal }) : h('span.small.muted', 'Owner only'),
          ),
        step(
          'globe',
          data.repo.direct ? '2 · Live' : '4 · Live',
          data.live.deploy?.state === 'pending' ? `${Host()} is deploying the latest publish…` : data.live.deploy?.state === 'failure' ? `The last deploy failed${data.live.deploy.description ? `: ${data.live.deploy.description}` : ''}. Visitors still see the version before it.` : 'What visitors see now.',
          h('div.row', deployPill(data.live.deploy), data.live.url || data.live.deploy?.url ? button('Open the site', { glyph: 'external', href: data.live.url || data.live.deploy.url, target: '_blank' }) : null),
        ),
      ),
    );
  };

  const statusCard = () =>
    card(
      cardHead('The site'),
      h(
        'dl.card-body.kv',
        h('dt', 'Repository'),
        h('dd', h('a', { href: data.repo.url, target: '_blank', rel: 'noopener', 'data-external': '' }, data.repo.name), data.repo.private ? h('span.pill', { style: { marginLeft: '8px' } }, 'Private') : null),
        h('dt', 'Hosting'),
        h('dd', host() === 'the host' ? 'Not reported yet' : host()),
        h('dt', 'Live branch'),
        h('dd', h('code.mono', data.repo.live)),
        !data.repo.direct && [h('dt', 'Drafts'), h('dd', h('code.mono', data.repo.draft), data.draft?.behind ? h('div.tiny.muted', 'Newer code on the live branch is brought in with the next save.') : null)],
        h('dt', 'Live now'),
        h('dd', data.live.head ? h('span', data.live.head.subject, h('div.tiny.muted', `${data.live.head.short} · ${data.live.head.author} · ${relative(data.live.head.at)}`)) : '—'),
      ),
    );

  const historyCard = () =>
    card(
      cardHead('History'),
      data.history.length
        ? h(
            'div.list',
            { style: { marginTop: '8px' } },
            data.history.slice(0, 10).map((commit) => h('div.list-row', h('div.list-icon', icon(/from the admin|Publish/i.test(commit.subject) ? 'rocket' : 'commit')), h('div.meta', h('strong', commit.subject), h('span', `${commit.short} · ${commit.author} · ${date(commit.at)}`)))),
          )
        : h('div.card-body', h('p.small.muted', 'No commits yet.')),
    );

  function publishModal() {
    const labels = [...new Set(data.changes.map((change) => change.label.replace(/^Media · .*/, 'media')))];
    const message = h('input.input', { type: 'text', value: `Publish ${labels.join(', ').toLowerCase()}`.slice(0, 120), maxLength: 200 });
    const typed = h('input.input', { type: 'text', autocomplete: 'off', placeholder: 'publish', 'aria-label': 'Type publish to confirm' });
    modal({
      title: 'Publish to the live site?',
      body: h(
        'div.stack',
        h('p', `${data.changes.length} ${data.changes.length === 1 ? 'change goes' : 'changes go'} onto ${data.repo.live}, and ${host()} deploys ${data.changes.length === 1 ? 'it' : 'them'} for every visitor in a minute or two.`),
        data.draft?.deploy?.state === 'failure' && notice('The preview build of these drafts failed. Publishing will most likely fail to deploy too.', { kind: 'warning', glyph: 'alert' }),
        h('div.field', h('label', 'A note for the history'), message),
        h('div.field', h('label', 'Type ', h('b', 'publish'), ' to confirm'), typed),
      ),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Publish',
          kind: 'primary',
          icon: 'rocket',
          onClick: async () => {
            if (typed.value.trim().toLowerCase() !== 'publish') return toast('Type “publish” to confirm.', { type: 'error' }), false;
            const result = await post('/api/publish/release', { confirm: 'publish', message: message.value });
            toast(`Published as ${result.short}. ${Host()} is deploying it.`);
            await reload();
          },
        },
      ],
    });
  }

  async function reload() {
    try {
      data = await get('/api/publish');
      draw();
      refreshBadges();
    } catch (error) {
      toastError(error);
    }
  }

  function draw() {
    holder.replaceChildren(h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 1fr)' } }, changesCard()), h('div.grid.two', stepsCard(), h('div.stack', statusCard(), historyCard())));
    clearTimeout(timer);
    // While something is building, check back every few seconds.
    const building = data.live.deploy?.state === 'pending' || (data.changes.length && data.draft?.deploy?.state === 'pending');
    if (building && !gone) timer = setTimeout(() => document.visibilityState === 'visible' && !gone && reload(), 8000);
  }

  draw();
  show(
    pageHead({ title: 'Publish', text: data.repo.direct ? `Admin edits go live through ${data.repo.name} as soon as ${host()} has built them.` : `Admin edits are saved as drafts on GitHub; visitors see them once they’re published.` }),
    session.features.publish === 'direct' || data.repo.direct ? notice('Every save goes live straight away (GITHUB_DRAFT_BRANCH is the live branch).', { kind: 'warning', glyph: 'alert' }) : null,
    holder,
  );
  return () => {
    gone = true;
    clearTimeout(timer);
  };
}
