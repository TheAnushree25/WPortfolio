import crypto from 'node:crypto';
import { BUDGETS, HttpError, MEETING_STATES, SERVICES, SOURCES, STATUSES, STATUS_LABELS, atLeast, badRequest, calendlyMeetings, check, csvCell, enquiryFields, notFound } from '../shared.mjs';
import { enquiries, meetings, settings, users } from '../data.mjs';
import { renderEmail } from '../mail.mjs';
import { text } from '../http.mjs';

/**
 * Clients: the enquiry pipeline and each enquiry's notes, the meetings and
 * the Calendly sync, CSV export, and the public endpoint the site's own form
 * posts to, which now also emails the studio about each new enquiry.
 */
export function clientRoutes(router, app) {
  const { db, config, limits, mailer } = app;

  const find = async (id) => {
    const enquiry = await enquiries.byId(db, id);
    if (!enquiry) throw notFound('That enquiry isn’t here any more.');
    return enquiry;
  };

  router.get('/api/enquiries', async (ctx) => {
    const q = String(ctx.query.q ?? '').trim().toLowerCase();
    const all = await enquiries.all(db, { archived: ctx.query.archived === '1' });
    const counts = Object.fromEntries(STATUSES.map((status) => [status, all.filter((item) => item.status === status).length]));
    let items = all;
    if (ctx.query.status && STATUSES.includes(ctx.query.status)) items = items.filter((item) => item.status === ctx.query.status);
    if (ctx.query.source && SOURCES.includes(ctx.query.source)) items = items.filter((item) => item.source === ctx.query.source);
    if (q) items = items.filter((item) => [item.name, item.email, item.company, item.message, item.service, ...(item.tags ?? [])].join(' ').toLowerCase().includes(q));
    const open = all.filter((item) => !['won', 'lost'].includes(item.status));
    return {
      items,
      counts,
      totals: {
        all: all.length,
        open: open.length,
        pipeline: open.reduce((sum, item) => sum + (item.value || 0), 0),
        won: all.filter((item) => item.status === 'won').reduce((sum, item) => sum + (item.value || 0), 0),
      },
      options: { statuses: STATUSES, labels: STATUS_LABELS, sources: SOURCES, services: SERVICES, budgets: BUDGETS },
    };
  });

  router.post('/api/enquiries', { auth: 'editor' }, async (ctx) => {
    const body = await ctx.body();
    const enquiry = await enquiries.insert(db, { ...enquiryFields(body), status: check.oneOf(body.status, STATUSES, { field: 'status', fallback: 'new' }) });
    await app.audit(ctx.user, 'enquiry.create', `Added an enquiry from ${enquiry.name}`, { target: enquiry.id });
    return enquiry;
  });

  router.get('/api/enquiries/:id', async (ctx) => {
    const enquiry = await find(ctx.params.id);
    return { ...enquiry, meetings: await meetings.forEnquiry(db, enquiry) };
  });

  router.patch('/api/enquiries/:id', { auth: 'editor' }, async (ctx) => {
    const enquiry = await find(ctx.params.id);
    const body = await ctx.body();
    const fields = enquiryFields(body, enquiry);
    if ('status' in body && body.status !== enquiry.status) {
      const next = check.oneOf(body.status, STATUSES, { field: 'status' });
      await enquiries.addNote(db, enquiry.id, { by: ctx.user.name, kind: 'status', text: `Moved from ${STATUS_LABELS[enquiry.status]} to ${STATUS_LABELS[next]}` });
      await app.audit(ctx.user, 'enquiry.status', `Moved ${enquiry.name} to ${STATUS_LABELS[next]}`, { target: enquiry.id });
      fields.status = next;
    }
    if ('archived' in body) {
      fields.archived = Boolean(body.archived);
      await app.audit(ctx.user, 'enquiry.archive', `${fields.archived ? 'Archived' : 'Restored'} the enquiry from ${enquiry.name}`, { target: enquiry.id });
    }
    return enquiries.update(db, enquiry.id, fields);
  });

  router.post('/api/enquiries/:id/notes', { auth: 'editor' }, async (ctx) => {
    const enquiry = await find(ctx.params.id);
    const body = await ctx.body();
    await enquiries.addNote(db, enquiry.id, { by: ctx.user.name, text: check.text(body.text, { field: 'note', max: 4000, multiline: true, required: true }) });
    await app.audit(ctx.user, 'enquiry.note', `Added a note to ${enquiry.name}`, { target: enquiry.id });
    return enquiries.update(db, enquiry.id, {});
  });

  router.delete('/api/enquiries/:id/notes/:note', { auth: 'editor' }, async (ctx) => {
    const enquiry = await find(ctx.params.id);
    const target = await enquiries.note(db, enquiry.id, ctx.params.note);
    if (!target) throw notFound('That note is already gone.');
    if (target.by !== ctx.user.name && !atLeast(ctx.user, 'owner')) throw new HttpError(403, 'forbidden', 'Only the person who wrote a note, or the owner, can remove it.');
    await enquiries.removeNote(db, target.id);
    return enquiries.byId(db, enquiry.id);
  });

  router.delete('/api/enquiries/:id', { auth: 'owner' }, async (ctx) => {
    const enquiry = await find(ctx.params.id);
    await enquiries.remove(db, enquiry.id);
    await app.audit(ctx.user, 'enquiry.delete', `Deleted the enquiry from ${enquiry.name}`, { target: enquiry.id });
    return { ok: true };
  });

  router.get('/api/enquiries-export', { auth: 'editor' }, async (ctx) => {
    const columns = ['createdAt', 'name', 'email', 'phone', 'company', 'service', 'budget', 'source', 'status', 'value', 'followUpAt', 'tags', 'message'];
    const rows = (await enquiries.all(db)).map((item) => columns.map((column) => csvCell(column === 'status' ? STATUS_LABELS[item.status] : column === 'tags' ? (item.tags ?? []).join('; ') : item[column])).join(','));
    await app.audit(ctx.user, 'enquiry.export', `Exported ${rows.length} enquiries`);
    return text(200, `﻿${[columns.join(','), ...rows].join('\r\n')}`, 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="atlas-enquiries-${new Date().toISOString().slice(0, 10)}.csv"` });
  });

  router.post('/api/enquiries-seen', async (ctx) => {
    await users.update(db, ctx.user.id, { enquiriesSeenAt: new Date().toISOString() });
    return { ok: true };
  });

  /** Emails the studio about a new enquiry, without holding up the visitor. */
  const notify = async (enquiry, ctx) => {
    if (!mailer.configured) return;
    const to = (await settings.get(db)).notifyEmail;
    if (!to) return;
    app.background(
      mailer
        .send({
          to,
          replyTo: enquiry.email || undefined,
          subject: `New enquiry from ${enquiry.name}${enquiry.company ? ` (${enquiry.company})` : ''}`,
          ...renderEmail({
            title: `${enquiry.name} got in touch`,
            intro: 'A new enquiry came in through the website. Reply to this email to write back to them.',
            rows: [
              ['Name', enquiry.name],
              ['Email', enquiry.email],
              ['Phone', enquiry.phone],
              ['Company', enquiry.company],
              ['Service', enquiry.service],
              ['Budget', enquiry.budget],
              ['Message', enquiry.message],
            ],
            button: { label: 'Open it in the admin', url: `${app.adminUrl(ctx)}/enquiries/${enquiry.id}` },
          }),
        })
        .catch((error) => app.audit(null, 'enquiry.notify', `Couldn’t email the alert for ${enquiry.name}’s enquiry (${error.message})`, { target: enquiry.id })),
      ctx,
    );
  };

  // The site's form (or any allowed site) posts here.
  router.post('/api/public/enquiry', { auth: false, public: true, limit: 64_000 }, async (ctx) => {
    const verdict = await limits.enquiry.hit(ctx.ip);
    if (verdict.limited) throw new HttpError(429, 'limited', 'Too many messages in a row. Please try again in a few minutes.', { retryAfter: verdict.retryAfter });
    const body = await ctx.body();
    // A hidden field people never see; only bots fill it in. They are thanked and ignored.
    if (body.website_url || body.company_site) return { ok: true };
    const fields = enquiryFields({
      name: body.name,
      email: body.email,
      phone: body.phone,
      company: body.company,
      service: SERVICES.includes(body.service) ? body.service : 'Other',
      budget: BUDGETS.includes(body.budget) ? body.budget : 'Not sure',
      source: SOURCES.includes(body.source) ? body.source : 'website',
      message: body.message,
    });
    if (!fields.email) throw badRequest('Please leave an email address so the studio can reply.', { field: 'email' });
    // Someone who wrote before (or is booking again) is the same client: their new words become a note.
    const existing = await enquiries.byEmail(db, fields.email);
    if (existing && !existing.archived && Date.now() - Date.parse(existing.createdAt) < 30 * 86_400_000) {
      if (fields.message && !existing.notes.some((note) => note.text === fields.message) && existing.message !== fields.message) {
        await enquiries.addNote(db, existing.id, { by: fields.name, kind: 'note', text: `Wrote again on the website: ${fields.message}` });
        await enquiries.update(db, existing.id, {});
      }
      return { ok: true };
    }
    const enquiry = await enquiries.insert(db, { ...fields, status: 'new' });
    await app.audit(null, 'enquiry.received', `New enquiry from ${enquiry.name} on the website`, { target: enquiry.id });
    await notify(enquiry, ctx);
    return { ok: true };
  });

  /* -------------------------------- Meetings ------------------------------- */

  const meetingFields = async (body, existing = null) => {
    const pick = async (key, read) => (key in body ? read(body[key]) : existing ? existing[key] : read(undefined));
    const start = await pick('start', (v) => check.date(v, { field: 'start', required: true }));
    let end = await pick('end', (v) => check.date(v, { field: 'end' }));
    if (!end || Date.parse(end) <= Date.parse(start)) end = new Date(Date.parse(start) + (Number(body.minutes) || 45) * 60_000).toISOString();
    return {
      title: await pick('title', (v) => check.text(v, { field: 'title', max: 140 }) || 'Discussion Meeting'),
      start,
      end,
      attendeeName: await pick('attendeeName', (v) => check.text(v, { field: 'attendeeName', max: 120 })),
      attendeeEmail: await pick('attendeeEmail', (v) => check.email(v, { field: 'attendeeEmail', required: false })),
      location: await pick('location', (v) => check.text(v, { field: 'location', max: 140 }) || 'Google Meet'),
      joinUrl: await pick('joinUrl', (v) => check.url(v, { field: 'joinUrl' })),
      status: await pick('status', (v) => check.oneOf(v, MEETING_STATES, { field: 'status', fallback: 'scheduled' })),
      enquiryId: await pick('enquiryId', async (v) => (typeof v === 'string' && (await db.one('SELECT id FROM enquiries WHERE id = $1', [v])) ? v : null)),
      notes: await pick('notes', (v) => check.text(v, { field: 'notes', max: 4000, multiline: true })),
    };
  };

  router.get('/api/meetings', async (ctx) => {
    const from = Date.parse(ctx.query.from ?? '') ? new Date(ctx.query.from).toISOString() : null;
    const to = Date.parse(ctx.query.to ?? '') ? new Date(ctx.query.to).toISOString() : null;
    const s = await settings.get(db);
    return {
      items: await meetings.list(db, { from, to }),
      calendly: { connected: Boolean(s.calendlyToken), lastSync: s.calendlyLastSync, user: s.calendlyUser },
    };
  });

  router.post('/api/meetings', { auth: 'editor' }, async (ctx) => {
    const meeting = await meetings.insert(db, { source: 'manual', ...(await meetingFields(await ctx.body())) });
    await app.audit(ctx.user, 'meeting.create', `Added a meeting with ${meeting.attendeeName || 'a client'}`, { target: meeting.id });
    return meeting;
  });

  router.patch('/api/meetings/:id', { auth: 'editor' }, async (ctx) => {
    const existing = await meetings.byId(db, ctx.params.id);
    if (!existing) throw notFound('That meeting isn’t here any more.');
    const meeting = await meetings.update(db, existing.id, await meetingFields(await ctx.body(), existing));
    await app.audit(ctx.user, 'meeting.update', `Updated the meeting with ${meeting.attendeeName || 'a client'}`, { target: meeting.id });
    return meeting;
  });

  router.delete('/api/meetings/:id', { auth: 'editor' }, async (ctx) => {
    const meeting = await meetings.byId(db, ctx.params.id);
    if (!meeting) throw notFound('That meeting isn’t here any more.');
    await meetings.remove(db, meeting.id);
    await app.audit(ctx.user, 'meeting.delete', `Removed the meeting with ${meeting.attendeeName || 'a client'}`, { target: meeting.id });
    return { ok: true };
  });

  router.post('/api/meetings/sync', { auth: 'editor' }, async (ctx) => {
    const result = await app.syncCalendly();
    await app.audit(ctx.user, 'meeting.sync', `Synced Calendly: ${result.added} new, ${result.updated} updated, ${result.enquiries} new enquiries`);
    return result;
  });

  router.get('/api/booking-rules', async () => {
    const { booking } = await app.content.values(['booking']);
    return { slots: booking.slots, minutes: booking.minutes, offset: booking.studioOffsetMinutes, horizon: booking.horizon, title: booking.title, location: booking.location, duration: booking.duration };
  });

  /** Brings Calendly's bookings in (also run by the daily schedule). */
  app.syncCalendly = async () => {
    const token = await app.calendlyToken();
    const { user, meetings: incoming } = await calendlyMeetings({ token, base: config.calendlyBase });
    let added = 0;
    let updated = 0;
    let created = 0;
    for (const meeting of incoming) {
      let enquiry = meeting.attendeeEmail ? await enquiries.byEmail(db, meeting.attendeeEmail) : null;
      if (!enquiry && meeting.attendeeEmail && meeting.status !== 'cancelled') {
        const now = new Date().toISOString();
        enquiry = await enquiries.insert(db, {
          id: crypto.randomUUID(),
          createdAt: meeting.start < now ? meeting.start : now,
          name: meeting.attendeeName || meeting.attendeeEmail,
          email: meeting.attendeeEmail.toLowerCase(),
          source: 'calendly',
          message: meeting.notes,
          status: 'meeting',
        });
        created++;
      }
      const existing = await meetings.byExternalId(db, meeting.externalId);
      const fields = { title: meeting.title, start: meeting.start, end: meeting.end, status: meeting.status, joinUrl: meeting.joinUrl, location: meeting.location, attendeeName: meeting.attendeeName, attendeeEmail: meeting.attendeeEmail, notes: meeting.notes, enquiryId: enquiry?.id ?? existing?.enquiryId ?? null };
      if (existing) {
        await meetings.update(db, existing.id, fields);
        updated++;
      } else {
        await meetings.insert(db, { source: 'calendly', externalId: meeting.externalId, ...fields });
        added++;
      }
    }
    await settings.patch(db, { calendlyLastSync: new Date().toISOString(), calendlyUser: user });
    return { added, updated, enquiries: created, total: incoming.length };
  };
}
