'use client';

import { useEffect, useRef, useState } from 'react';
import { isNavigating, settleOn } from '@/lib/scroll';

/**
 * Cues a section's reveal: true once `amount` of the element is on screen,
 * false again only after it has left the screen entirely — so the reveal
 * replays on the next visit without anything vanishing in view.
 */
export function useReveal<T extends Element>(amount = 0.4) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= amount) setShown(true);
        else if (!entry.isIntersecting) setShown(false);
      },
      { threshold: [0, amount] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [amount]);

  return [ref, shown] as const;
}

/**
 * For a full-screen section whose words reveal over `hold` ms: scrolling down
 * into it, the page glides it flush with the top and holds there until every
 * line has landed, and only then moves on. It plays again once the visitor
 * has gone back up above it; coming back down onto it from below, it simply
 * stays revealed.
 */
export function useHeldReveal<T extends HTMLElement>(hold: number) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastY = window.scrollY;
    let revealed = false;
    let free: (() => void) | null = null;

    const check = () => {
      const y = window.scrollY;
      const down = y > lastY;
      lastY = y;
      const box = section.getBoundingClientRect();
      const vh = window.innerHeight;
      if (revealed) {
        if (box.top >= vh) {
          revealed = false;
          setShown(false);
        }
        return;
      }
      // Its top has risen past the middle of the screen: reveal, and hold if arriving from above.
      if (box.top < vh * 0.55 && box.bottom > vh * 0.5) {
        revealed = true;
        setShown(true);
        if (down && box.top > 2 && !still && !isNavigating()) free = settleOn(section, hold);
      }
    };

    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => {
      window.removeEventListener('scroll', check);
      free?.();
    };
  }, [hold]);

  return [ref, shown] as const;
}
