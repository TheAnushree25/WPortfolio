'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { booking } from '@/content/site';
import { clashes, localDay, MEETING, slotsOn, type Busy } from '@/lib/booking';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { MeetingDetails } from './MeetingDetails';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ordinal = (n: number) => {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
};

type Step = 'pick' | 'form' | 'booked' | 'sent';
type Booked = { start: Date; email: string; meet: string | null };

/** iCalendar's UTC stamp: 20261023T053000Z. */
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** The booked meeting as an .ics file, for calendars other than the visitor's Google one. */
function icsFor({ start, meet }: Booked) {
  const line = (text: string) => text.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Atlas Studio//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@theatlasstudio`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(new Date(start.getTime() + MEETING))}`,
    `SUMMARY:${line(`${booking.title} — ${booking.studio}`)}`,
    `DESCRIPTION:${line(meet ? `Join on Google Meet: ${meet}` : `${booking.title} with ${booking.studio}`)}`,
    `LOCATION:${line(meet ?? booking.location)}`,
    `ORGANIZER;CN=${line(booking.studio)}:mailto:${booking.email}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/**
 * Studio Mirage's booking page in the studio's own light, for when no Cal.com
 * link is set: the meeting on the left, a month of open weekdays, and the day's
 * times — in the visitor's own zone, 12h or 24h. Times already taken on the
 * studio's calendar are left out. Picking one asks for a name and email and
 * books it: the meeting goes on the studio's Google Calendar with a Meet link
 * and the invitation goes to the visitor (api/booking). Until Google is
 * connected, or if it can't be reached, the request opens in the visitor's
 * email app instead, addressed to the studio.
 */
export function RequestBooker({ onService }: { onService?: (live: boolean) => void }) {
  const [now, setNow] = useState<number | null>(null);
  const [month, setMonth] = useState<Date | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [hour12, setHour12] = useState(true);
  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState<Busy[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  /** The day's times the studio can still take. */
  const openOn = useCallback(
    (date: Date, at: number, taken: readonly Busy[]) => slotsOn(date, at).filter((time) => !clashes(time.getTime(), taken)),
    [],
  );

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

  // What is already taken on the studio's calendar (and whether bookings reach it at all);
  // without it every slot stays on offer.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/booking/availability', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { configured?: boolean; busy?: Busy[] } | null) => {
        if (cancelled) return;
        onService?.(Boolean(data?.configured));
        if (data?.busy?.length) setBusy(data.busy);
      })
      .catch(() => {
        if (!cancelled) onService?.(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onService]);

  // Once the taken times arrive, a chosen day that has none left moves on to the next open one.
  useEffect(() => {
    if (now === null || !day || !busy.length || openOn(day, now, busy).length) return;
    for (let i = 1; i <= booking.horizon; i++) {
      const candidate = localDay(new Date(day.getTime() + i * 86_400_000 + 3_600_000));
      if (openOn(candidate, now, busy).length) {
        setDay(candidate);
        setMonth(new Date(candidate.getFullYear(), candidate.getMonth(), 1));
        return;
      }
    }
  }, [busy, day, now, openOn]);

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
        const open = date <= last && openOn(date, now, busy).length > 0;
        return { date, open };
      }),
    ];
  }, [busy, month, now, openOn]);

  const times = day && now !== null ? openOn(day, now, busy) : [];
  const today = now !== null ? localDay(new Date(now)) : null;
  const thisMonth = today ? new Date(today.getFullYear(), today.getMonth(), 1) : null;
  const lastMonth = now !== null ? (() => { const last = new Date(now + booking.horizon * 86_400_000); return new Date(last.getFullYear(), last.getMonth(), 1); })() : null;

  /** Without the booking service the request is written out in the visitor's own email app, as before. */
  const byEmail = (form: FormData, at: Date) => {
    const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(at);
    const studio = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(at);
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
    onService?.(false);
    setStep('sent');
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!slot || sending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          start: slot.toISOString(),
          name: form.get('name'),
          email,
          notes: form.get('notes') ?? '',
          zone,
          company: form.get('company') ?? '',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; meet?: string | null };
      if (response.ok) {
        setBooked({ start: slot, email, meet: data.meet ?? null });
        setStep('booked');
      } else if (response.status === 409 || response.status === 422) {
        // Taken a moment ago: strike it out and send the visitor back to the times.
        setBusy((list) => [...list, { start: slot.getTime(), end: slot.getTime() + MEETING }]);
        setError(booking.errors.taken);
        setStep('pick');
      } else if (response.status === 400) setError(booking.errors.invalid);
      else if (response.status === 429) setError(booking.errors.limited);
      else byEmail(form, slot);
    } catch {
      byEmail(form, slot);
    } finally {
      setSending(false);
    }
  };

  const downloadIcs = () => {
    if (!booked) return;
    const url = URL.createObjectURL(new Blob([icsFor(booked)], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atlas-studio-meeting.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const again = () => {
    setStep('pick');
    setBooked(null);
    setError(null);
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
        <MeetingDetails zone={zone} />

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
                {error && (
                  <p role="alert" className="mb-4 rounded-[8px] border border-sky/30 bg-sky/10 px-3 py-2.5 text-[0.85rem] leading-[1.5] text-paper-soft/90">
                    {error}
                  </p>
                )}
                <ul className="-mr-2 flex flex-col gap-2.5 overflow-y-auto pr-2">
                  {times.map((time) => (
                    <li key={time.getTime()}>
                      <button
                        type="button"
                        onClick={() => {
                          setSlot(time);
                          setError(null);
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
                  {/* Left empty by people; bots fill it in and are quietly turned away. */}
                  <input
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden
                    className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0"
                  />
                  {error && (
                    <p role="alert" className="rounded-[8px] border border-sky/30 bg-sky/10 px-3 py-2.5 text-[0.85rem] leading-[1.5] text-paper-soft/90">
                      {error}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-4">
                    <button type="button" onClick={() => setStep('pick')} className="glass-button is-outlined" disabled={sending}>
                      <span>{booking.form.back}</span>
                    </button>
                    <button type="submit" className="glow-button" disabled={sending} aria-busy={sending}>
                      <span className="glow-button-label">
                        {sending && (
                          <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5 animate-spin">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
                            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        )}
                        {sending ? booking.form.sending : booking.form.send}
                      </span>
                      <span className="glow-button-bg" aria-hidden />
                    </button>
                  </div>
                </form>
              ) : step === 'booked' && booked ? (
                <div className="flex max-w-[440px] flex-col items-start gap-4" role="status">
                  <span className="grid size-12 place-items-center rounded-full bg-brand shadow-[0_0_40px_rgb(9_92_251_/_0.55)]" aria-hidden>
                    <svg viewBox="0 0 20 20" fill="none" className="size-5">
                      <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <p className="text-[1.6rem] leading-tight font-semibold">{booking.booked.title}</p>
                  <p className="text-[1.05rem] font-semibold text-paper-soft/90">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(booked.start)} · {timeFormat.format(booked.start)}
                    <span className="font-normal text-paper-soft/55"> · {booking.duration}</span>
                  </p>
                  <p className="text-[0.95rem] leading-[1.6] text-paper-soft/70">
                    {booking.booked.body} <span className="font-semibold text-paper-soft">{booked.email}</span>.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {booked.meet && (
                      <a href={booked.meet} target="_blank" rel="noreferrer" className="glass-button">
                        <span>{booking.booked.join}</span>
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-[14px]">
                          <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    )}
                    <button type="button" onClick={downloadIcs} className="glass-button is-outlined">
                      <span>{booking.booked.ics}</span>
                      <svg viewBox="0 0 12 14" fill="none" aria-hidden className="w-3">
                        <path d="M9.5 4.8 5.55 8.75 1.6 4.8M5.55.55v7.87M.55 12.9h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <button type="button" onClick={again} className="mt-1 text-[0.85rem] font-semibold text-paper-soft/60 underline-offset-4 transition hover:text-paper-soft hover:underline">
                    {booking.booked.again}
                  </button>
                </div>
              ) : (
                <div className="flex max-w-[420px] flex-col items-start gap-4">
                  <p className="text-[1.4rem] leading-tight font-semibold">{booking.sent.title}</p>
                  <p className="text-[0.95rem] leading-[1.6] text-paper-soft/70">{booking.sent.body}</p>
                  <button type="button" onClick={again} className="glass-button is-outlined mt-2">
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
