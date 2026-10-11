'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { footer, nextPage } from '@/content/site';
import { download } from '@/lib/download';
import { kickFinale, provideFinale, useFinaleDrawn, type FinaleLight } from '@/lib/finale';
import { provideFootage, teaserHover, useFlag } from '@/lib/footage';
import { ease } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { lockScroll } from '@/lib/scroll';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/ui/GlassButton';
import { WORDMARK_BOX, WORDMARK_LETTERS } from '@/components/hero/geometry';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** How long the light takes to sweep across the formed word (ms). */
const SWEEP = 2200;
/** The globe sits a little back behind the footer, a little further while the carousel plays. */
const GLOBE_FADE = 0.82;
const GLOBE_FADE_HOVER = 0.6;

/** The footer's columns rise out of a blur one after another. */
const rise: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(8px)', transition: { duration: 0.3 } },
  shown: (order: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 1.1, ease: ease.expo, delay: 0.1 + order * 0.12 },
    transitionEnd: { filter: 'none' },
  }),
};

/**
 * The close of the page, after Studio Mirage's footer: in place of their giant
 * logo, “Atlas” gathers out of blown sand as it rises into view — drawn by the
 * page background, so the cursor can scatter it again. Beneath it a planet of
 * light comes up over the horizon, its latitudes and longitudes drawing out
 * from the pole, city lights and travellers' arcs crossing it as it turns.
 * Over it, Mirage's footer: where the studio works, the ways to start a
 * project, the links between hairlines and the credits. While the next-page
 * sheet is hovered, the footer steps aside for the reel's turning carousel.
 */
