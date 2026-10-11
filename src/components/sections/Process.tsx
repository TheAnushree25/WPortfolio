'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import { method } from '@/content/site';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const STEPS = method.steps.length;
/** Scroll per card, in screen heights — Studio Mirage's pin runs 0.8 of a screen for each. */
const PER_CARD = 0.8;
/** How far past halfway a card must travel before it takes over, so the highlight never flickers. */
const HYSTERESIS = 0.06;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** GSAP's power2.inOut, the ease of the nudge each card gives the one beneath it. */
const nudge = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Each card's corner light: hues spaced evenly round the wheel, as on Mirage. */
const hue = (index: number) => `hsl(${Math.round((10 + (360 / STEPS) * index) % 360)} 58% 64%)`;

/**
 * How a project runs, after Studio Mirage's timeline. The section pins while
 * the cards play out: the first stands alone, the rest wait fanned in a deck
 * on the right, and with each stretch of scroll the next card slides across
 * onto the stack, nudging the one beneath it aside, and becomes the lit glass
 * card. A plus on the line above rides with every card and brightens once it
 * has arrived.
 */
export function Process() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLOListElement>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  const layout = useRef({ full: 0, peek: 0, push: 0, current: 0 });
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });

  const place = useCallback((progress: number) => {
    const state = layout.current;
    const { full, peek, push } = state;
    if (!full) return;
    const at = progress * (STEPS - 1);
    if (at > state.current + 0.5 + HYSTERESIS || at < state.current - 0.5 - HYSTERESIS) {
      state.current = Math.min(STEPS - 1, Math.max(0, Math.round(at)));
    }
    for (let k = 0; k < STEPS; k++) {
      // In the deck a card sits one full width further right; it slides home
      // during the stretch before its own, then gives way to the next.
      const home = k * peek;
      const arrived = k === 0 ? home : home + (full - peek) * (1 - clamp01(at - (k - 1)));
      const x = arrived - (k < STEPS - 1 ? push * nudge(clamp01(at - k)) : 0);
      const card = cards.current[k];
      const mark = marks.current[k];
      if (card) card.style.transform = `translate3d(${x}px, 0, 0)`;
      if (mark) mark.style.transform = `translate3d(${x + peek / 2}px, 0, 0)`;
    }
    setActive(state.current);
  }, []);

  useMotionValueEvent(scrollYProgress, 'change', place);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const measure = () => {
      const first = cards.current[0];
      if (!first) return;
      const narrow = window.innerWidth <= 768;
      const full = first.offsetWidth + (narrow ? 20 : 100);
      const peek = Math.min(full, Math.max(narrow ? 16 : 64, (stack.clientWidth - full) / (STEPS - 1)));
      layout.current = { ...layout.current, full, peek, push: narrow ? 12 : 48 };
      stack.style.setProperty('--peek', `${peek}px`);
      place(scrollYProgress.get());
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    return () => observer.disconnect();
  }, [place, scrollYProgress]);

  return (
    <section
      id="process"
      data-nav-tone="dark"
      aria-labelledby="process-title"
      className="relative z-10"
      style={{ paddingBottom: 'max(10vw, 8rem)' }}
    >
      <h2 id="process-title" className="sr-only">
        {method.title}
      </h2>

      <div ref={trackRef} style={{ height: `calc(100svh + ${(STEPS - 1) * PER_CARD * 100}svh)` }}>
        <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden pt-24 pb-8">
          <div className="mb-8 w-full px-4 md:mb-16 md:px-20">
            <div className="relative h-px w-full">
              <motion.span
                aria-hidden
                className="absolute inset-0 origin-left bg-white/15"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.8, ease: ease.expo }}
              />
              {method.steps.map((step, k) => (
                <span
                  key={step.title}
                  ref={(element) => {
                    marks.current[k] = element;
                  }}
                  aria-hidden
                  className="absolute top-1/2 left-0 will-change-transform"
                >
                  <span className={cn('process-mark', k <= active && 'is-active')} />
                </span>
              ))}
            </div>
          </div>

          <div className="w-full px-4 md:px-20">
            <ol ref={stackRef} className="process-stack relative w-full">
              {method.steps.map((step, k) => (
                <li
                  key={step.title}
                  ref={(element) => {
                    cards.current[k] = element;
                  }}
                  className="absolute top-0 left-0 will-change-transform"
                >
                  <motion.article
                    className={cn('process-card', k === active && 'is-active')}
                    style={{ '--card-color': hue(k) } as CSSProperties}
                    aria-current={k === active ? 'step' : undefined}
                    initial={{ opacity: 0, y: 70 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 1.2, ease: ease.expo, delay: 0.1 + k * 0.08 }}
                  >
                    <div className="process-card-content font-studio">
                      <div>
                        <span className="process-card-number">{String(k + 1).padStart(2, '0')}</span>
                        <h3>{step.title}</h3>
                      </div>
                      <p className="font-medium">{step.text}</p>
                    </div>
                  </motion.article>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
