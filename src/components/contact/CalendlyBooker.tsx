'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { booking } from '@/content/site';
import { ease } from '@/lib/motion';
import { MeetingDetails } from './MeetingDetails';

type InlineWidget = {
  url: string;
  parentElement: HTMLElement;
  prefill?: { name?: string; email?: string; customAnswers?: Record<string, string> };
  /** Calendly sets the parent's height to each page it shows, so the frame never scrolls inside. */
  resize?: boolean;
};

declare global {
  interface Window {
    Calendly?: { initInlineWidget: (options: InlineWidget) => void };
  }
}

type Details = { name: string; email: string; notes: string };
type Step = 'details' | 'time' | 'booked';

const WIDGET_SCRIPT = 'https://assets.calendly.com/assets/external/widget.js';
const CALENDLY = 'https://calendly.com';

/** Calendly's widget script, fetched once however many times the page is opened. */
let loading: Promise<void> | null = null;
function loadCalendly() {
  if (window.Calendly) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null; // the next visit tries again
      script.remove();
      reject(new Error('Calendly did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * The visitor's answers, keyed the way Calendly numbers its invitee questions:
 * a1 fills the event's first question, so "Anything we should know?" must stay
 * first on the Calendly event.
 */
const answers = ({ notes }: Details): Record<string, string> => (notes ? { a1: notes } : {});

/** The event's own page with the visitor's details on it, for when the calendar can't load here. */
function prefilled(url: string, details: Details) {
  const link = new URL(url);
  link.searchParams.set('name', details.name);
  link.searchParams.set('email', details.email);
  for (const [key, value] of Object.entries(answers(details))) link.searchParams.set(key, value);
  return link.toString();
}

/** Calendly reports what happens in its frame by message; anything from elsewhere is ignored. */
const fromCalendly = (event: MessageEvent, name: string) => event.origin === CALENDLY && event.data?.event === name;

/**
 * Calendly's calendar, inline, with the visitor's details handed over so its
 * form arrives filled in. Calendly owns the open times, the booking (one per
 * slot) and every email. The event's own summary is hidden, since the panel
 * beside it shows the same; the studio's colours apply on Calendly's paid plans.
 */
function CalendlyFrame({ url, details }: { url: string; details: Details }) {
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const parent = frame.current;
    if (!parent) return;
    const link = new URL(url);
    link.searchParams.set('hide_event_type_details', '1');
    // The studio's ink, paper and electric blue (globals.css).
    link.searchParams.set('background_color', '020923');
    link.searchParams.set('text_color', 'f4f7ff');
    link.searchParams.set('primary_color', '095cfb');

    let active = true;
    const ready = () => {
      if (active) setState('ready');
    };
    const shown = (event: MessageEvent) => {
      if (fromCalendly(event, 'calendly.event_type_viewed')) ready();
    };
    window.addEventListener('message', shown);
    loadCalendly()
      .then(() => {
        if (!active) return;
        window.Calendly?.initInlineWidget({
          url: link.toString(),
          parentElement: parent,
          prefill: { name: details.name, email: details.email, customAnswers: answers(details) },
          resize: true,
        });
        parent.querySelector('iframe')?.addEventListener('load', ready);
      })
      .catch(() => {
        if (active) setState('failed');
      });
    // Calendly appends a new frame on every call, and React runs effects twice in development.
    return () => {
      active = false;
      window.removeEventListener('message', shown);
      parent.replaceChildren();
    };
  }, [url, details]);

  if (state === 'failed') {
    return (
      <p className="max-w-[420px] text-center text-[1rem] leading-[1.6] text-paper-soft/80">
        {booking.calendly.failed}{' '}
        <a href={prefilled(url, details)} target="_blank" rel="noopener" className="font-semibold text-paper-soft underline underline-offset-4">
          {booking.calendly.open}
        </a>{' '}
        {booking.calendly.or}{' '}
        <a href={`mailto:${booking.email}`} className="font-semibold text-paper-soft underline underline-offset-4">
          {booking.calendly.write}
        </a>
        .
      </p>
    );
  }

  // The cursor dot can't follow the pointer into Calendly's frame, so the padding hides it at the edge.
  return (
    <div data-cursor="hide" className="relative w-full p-2">
      {state === 'loading' && (
        <p className="absolute inset-0 grid place-items-center text-[0.95rem] text-paper-soft/60" aria-live="polite">
          {booking.calendly.loading}
        </p>
      )}
      {/* 700px until Calendly reports its page's height. */}
      <div ref={frame} className="relative h-[700px] w-full" />
    </div>
  );
}

const field =
  'rounded-[8px] border border-paper-soft/15 bg-paper-soft/5 px-3 text-[0.95rem] text-paper-soft outline-none focus:border-paper-soft/50';
const label = 'flex flex-col gap-2 text-[0.85rem] font-medium text-paper-soft/70';

/**
 * The booking page with Calendly behind it: the visitor's details first, in the
 * studio's own form, then Calendly's calendar with those details already in its
 * form, so nothing is typed twice. Picking a time and pressing Schedule books
 * it: Calendly puts the meeting on the studio's Google Calendar with a Meet
 * link, sends the visitor the invitation and the studio their answers.
 */
export function CalendlyBooker({ url }: { url: string }) {
  const [step, setStep] = useState<Step>('details');
  const [details, setDetails] = useState<Details | null>(null);
  const [zone, setZone] = useState('');

  // The visitor's zone is only known in the browser; some still report India's by its old name.
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone.replace('Asia/Calcutta', 'Asia/Kolkata'));
  }, []);

  // Calendly says when the visitor has booked; its frame then shows the confirmation.
  useEffect(() => {
    const scheduled = (event: MessageEvent) => {
      if (fromCalendly(event, 'calendly.event_scheduled')) setStep('booked');
    };
    window.addEventListener('message', scheduled);
    return () => window.removeEventListener('message', scheduled);
  }, []);

  const next = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    setDetails({ name: text('name').replace(/\s+/g, ' '), email: text('email'), notes: text('notes') });
    setStep('time');
  };

  return (
    <motion.div
      className="font-studio w-full max-w-[1300px] overflow-hidden rounded-[14px] border border-paper-soft/10 bg-[rgb(2_9_35_/_0.55)] text-paper-soft backdrop-blur-xl"
      initial={{ opacity: 0, y: 40, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1.1, ease: ease.expo, delay: 0.15 }}
    >
      <div className="grid min-h-[612px] lg:grid-cols-[minmax(260px,350px)_1fr]">
        <MeetingDetails zone={zone}>
          {details && step !== 'details' && (
            <div className="mt-8 border-t border-paper-soft/10 pt-6">
              <p className="text-[0.75rem] font-semibold tracking-[0.1em] text-paper-soft/50 uppercase">{booking.calendly.as}</p>
              <p className="mt-2 text-[0.95rem] font-semibold">{details.name}</p>
              <p className="text-[0.9rem] break-all text-paper-soft/70">{details.email}</p>
              {step === 'booked' ? (
                <p role="status" className="mt-5 text-[0.9rem] leading-[1.6] text-paper-soft/80">
                  <span className="font-semibold text-paper-soft">{booking.booked.title}.</span> {booking.booked.body} {details.email}.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="mt-4 text-[0.85rem] font-semibold text-paper-soft/60 underline-offset-4 transition hover:text-paper-soft hover:underline"
                >
                  {booking.calendly.edit}
                </button>
              )}
            </div>
          )}
        </MeetingDetails>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'details' || !details ? (
            <motion.div
              key="details"
              className="flex items-center justify-center p-7"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: ease.expo }}
            >
              <form onSubmit={next} className="flex w-full max-w-[460px] flex-col gap-4">
                <p className="mb-2 text-[1.05rem] font-semibold">{booking.calendly.intro}</p>
                <label className={label}>
                  {booking.form.name}
                  <input name="name" required maxLength={120} autoComplete="name" defaultValue={details?.name} className={`h-11 ${field}`} />
                </label>
                <label className={label}>
                  {booking.form.email}
                  <input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={details?.email} className={`h-11 ${field}`} />
                </label>
                <label className={label}>
                  {booking.form.notes}
                  <textarea name="notes" rows={3} maxLength={2000} defaultValue={details?.notes} className={`py-2.5 ${field}`} />
                </label>
                <div className="mt-3 flex justify-end">
                  <button type="submit" className="glow-button">
                    <span className="glow-button-label">{booking.form.next}</span>
                    <span className="glow-button-bg" aria-hidden />
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="calendly"
              className="flex items-center justify-center p-3 lg:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <CalendlyFrame url={url} details={details} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