export function Finale() {
  const rootRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const drawn = useFinaleDrawn();
  const hover = useFlag(teaserHover);
  const reduce = useReducedMotion();
  const [bodyRef, shown] = useReveal<HTMLDivElement>(0.2);
  const [legal, setLegal] = useState(false);

  // Hand the background a way to measure the scene each frame while it's near the screen.
  useEffect(() => {
    const root = rootRef.current;
    const mark = markRef.current;
    const anchor = globeRef.current;
    if (!root || !mark || !anchor) return;
    let form = 0;
    let fade = GLOBE_FADE;
    let last = 0;
    let sweepAt = -Infinity;
    let armed = true;

    const measure = (now: number): FinaleLight => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const box = mark.getBoundingClientRect();
      const base = anchor.getBoundingClientRect();
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1;
      last = now;
      // The sand gathers as the word rises through the lower part of the screen,
      // easing toward where the scroll says it should be.
      const target = smooth(clamp01((vh - box.top) / (vh * 0.62)));
      form = reduce ? target : form + (target - form) * Math.min(1, dt * 3.2);
      if (armed && form > 0.985) {
        armed = false;
        sweepAt = now;
      }
      if (form < 0.5) armed = true;
      const t = (now - sweepAt) / SWEEP;
      const sweep = !reduce && t >= 0 && t <= 1 ? -0.4 + t * 1.8 : -1;
      fade += ((teaserHover.get() ? GLOBE_FADE_HOVER : GLOBE_FADE) - fade) * Math.min(1, dt * 4);
      // The globe draws and rises as its horizon comes up the screen after the word.
      const draw = reduce ? 1 : clamp01((vh * 0.95 - base.top) / (vh * 0.55));
      const settle = 1 - smooth(draw);
      const r = Math.min(1400, Math.max(0.54 * vw, 0.56 * vh));
      return {
        mark: { x: box.left, y: box.top, width: box.width, height: box.height, form, sweep },
        globe: {
          x: base.left + base.width / 2,
          y: base.top + r * (1 + 0.3 * settle),
          r,
          tilt: 0.62 - 0.16 * settle,
          draw,
          spin: window.scrollY * 0.00035,
          fade,
        },
      };
    };

    const observer = new IntersectionObserver(([entry]) => provideFinale(entry.isIntersecting ? measure : null), {
      rootMargin: '30% 0px',
    });
    observer.observe(root);
    const onScroll = () => kickFinale();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      provideFinale(null);
    };
  }, [reduce]);

  // The carousel: the light draws it into the stage while the sheet below is hovered.
  useEffect(() => {
    const video = clipRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;
    let fade = 0;
    let last = 0;
    provideFootage('clip', {
      video,
      fade: () => {
        const now = performance.now();
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        fade += ((teaserHover.get() ? 1 : 0) - fade) * Math.min(1, dt * 5);
        return fade;
      },
      place: () => {
        const box = stage.getBoundingClientRect();
        return { x: box.left, y: box.top, width: box.width, height: box.height };
      },
    });
    let pause = 0;
    const unsubscribe = teaserHover.subscribe(() => {
      window.clearTimeout(pause);
      if (teaserHover.get()) video.play().catch(() => {});
      else pause = window.setTimeout(() => video.pause(), 900);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(pause);
      provideFootage('clip', null);
    };
  }, []);

  // Mirage's light along the hairlines: it follows the pointer, masked to the lines.
  useEffect(() => {
    const links = linksRef.current;
    if (!links) return;
    const lines = () => {
      const tops = Array.from(links.querySelectorAll('li')).map((item) => item.offsetTop);
      tops.push(links.offsetHeight - 1);
      links.style.setProperty('--rows-mask', tops.map(() => 'linear-gradient(#000, #000)').join(', '));
      links.style.setProperty('--rows-pos', tops.map((top) => `0 ${top}px`).join(', '));
    };
    const move = (event: PointerEvent) => {
      const box = links.getBoundingClientRect();
      links.style.setProperty('--mx', `${event.clientX - box.left}px`);
      links.style.setProperty('--my', `${event.clientY - box.top}px`);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') links.style.setProperty('--glow-on', '1');
    };
    const leave = () => links.style.setProperty('--glow-on', '0');
    lines();
    const observer = new ResizeObserver(lines);
    observer.observe(links);
    links.addEventListener('pointermove', move, { passive: true });
    links.addEventListener('pointerenter', enter);
    links.addEventListener('pointerleave', leave);
    return () => {
      observer.disconnect();
      links.removeEventListener('pointermove', move);
      links.removeEventListener('pointerenter', enter);
      links.removeEventListener('pointerleave', leave);
    };
  }, []);

  const { contact } = footer;

  return (
    <footer
      ref={rootRef}
      id="contact"
      data-nav-tone="dark"
      aria-labelledby="footer-title"
      className="relative z-10 pt-40 text-paper-soft"
    >
      <h2 id="footer-title" className="sr-only">
        {footer.title}
      </h2>

      {/* The background draws the word into this box; without WebGL it shows here instead. */}
      <div
        ref={markRef}
        aria-hidden
        className="relative mx-auto w-[92.35vw]"
        style={{ aspectRatio: `${WORDMARK_BOX.width} / ${WORDMARK_BOX.height}` }}
      >
        {!drawn && (
          <svg
            viewBox={`${WORDMARK_BOX.x} ${WORDMARK_BOX.y} ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}`}
            className="absolute inset-0 size-full"
          >
            {WORDMARK_LETTERS.map((letter) => (
              <path key={letter.id} d={letter.d} fill="#fff" />
            ))}
          </svg>
        )}
      </div>

      {/* The open sky the globe rises into. */}
      <div ref={globeRef} aria-hidden className="mt-[clamp(2.5rem,6vw,6rem)] h-[clamp(12rem,26vw,24rem)]" />

      <motion.div
        ref={bodyRef}
        initial="hidden"
        animate={shown ? 'shown' : 'hidden'}
        className={cn('font-studio transition-opacity duration-200', hover && 'pointer-events-none opacity-0')}
      >
        <div className="flex justify-between gap-5 px-[var(--pad-sides)] pt-16 pb-20 max-md:flex-col max-md:gap-12">
          <motion.ul custom={0} variants={rise} className="flex flex-wrap gap-8 md:w-1/4">
            {footer.locations.map((location) => (
              <li key={location.place} className="flex-[1_1_40%]">
                <h3 className="text-[1.05rem] font-semibold">{location.place}</h3>
                <span className="text-[0.85rem] opacity-50">{location.detail}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div custom={1} variants={rise} className="flex flex-col justify-between gap-7 leading-[1.3] md:flex-[1_1_25%]">
            <h3 className="text-[1.05rem] font-semibold">{contact.title}</h3>
            <div className="flex flex-wrap gap-5">
              <Link
                href={contact.deck.href}
                onClick={() => download(contact.deck.pdf, contact.deck.file)}
                className="glass-button is-outlined"
              >
                <span>{contact.deck.label}</span>
                <svg viewBox="0 0 12 14" fill="none" aria-hidden className="w-3">
                  <path d="M9.5 4.8 5.55 8.75 1.6 4.8M5.55.55v7.87M.55 12.9h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </Link>
              <a href={contact.line.href} className="glass-button">
                <span>{contact.line.label}</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="w-3.5">
                  <path d="M14.5 1.5 7 9M14.5 1.5 10 14.5 7 9 1.5 6l13-4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </a>
              <Link href={contact.talk.href} className="glow-button">
                <span className="glow-button-label">
                  {contact.talk.label}
                  <svg viewBox="0 0 12 12" aria-hidden className="w-3" fill="currentColor">
                    <path d="M11.34 8.25c-.82 0-1.61-.13-2.35-.37a.65.65 0 0 0-.67.16l-1.05 1.31C5.38 8.45 3.62 6.75 2.67 4.8l1.3-1.1a.68.68 0 0 0 .16-.69A7.4 7.4 0 0 1 3.76.66.66.66 0 0 0 3.1 0H.8C.43 0 0 .16 0 .66 0 6.85 5.15 12 11.34 12c.47 0 .66-.42.66-.79V8.91c0-.36-.3-.66-.66-.66Z" />
                  </svg>
                </span>
                <span className="glow-button-bg" aria-hidden />
              </Link>
            </div>
          </motion.div>

          <motion.nav custom={2} variants={rise} ref={linksRef} className="footer-links" aria-label="Elsewhere">
            <ul>
              {footer.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} {...(link.href.startsWith('http') && { target: '_blank', rel: 'noreferrer' })}>
                    <span>{link.label}</span>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-4 opacity-70">
                      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
            <div className="footer-links-glow" aria-hidden />
          </motion.nav>
        </div>

        <motion.div custom={3} variants={rise} className="footer-credits px-[var(--pad-sides)] pb-20">
          <p className="opacity-50 md:w-1/4">{footer.copyright}</p>
          <div className="flex flex-wrap gap-x-[10vw] gap-y-3 md:flex-1">
            <button
              type="button"
              onClick={() => setLegal(true)}
              className="cursor-pointer opacity-50 transition-opacity duration-200 hover:opacity-100"
            >
              {footer.legal.label}
            </button>
            <a href={`mailto:${footer.email}`}>{footer.email}</a>
          </div>
          <div className="flex md:w-1/5 md:justify-end">
            <a href="#home" className="back-to-top">
              {footer.top}
              <svg viewBox="0 0 12 13" fill="none" aria-hidden>
                <path d="M1.3 6.1 6.3 1.1l5 5M6.3 12.3V1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </a>
          </div>
        </motion.div>
      </motion.div>

      {/* Where the light plays the carousel while the next-page sheet is hovered. */}
      <div
        ref={stageRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-12 mx-auto aspect-[1200/560] w-[min(80vw,1080px)]"
      />
      {/* Kept on the page (one transparent pixel) so the browser keeps decoding it. */}
      <video
        ref={clipRef}
        src={nextPage.clip}
        aria-hidden
        tabIndex={-1}
        muted
        loop
        playsInline
        preload="auto"
        className="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
      />

      <LegalNotice open={legal} onClose={() => setLegal(false)} />
    </footer>
  );
}

/** The legal notice, in a native modal like the project viewer. */
function LegalNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    dialog.showModal();
    const release = lockScroll();
    return () => {
      release();
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="legal-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="font-studio m-auto max-w-[min(90vw,34rem)] rounded-[20px] border border-paper-soft/10 bg-night/80 p-8 text-paper-soft backdrop-blur-xl backdrop:bg-night/70 backdrop:backdrop-blur-md md:p-10"
    >
      <h3 id="legal-title" className="mb-5 text-[1.4rem] font-medium">
        {footer.legal.label}
      </h3>
      <div className="flex flex-col gap-3 text-[0.95rem] leading-[1.6] text-paper-soft/75">
        {footer.legal.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <GlassButton className="mt-8" onClick={onClose}>
        {footer.legal.close}
      </GlassButton>
    </dialog>
  );
}
