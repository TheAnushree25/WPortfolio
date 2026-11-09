import { HttpError } from './http.mjs';

/**
 * Reads the studio's meetings from Calendly, which takes the bookings on
 * /contact. It needs a Personal Access Token (Calendly → Integrations → API
 * & Webhooks), entered in Settings by the owner. Only Calendly's own
 * addresses are ever fetched, whatever a response points at.
 */

const DAY = 86_400_000;

export async function calendlyMeetings({ token, base, now = Date.now() }) {
  if (!token) throw new HttpError(400, 'not_connected', 'Add a Calendly token in Settings → Integrations first.');
  const get = async (url) => {
    if (!url.startsWith(`${base}/`)) throw new HttpError(502, 'calendly', 'Calendly pointed somewhere unexpected; the sync stopped.');
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 401) throw new HttpError(400, 'calendly_token', 'Calendly turned the token down. Create a new one and save it in Settings.');
    if (!response.ok) throw new HttpError(502, 'calendly', `Calendly answered ${response.status}. Try again in a minute.`);
    return response.json();
  };

  const me = (await get(`${base}/users/me`)).resource;
  const query = new URLSearchParams({
    user: me.uri,
    min_start_time: new Date(now - 30 * DAY).toISOString(),
    max_start_time: new Date(now + 120 * DAY).toISOString(),
    count: '100',
    sort: 'start_time:asc',
  });
  const events = [];
  let next = `${base}/scheduled_events?${query}`;
  for (let page = 0; next && page < 6; page++) {
    const body = await get(next);
    events.push(...(body.collection ?? []));
    next = body.pagination?.next_page ?? null;
  }

  const meetings = [];
  for (const event of events) {
    let invitee = null;
    try {
      invitee = (await get(`${event.uri}/invitees?count=10`)).collection?.find((item) => item.status !== 'canceled') ?? null;
    } catch {
      /* a meeting without its invitee still shows */
    }
    const end = Date.parse(event.end_time);
    meetings.push({
      externalId: event.uri,
      title: event.name ?? 'Meeting',
      start: event.start_time,
      end: event.end_time,
      status: event.status === 'canceled' ? 'cancelled' : end < now ? 'completed' : 'scheduled',
      joinUrl: event.location?.join_url ?? '',
      location: event.location?.type === 'google_conference' ? 'Google Meet' : event.location?.location ?? event.location?.type ?? '',
      attendeeName: invitee?.name ?? '',
      attendeeEmail: invitee?.email ?? '',
      notes: (invitee?.questions_and_answers ?? []).map((qa) => `${qa.question}\n${qa.answer}`).join('\n\n'),
    });
  }
  return { user: { name: me.name, email: me.email, schedulingUrl: me.scheduling_url }, meetings };
}
