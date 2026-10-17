import { horizonEnd, MEETING, type Busy } from '@/lib/booking';
import { busyBetween, GoogleError, googleReady } from '@/lib/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * When the studio's calendar is busy across the booking horizon, so the page
 * can strike out times that are already taken. Only start and end times
 * leave the server, never what the events are.
 *
 *   GET → { configured, busy: [{ start, end }] }   (epoch ms)
 */

/** Asked of Google at most every half minute, however many visitors look. */
const FRESH = 30_000;
let memo: { at: number; busy: Busy[] } | null = null;

export async function GET() {
  if (!googleReady()) return Response.json({ configured: false, busy: [] }, { headers: { 'cache-control': 'no-store' } });
  const now = Date.now();
  try {
    if (!memo || now - memo.at > FRESH) memo = { at: now, busy: await busyBetween(now, horizonEnd(now) + MEETING) };
    return Response.json({ configured: true, busy: memo.busy }, { headers: { 'cache-control': 'private, max-age=30' } });
  } catch (error) {
    console.error('[booking] availability:', error instanceof GoogleError ? error.message : error);
    return Response.json({ configured: true, busy: [], error: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
