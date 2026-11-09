import fs from 'node:fs';
import path from 'node:path';
import { HttpError, badRequest } from '../http.mjs';
import { siteHealth } from '../health.mjs';
import { SECTIONS } from '../content/sections.mjs';
import { clean } from '../content/rewrite.mjs';

/**
 * The site's words and projects: sections read and saved through the
 * content store, the project lists the projects page shows, archiving a card
 * (kept in the admin so it can come back), the content backups, and the
 * health review.
 */
export function contentRoutes(router, app) {
  const { content, media, db, config } = app;

  const jsonCache = new Map();
  const readJson = (file) => {
    try {
      const stat = fs.statSync(file);
      const cached = jsonCache.get(file);
      if (cached?.mtime === stat.mtimeMs) return cached.value;
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      jsonCache.set(file, { mtime: stat.mtimeMs, value });
      return value;
    } catch {
      return null;
    }
  };
  const deckPages = (deck) => (/^[a-z0-9-]+$/.test(String(deck)) ? readJson(path.join(config.siteRoot, 'src/content/decks', `${deck}.json`))?.pages?.length ?? 0 : 0);
  const screensOf = (slug) => (/^[a-z0-9-]+$/.test(slug) ? readJson(path.join(config.siteRoot, 'src/content/screens', `${slug}.json`))?.screens ?? [] : []);
  const decks = () => {
    const dir = path.join(config.siteRoot, 'src/content/decks');
    const out = {};
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (name.endsWith('.json')) out[name.slice(0, -5)] = deckPages(name.slice(0, -5));
    return out;
  };

  app.rulesContext = async () => {
    const values = await content.values(['works', 'systems']);
    return {
      publicFile: (publicPath) => media.exists(publicPath),
      deckPages,
      cardSlugs: (values.works?.projects ?? []).map((card) => card.slug),
      systemSlugs: Object.keys(values.systems ?? {}),
    };
  };

  /** Every string in the site's content, for finding which files are used. */
  app.contentStrings = async () => {
    const values = await content.values(Object.keys(SECTIONS));
    const out = [];
    (function walk(node) {
      if (typeof node === 'string') out.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    })(values);
    return out;
  };

  app.saveContent = async (changes, user, summary) => {
    const result = await content.save(changes, { rulesContext: app.rulesContext, actor: user.name });
    if (result.files.length) {
      const labels = changes.map((change) => SECTIONS[change.id]?.label ?? change.id);
      app.audit(user, 'content.update', summary ?? `Edited ${labels.join(', ')}`, { target: changes.map((change) => change.id).join(','), meta: { files: result.files } });
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
    return app.saveContent(body.changes, ctx.user, body.summary ? String(body.summary).slice(0, 200) : undefined);
  });

  router.get('/api/projects', async () => {
    const values = await content.values(['works', 'studies', 'systems', 'systemOrder']);
    const deckList = decks();
    const design = (values.works?.projects ?? []).map((card, position) => {
      const study = values.studies?.[card.slug];
      return {
        ...card,
        position,
        hasDeck: Boolean(study),
        accent: study?.accent ?? null,
        summary: study?.summary ?? '',
        editions: (study?.editions ?? []).map((edition) => ({ label: edition.label, deck: edition.deck, pages: deckList[edition.deck] ?? 0, chapters: edition.chapters.length })),
      };
    });
    const order = values.systemOrder ?? [];
    const systems = Object.entries(values.systems ?? {})
      .map(([slug, study]) => {
        const screens = screensOf(slug);
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
      })
      .sort((a, b) => (a.visible === b.visible ? a.position - b.position : a.visible ? -1 : 1));
    return {
      design,
      systems,
      archived: db.data.archive.projects,
      decks: deckList,
      orphanStudies: Object.keys(values.studies ?? {}).filter((slug) => !design.some((card) => card.slug === slug)),
    };
  });

  router.post('/api/projects/design/:slug/archive', { auth: 'editor' }, async (ctx) => {
    const section = await content.section('works');
    const card = section.value.projects.find((item) => item.slug === ctx.params.slug);
    if (!card) throw new HttpError(404, 'not_found', 'That project isn’t in Selected work.');
    if (section.value.projects.length <= 1) throw badRequest('Keep at least one project in Selected work.');
    const next = { ...section.value, projects: section.value.projects.filter((item) => item !== card) };
    await app.saveContent([{ id: 'works', value: next, version: section.version }], ctx.user, `Archived the ${card.title} card`);
    db.data.archive.projects = [{ card, position: section.value.projects.indexOf(card), archivedAt: new Date().toISOString(), by: ctx.user.name }, ...db.data.archive.projects.filter((item) => item.card.slug !== card.slug)];
    db.save();
    return { ok: true };
  });

  router.post('/api/projects/design/restore', { auth: 'editor' }, async (ctx) => {
    const { slug } = await ctx.body();
    const entry = db.data.archive.projects.find((item) => item.card.slug === slug);
    if (!entry) throw new HttpError(404, 'not_found', 'That card isn’t in the archive.');
    const section = await content.section('works');
    if (section.value.projects.some((item) => item.slug === slug)) throw badRequest('A card with that slug is already showing.');
    const projects = [...section.value.projects];
    projects.splice(Math.min(entry.position, projects.length), 0, entry.card);
    await app.saveContent([{ id: 'works', value: { ...section.value, projects }, version: section.version }], ctx.user, `Restored the ${entry.card.title} card`);
    db.data.archive.projects = db.data.archive.projects.filter((item) => item !== entry);
    db.save();
    return { ok: true };
  });

  router.delete('/api/projects/archive/:slug', { auth: 'owner' }, (ctx) => {
    const entry = db.data.archive.projects.find((item) => item.card.slug === ctx.params.slug);
    if (!entry) throw new HttpError(404, 'not_found', 'That card isn’t in the archive.');
    db.data.archive.projects = db.data.archive.projects.filter((item) => item !== entry);
    db.save();
    app.audit(ctx.user, 'project.forget', `Removed the archived ${entry.card.title} card for good`);
    return { ok: true };
  });

  router.get('/api/content-backups', { auth: 'owner' }, () => content.backups());

  router.post('/api/content-backups/restore', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    const result = await content.restoreBackup(String(body.file), String(body.name), ctx.user.name);
    app.audit(ctx.user, 'content.restore', `Restored ${result.path} from a backup`, { meta: { backup: body.name } });
    return result;
  });

  app.health = async () => {
    const [values, library, changes] = await Promise.all([
      content.values(['studio', 'seo', 'testimonials', 'footer', 'works', 'studies', 'partners']),
      app.contentStrings().then((strings) => media.library(strings)),
      app.git.status().catch(() => []),
    ]);
    return siteHealth({
      values: clean(values),
      library,
      changes: changes.filter((change) => change.managed),
      siteRoot: config.siteRoot,
      analytics: app.analytics.report(7),
      packages: app.jobs.siteReady().packages,
    });
  };

  router.get('/api/health', () => app.health());
}
