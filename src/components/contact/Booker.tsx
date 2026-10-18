'use client';

import { useState } from 'react';
import { booking } from '@/content/site';
import { env } from '@/lib/env';
import { CalEmbed } from './CalEmbed';
import { CalendlyBooker } from './CalendlyBooker';
import { RequestBooker } from './RequestBooker';

/**
 * The booking page's scheduler: the studio's form handing over to Calendly when
 * its link is configured (Calendly then owns the slots, bookings and emails);
 * else Cal.com's own when that is; otherwise the studio's own booker, which
 * puts meetings on its Google Calendar, or takes requests by email until that's
 * connected. The line underneath says which, once the booker knows.
 */
export function Booker() {
  const [live, setLive] = useState<boolean | null>(env.calendlyUrl || env.calLink ? true : null);
  return (
    <main className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center gap-6 px-[var(--pad-sides)] pt-32 pb-20">
      {env.calendlyUrl ? (
        <CalendlyBooker url={env.calendlyUrl} />
      ) : env.calLink ? (
        <CalEmbed calLink={env.calLink} />
      ) : (
        <RequestBooker onService={setLive} />
      )}
      <p
        className="font-studio text-[0.85rem] font-medium text-paper-soft/50 transition-opacity duration-700"
        style={{ opacity: live === null ? 0 : undefined }}
      >
        {live === false ? booking.note.inbox : booking.note.calendar}
      </p>
    </main>
  );
}
