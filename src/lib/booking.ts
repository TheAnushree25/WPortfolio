import { booking } from '@/content/site';

/**
 * The booking rules, shared by the page that offers the times and the server
 * that books them: the same slots, notice and horizon on both sides, so a
 * time the page shows is a time the server accepts.
 */

/** Requests need a little notice (ms). */
export const NOTICE = 12 * 3_600_000;
/** How long a meeting runs (ms). */
export const MEETING = booking.minutes * 60_000;
const DAY = 86_400_000;
const pad = (value: number) => String(value).padStart(2, '0');

/** A busy stretch of the studio's calendar, in epoch ms. */
export type Busy = { start: number; end: number };

export const localDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** The last moment a booking can start. */
export const horizonEnd = (now: number) => now + booking.horizon * DAY;

/**
 * The studio's start times that fall on a visitor's calendar day. Times are set
 * in the studio's zone on its weekdays, so a day's slots can come from the
 * studio's day before or after, depending on where the visitor is.
 */
export function slotsOn(day: Date, now: number) {
  const found: Date[] = [];
  for (let shift = -1; shift <= 1; shift++) {
    const y = day.getFullYear();
    const m = day.getMonth();
    const d = day.getDate() + shift;
    const weekday = new Date(Date.UTC(y, m, d)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const time of booking.slots) {
      const [h, min] = time.split(':').map(Number);
      const at = new Date(Date.UTC(y, m, d, h, min) - booking.studioOffsetMinutes * 60_000);
      if (localDay(at).getTime() === day.getTime() && at.getTime() > now + NOTICE && at.getTime() <= horizonEnd(now)) found.push(at);
    }
  }
  return found.sort((a, b) => a.getTime() - b.getTime());
}

/** True when `start` is one of the studio's slots, far enough ahead and within the horizon. */
export function isBookable(start: Date, now: number) {
  const time = start.getTime();
  if (!Number.isFinite(time) || time <= now + NOTICE || time > horizonEnd(now)) return false;
  // The studio's wall clock, read off the UTC fields.
  const studio = new Date(time + booking.studioOffsetMinutes * 60_000);
  const weekday = studio.getUTCDay();
  if (weekday === 0 || weekday === 6 || studio.getUTCSeconds() || studio.getUTCMilliseconds()) return false;
  return (booking.slots as readonly string[]).includes(`${pad(studio.getUTCHours())}:${pad(studio.getUTCMinutes())}`);
}

/** Whether a meeting starting at `start` would run into anything already on the calendar. */
export const clashes = (start: number, busy: readonly Busy[]) => busy.some((stretch) => start < stretch.end && start + MEETING > stretch.start);
