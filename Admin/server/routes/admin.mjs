import crypto from 'node:crypto';
import { HttpError, badRequest, notFound } from '../http.mjs';
import { hashPassword, publicUser, ROLES, temporaryPassword } from '../security.mjs';
import { email, oneOf, text } from '../validate.mjs';
import { clearSample, loadSample } from '../sample.mjs';
import { SECTIONS } from '../content/sections.mjs';
import { STATUS_LABELS } from './clients.mjs';

/**
 * Running the admin: the dashboard, the badges in the menu, search, the
 * activity log, team accounts and roles, settings and integrations, and the
 * data export, import and sample controls.
 */
export function adminRoutes(router, app) {
  const { db, config, git } = app;

  let changeCount = { at: 0, value: 0 };
  const managedChanges = async () => {
    if (Date.now() - changeCount.at < 5000) return changeCount.value;
    const value = await git.status().then((list) => list.filter((entry) => entry.managed).length).catch(() => 0);
    changeCount = { at: Date.now(), value };
    return value;
  };

  router.get('/api/badges', async (ctx) => {
    const seen = ctx.user.enquiriesSeenAt ?? '';
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = startOfDay.getTime() + 86_400_000;
    return {
      enquiries: db.data.enquiries.filter((item) => !item.archived && item.status === 'new' && item.createdAt > seen).length,
      changes: await managedChanges(),
      meetingsToday: db.data.meetings.filter((item) => item.status === 'scheduled' && Date.parse(item.start) >= startOfDay.getTime() && Date.parse(item.start) < endOfDay).length,
      sample: db.data.sample,
    };
  });

  router.get('/api/dashboard', async () => {
    const now = Date.now();
    const DAY = 86_400_000;
    const live = db.data.enquiries.filter((item) => !item.archived);
    const open = live.filter((item) => !['won', 'lost'].includes(item.status));
    const recent = (days, from = now) => live.filter((item) => Date.parse(item.createdAt) > from - days * DAY && Date.parse(item.createdAt) <= from);
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const end = now - i * DAY;
      const day = new Date(end);
      series.push({ date: day.toISOString().slice(0, 10), count: live.filter((item) => Date.parse(item.createdAt) > end - DAY && Date.parse(item.createdAt) <= end).length });
    }
    const decided = live.filter((item) => ['won', 'lost'].includes(item.status));
    const [projects, health] = await Promise.all([app.content.values(['works', 'systemOrder']), app.health()]);
    const visits = app.analytics.report(7);
    return {
      kpis: {
        newEnquiries: recent(7).length,
        newEnquiriesBefore: recent(7, now - 7 * DAY).length,
        pipeline: open.reduce((sum, item) => sum + (item.value || 0), 0),
        openCount: open.length,
        winRate: decided.length ? Math.round((decided.filter((item) => item.status === 'won').length / decided.length) * 100) : null,
        upcoming: db.data.meetings.filter((item) => item.status === 'scheduled' && Date.parse(item.start) > now).length,
        projects: (projects.works?.projects?.length ?? 0) + (projects.systemOrder?.length ?? 0),
        visits: visits.totals.views,
        visitsBefore: visits.totals.previousViews,
        changes: await managedChanges(),
      },
      series,
      pipeline: ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'].map((status) => ({
        status,
        label: STATUS_LABELS[status],
        count: live.filter((item) => item.status === status).length,
        value: live.filter((item) => item.status === status).reduce((sum, item) => sum + (item.value || 0), 0),
      })),
      followUps: open
        .filter((item) => item.followUpAt && Date.parse(item.followUpAt) < now + 2 * DAY)
        .sort((a, b) => (a.followUpAt < b.followUpAt ? -1 : 1))
        .slice(0, 5)
        .map(({ id, name, company, followUpAt, status, sample }) => ({ id, name, company, followUpAt, status, sample })),
      upcoming: db.data.meetings
        .filter((item) => item.status === 'scheduled' && Date.parse(item.end) > now)
        .sort((a, b) => (a.start < b.start ? -1 : 1))
        .slice(0, 5),
      latest: [...live].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5),
      activity: db.data.activity.slice(0, 8),
      health: { score: health.score, checks: health.checks.filter((check) => check.level !== 'ok').slice(0, 5) },
      visits: { series: visits.series, totals: visits.totals, hasData: visits.hasData },
      sample: db.data.sample,
    };
  });

  router.get('/api/search', async (ctx) => {
    const q = String(ctx.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return { results: [] };
    const results = [];
    const values = await app.content.values(['works', 'systems']);
    for (const card of values.works?.projects ?? []) {
      if (`${card.title} ${card.kind} ${card.industry} ${card.slug}`.toLowerCase().includes(q)) results.push({ type: 'Project', title: card.title, detail: card.kind, href: `/projects/design/${card.slug}` });
    }
    for (const [slug, study] of Object.entries(values.systems ?? {})) {
      if (`${study.title} ${study.kind} ${study.industry} ${slug}`.toLowerCase().includes(q)) results.push({ type: 'System', title: study.title, detail: study.kind, href: `/projects/system/${slug}` });
    }
    for (const [id, section] of Object.entries(SECTIONS)) {
      if (!section.hidden && `${section.label} ${section.description} ${section.group}`.toLowerCase().includes(q)) results.push({ type: 'Content', title: section.label, detail: section.group, href: `/content/${id}` });
    }
    for (const item of db.data.enquiries) {
      if (`${item.name} ${item.email} ${item.company}`.toLowerCase().includes(q)) results.push({ type: 'Enquiry', title: item.name, detail: [item.company, STATUS_LABELS[item.status]].filter(Boolean).join(' · '), href: `/enquiries/${item.id}` });
    }
    return { results: results.slice(0, 20) };
  });

  router.get('/api/activity', (ctx) => {
    const limit = Math.min(200, Math.max(1, Number(ctx.query.limit) || 50));
    let items = db.data.activity;
    if (ctx.query.category) items = items.filter((item) => item.action.startsWith(`${ctx.query.category}.`));
    if (ctx.query.before) items = items.filter((item) => item.at < ctx.query.before);
    return { items: items.slice(0, limit), more: items.length > limit };
  });

  /* ---------------------------------- Team ---------------------------------- */

  router.get('/api/users', { auth: 'owner' }, () => db.data.users.map(publicUser));

  router.post('/api/users', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    const name = text(body.name, { field: 'name', max: 80, required: true });
    const address = email(body.email);
    const role = oneOf(body.role, ROLES, { field: 'role', fallback: 'editor' });
    if (db.data.users.some((item) => item.email === address)) throw badRequest('Someone here already uses that email.', { field: 'email' });
    const password = temporaryPassword();
    const user = { id: crypto.randomUUID(), name, email: address, role, passwordHash: await hashPassword(password), createdAt: new Date().toISOString(), lastLoginAt: null, disabled: false, mustChangePassword: true };
    db.data.users.push(user);
    db.save();
    app.audit(ctx.user, 'user.create', `Added ${name} as ${role}`, { target: user.id });
    return { user: publicUser(user), password };
  });

  const owners = () => db.data.users.filter((item) => item.role === 'owner' && !item.disabled);
  const findUser = (id) => {
    const user = db.data.users.find((item) => item.id === id);
    if (!user) throw notFound('That account isn’t here any more.');
    return user;
  };

  router.patch('/api/users/:id', { auth: 'owner' }, async (ctx) => {
    const user = findUser(ctx.params.id);
    const body = await ctx.body();
    const role = 'role' in body ? oneOf(body.role, ROLES, { field: 'role' }) : user.role;
    const disabled = 'disabled' in body ? Boolean(body.disabled) : user.disabled;
    if (user.role === 'owner' && (role !== 'owner' || disabled) && owners().length <= 1) throw badRequest('The admin needs at least one active owner.');
    if (user.id === ctx.user.id && disabled) throw badRequest('You can’t turn off your own account.');
    if ('name' in body) user.name = text(body.name, { field: 'name', max: 80, required: true });
    user.role = role;
    user.disabled = disabled;
    if (disabled) db.data.sessions = db.data.sessions.filter((item) => item.userId !== user.id);
    db.save();
    app.audit(ctx.user, 'user.update', `Updated ${user.name}: ${role}${disabled ? ', turned off' : ''}`, { target: user.id });
    return publicUser(user);
  });

  router.post('/api/users/:id/reset', { auth: 'owner' }, async (ctx) => {
    const user = findUser(ctx.params.id);
    const password = temporaryPassword();
    user.passwordHash = await hashPassword(password);
    user.mustChangePassword = true;
    db.data.sessions = db.data.sessions.filter((item) => item.userId !== user.id || item.id === ctx.session.id);
    db.save();
    app.audit(ctx.user, 'user.reset', `Reset the password for ${user.name}`, { target: user.id });
    return { password };
  });

  router.delete('/api/users/:id', { auth: 'owner' }, (ctx) => {
    const user = findUser(ctx.params.id);
    if (user.id === ctx.user.id) throw badRequest('You can’t remove your own account.');
    if (user.role === 'owner' && owners().length <= 1) throw badRequest('The admin needs at least one active owner.');
    db.data.users = db.data.users.filter((item) => item !== user);
    db.data.sessions = db.data.sessions.filter((item) => item.userId !== user.id);
    db.save();
    app.audit(ctx.user, 'user.delete', `Removed ${user.name}’s account`, { target: user.id });
    return { ok: true };
  });

  /* -------------------------------- Settings -------------------------------- */

  const settingsView = () => {
    const s = db.data.settings;
    return {
      siteUrl: s.siteUrl,
      notifyEmail: s.notifyEmail,
      siteOrigins: s.siteOrigins ?? [],
      envOrigins: config.siteOrigins,
      calendly: { connected: Boolean(s.calendlyToken), hint: s.calendlyToken ? `••••${s.calendlyToken.slice(-4)}` : '', user: s.calendlyUser, lastSync: s.calendlyLastSync },
      sample: db.data.sample,
      system: {
        version: config.version,
        node: process.version,
        siteRoot: config.siteRoot,
        dataDir: config.dataDir,
        host: config.host,
        port: config.port,
        sessionHours: config.sessionHours,
        timeZone: config.timeZone,
        counts: { users: db.data.users.length, enquiries: db.data.enquiries.length, meetings: db.data.meetings.length, activity: db.data.activity.length },
      },
    };
  };

  router.get('/api/settings', () => settingsView());

  router.patch('/api/settings', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    const s = db.data.settings;
    if ('siteUrl' in body) {
      const value = text(body.siteUrl, { field: 'siteUrl', max: 300 });
      if (value && !/^https?:\/\/[^\s/]+/.test(value)) throw badRequest('The live site’s address should start with https://', { field: 'siteUrl' });
      s.siteUrl = value.replace(/\/+$/, '');
    }
    if ('notifyEmail' in body) s.notifyEmail = email(body.notifyEmail, { field: 'notifyEmail', required: false });
    if ('siteOrigins' in body) {
      const list = (Array.isArray(body.siteOrigins) ? body.siteOrigins : String(body.siteOrigins).split(/[\s,]+/)).map((item) => String(item).trim().replace(/\/+$/, '')).filter(Boolean);
      for (const origin of list) {
        if (!/^https?:\/\/[^\s/]+$/.test(origin)) throw badRequest(`“${origin}” isn’t an origin like https://theatlasstudio.com`, { field: 'siteOrigins' });
      }
      s.siteOrigins = [...new Set(list)].slice(0, 12);
    }
    if ('calendlyToken' in body) {
      const token = String(body.calendlyToken ?? '').trim();
      if (token && !/^[\w.-]{20,4000}$/.test(token)) throw badRequest('That doesn’t look like a Calendly token.', { field: 'calendlyToken' });
      s.calendlyToken = token;
      if (!token) s.calendlyUser = null;
    }
    db.save();
    app.audit(ctx.user, 'settings.update', `Changed settings: ${Object.keys(body).filter((key) => key !== 'calendlyToken').concat('calendlyToken' in body ? ['Calendly token'] : []).join(', ')}`);
    return settingsView();
  });

  router.get('/api/settings/export', { auth: 'owner' }, (ctx) => {
    const rest = { ...db.data };
    delete rest.sessions;
    const data = { ...rest, users: rest.users.map(publicUser), settings: { ...rest.settings, calendlyToken: '' }, exportedAt: new Date().toISOString(), exportedBy: ctx.user.email };
    app.audit(ctx.user, 'settings.export', 'Exported the admin’s data');
    ctx.res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="atlas-admin-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    ctx.res.end(JSON.stringify(data, null, 2));
    return undefined;
  });

  router.post('/api/settings/import', { auth: 'owner', limit: 20_000_000 }, async (ctx) => {
    const body = await ctx.body();
    if (!Array.isArray(body.enquiries) || !Array.isArray(body.meetings)) throw badRequest('That file isn’t an admin export.');
    const ids = new Set(db.data.enquiries.map((item) => item.id));
    const added = body.enquiries.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && !ids.has(item.id));
    db.data.enquiries.push(...added);
    const meetingIds = new Set(db.data.meetings.map((item) => item.id));
    const meetings = body.meetings.filter((item) => item && typeof item.id === 'string' && typeof item.start === 'string' && !meetingIds.has(item.id));
    db.data.meetings.push(...meetings);
    if (body.analytics?.days && typeof body.analytics.days === 'object') {
      for (const [key, day] of Object.entries(body.analytics.days)) if (/^\d{4}-\d\d-\d\d$/.test(key) && !db.data.analytics.days[key]) db.data.analytics.days[key] = day;
    }
    db.save();
    app.audit(ctx.user, 'settings.import', `Imported ${added.length} enquiries and ${meetings.length} meetings`);
    return { enquiries: added.length, meetings: meetings.length };
  });

  router.post('/api/settings/sample', { auth: 'owner' }, (ctx) => {
    const result = loadSample(db, { timeZone: config.timeZone });
    app.audit(ctx.user, 'settings.sample', 'Loaded sample data');
    return result;
  });

  router.delete('/api/settings/sample', { auth: 'owner' }, (ctx) => {
    const removed = clearSample(db);
    app.audit(ctx.user, 'settings.sample', `Cleared the sample data (${removed} records)`);
    return { removed };
  });

  router.post('/api/settings/test-calendly', { auth: 'owner' }, async () => {
    const token = db.data.settings.calendlyToken;
    if (!token) throw new HttpError(400, 'not_connected', 'Save a Calendly token first.');
    const response = await fetch(`${config.calendlyBase}/users/me`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!response) throw new HttpError(502, 'calendly', 'Calendly couldn’t be reached.');
    if (!response.ok) throw new HttpError(400, 'calendly_token', `Calendly answered ${response.status}: the token isn’t accepted.`);
    const me = (await response.json()).resource;
    db.data.settings.calendlyUser = { name: me.name, email: me.email, schedulingUrl: me.scheduling_url };
    db.save();
    return db.data.settings.calendlyUser;
  });
}
