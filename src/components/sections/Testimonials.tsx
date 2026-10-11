'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { testimonials } from '@/content/site';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';
import { FocusText } from '@/components/ui/FocusText';

/** Studio Mirage's card colours, one per card in turn. */
const COLORS = ['#2DA7F9', '#52F92D', '#3E2DF9'];
/** How many cards show behind the front one, and how much each step back shrinks and fades. */
const DEPTH = 8;
const SHRINK = 0.07;
const FADE = 0.12;
/** A change waits out the last shuffle (ms). */
const SHUFFLE = 400;
/** Swipes shorter than this are taps (px). */
const SWIPE = 40;

/**
 * What clients say, after Studio Mirage's testimonials: a deck of glass cards,
 * the active one in front and the rest stepping back and up behind it, each lit
 * from its top edge in its own colour. Dots, arrow keys and swipes shuffle the
 * deck; only the front card shows its words. On arrival the deck builds from
 * the back and the quote focuses in like the landing statement.
 */
export function Testimonials() {
  const cards = testimonials.cards;
  const count = cards.length;
  const [active, setActive] = useState(0);
  const current = useRef(0);
  const busy = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [ref, shown] = useReveal<HTMLDivElement>(0.35);
  // The deck's first arrival is slower than a shuffle; afterwards it moves at Mirage's pace.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!shown) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), 1700);
    return () => window.clearTimeout(timer);
  }, [shown]);

  const go = useCallback((index: number) => {
    if (busy.current || index === current.current) return;
    busy.current = true;
    current.current = index;
    setActive(index);
    window.setTimeout(() => {
      busy.current = false;
    }, SHUFFLE);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || count < 2) return;
    const step = (by: number) => go((current.current + by + count) % count);
    const onKey = (event: KeyboardEvent) => {
      if (!section.contains(document.activeElement)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
    };
    let startX = 0;
    let startY = 0;
    const onStart = (event: TouchEvent) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const onEnd = (event: TouchEvent) => {
      const dx = event.changedTouches[0].clientX - startX;
      const dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < SWIPE) return;
      step(dx < 0 ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    section.addEventListener('touchstart', onStart, { passive: true });
    section.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      section.removeEventListener('touchstart', onStart);
      section.removeEventListener('touchend', onEnd);
    };
  }, [count, go]);

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      data-nav-tone="dark"
      aria-label={testimonials.label}
      className="screen-block relative z-10 justify-center"
    >
      <motion.div
        ref={ref}
        className="flex w-full flex-col items-center"
        initial="hidden"
        animate={shown ? 'shown' : 'hidden'}
      >
        <div className="testimonials-track">
          {cards.map((card, i) => {
            // Steps behind the front card, counting round the deck.
            const back = (((i - active) % count) + count) % count;
            const depth = Math.min(back, DEPTH + 1);
            const style = {
              '--card-color': COLORS[i % COLORS.length],
              '--card-y': shown ? `${depth * -20}px` : '60px',
              '--card-s': shown ? 1 - depth * SHRINK : 0.94,
              '--card-o': shown && back <= DEPTH ? 1 - back * FADE : 0,
              '--card-z': count - back,
              ...(!settled && {
                transitionDuration: '1.2s',
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                transitionDelay: shown ? `${0.1 + (count - 1 - back) * 0.12}s` : '0s',
              }),
            } as CSSProperties;
            return (
              <article
                key={i}
                className={cn('testimonial-card', i === active && 'is-active')}
                style={style}
                aria-hidden={i !== active}
              >
                <div aria-hidden>
                  <svg viewBox="0 0 30 21" className="h-[21px] w-[30px]" fill="#fff">
                    <path d="M11.8.6C6.2 2.4.4 7.6.1 14.6A6 6 0 0 0 12 15a6 6 0 0 0-5.4-5.9c-.2-2.7 1.8-5.2 6.3-6.9ZM28.8.6c-5.6 1.8-11.4 7-11.7 14A6 6 0 0 0 29 15a6 6 0 0 0-5.4-5.9c-.2-2.7 1.8-5.2 6.3-6.9Z" />
                  </svg>
                </div>
                <blockquote className="testimonial-text font-studio">
                  <FocusText text={card.quote} delay={0.55} step={Math.min(0.02, 1.1 / card.quote.length)} />
                </blockquote>
                <footer className="testimonial-author font-studio">
                  <div className="testimonial-avatar" aria-hidden>
                    {card.initials}
                  </div>
                  <div className="testimonial-identity">
                    <span className="testimonial-name">{card.name}</span>
                    <span className="testimonial-role">{card.role}</span>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>

        {count > 1 && (
          <nav className="testimonial-dots" aria-label="Testimonial navigation">
            {cards.map((_, i) => (
              <button
                key={i}
                type="button"
                className={cn('testimonial-dot', i === active && 'is-active')}
                aria-label={`Go to testimonial ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </nav>
        )}
      </motion.div>
    </section>
  );
}
