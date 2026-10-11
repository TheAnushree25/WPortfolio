'use client';

import { booking } from '@/content/site';
import { env } from '@/lib/env';
import { CalEmbed } from './CalEmbed';
import { RequestBooker } from './RequestBooker';

/**
 * The booking page's scheduler: Cal.com's own when a link is configured, so
 * visitors book real slots with a Meet link and the studio's calendar fills
 * itself; otherwise the same layout, taking requests by email.
 */
export function Booker() {
  return (
    <main className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center gap-6 px-[var(--pad-sides)] pt-32 pb-20">
      {env.calLink ? <CalEmbed calLink={env.calLink} /> : <RequestBooker />}
      <p className="font-studio text-[0.85rem] font-medium text-paper-soft/50">{booking.note}</p>
    </main>
  );
}
