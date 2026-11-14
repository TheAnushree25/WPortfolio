import { HttpError, SECTIONS, badRequest, clean, isManaged, siteHealth } from '../shared.mjs';
import { archive } from '../data.mjs';

/**
 * The site's words and projects over GitHub: sections read and saved
 * through the content service, the projects page's lists, archiving a card
 * (kept in the database so it can come back), the content history, and the
 * health review.
 */
export function contentRoutes(router, app) {
  const { content, db, repo, config } = app;

  const jsonAt = async (snapshot, file) => {
    const entry = snapshot.files.get(file);
    if (!entry) return null;
    try {
      return JSON.parse(await repo.text(entry.sha));
    } catch {
      return null;
    }
  };

  /** Each deck's page count at a snapshot (src/content/decks/<deck>.json). */
  const deckPages = async (snapshot) => {
    const out = {};
    const files = [...snapshot.files.keys()].filter((file) => /^src\/content\/decks\/[a-z0-9-]+\.json$/.test(file));
    const texts = await repo.manyTexts(files.map((file) => snapshot.files.get(file).sha));
    for (const file of files) {
      try {
        out[file.slice('src/content/decks/'.length, -5)] = JSON.parse(texts.get(snapshot.files.get(file).sha) ?? '{}').pages?.length ?? 0;
      } catch {
        out[file.slice('src/content/decks/'.length, -5)] = 0;
      }
    }
    return out;
  };

  /** What a save's rules check against, at the commit it's being made on. */
  app.rulesContext = async (snapshot) => {
    const [values, decks] = await Promise.all([content.values(['works', 'systems'], snapshot), deckPages(snapshot)]);
    return {
      publicFile: (publicPath) => typeof publicPath === 'string' && snapshot.files.has(`public${publicPath}`),
      deckPages: (deck) => decks[deck] ?? 0,
      cardSlugs: (values.works?.projects ?? []).map((card) => card.slug),
      systemSlugs: Object.keys(values.systems ?? {}),
    };
  };

  /** Every string in the site's content, for finding which files are used. */
  app.contentStrings = async (snapshot) => {
    const values = await content.values(Object.keys(SECTIONS), snapshot);
    const out = [];
    (function walk(node) {
      if (typeof node === 'string') out.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    })(values);
    return out;
  };

  app.saveContent = async (changes, user, summary) => {
    const labels = changes.map((change) => SECTIONS[change?.id]?.label ?? change?.id);
    const result = await content.save(changes, { rulesContext: app.rulesContext, author: user, message: `${summary ?? `Edit ${labels.join(', ')}`} from the admin` });
    if (result.files.length) {
      await app.audit(user, 'content.update', summary ?? `Edited ${labels.join(', ')}`, { target: changes.map((change) => change.id).join(','), meta: { files: result.files, commit: result.sha } });
    }
    return result;
  };

  router.get('/api/content', () => content.list().filter((section) => !section.hidden));

  router.get('/api/content/:id', (ctx) => content.section(ctx.params.id));

  router.put('/api/content/:id', { auth: 'editor' }, async (ctx) => {
    const body = await ctx.body();
    const { saved } = await app.saveContent([{ id: ctx.params.id, value: body.value, version: body.version }], ctx.user);
    return saved[0];
  });

  router.put('/api/content', { auth: 'editor' }, async (ctx) => {
    const body = await ctx.body();
    if (!Array.isArray(body.changes)) throw badRequest('Send the changes as a list.');
    const { saved, files } = await app.saveContent(body.changes, ctx.user, body.summary ? String(body.summary).slice(0, 200) : undefined);
    return { saved, files };
  });

  router.get('/api/projects', async () => {
    const snapshot = await repo.view();
    const [values, decks, archived] = await Promise.all([content.values(['works', 'studies', 'systems', 'systemOrder'], snapshot), deckPages(snapshot), archive.list(db)]);
    const design = (values.works?.projects ?? []).map((card, position) => {
      const study = values.studies?.[card.slug];
      return {
        ...card,
        position,
        hasDeck: Boolean(study),
        accent: study?.accent ?? null,
        summary: study?.summary ?? '',
        editions: (study?.editions ?? []).map((edition) => ({ label: edition.label, deck: edition.deck, pages: decks[edition.deck] ?? 0, chapters: edition.chapters.length })),
      };
    });
    const order = values.systemOrder ?? [];
    const systems = await Promise.all(
      Object.entries(values.systems ?? {}).map(async ([slug, study]) => {
        const screens = (/^[a-z0-9-]+$/.test(slug) ? (await jsonAt(snapshot, `src/content/screens/${slug}.json`))?.screens : null) ?? [];
        const cover = screens.find((screen) => screen.device === 'desktop') ?? screens[0];
        return {
          slug,
          title: study.title,
          kind: study.kind,
          industry: study.industry,
          year: study.year,
          accent: study.accent,
          platform: study.platform ?? 'web',
          live: study.live,
          visible: order.includes(slug),
          position: order.indexOf(slug),
          screens: screens.length,
          cover: cover?.half ?? cover?.src ?? null,
        };
      }),
    );
    systems.sort((a, b) => (a.visible === b.visible ? a.position - b.position : a.visible ? -1 : 1));
    return { design, systems, archived, decks, orphanStudies: Object.keys(values.studies ?? {}).filter((slug) => !design.some((card) => card.slug === slug)) };
  });

  router.post('/api/projects/design/:slug/archive', { auth: 'editor' }, async (ctx) => {
    const section = await content.section('works');
    const card = section.value.projects.find((item) => item.slug === ctx.params.slug);
    if (!card) throw new HttpError(404, 'not_found', 'That project isn’t in Selected work.');
    if (section.value.projects.length <= 1) throw badRequest('Keep at least one project in Selected work.');
    const next = { ...section.value, projects: section.value.projects.filter((item) => item !== card) };
    await app.saveContent([{ id: 'works', value: next, version: section.version }], ctx.user, `Archived the ${card.title} card`);
    await archive.put(db, { card: clean(card), position: section.value.projects.indexOf(card), by: ctx.user.name });
    return { ok: true };
  });

  router.post('/api/projects/design/restore', { auth: 'editor' }, async (ctx) => {
    const { slug } = await ctx.body();
    const entry = await archive.bySlug(db, String(slug ?? ''));
    if (!entry) throw new HttpError(404, 'not_found', 'That card isn’t in the archive.');
    const section = await content.section('works');
    if (section.value.projects.some((item) => item.slug === slug)) throw badRequest('A card with that slug is already showing.');
    const projects = [...section.value.projects];
    projects.splice(Math.min(entry.position, projects.length), 0, entry.card);
    await app.saveContent([{ id: 'works', value: { ...section.value, projects }, version: section.version }], ctx.user, `Restored the ${entry.card.title} card`);
    await archive.remove(db, slug);
    return { ok: true };
  });

  router.delete('/api/projects/archive/:slug', { auth: 'owner' }, async (ctx) => {
    const entry = await archive.bySlug(db, ctx.params.slug);
    if (!entry) throw new HttpError(404, 'not_found', 'That card isn’t in the archive.');
    await archive.remove(db, ctx.params.slug);
    await app.audit(ctx.user, 'project.forget', `Removed the archived ${entry.card.title} card for good`);
    return { ok: true };
  });

  router.get('/api/content-backups', { auth: 'owner' }, () => content.backups());

  router.post('/api/content-backups/restore', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    const result = await content.restoreBackup(String(body.file), String(body.name), { author: ctx.user });
    await app.audit(ctx.user, 'content.restore', `Restored ${result.path} to an earlier version`, { meta: { from: body.name } });
    return result;
  });

  /* ------------------------------------- Health ------------------------------------- */

  let calendlyCache = { at: 0, value: undefined };
  /** Whether the live /contact page books through Calendly (null when it can't be checked). */
  const liveCalendly = async () => {
    if (Date.now() - calendlyCache.at < 30 * 60_000) return calendlyCache.value;
    let value = null;
    const site = (await app.siteUrl()) || '';
    if (site) {
      try {
        const html = await (await fetch(`${site}/contact`, { signal: AbortSignal.timeout(6000) })).text();
        value = /https:\/\/calendly\.com\/[\w-]+\/[\w-]+/.exec(html)?.[0] ?? '';
      } catch {
        value = null;
      }
    }
    calendlyCache = { at: Date.now(), value };
    return value;
  };

  const hostOf = (site) => {
    try {
      const host = new URL(site).hostname;
      if (/\.vercel\.app$/.test(host)) return 'Vercel';
      if (/\.(workers|pages)\.dev$/.test(host)) return 'Cloudflare';
    } catch {
      /* no address */
    }
    return null;
  };

  app.health = async () => {
    const snapshot = await repo.view();
    const strings = await app.contentStrings(snapshot);
    const [values, library, pending, analytics, calendly, site] = await Promise.all([
      content.values(['studio', 'seo', 'testimonials', 'footer', 'works', 'studies', 'partners'], snapshot),
      app.media.library(strings, snapshot),
      app.pendingChanges().catch(() => []),
      app.analytics.report(7),
      liveCalendly(),
      app.siteUrl(),
    ]);
    return siteHealth({ values: clean(values), library, changes: pending, siteRoot: config.dataDir, analytics, packages: true, host: hostOf(site), calendly, hosted: true });
  };

  router.get('/api/health', () => app.health());

  /** Admin edits not yet live, as the publish page lists them. */
  app.pendingChanges = async () => (await repo.pending()).files.filter((file) => isManaged(file.filename));
}
