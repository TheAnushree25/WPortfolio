'use client';

import { useEffect, useRef } from 'react';
import { nextPage } from '@/content/site';
import { teaserHover } from '@/lib/footage';

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
/** Mirage eases both the call to action and the eye 15% of the way each frame. */
const EASE = 0.15;

/**
 * The foot of the page, after Studio Mirage's next-page teaser: a white sheet
 * torn along its top edge. Hovering it, "You are one click away" follows the
 * pointer in place of the cursor dot, a gradient line wakes along the bottom,
 * and the footer above hands its stage to the reel's turning carousel; the eye
 * watches the pointer wherever it is and blinks now and then. The whole sheet
 * is the link.
 */
export function NextPage() {
  const zoneRef = useRef<HTMLAnchorElement>(null);
  const ctaRef = useRef<HTMLSpanElement>(null);
  const irisRef = useRef<HTMLSpanElement>(null);
  const eyeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const zone = zoneRef.current;
    const cta = ctaRef.current;
    const iris = irisRef.current;
    const eye = eyeRef.current;
    if (!zone || !cta || !iris || !eye) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let visible = false;
    let hovering = false;
    let frame = 0;
    let pointerX = -1e4;
    let pointerY = -1e4;
    const follow = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };

    const tick = () => {
      frame = 0;
      // The call to action heads for the pointer while it's over the sheet, and home after.
      const box = cta.getBoundingClientRect();
      const toX = hovering ? pointerX - (box.left + box.width / 2 - follow.x) : 0;
      const toY = hovering ? pointerY - (box.top + box.height / 2 - follow.y) : 0;
      follow.x += (toX - follow.x) * EASE;
      follow.y += (toY - follow.y) * EASE;
      cta.style.transform = `translate(${follow.x}px, ${follow.y}px)`;
      // The iris turns toward the pointer, kept inside the eye.
      const socket = iris.getBoundingClientRect();
      const lookX = clamp(pointerX - (socket.left + socket.width / 2), socket.width / 2 - 4);
      const lookY = clamp(pointerY - (socket.top + socket.height / 2), socket.height / 2 - 4);
      look.x += (lookX - look.x) * EASE;
      look.y += (lookY - look.y) * EASE;
      iris.style.setProperty('--look-x', `${look.x}px`);
      iris.style.setProperty('--look-y', `${look.y}px`);
      const moving =
        Math.abs(toX - follow.x) > 0.1 || Math.abs(toY - follow.y) > 0.1 || Math.abs(lookX - look.x) > 0.05 || Math.abs(lookY - look.y) > 0.05;
      if (visible && moving) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame && visible && !still) frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      wake();
    };
    const onEnter = (event: PointerEvent) => {
      hovering = event.pointerType !== 'touch';
      teaserHover.set(hovering);
      wake();
    };
    const onLeave = () => {
      hovering = false;
      teaserHover.set(false);
      wake();
    };

    // A blink every two to six seconds: the lid closes and opens in 90ms each way.
    let blinkTimer = 0;
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        eye.style.setProperty('--lid', '0.05');
        blinkTimer = window.setTimeout(() => {
          eye.style.setProperty('--lid', '1');
          schedule();
        }, 90);
      }, 2000 + Math.random() * 4000);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      window.clearTimeout(blinkTimer);
      if (visible && !still) {
        schedule();
        wake();
      }
    });
    observer.observe(zone);
    window.addEventListener('pointermove', onMove, { passive: true });
    zone.addEventListener('pointerenter', onEnter);
    zone.addEventListener('pointerleave', onLeave);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(blinkTimer);
      window.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerenter', onEnter);
      zone.removeEventListener('pointerleave', onLeave);
      teaserHover.set(false);
    };
  }, []);

  return (
    <section className="next-page relative z-10" aria-label={nextPage.overline}>
      <a
        ref={zoneRef}
        href={nextPage.href}
        aria-label={`${nextPage.label}: ${nextPage.title}`}
        data-cursor="hide"
        className="next-page-zone font-studio"
      >
        <span className="block">
          <span className="next-page-overline">{nextPage.overline}</span>
          <span className="next-page-title block">{nextPage.title}</span>
        </span>
        <span className="next-page-cta">
          <span ref={ctaRef}>{nextPage.cta}</span>
          <span className="blinky" aria-hidden>
            <span ref={irisRef} className="blinky-iris" />
            <span ref={eyeRef} className="blinky-eye" />
          </span>
        </span>
        <span className="next-page-line" aria-hidden />
      </a>
    </section>
  );
}
