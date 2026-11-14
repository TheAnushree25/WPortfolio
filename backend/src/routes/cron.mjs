import { HttpError, safeEqual } from '../shared.mjs';

/**
 * Work on a schedule (Vercel Cron, or any scheduler calling this address with
 * `Authorization: Bearer <CRON_SECRET>`): bring Calendly's bookings in and
 * tidy expired sessions, links, counters and unfinished uploads. The admin
 * also tidies as it's used, so a missed run costs nothing.
 */
export function cronRoutes(router, app) {
  router.get('/api/cron/daily', { auth: false, cron: true }, async (ctx) => {
    const secret = app.config.cronSecret;
    const given = (ctx.request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!secret || !safeEqual(given, secret)) throw new HttpError(401, 'cron', 'Not allowed.');
    const outcome = { housekeeping: false, calendly: null };
    await app.housekeeping({ force: true });
    outcome.housekeeping = true;
    if (await app.calendlyToken()) {
      try {
        outcome.calendly = await app.syncCalendly();
        await app.audit(null, 'meeting.sync', `Synced Calendly on schedule: ${outcome.calendly.added} new, ${outcome.calendly.updated} updated, ${outcome.calendly.enquiries} new enquiries`);
      } catch (error) {
        outcome.calendly = { error: error.message };
        await app.audit(null, 'meeting.sync', `The scheduled Calendly sync failed: ${error.message}`);
      }
    }
    return outcome;
  });
}
