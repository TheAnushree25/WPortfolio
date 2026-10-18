/**
 * The Atlas Studio · booking guard (Google Apps Script)
 *
 * Calendly frees a slot when the studio cancels a meeting, or when the client
 * uses the cancel link in their invitation. It doesn't when the client only
 * answers "No" to the Google Calendar invitation: the meeting stays booked and
 * the time stays taken. This closes that gap. Every five minutes it reads the
 * studio's upcoming Calendly meetings, and when every guest on one has said
 * "No", it deletes the meeting from the calendar. Calendly ("Automatically sync
 * changes from this calendar to Calendly") then cancels the booking and offers
 * the time again. The client gets a short note with a link to book another
 * time, and the studio a note saying who declined.
 *
 * It runs inside the studio's Google account (contact.theatlasstudio@gmail.com)
 * at script.google.com, with the "Google Calendar API" service added under the
 * name `Calendar`. Run `install` once to start it and `uninstall` to stop it.
 * README.md → "Bookings" → "Cancellations".
 */

const SETTINGS = {
  /** Where a client who said "No" can book another time (the website's /contact page, once it's live). */
  bookingPage: 'https://calendly.com/theatlasstudio/meeting',
  /** Who hears that a client declined. */
  studioEmail: 'contact.theatlasstudio@gmail.com',
  studioName: 'The Atlas Studio',
  /** How far ahead to look, in days; Calendly takes bookings up to 60 days out. */
  daysAhead: 60,
  /** Set to false to cancel without writing to the client. */
  emailClient: true,
  /** The zone the times in both notes are written in. */
  timeZone: 'Asia/Kolkata',
};

/** Starts the check every five minutes, and runs it once now. */
function install() {
  uninstall();
  ScriptApp.newTrigger('checkDeclines').timeBased().everyMinutes(5).create();
  checkDeclines();
}

/** Stops the check. */
function uninstall() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'checkDeclines') ScriptApp.deleteTrigger(trigger);
  }
}

/** Cancels every upcoming Calendly meeting whose guests have all said "No". */
function checkDeclines() {
  const now = new Date();
  const until = new Date(now.getTime() + SETTINGS.daysAhead * 86400000);
  let pageToken;
  do {
    const page = Calendar.Events.list('primary', {
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      singleEvents: true,
      maxResults: 250,
      pageToken,
    });
    for (const event of page.items || []) {
      if (!isCalendlyBooking(event)) continue;
      const guests = (event.attendees || []).filter((person) => !person.self && !person.organizer && !person.resource);
      if (guests.length && guests.every((guest) => guest.responseStatus === 'declined')) cancel(event, guests);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
}

/** A meeting Calendly put on the studio's calendar: the studio organises it, and its description carries Calendly's links. */
function isCalendlyBooking(event) {
  return Boolean(event.organizer && event.organizer.self) && /calendly\.com/i.test(event.description || '');
}

/** Takes the meeting off the calendar (Calendly follows), then tells the client and the studio. */
function cancel(event, guests) {
  // No notice from Google: the client already said "No", and hears from the studio below instead.
  Calendar.Events.remove('primary', event.id, { sendUpdates: 'none' });

  // Calendly titles the event "<meeting> between <studio> and <client>"; the notes only need the meeting.
  const title = (event.summary || 'Your meeting').replace(/\s+between\s.+$/i, '');
  const start = new Date(event.start.dateTime || event.start.date);
  const when = `${Utilities.formatDate(start, SETTINGS.timeZone, "EEEE d MMMM yyyy 'at' h:mm a")} (India time)`;
  const names = guests.map((guest) => guest.displayName || guest.email).join(', ');

  if (SETTINGS.emailClient) {
    for (const guest of guests) {
      MailApp.sendEmail({
        to: guest.email,
        name: SETTINGS.studioName,
        replyTo: SETTINGS.studioEmail,
        subject: `Cancelled: ${title}, ${when}`,
        body: [
          `Hello${guest.displayName ? ` ${guest.displayName}` : ''},`,
          '',
          `You declined the ${title} on ${when}, so we've cancelled it and freed the time.`,
          '',
          `If you'd like to meet another time, you can pick one here: ${SETTINGS.bookingPage}`,
          '',
          SETTINGS.studioName,
        ].join('\n'),
      });
    }
  }

  MailApp.sendEmail({
    to: SETTINGS.studioEmail,
    name: `${SETTINGS.studioName} bookings`,
    subject: `Declined · ${names} · ${when}`,
    body: [
      `${names} declined the ${title} on ${when}.`,
      '',
      'The meeting is off the calendar, and Calendly cancels the booking when it sees that, so the time is offered again.',
      ...(SETTINGS.emailClient ? ['A note went to them with a link to book another time.'] : []),
    ].join('\n'),
  });
}
