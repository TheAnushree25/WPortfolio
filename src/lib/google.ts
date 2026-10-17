import type { Busy } from '@/lib/booking';

/**
 * The studio's Google account, spoken to over plain REST (no SDK): Calendar
 * for free/busy and the meeting itself, Gmail for the note to the inbox.
 * Server only. It runs on one OAuth refresh token for the studio's account,
 * minted once by `node scripts/google/authorize.mjs`.
 *
 * GOOGLE_API_BASE points every call at a stand-in server instead of Google;
 * it exists for local testing only and stays unset everywhere else.
 */

const BASE = process.env.GOOGLE_API_BASE?.replace(/\/$/, '');
const TOKEN_URL = BASE ? `${BASE}/token` : 'https://oauth2.googleapis.com/token';
const CALENDAR = BASE ? `${BASE}/calendar/v3` : 'https://www.googleapis.com/calendar/v3';
const GMAIL = BASE ? `${BASE}/gmail/v1` : 'https://gmail.googleapis.com/gmail/v1';

const calendarId = () => encodeURIComponent(process.env.BOOKING_CALENDAR_ID || 'primary');

export class GoogleError extends Error {
  constructor(
    readonly step: 'auth' | 'freebusy' | 'event' | 'mail',
    readonly status: number,
    detail: string,
  ) {
    super(`Google ${step} failed (${status}): ${detail.slice(0, 300)}`);
  }
}

/** True once the three OAuth settings are in place. */
export const googleReady = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

let cached: { value: string; expires: number } | null = null;

/** An access token for the studio's account, refreshed a minute before it lapses. */
async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new GoogleError('auth', response.status, await response.text());
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cached.value;
}

async function call<T>(step: GoogleError['step'], url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    // A token the account has since revoked is forgotten, so the next request asks afresh.
    if (response.status === 401) cached = null;
    throw new GoogleError(step, response.status, await response.text());
  }
  return (await response.json()) as T;
}

const WINDOW = 30 * 86_400_000;

/** Everything busy on the studio's calendar between two moments, asked in month-long windows. */
export async function busyBetween(from: number, to: number): Promise<Busy[]> {
  const busy: Busy[] = [];
  for (let start = from; start < to; start += WINDOW) {
    const end = Math.min(to, start + WINDOW);
    const data = await call<{ calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
      'freebusy',
      `${CALENDAR}/freeBusy`,
      { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), items: [{ id: process.env.BOOKING_CALENDAR_ID || 'primary' }] },
    );
    for (const calendar of Object.values(data.calendars ?? {})) {
      if (calendar.errors?.length) throw new GoogleError('freebusy', 200, JSON.stringify(calendar.errors));
      for (const stretch of calendar.busy ?? []) busy.push({ start: Date.parse(stretch.start), end: Date.parse(stretch.end) });
    }
  }
  return busy;
}

type Meeting = {
  start: Date;
  end: Date;
  summary: string;
  description: string;
  guest: { name: string; email: string } | null;
};

/** Puts the meeting on the studio's calendar with a Google Meet link; with a guest, Google sends them the invitation. */
export async function createMeeting({ start, end, summary, description, guest }: Meeting) {
  const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: guest ? 'all' : 'none' });
  const event = await call<{ id: string; htmlLink: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } }>(
    'event',
    `${CALENDAR}/calendars/${calendarId()}/events?${params}`,
    {
      summary,
      description,
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
      attendees: guest ? [{ email: guest.email, displayName: guest.name }] : [],
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      guestsCanInviteOthers: false,
      reminders: { useDefault: true },
    },
  );
  const meet = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')?.uri ?? null;
  return { id: event.id, link: event.htmlLink, meet };
}

/** RFC 2047 for headers that may carry non-ASCII (names, subjects); CR/LF never reach a header. */
const header = (value: string) => {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
};
const address = (name: string, email: string) => {
  const clean = name.replace(/[\r\n"\\]+/g, ' ').trim();
  const shown = /^[\x20-\x7e]*$/.test(clean) ? `"${clean}"` : header(clean);
  return `${shown} <${email.replace(/[\s<>"]/g, '')}>`;
};
const wrap = (base64: string) => base64.replace(/.{76}/g, '$&\r\n');

type Mail = { to: string; from: { name: string; email: string }; replyTo?: { name: string; email: string }; subject: string; text: string; html: string };

/** Sends a plain + HTML email from the studio's own Gmail. */
export async function sendMail({ to, from, replyTo, subject, text, html }: Mail) {
  const boundary = `atlas-${crypto.randomUUID()}`;
  const message = [
    `From: ${address(from.name, from.email)}`,
    `To: ${to.replace(/[\r\n]/g, '')}`,
    ...(replyTo ? [`Reply-To: ${address(replyTo.name, replyTo.email)}`] : []),
    `Subject: ${header(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(html, 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  await call('mail', `${GMAIL}/users/me/messages/send`, { raw: Buffer.from(message, 'utf8').toString('base64url') });
}
