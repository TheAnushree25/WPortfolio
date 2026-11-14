import crypto from 'node:crypto';
import { HttpError, badRequest, notFound, sendText } from '../http.mjs';
import { atLeast } from '../security.mjs';
import { date, email, list, number, oneOf, text, url } from '../validate.mjs';
import { calendlyMeetings } from '../calendly.mjs';

/**
 * Clients: the enquiry pipeline (new → contacted → meeting → proposal → won
 * or lost), each enquiry's timeline of notes, the meetings calendar with its
 * Calendly sync, CSV export, and the public endpoint a site form can post an
 * enquiry to.
 */

export const STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
export const STATUS_LABELS = { new: 'New', contacted: 'Contacted', meeting: 'Meeting', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
export const SOURCES = ['website', 'calendly', 'email', 'instagram', 'linkedin', 'referral', 'whatsapp', 'other'];
export const SERVICES = ['Brand identity', 'Packaging', 'Website', 'UX & product design', 'System / platform', 'Strategy', 'Other'];
export const BUDGETS = ['Under ₹50k', '₹50k – ₹1.5L', '₹1.5L – ₹5L', '₹5L+', 'Not sure'];
export const MEETING_STATES = ['scheduled', 'completed', 'cancelled', 'no-show'];

export function enquiryFields(body, existing = null) {
  const pick = (key, read) => (key in body ? read(body[key]) : existing ? existing[key] : read(undefined));
  return {
    name: pick('name', (v) => text(v, { field: 'name', max: 120, required: true })),
    email: pick('email', (v) => email(v, { required: false })),
    phone: pick('phone', (v) => text(v, { field: 'phone', max: 40 })),
    company: pick('company', (v) => text(v, { field: 'company', max: 120 })),
    website: pick('website', (v) => url(v, { field: 'website' })),
    service: pick('service', (v) => oneOf(v, SERVICES, { field: 'service', fallback: 'Other' })),
    budget: pick('budget', (v) => oneOf(v, BUDGETS, { field: 'budget', fallback: 'Not sure' })),
    source: pick('source', (v) => oneOf(v, SOURCES, { field: 'source', fallback: 'other' })),
    message: pick('message', (v) => text(v, { field: 'message', max: 5000, multiline: true })),
    value: pick('value', (v) => number(v, { field: 'value', min: 0, max: 1e9 }) ?? 0),
    followUpAt: pick('followUpAt', (v) => date(v, { field: 'followUpAt' })),
    tags: pick('tags', (v) => list(v, { field: 'tags', max: 8, itemMax: 24 })),
  };
}

export const csvCell = (value) => {
  const out = String(value ?? '');
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(out) ? `'${out}` : out;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function clientRoutes(router, app) {
  const { db, config, limits } = app;

  const find = (id) => {
    const enquiry = db.data.enquiries.find((item) => item.id === id);
    if (!enquiry) throw notFound('That enquiry isn’t here any more.');
    return enquiry;
  };

  const note = (enquiry, by, textValue, kind = 'note') => {
    enquiry.notes = [...(enquiry.notes ?? []), { id: crypto.randomUUID(), at: new Date().toISOString(), by, kind, text: textValue }];
  };

  router.get('/api/enquiries', (ctx) => {
    const q = String(ctx.query.q ?? '').trim().toLowerCase();
    const archived = ctx.query.archived === '1';
    const all = db.data.enquiries.filter((item) => Boolean(item.archived) === archived);
    const counts = Object.fromEntries(STATUSES.map((status) => [status, all.filter((item) => item.status === status).length]));
    let items = all;
    if (ctx.query.status && STATUSES.includes(ctx.query.status)) items = items.filter((item) => item.status === ctx.query.status);
    if (ctx.query.source && SOURCES.includes(ctx.query.source)) items = items.filter((item) => item.source === ctx.query.source);
    if (q) items = items.filter((item) => [item.name, item.email, item.company, item.message, item.service, ...(item.tags ?? [])].join(' ').toLowerCase().includes(q));
    items = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
    const fields = enquiryFields(body);
    const now = new Date().toISOString();
    const enquiry = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields, status: oneOf(body.status, STATUSES, { field: 'status', fallback: 'new' }), notes: [], archived: false };
    db.data.enquiries.push(enquiry);
    db.save();
    app.audit(ctx.user, 'enquiry.create', `Added an enquiry from ${enquiry.name}`, { target: enquiry.id });
    return enquiry;
  });

  router.get('/api/enquiries/:id', (ctx) => {
    const enquiry = find(ctx.params.id);
    const meetings = db.data.meetings.filter((item) => item.enquiryId === enquiry.id || (enquiry.email && item.attendeeEmail === enquiry.email));
    return { ...enquiry, meetings: meetings.sort((a, b) => (a.start < b.start ? 1 : -1)) };
  });

  router.patch('/api/enquiries/:id', { auth: 'editor' }, async (ctx) => {
    const enquiry = find(ctx.params.id);
    const body = await ctx.body();
    Object.assign(enquiry, enquiryFields(body, enquiry));
    if ('status' in body && body.status !== enquiry.status) {
      const next = oneOf(body.status, STATUSES, { field: 'status' });
      note(enquiry, ctx.user.name, `Moved from ${STATUS_LABELS[enquiry.status]} to ${STATUS_LABELS[next]}`, 'status');
      app.audit(ctx.user, 'enquiry.status', `Moved ${enquiry.name} to ${STATUS_LABELS[next]}`, { target: enquiry.id });
      enquiry.status = next;
    }
    if ('archived' in body) {
      enquiry.archived = Boolean(body.archived);
      app.audit(ctx.user, 'enquiry.archive', `${enquiry.archived ? 'Archived' : 'Restored'} the enquiry from ${enquiry.name}`, { target: enquiry.id });
    }
    enquiry.updatedAt = new Date().toISOString();
    db.save();
    return enquiry;
  });

  router.post('/api/enquiries/:id/notes', { auth: 'editor' }, async (ctx) => {
    const enquiry = find(ctx.params.id);
    const body = await ctx.body();
    note(enquiry, ctx.user.name, text(body.text, { field: 'note', max: 4000, multiline: true, required: true }));
    enquiry.updatedAt = new Date().toISOString();
    db.save();
    app.audit(ctx.user, 'enquiry.note', `Added a note to ${enquiry.name}`, { target: enquiry.id });
    return enquiry;
  });

  router.delete('/api/enquiries/:id/notes/:note', { auth: 'editor' }, (ctx) => {
    const enquiry = find(ctx.params.id);
    const target = (enquiry.notes ?? []).find((item) => item.id === ctx.params.note);
    if (!target) throw notFound('That note is already gone.');
    if (target.by !== ctx.user.name && !atLeast(ctx.user, 'owner')) throw new HttpError(403, 'forbidden', 'Only the person who wrote a note, or the owner, can remove it.');
    enquiry.notes = enquiry.notes.filter((item) => item !== target);
    db.save();
    return enquiry;
  });

  router.delete('/api/enquiries/:id', { auth: 'owner' }, (ctx) => {
    const enquiry = find(ctx.params.id);
    db.data.enquiries = db.data.enquiries.filter((item) => item !== enquiry);
    db.save();
    app.audit(ctx.user, 'enquiry.delete', `Deleted the enquiry from ${enquiry.name}`, { target: enquiry.id });
    return { ok: true };
  });

  router.get('/api/enquiries-export', { auth: 'editor' }, (ctx) => {
    const columns = ['createdAt', 'name', 'email', 'phone', 'company', 'service', 'budget', 'source', 'status', 'value', 'followUpAt', 'tags', 'message'];
    const rows = [...db.data.enquiries]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((item) => columns.map((column) => csvCell(column === 'status' ? STATUS_LABELS[item.status] : column === 'tags' ? (item.tags ?? []).join('; ') : item[column])).join(','));
    app.audit(ctx.user, 'enquiry.export', `Exported ${rows.length} enquiries`);
    sendText(ctx.res, 200, `﻿${[columns.join(','), ...rows].join('\r\n')}`, 'text/csv; charset=utf-8', {
      'content-disposition': `attachment; filename="atlas-enquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  });

  router.post('/api/enquiries-seen', (ctx) => {
    ctx.user.enquiriesSeenAt = new Date().toISOString();
    db.save();
    return { ok: true };
  });

  // The site (or any form the studio runs) can post an enquiry here.
  router.post('/api/public/enquiry', { auth: false, public: true, limit: 64_000 }, async (ctx) => {
    const verdict = limits.enquiry.hit(ctx.ip);
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
      source: 'website',
      message: body.message,
    });
    if (!fields.email) throw badRequest('Please leave an email address so the studio can reply.', { field: 'email' });
    const now = new Date().toISOString();
    const enquiry = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields, status: 'new', notes: [], archived: false };
    db.data.enquiries.push(enquiry);
    db.save();
    app.audit(null, 'enquiry.received', `New enquiry from ${enquiry.name} on the website`, { target: enquiry.id });
    return { ok: true };
  });

  /* -------------------------------- Meetings ------------------------------- */

  const meetingFields = (body, existing = null) => {
    const pick = (key, read) => (key in body ? read(body[key]) : existing ? existing[key] : read(undefined));
    const start = pick('start', (v) => date(v, { field: 'start', required: true }));
    let end = pick('end', (v) => date(v, { field: 'end' }));
    if (!end || Date.parse(end) <= Date.parse(start)) end = new Date(Date.parse(start) + (Number(body.minutes) || 45) * 60_000).toISOString();
    return {
      title: pick('title', (v) => text(v, { field: 'title', max: 140 }) || 'Discussion Meeting'),
      start,
      end,
      attendeeName: pick('attendeeName', (v) => text(v, { field: 'attendeeName', max: 120 })),
      attendeeEmail: pick('attendeeEmail', (v) => email(v, { field: 'attendeeEmail', required: false })),
      location: pick('location', (v) => text(v, { field: 'location', max: 140 }) || 'Google Meet'),
      joinUrl: pick('joinUrl', (v) => url(v, { field: 'joinUrl' })),
      status: pick('status', (v) => oneOf(v, MEETING_STATES, { field: 'status', fallback: 'scheduled' })),
      enquiryId: pick('enquiryId', (v) => (typeof v === 'string' && db.data.enquiries.some((item) => item.id === v) ? v : null)),
      notes: pick('notes', (v) => text(v, { field: 'notes', max: 4000, multiline: true })),
    };
  };

  router.get('/api/meetings', (ctx) => {
    const from = Date.parse(ctx.query.from ?? '') || 0;
    const to = Date.parse(ctx.query.to ?? '') || Infinity;
    const items = db.data.meetings.filter((item) => Date.parse(item.start) >= from && Date.parse(item.start) <= to).sort((a, b) => (a.start < b.start ? -1 : 1));
    return {
      items,
      calendly: { connected: Boolean(db.data.settings.calendlyToken), lastSync: db.data.settings.calendlyLastSync, user: db.data.settings.calendlyUser },
    };
  });

  router.post('/api/meetings', { auth: 'editor' }, async (ctx) => {
    const meeting = { id: crypto.randomUUID(), source: 'manual', ...meetingFields(await ctx.body()) };
    db.data.meetings.push(meeting);
    db.save();
    app.audit(ctx.user, 'meeting.create', `Added a meeting with ${meeting.attendeeName || 'a client'}`, { target: meeting.id });
    return meeting;
  });

  router.patch('/api/meetings/:id', { auth: 'editor' }, async (ctx) => {
    const meeting = db.data.meetings.find((item) => item.id === ctx.params.id);
    if (!meeting) throw notFound('That meeting isn’t here any more.');
    Object.assign(meeting, meetingFields(await ctx.body(), meeting));
    db.save();
    app.audit(ctx.user, 'meeting.update', `Updated the meeting with ${meeting.attendeeName || 'a client'}`, { target: meeting.id });
    return meeting;
  });

  router.delete('/api/meetings/:id', { auth: 'editor' }, (ctx) => {
    const meeting = db.data.meetings.find((item) => item.id === ctx.params.id);
    if (!meeting) throw notFound('That meeting isn’t here any more.');
    db.data.meetings = db.data.meetings.filter((item) => item !== meeting);
    db.save();
    app.audit(ctx.user, 'meeting.delete', `Removed the meeting with ${meeting.attendeeName || 'a client'}`, { target: meeting.id });
    return { ok: true };
  });

  router.post('/api/meetings/sync', { auth: 'editor' }, async (ctx) => {
    const { user, meetings } = await calendlyMeetings({ token: db.data.settings.calendlyToken, base: config.calendlyBase });
    let added = 0;
    let updated = 0;
    let enquiries = 0;
    for (const incoming of meetings) {
      let enquiry = incoming.attendeeEmail ? db.data.enquiries.find((item) => item.email === incoming.attendeeEmail.toLowerCase()) : null;
      if (!enquiry && incoming.attendeeEmail && incoming.status !== 'cancelled') {
        const now = new Date().toISOString();
        enquiry = { id: crypto.randomUUID(), createdAt: incoming.start < now ? incoming.start : now, updatedAt: now, name: incoming.attendeeName || incoming.attendeeEmail, email: incoming.attendeeEmail.toLowerCase(), phone: '', company: '', website: '', service: 'Other', budget: 'Not sure', source: 'calendly', message: incoming.notes, value: 0, followUpAt: null, tags: [], status: 'meeting', notes: [], archived: false };
        db.data.enquiries.push(enquiry);
        enquiries++;
      }
      const existing = db.data.meetings.find((item) => item.externalId === incoming.externalId);
      if (existing) {
        Object.assign(existing, { ...incoming, enquiryId: enquiry?.id ?? existing.enquiryId });
        updated++;
      } else {
        db.data.meetings.push({ id: crypto.randomUUID(), source: 'calendly', ...incoming, enquiryId: enquiry?.id ?? null });
        added++;
      }
    }
    db.data.settings.calendlyLastSync = new Date().toISOString();
    db.data.settings.calendlyUser = user;
    db.save();
    app.audit(ctx.user, 'meeting.sync', `Synced Calendly: ${added} new, ${updated} updated, ${enquiries} new enquiries`);
    return { added, updated, enquiries, total: meetings.length };
  });

  router.get('/api/booking-rules', async () => {
    const { booking } = await app.content.values(['booking']);
    return { slots: booking.slots, minutes: booking.minutes, offset: booking.studioOffsetMinutes, horizon: booking.horizon, title: booking.title, location: booking.location, duration: booking.duration };
  });
}
