import { HttpError, ROLES, SECTIONS, STATUS_LABELS, badRequest, check, hashPassword, notFound, randomToken, temporaryPassword } from '../shared.mjs';
import { activity, archive, enquiries, meetings, meta, publicUser, sessions, settings, tokens, users } from '../data.mjs';
import { maskUrl } from '../config.mjs';
import { renderEmail } from '../mail.mjs';

/**
 * Running the admin: the dashboard, the menu's badges, search, the activity
 * log, team accounts (with emailed invitations), settings and integrations,
 * and the data export, import and sample controls.
 */
export function adminRoutes(router, app) {
  const { db, config, mailer, sealer } = app;

  let changeCount = { at: 0, value: 0 };
  const pendingChanges = async () => {
    if (Date.now() - changeCount.at < 5000) return changeCount.value;
    const value = await app.pendingChanges().then((list) => list.length).catch(() => 0);
    changeCount = { at: Date.now(), value };
    return value;
  };

  router.get('/api/badges', async (ctx) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [fresh, changes, today, sample] = await Promise.all([
      enquiries.newSince(db, ctx.user.enquiriesSeenAt),
      pendingChanges(),
      meetings.todayCount(db, startOfDay.toISOString(), new Date(startOfDay.getTime() + 86_400_000).toISOString()),
      meta.get(db, 'sample', false),
    ]);
    app.housekeeping().catch((error) => console.warn('[backend] housekeeping:', error.message));
    return { enquiries: fresh, changes, meetingsToday: today, sample: Boolean(sample) };
  });

  router.get('/api/dashboard', async () => {
    const now = Date.now();
    const DAY = 86_400_000;
    const [all, meetingList, recentActivity, sample] = await Promise.all([enquiries.all(db, { archived: false }), meetings.list(db), activity.list(db, { limit: 8 }), meta.get(db, 'sample', false)]);
    const open = all.filter((item) => !['won', 'lost'].includes(item.status));
    const recent = (days, from = now) => all.filter((item) => Date.parse(item.createdAt) > from - days * DAY && Date.parse(item.createdAt) <= from);
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const end = now - i * DAY;
      series.push({ date: new Date(end).toISOString().slice(0, 10), count: all.filter((item) => Date.parse(item.createdAt) > end - DAY && Date.parse(item.createdAt) <= end).length });
    }
    const decided = all.filter((item) => ['won', 'lost'].includes(item.status));
    const [projects, health, visits, changes] = await Promise.all([
      app.content.values(['works', 'systemOrder']).catch(() => ({})),
      app.health().catch((error) => ({ score: null, checks: [{ id: 'backend', level: 'warning', title: 'The site couldn’t be reviewed', detail: error.message, href: '/settings/system' }] })),
      app.analytics.report(7),
      pendingChanges(),
    ]);
    return {
      kpis: {
        newEnquiries: recent(7).length,
        newEnquiriesBefore: recent(7, now - 7 * DAY).length,
        pipeline: open.reduce((sum, item) => sum + (item.value || 0), 0),
        openCount: open.length,
        winRate: decided.length ? Math.round((decided.filter((item) => item.status === 'won').length / decided.length) * 100) : null,
        upcoming: meetingList.filter((item) => item.status === 'scheduled' && Date.parse(item.start) > now).length,
        projects: (projects.works?.projects?.length ?? 0) + (projects.systemOrder?.length ?? 0),
        visits: visits.totals.views,
        visitsBefore: visits.totals.previousViews,
        changes,
      },
      series,
      pipeline: ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'].map((status) => ({
        status,
        label: STATUS_LABELS[status],
        count: all.filter((item) => item.status === status).length,
        value: all.filter((item) => item.status === status).reduce((sum, item) => sum + (item.value || 0), 0),
      })),
      followUps: open
        .filter((item) => item.followUpAt && Date.parse(item.followUpAt) < now + 2 * DAY)
        .sort((a, b) => (a.followUpAt < b.followUpAt ? -1 : 1))
        .slice(0, 5)
        .map(({ id, name, company, followUpAt, status, sample: isSample }) => ({ id, name, company, followUpAt, status, sample: isSample })),
      upcoming: meetingList.filter((item) => item.status === 'scheduled' && Date.parse(item.end) > now).slice(0, 5),
      latest: all.slice(0, 5),
      activity: recentActivity.items,
      health: { score: health.score, checks: health.checks.filter((item) => item.level !== 'ok').slice(0, 5) },
      visits: { series: visits.series, totals: visits.totals, hasData: visits.hasData },
      sample: Boolean(sample),
    };
  });

  router.get('/api/search', async (ctx) => {
    const q = String(ctx.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return { results: [] };
    const results = [];
    const values = await app.content.values(['works', 'systems']).catch(() => ({}));
    for (const card of values.works?.projects ?? []) {
      if (`${card.title} ${card.kind} ${card.industry} ${card.slug}`.toLowerCase().includes(q)) results.push({ type: 'Project', title: card.title, detail: card.kind, href: `/projects/design/${card.slug}` });
    }
    for (const [slug, study] of Object.entries(values.systems ?? {})) {
      if (`${study.title} ${study.kind} ${study.industry} ${slug}`.toLowerCase().includes(q)) results.push({ type: 'System', title: study.title, detail: study.kind, href: `/projects/system/${slug}` });
    }
    for (const [id, section] of Object.entries(SECTIONS)) {
      if (!section.hidden && `${section.label} ${section.description} ${section.group}`.toLowerCase().includes(q)) results.push({ type: 'Content', title: section.label, detail: section.group, href: `/content/${id}` });
    }
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const rows = await db.query(`SELECT id, name, company, status FROM enquiries WHERE name ILIKE $1 OR email ILIKE $1 OR company ILIKE $1 ORDER BY created_at DESC LIMIT 20`, [like]);
    for (const row of rows) results.push({ type: 'Enquiry', title: row.name, detail: [row.company, STATUS_LABELS[row.status]].filter(Boolean).join(' · '), href: `/enquiries/${row.id}` });
    return { results: results.slice(0, 20) };
  });

  router.get('/api/activity', async (ctx) => {
    const limit = Math.min(200, Math.max(1, Number(ctx.query.limit) || 50));
    const category = /^[a-z]+$/.test(String(ctx.query.category ?? '')) ? ctx.query.category : '';
    const before = ctx.query.before && !Number.isNaN(Date.parse(ctx.query.before)) ? ctx.query.before : '';
    return activity.list(db, { limit, category, before });
  });

  /* ---------------------------------- Team ---------------------------------- */

  router.get('/api/users', { auth: 'owner' }, async () => (await users.list(db)).map(publicUser));

  router.post('/api/users', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    const name = check.text(body.name, { field: 'name', max: 80, required: true });
    const address = check.email(body.email);
    const role = check.oneOf(body.role, ROLES, { field: 'role', fallback: 'editor' });
    if (await users.byEmail(db, address)) throw badRequest('Someone here already uses that email.', { field: 'email' });
    const invite = Boolean(body.invite) && mailer.configured;
    // An invited person chooses their own password from the email; nobody ever sees this random one.
    const password = invite ? randomToken(24) : temporaryPassword();
    const user = await users.insert(db, { name, email: address, role, passwordHash: await hashPassword(password), mustChangePassword: !invite });
    await app.audit(ctx.user, 'user.create', `Added ${name} as ${role}${invite ? ' and emailed an invitation' : ''}`, { target: user.id });
    if (invite) {
      const raw = await tokens.create(db, { kind: 'invite', userId: user.id, minutes: 72 * 60 });
      try {
        await mailer.send({
          to: address,
          replyTo: ctx.user.email,
          subject: `${ctx.user.name} invited you to the Atlas Studios admin`,
          ...renderEmail({
            title: 'You’re invited to the studio’s admin',
            intro: `${ctx.user.name} added you as ${role === 'owner' ? 'an owner' : `an ${role}`} of the Atlas Studios admin. Choose a password to sign in; the link works for three days.`,
            button: { label: 'Choose your password', url: `${app.adminUrl(ctx)}/reset?token=${raw}` },
          }),
        });
      } catch (error) {
        await users.remove(db, user.id);
        throw new HttpError(502, error.code ?? 'mail', `The invitation couldn’t be emailed (${error.message}), so the account wasn’t added. Try again, or add them without an email.`);
      }
      return { user: publicUser(user), invited: true };
    }
    return { user: publicUser(user), password };
  });

  const findUser = async (id) => {
    const user = await users.byId(db, id);
    if (!user) throw notFound('That account isn’t here any more.');
    return user;
  };

  router.patch('/api/users/:id', { auth: 'owner' }, async (ctx) => {
    const user = await findUser(ctx.params.id);
    const body = await ctx.body();
    const role = 'role' in body ? check.oneOf(body.role, ROLES, { field: 'role' }) : user.role;
    const disabled = 'disabled' in body ? Boolean(body.disabled) : user.disabled;
    if (user.role === 'owner' && (role !== 'owner' || disabled) && (await users.activeOwners(db)) <= 1) throw badRequest('The admin needs at least one active owner.');
    if (user.id === ctx.user.id && disabled) throw badRequest('You can’t turn off your own account.');
    const name = 'name' in body ? check.text(body.name, { field: 'name', max: 80, required: true }) : user.name;
    const updated = await users.update(db, user.id, { name, role, disabled });
    if (disabled) await sessions.removeForUser(db, user.id);
    await app.audit(ctx.user, 'user.update', `Updated ${updated.name}: ${role}${disabled ? ', turned off' : ''}`, { target: user.id });
    return publicUser(updated);
  });

  router.post('/api/users/:id/reset', { auth: 'owner' }, async (ctx) => {
    const user = await findUser(ctx.params.id);
    const password = temporaryPassword();
    await users.update(db, user.id, { passwordHash: await hashPassword(password), mustChangePassword: true });
    await sessions.removeForUser(db, user.id, ctx.session.id);
    await app.audit(ctx.user, 'user.reset', `Reset the password for ${user.name}`, { target: user.id });
    return { password };
  });

  router.post('/api/users/:id/two-factor-reset', { auth: 'owner' }, async (ctx) => {
    const user = await findUser(ctx.params.id);
    if (!user.totpEnabledAt) throw badRequest(`${user.name} doesn’t use two-step sign-in.`);
    const updated = await users.update(db, user.id, { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: 0, recoveryCodes: [] });
    await sessions.removeForUser(db, user.id, ctx.session.id);
    await app.audit(ctx.user, 'user.2fa', `Turned off two-step sign-in for ${user.name}`, { target: user.id });
    return publicUser(updated);
  });

  router.delete('/api/users/:id', { auth: 'owner' }, async (ctx) => {
    const user = await findUser(ctx.params.id);
    if (user.id === ctx.user.id) throw badRequest('You can’t remove your own account.');
    if (user.role === 'owner' && (await users.activeOwners(db)) <= 1) throw badRequest('The admin needs at least one active owner.');
    await users.remove(db, user.id);
    await app.audit(ctx.user, 'user.delete', `Removed ${user.name}’s account`, { target: user.id });
    return { ok: true };
  });

  /* -------------------------------- Settings -------------------------------- */

  const settingsView = async () => {
    const s = await settings.get(db);
    const [counts, sample] = await Promise.all([
      db.one(`SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM enquiries) AS enquiries, (SELECT count(*)::int FROM meetings) AS meetings, (SELECT count(*)::int FROM activity) AS activity`),
      meta.get(db, 'sample', false),
    ]);
    const names = await app.repo.names().catch(() => ({ live: config.github.liveBranch || 'main', draft: config.github.draftBranch }));
    let calendlyHint = '';
    try {
      const token = sealer.open(s.calendlyToken);
      calendlyHint = token ? `••••${token.slice(-4)}` : '';
    } catch {
      calendlyHint = '(unreadable: save it again)';
    }
    return {
      siteUrl: s.siteUrl || config.siteUrl,
      notifyEmail: s.notifyEmail,
      siteOrigins: s.siteOrigins ?? [],
      envOrigins: config.siteOrigins,
      calendly: { connected: Boolean(s.calendlyToken), hint: calendlyHint, user: s.calendlyUser, lastSync: s.calendlyLastSync },
      mail: { configured: mailer.configured, kind: mailer.kind, from: config.mail.from },
      sample: Boolean(sample),
      system: {
        mode: 'hosted',
        version: config.version,
        node: process.version,
        database: db.kind === 'postgres' ? maskUrl(config.databaseUrl).replace(/\?.*$/, '') : `Built-in Postgres (PGlite) in ${config.dataDir}`,
        databaseKind: db.kind,
        repo: config.github.repo,
        repoUrl: config.github.repo ? `https://github.com/${config.github.repo}` : '',
        liveBranch: names.live,
        draftBranch: names.draft,
        direct: names.live === names.draft,
        github: app.github.rate,
        host: config.serverless ? 'serverless' : config.host,
        port: config.port,
        siteRoot: config.github.repo,
        dataDir: db.kind,
        sessionHours: config.sessionHours,
        timeZone: config.timeZone,
        publicUrl: config.publicUrl,
        counts,
      },
    };
  };

  router.get('/api/settings', () => settingsView());

  router.patch('/api/settings', { auth: 'owner' }, async (ctx) => {
    const body = await ctx.body();
    const changes = {};
    if ('siteUrl' in body) {
      const value = check.text(body.siteUrl, { field: 'siteUrl', max: 300 });
      if (value && !/^https?:\/\/[^\s/]+/.test(value)) throw badRequest('The live site’s address should start with https://', { field: 'siteUrl' });
      changes.siteUrl = value.replace(/\/+$/, '');
    }
    if ('notifyEmail' in body) changes.notifyEmail = check.email(body.notifyEmail, { field: 'notifyEmail', required: false });
    if ('siteOrigins' in body) {
      const list = (Array.isArray(body.siteOrigins) ? body.siteOrigins : String(body.siteOrigins).split(/[\s,]+/)).map((item) => String(item).trim().replace(/\/+$/, '')).filter(Boolean);
      for (const origin of list) if (!/^https?:\/\/[^\s/]+$/.test(origin)) throw badRequest(`“${origin}” isn’t an origin like https://theatlasstudio.com`, { field: 'siteOrigins' });
      changes.siteOrigins = [...new Set(list)].slice(0, 12);
    }
    if ('calendlyToken' in body) {
      const token = String(body.calendlyToken ?? '').trim();
      if (token && !/^[\w.-]{20,4000}$/.test(token)) throw badRequest('That doesn’t look like a Calendly token.', { field: 'calendlyToken' });
      changes.calendlyToken = sealer.seal(token);
      if (!token) changes.calendlyUser = null;
    }
    await settings.patch(db, changes);
    app.forgetSettings();
    await app.audit(ctx.user, 'settings.update', `Changed settings: ${Object.keys(changes).map((key) => (key === 'calendlyToken' ? 'Calendly token' : key)).join(', ') || 'nothing'}`);
    return settingsView();
  });

  router.post('/api/settings/test-calendly', { auth: 'owner' }, async () => {
    const token = await app.calendlyToken();
    if (!token) throw new HttpError(400, 'not_connected', 'Save a Calendly token first.');
    const response = await fetch(`${config.calendlyBase}/users/me`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!response) throw new HttpError(502, 'calendly', 'Calendly couldn’t be reached.');
    if (!response.ok) throw new HttpError(400, 'calendly_token', `Calendly answered ${response.status}: the token isn’t accepted.`);
    const me = (await response.json()).resource;
    const calendlyUser = { name: me.name, email: me.email, schedulingUrl: me.scheduling_url };
    await settings.patch(db, { calendlyUser });
    return calendlyUser;
  });

  router.post('/api/settings/test-email', { auth: 'owner' }, async (ctx) => {
    const to = (await settings.get(db)).notifyEmail || ctx.user.email;
    await mailer.send({ to, subject: 'A test from the Atlas Studios admin', ...renderEmail({ title: 'Email works', intro: `This is a test sent from the admin by ${ctx.user.name}. New enquiries and password resets will arrive like this.` }) });
    await app.audit(ctx.user, 'settings.email', `Sent a test email to ${to}`);
    return { to };
  });

  router.get('/api/settings/export', { auth: 'owner' }, async (ctx) => {
    const [enquiryList, meetingList, activityList, userList, s, archived] = await Promise.all([
      enquiries.all(db),
      meetings.list(db),
      db.query('SELECT * FROM activity ORDER BY at DESC LIMIT 3000'),
      users.list(db),
      settings.get(db),
      archive.list(db),
    ]);
    const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    const data = {
      schema: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: ctx.user.email,
      users: userList.map(publicUser),
      enquiries: enquiryList,
      meetings: meetingList,
      activity: activityList.map((row) => ({ id: row.id, at: new Date(row.at).toISOString(), userId: row.user_id, userName: row.user_name, action: row.action, target: row.target, summary: row.summary, meta: row.meta })),
      analytics: { days: await app.analytics.days(since) },
      archive: { projects: archived },
      settings: { ...s, calendlyToken: '' },
    };
    await app.audit(ctx.user, 'settings.export', 'Exported the admin’s data');
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="atlas-admin-${new Date().toISOString().slice(0, 10)}.json"` },
    });
  });

  // An export from this admin or from the local one: records not here yet are added, nothing is overwritten.
  router.post('/api/settings/import', { auth: 'owner', limit: 20_000_000 }, async (ctx) => {
    const body = await ctx.body();
    if (!Array.isArray(body.enquiries) || !Array.isArray(body.meetings)) throw badRequest('That file isn’t an admin export.');
    let added = 0;
    let addedMeetings = 0;
    await db.tx(async (t) => {
      for (const item of body.enquiries) {
        if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
        const tidy = {
          ...item,
          notes: (Array.isArray(item.notes) ? item.notes : []).filter((note) => note && typeof note.text === 'string'),
          tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 8) : [],
          createdAt: Date.parse(item.createdAt) ? item.createdAt : new Date().toISOString(),
          followUpAt: Date.parse(item.followUpAt) ? item.followUpAt : null,
        };
        if (await enquiries.insert(t, tidy)) added++;
      }
      for (const item of body.meetings) {
        if (!item || typeof item.id !== 'string' || !Date.parse(item.start)) continue;
        const end = Date.parse(item.end) > Date.parse(item.start) ? item.end : new Date(Date.parse(item.start) + 45 * 60_000).toISOString();
        const enquiryId = item.enquiryId && (await t.one('SELECT id FROM enquiries WHERE id = $1', [item.enquiryId])) ? item.enquiryId : null;
        if (item.externalId && (await t.one('SELECT id FROM meetings WHERE external_id = $1', [item.externalId]))) continue;
        if (await meetings.insert(t, { ...item, end, enquiryId })) addedMeetings++;
      }
    });
    const days = await app.analytics.importDays(body.analytics?.days ?? {});
    await app.audit(ctx.user, 'settings.import', `Imported ${added} enquiries, ${addedMeetings} meetings and ${days.length} days of visits`);
    return { enquiries: added, meetings: addedMeetings, days: days.length };
  });

  router.post('/api/settings/sample', { auth: 'owner' }, async (ctx) => {
    const result = await app.loadSample();
    await app.audit(ctx.user, 'settings.sample', 'Loaded sample data');
    return result;
  });

  router.delete('/api/settings/sample', { auth: 'owner' }, async (ctx) => {
    const removed = await app.clearSample();
    await app.audit(ctx.user, 'settings.sample', `Cleared the sample data (${removed} records)`);
    return { removed };
  });
}
