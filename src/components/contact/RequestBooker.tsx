'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { booking } from '@/content/site';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { WORDMARK_LETTERS } from '@/components/hero/geometry';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Requests need a little notice (ms). */
const NOTICE = 12 * 3_600_000;

const localDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const ordinal = (n: number) => {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
};

/**
 * The studio's start times that fall on a visitor's calendar day. Times are set
 * in the studio's zone on its weekdays, so a day's slots can come from the
 * studio's day before or after, depending on where the visitor is.
 */
function slotsOn(day: Date, now: number) {
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
      if (localDay(at).getTime() === day.getTime() && at.getTime() > now + NOTICE) found.push(at);
    }
  }
  return found.sort((a, b) => a.getTime() - b.getTime());
}

type Step = 'pick' | 'form' | 'sent';

/**
 * Studio Mirage's booking page in the studio's own light, for when no Cal.com
 * link is set: the meeting on the left, a month of open weekdays, and the day's
 * times — in the visitor's own zone, 12h or 24h. Picking a time asks for a name
 * and email, then opens the visitor's mail app with the request addressed to
 * the studio, to be confirmed with a meeting link.
 */
export function RequestBooker() {
  const [now, setNow] = useState<number | null>(null);
  const [month, setMonth] = useState<Date | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [hour12, setHour12] = useState(true);
  const [step, setStep] = useState<Step>('pick');

  // Times depend on the visitor's clock and zone, so they're worked out in the browser.
  useEffect(() => {
    const start = Date.now();
    setNow(start);
    for (let i = 0; i <= booking.horizon; i++) {
      const candidate = localDay(new Date(start + i * 86_400_000));
      if (slotsOn(candidate, start).length) {
        setDay(candidate);
        setMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
        return;
      }
    }
    setMonth(new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1));
  }, []);

  // Some browsers still report India's zone by its old name.
  const zone = useMemo(
    () => (now ? Intl.DateTimeFormat().resolvedOptions().timeZone.replace('Asia/Calcutta', 'Asia/Kolkata') : ''),
    [now],
  );
  const timeFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12 }), [hour12]);

  const cells = useMemo(() => {
    if (!month || now === null) return [];
    const last = localDay(new Date(now + booking.horizon * 86_400_000));
    const lead = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => {
        const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
        const open = date <= last && slotsOn(date, now).length > 0;
        return { date, open };
      }),
    ];
  }, [month, now]);

  const times = day && now !== null ? slotsOn(day, now) : [];
  const today = now !== null ? localDay(new Date(now)) : null;
  const thisMonth = today ? new Date(today.getFullYear(), today.getMonth(), 1) : null;
  const lastMonth = now !== null ? (() => { const last = new Date(now + booking.horizon * 86_400_000); return new Date(last.getFullYear(), last.getMonth(), 1); })() : null;

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!slot) return;
    const form = new FormData(event.currentTarget);
    const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(slot);
    const studio = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(slot);
    const subject = `${booking.title} — ${when}`;
    const body = [
      `Hello ${booking.studio},`,
      '',
      `I'd like to book "${booking.title}" (${booking.duration}, ${booking.location}).`,
      '',
      `Time: ${when} (${zone})`,
      `Studio time: ${studio}`,
      `Name: ${form.get('name')}`,
      `Email: ${form.get('email')}`,
      '',
      String(form.get('notes') ?? ''),
    ].join('\n');
    window.location.href = `mailto:${booking.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStep('sent');
  };

  const shiftMonth = (by: number) => month && setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  return (
    <motion.div
      className="font-studio w-full max-w-[1300px] overflow-hidden rounded-[14px] border border-paper-soft/10 bg-[rgb(2_9_35_/_0.55)] text-paper-soft backdrop-blur-xl"
      initial={{ opacity: 0, y: 40, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1.1, ease: ease.expo, delay: 0.15 }}
    >
      <div className="grid min-h-[612px] lg:grid-cols-[minmax(260px,350px)_1fr]">
        {/* The meeting. */}
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
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'pick' ? (
            <motion.div
              key="pick"
              className="grid lg:grid-cols-[1fr_minmax(240px,350px)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* The month. */}
              <div className="border-b border-paper-soft/10 p-7 lg:border-r lg:border-b-0">
                <div className="mb-6 flex items-center justify-between">
                  <p className="text-[1.15rem] font-semibold">
                    {month?.toLocaleString(undefined, { month: 'long' })}{' '}
                    <span className="font-normal text-paper-soft/60">{month?.getFullYear()}</span>
                  </p>
                  <div className="flex gap-1">
                    {[-1, 1].map((by) => {
                      const blocked = !month || (by < 0 ? month <= (thisMonth ?? month) : month >= (lastMonth ?? month));
                      return (
                        <button
                          key={by}
                          type="button"
                          disabled={blocked}
                          onClick={() => shiftMonth(by)}
                          aria-label={by < 0 ? 'Previous month' : 'Next month'}
                          className="grid size-8 place-items-center rounded-full text-paper-soft/80 transition hover:bg-paper-soft/10 disabled:opacity-25"
                        >
                          <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn('size-4', by < 0 && 'rotate-180')}>
                            <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {WEEKDAYS.map((weekday) => (
                    <span key={weekday} className="pb-3 text-[0.7rem] font-semibold tracking-[0.06em] text-paper-soft/80 uppercase xl:tracking-[0.12em]">
                      {weekday}
                    </span>
                  ))}
                  {cells.map((cell, i) =>
                    cell ? (
                      <button
                        key={i}
                        type="button"
                        disabled={!cell.open}
                        onClick={() => setDay(cell.date)}
                        aria-pressed={day?.getTime() === cell.date.getTime()}
                        className={cn(
                          'relative aspect-square rounded-[8px] text-[0.95rem] transition',
                          day?.getTime() === cell.date.getTime()
                            ? 'bg-paper-soft font-semibold text-night'
                            : cell.open
                              ? 'bg-paper-soft/10 font-semibold hover:bg-paper-soft/20'
                              : 'text-paper-soft/40',
                        )}
                      >
                        {cell.date.getDate()}
                        {today?.getTime() === cell.date.getTime() && (
                          <span className="absolute bottom-[18%] left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <span key={i} aria-hidden />
                    ),
                  )}
                </div>
              </div>

              {/* The day's times. */}
              <div className="flex max-h-[612px] flex-col p-7">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="text-[1.05rem] font-semibold">
                    {day ? (
                      <>
                        {day.toLocaleString(undefined, { weekday: 'short' })}{' '}
                        <span className="font-normal text-paper-soft/60">{ordinal(day.getDate())}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                  <div className="flex rounded-[8px] border border-paper-soft/10 p-0.5 text-[0.8rem] font-semibold">
                    {[true, false].map((twelve) => (
                      <button
                        key={String(twelve)}
                        type="button"
                        onClick={() => setHour12(twelve)}
                        aria-pressed={hour12 === twelve}
                        className={cn('rounded-[6px] px-2 py-1 transition', hour12 === twelve ? 'bg-paper-soft/15' : 'text-paper-soft/60')}
                      >
                        {twelve ? '12h' : '24h'}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="-mr-2 flex flex-col gap-2.5 overflow-y-auto pr-2">
                  {times.map((time) => (
                    <li key={time.getTime()}>
                      <button
                        type="button"
                        onClick={() => {
                          setSlot(time);
                          setStep('form');
                        }}
                        className="h-11 w-full rounded-[8px] border border-paper-soft/15 text-[0.95rem] font-semibold transition hover:border-paper-soft/50 hover:bg-paper-soft/5"
                      >
                        {timeFormat.format(time)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              className="flex items-center justify-center p-7"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: ease.expo }}
            >
              {step === 'form' && slot ? (
                <form onSubmit={send} className="flex w-full max-w-[460px] flex-col gap-4">
                  <p className="mb-2 text-[1.05rem] font-semibold">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(slot)} · {timeFormat.format(slot)}
                  </p>
                  {(['name', 'email', 'notes'] as const).map((field) => (
                    <label key={field} className="flex flex-col gap-2 text-[0.85rem] font-medium text-paper-soft/70">
                      {booking.form[field]}
                      {field === 'notes' ? (
                        <textarea
                          name={field}
                          rows={3}
                          className="rounded-[8px] border border-paper-soft/15 bg-paper-soft/5 px-3 py-2.5 text-[0.95rem] text-paper-soft outline-none focus:border-paper-soft/50"
                        />
                      ) : (
                        <input
                          name={field}
                          type={field === 'email' ? 'email' : 'text'}
                          required
                          autoComplete={field}
                          className="h-11 rounded-[8px] border border-paper-soft/15 bg-paper-soft/5 px-3 text-[0.95rem] text-paper-soft outline-none focus:border-paper-soft/50"
                        />
                      )}
                    </label>
                  ))}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-4">
                    <button type="button" onClick={() => setStep('pick')} className="glass-button is-outlined">
                      <span>{booking.form.back}</span>
                    </button>
                    <button type="submit" className="glow-button">
                      <span className="glow-button-label">{booking.form.send}</span>
                      <span className="glow-button-bg" aria-hidden />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex max-w-[420px] flex-col items-start gap-4">
                  <p className="text-[1.4rem] leading-tight font-semibold">{booking.sent.title}</p>
                  <p className="text-[0.95rem] leading-[1.6] text-paper-soft/70">{booking.sent.body}</p>
                  <button type="button" onClick={() => setStep('pick')} className="glass-button is-outlined mt-2">
                    <span>{booking.sent.again}</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
