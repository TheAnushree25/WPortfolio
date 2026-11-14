import { HttpError, badRequest, check, isManaged } from '../shared.mjs';

/**
 * Publishing and the site's numbers. Hosted, a save is already a commit on
 * the drafts and the hosting provider builds each one as a preview; this
 * page lists what's waiting, shows each change's diff, puts a change back,
 * and publishes: everything waiting goes onto the live branch as one commit,
 * which the provider then deploys to visitors.
 */

function describe(file) {
  if (file === 'src/content/site.ts') return 'Site content';
  if (file === 'src/content/work.ts') return 'Case studies';
  if (file === 'src/content/systems.ts') return 'Systems';
  if (file === 'src/app/layout.tsx') return 'Search & sharing';
  if (file.startsWith('src/content/')) return 'Generated content';
  if (file.startsWith('public/')) return `Media · ${file.slice('public/'.length)}`;
  return file;
}

const STATE = { added: 'new', removed: 'deleted', modified: 'modified', renamed: 'renamed', changed: 'modified', copied: 'added' };

export function siteRoutes(router, app) {
  const { repo, github, config, analytics } = app;

  const summary = (commit) =>
    commit && {
      hash: commit.sha,
      short: commit.sha.slice(0, 7),
      subject: String(commit.message ?? '').split('\n')[0],
      author: commit.author?.name ?? '',
      at: commit.author?.date ?? commit.committer?.date ?? null,
    };

  router.get('/api/publish', async () => {
    const [names, pending, repoInfo] = await Promise.all([repo.names(), repo.pending(), github.repository().catch(() => null)]);
    const heads = pending.heads;
    const direct = names.live === names.draft;
    const [liveCommit, draftCommit, liveDeploy, draftDeploy, history, site] = await Promise.all([
      github.commit(heads.live),
      heads.draft && heads.draft !== heads.live ? github.commit(heads.draft) : null,
      github.deployment(heads.live),
      heads.draft && heads.draft !== heads.live && pending.ahead ? github.deployment(heads.draft) : null,
      repo.history({ branch: 'live', limit: 12 }).catch(() => []),
      app.siteUrl(),
    ]);
    const changes = pending.files.filter((file) => isManaged(file.filename)).map((file) => ({
      file: file.filename,
      from: file.previous_filename ?? null,
      state: STATE[file.status] ?? 'modified',
      managed: true,
      label: describe(file.filename),
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    }));
    return {
      mode: 'hosted',
      repo: { name: config.github.repo, url: repoInfo?.html_url ?? `https://github.com/${config.github.repo}`, private: repoInfo?.private ?? null, live: names.live, draft: names.draft, direct },
      changes,
      otherChanges: pending.files.length - changes.length,
      live: { head: summary(liveCommit), deploy: liveDeploy, url: site },
      draft: draftCommit ? { head: summary(draftCommit), deploy: draftDeploy, ahead: pending.ahead, behind: pending.behind } : null,
      history,
      git: { available: true, branch: direct ? names.live : names.draft, head: summary(draftCommit ?? liveCommit) },
      site: { hosting: hostingName(liveDeploy, site), root: config.github.repo, mounted: false, packages: true },
      jobs: [],
      busy: null,
      preview: null,
    };
  });

  const hostingName = (deploy, site) => {
    const text = `${deploy?.environment ?? ''} ${deploy?.url ?? ''} ${site ?? ''}`;
    if (/vercel/i.test(text)) return 'Vercel';
    if (/cloudflare|workers\.dev|pages\.dev/i.test(text)) return 'Cloudflare';
    return 'the host';
  };

  router.get('/api/publish/diff', async (ctx) => {
    const file = String(ctx.query.file ?? '');
    const pending = await repo.pending();
    const change = pending.files.find((item) => item.filename === file);
    if (!change) return { file, state: 'unchanged', diff: '' };
    const state = STATE[change.status] ?? 'modified';
    const textual = /\.(ts|tsx|json|css|md|txt|mjs|js)$/.test(file);
    if (!change.patch || !textual) {
      const view = await repo.view();
      return { file, state, bytes: view.files.get(file)?.size ?? 0, diff: '', binary: true };
    }
    return { file, state, diff: change.patch, binary: false };
  });

  router.post('/api/publish/discard', { auth: 'editor' }, async (ctx) => {
    const { file } = await ctx.body();
    const target = String(file ?? '');
    if (!isManaged(target)) throw new HttpError(403, 'forbidden', 'The admin only puts back changes to content and media.');
    const outcome = await repo.discard(target, { author: ctx.user });
    // A new picture that's discarded goes to the trash, as it does in the local admin.
    if (target.startsWith('public/') && outcome.result?.previous && !outcome.result.existsLive) {
      await app.media.rememberRemoved(`/${target.slice('public/'.length)}`, outcome.result.previous, ctx.user);
    }
    await app.audit(ctx.user, 'publish.discard', `Discarded the change to ${target}`, { target });
    return { file: target };
  });

  router.post('/api/publish/release', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    if (body.confirm !== 'publish') throw badRequest('Type “publish” to confirm.');
    const pending = (await app.pendingChanges()).map((change) => describe(change.filename).replace(/^Media · .*/, 'media'));
    const labels = [...new Set(pending)];
    const message = check.text(body.message, { field: 'message', max: 200 }) || `Publish from the admin: ${labels.join(', ').toLowerCase() || 'changes'}`;
    const result = await repo.publish({ message: `${message}\n\nPublished by ${ctx.user.name} from the Atlas Studios admin.`, author: ctx.user });
    await app.audit(ctx.user, 'publish.release', `Published to the live site: “${message}”`, { target: result.sha, meta: { files: result.files } });
    return { ...result, short: result.sha.slice(0, 7) };
  });

  router.get('/api/publish/deploy/:sha', async (ctx) => {
    if (!/^[0-9a-f]{40}$/.test(ctx.params.sha)) throw badRequest('That isn’t a commit.');
    return github.deployment(ctx.params.sha);
  });

  // The local admin's build and preview jobs need the site on disk; hosted, the provider builds every commit instead.
  router.get('/api/jobs', () => []);
  router.post('/api/jobs', { auth: 'editor' }, () => {
    throw new HttpError(409, 'hosted', 'The hosted admin doesn’t run builds itself: every save is built as a preview by the hosting provider, and publishing deploys it.');
  });

  /* -------------------------------- Analytics ------------------------------ */

  router.get('/api/analytics', async (ctx) => {
    const span = [7, 30, 90].includes(Number(ctx.query.days)) ? Number(ctx.query.days) : 30;
    const sampleDays = await app.sampleDays();
    return { ...(await analytics.report(span)), origins: await app.allowedOrigins(ctx), sample: sampleDays.length > 0 };
  });

  router.post('/api/public/collect', { auth: false, public: true, limit: 4_000 }, async (ctx) => {
    if (app.limits.collect.hit(ctx.ip).limited) throw new HttpError(429, 'limited', 'Slow down.');
    const body = await ctx.body();
    const own = (await app.allowedOrigins(ctx)).map((origin) => {
      try {
        return new URL(origin).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    });
    await analytics.record({
      path: body.p,
      referrer: typeof body.r === 'string' ? body.r.slice(0, 500) : '',
      width: body.w,
      event: typeof body.e === 'string' ? body.e : '',
      ua: ctx.request.headers.get('user-agent') ?? '',
      ip: ctx.ip,
      country: ctx.request.headers.get('x-vercel-ip-country') ?? ctx.request.headers.get('cf-ipcountry') ?? '',
      ownHosts: own,
    });
    return new Response(null, { status: 204 });
  });
}
