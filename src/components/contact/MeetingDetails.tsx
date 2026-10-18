import type { ReactNode } from 'react';
import { booking } from '@/content/site';
import { WORDMARK_LETTERS } from '@/components/hero/geometry';

/**
 * The meeting at the head of both bookers: the studio, the meeting, its length,
 * where it happens and the visitor's own zone. Whatever the booker adds (who is
 * booking, once they've said) sits underneath.
 */
export function MeetingDetails({ zone, children }: { zone: string; children?: ReactNode }) {
  return (
    <div className="border-b border-paper-soft/10 p-7 lg:border-r lg:border-b-0">
      <span className="mb-4 grid size-9 place-items-center rounded-full bg-paper-soft/10" aria-hidden>
        <svg viewBox="50 470 274 216" className="w-4" fill="#fff">
          <path d={WORDMARK_LETTERS[0].d} />
        </svg>
      </span>
      <p className="text-[0.95rem] font-medium text-paper-soft/60">{booking.studio}</p>
      <h1 className="mt-2 mb-6 text-[1.5rem] leading-tight font-semibold">{booking.title}</h1>
      <ul className="flex flex-col gap-4 text-[0.95rem] font-medium text-paper-soft/85">
        <li className="flex items-center gap-3">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-[18px] opacity-80">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 5.5V10l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {booking.duration}
        </li>
        <li className="flex items-center gap-3">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-[18px] opacity-80">
            <rect x="2" y="5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="m13 9 5-3v8l-5-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {booking.location}
        </li>
        <li className="flex items-center gap-3">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-[18px] opacity-80">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
            <path d="M2 10h16M10 2c2.5 2.4 2.5 13.6 0 16M10 2c-2.5 2.4-2.5 13.6 0 16" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {zone || '—'}
        </li>
      </ul>
      {children}
    </div>
  );
}
