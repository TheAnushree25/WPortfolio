import { booking } from '@/content/site';
import { clashes, isBookable, MEETING } from '@/lib/booking';
import { busyBetween, createMeeting, GoogleError, googleReady, sendMail } from '@/lib/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Books a meeting from the contact page. The time is checked against the
 * studio's slots and its calendar, then the meeting goes on the studio's
 * Google Calendar with a Meet link (Google invites the visitor), and the
 * studio's inbox gets a note it can reply to.
 *
 *   POST { start, name, email, notes?, zone? }
 *   200 { ok, start, end, meet }  · 400 invalid · 409 taken · 422 slot
 *   429 limited · 503 unconfigured | unavailable (the page falls back to email)
 */

/** Where the note goes (it's sent from the studio's account), and whether the visitor is invited too. */
const notify = () => process.env.BOOKING_NOTIFY_EMAIL || booking.email;
const inviteGuest = () => process.env.BOOKING_INVITE_GUEST !== 'false';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** At most five bookings per visitor in ten minutes, per server instance. */
const LIMIT = 5;
const WINDOW = 10 * 60_000;
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  if (hits.size > 2000) hits.clear();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > LIMIT;
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:.]+(?:\.[^\s@<>()",;:.]+)+$/;
const ZONE = /^[A-Za-z]+(?:[/_+-][A-Za-z0-9]+){0,4}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

type BookingRequest = { start: Date; name: string; email: string; notes: string; zone: string; trap: boolean };

function parse(input: unknown): BookingRequest | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof value[key] === 'string' ? value[key].replace(CONTROL, '').trim().slice(0, max) : '');
  const name = text('name', 120).replace(/\s+/g, ' ');
  const email = text('email', 254).toLowerCase();
  const start = new Date(typeof value.start === 'string' ? value.start : Number.NaN);
  if (!name || !EMAIL.test(email) || Number.isNaN(start.getTime())) return null;
  const zone = text('zone', 64);
  // The form's hidden "company" field is only ever filled in by bots.
  return { start, name, email, notes: text('notes', 2000), zone: ZONE.test(zone) ? zone : '', trap: Boolean(text('company', 200)) };
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function format(date: Date, zone: string, style: 'long' | 'short') {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      ...(style === 'long' ? { dateStyle: 'full', timeStyle: 'short' } : { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
      timeZone: zone,
      hour12: true,
    }).format(date);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!googleReady()) return json({ error: 'unconfigured' }, 503);
  const visitor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
  if (limited(visitor)) return json({ error: 'limited' }, 429);

  const input = parse(await request.json().catch(() => null));
  if (!input) return json({ error: 'invalid' }, 400);
  if (!isBookable(input.start, Date.now())) return json({ error: 'slot' }, 422);
  const start = input.start;
  const end = new Date(start.getTime() + MEETING);
  if (input.trap) return json({ ok: true, start: start.toISOString(), end: end.toISOString(), meet: null });

  try {
    if (clashes(start.getTime(), await busyBetween(start.getTime(), end.getTime()))) return json({ error: 'taken' }, 409);

    const studioWhen = format(start, 'Asia/Kolkata', 'long') ?? start.toISOString();
    const theirWhen = input.zone && input.zone !== 'Asia/Kolkata' ? format(start, input.zone, 'long') : null;
    const meeting = await createMeeting({
      start,
      end,
      summary: `${booking.studio} × ${input.name}`,
      description: [
        `${booking.title} (${booking.duration}), booked on the Atlas Studios website.`,
        '',
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        ...(theirWhen ? [`Their time: ${theirWhen} (${input.zone})`] : []),
        ...(input.notes ? ['', 'Notes:', input.notes] : []),
      ].join('\n'),
      guest: inviteGuest() ? { name: input.name, email: input.email } : null,
    });

    // The meeting stands even if the note doesn't go out; the calendar has it.
    try {
      const rows: [string, string][] = [
        ['When', `${studioWhen} (India)`],
        ...(theirWhen ? ([['Their time', `${theirWhen} (${input.zone})`]] as [string, string][]) : []),
        ['Name', input.name],
        ['Email', input.email],
        ['Meeting', `${booking.title}, ${booking.duration}, ${booking.location}`],
      ];
      await sendMail({
        to: notify(),
        from: { name: `${booking.studio} bookings`, email: booking.email },
        replyTo: { name: input.name, email: input.email },
        subject: `New booking · ${input.name} · ${format(start, 'Asia/Kolkata', 'short') ?? studioWhen}`,
        text: [
          `${input.name} booked ${booking.title.toLowerCase()} on the website.`,
          '',
          ...rows.map(([label, value]) => `${label}: ${value}`),
          ...(meeting.meet ? [`Google Meet: ${meeting.meet}`] : []),
          `Calendar: ${meeting.link}`,
          ...(input.notes ? ['', 'Notes:', input.notes] : []),
          '',
          'Reply to this email to write to them directly.',
        ].join('\n'),
        html: `<!doctype html><html><body style="margin:0;background:#f4f7ff;font-family:Helvetica,Arial,sans-serif;color:#020923">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#095cfb;font-weight:700">New booking</p>
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;font-weight:600">${escape(input.name)} booked ${escape(booking.title.toLowerCase())}</h1>
<table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #d9e2f2;border-radius:12px">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:12px 16px;border-bottom:1px solid #eef2fa;font-size:13px;color:#5c6d8f;width:110px;vertical-align:top">${escape(label)}</td><td style="padding:12px 16px;border-bottom:1px solid #eef2fa;font-size:15px">${escape(value)}</td></tr>`,
  )
  .join('\n')}
${input.notes ? `<tr><td style="padding:12px 16px;font-size:13px;color:#5c6d8f;vertical-align:top">Notes</td><td style="padding:12px 16px;font-size:15px;white-space:pre-wrap">${escape(input.notes)}</td></tr>` : ''}
</table>
<p style="margin:24px 0 0">
${meeting.meet ? `<a href="${escape(meeting.meet)}" style="display:inline-block;margin:0 10px 10px 0;padding:12px 22px;border-radius:999px;background:#095cfb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">Join on Google Meet</a>` : ''}
<a href="${escape(meeting.link)}" style="display:inline-block;margin:0 0 10px;padding:12px 22px;border-radius:999px;border:1px solid #aab8d6;color:#020923;text-decoration:none;font-weight:600;font-size:14px">Open in Google Calendar</a>
</p>
<p style="margin:18px 0 0;font-size:13px;color:#5c6d8f">Reply to this email to write to ${escape(input.name)} directly.</p>
</div></body></html>`,
      });
    } catch (error) {
      console.error('[booking] the inbox note failed:', error instanceof Error ? error.message : error);
    }

    return json({ ok: true, start: start.toISOString(), end: end.toISOString(), meet: meeting.meet });
  } catch (error) {
    console.error('[booking]', error instanceof GoogleError ? error.message : error);
    if (error instanceof GoogleError && error.step === 'auth') {
      console.error('[booking] Google refused the refresh token: run `node scripts/google/authorize.mjs` again.');
    }
    return json({ error: 'unavailable' }, 503);
  }
}
