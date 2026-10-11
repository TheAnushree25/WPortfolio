'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { motion, type Variants } from 'motion/react';
import { partners } from '@/content/site';
import { ease } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { FocusText } from '@/components/ui/FocusText';

/** Each mark sharpens out of a blur, in a wave running down and across the grid. */
const logoIn: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.94, filter: 'blur(12px)', transition: { duration: 0.35, ease: ease.appear } },
  shown: (wave: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 1.1, ease: ease.expo, delay: 0.35 + wave * 0.08 },
    transitionEnd: { filter: 'none' },
  }),
};

/**
 * "They trust us", after Studio Mirage's partner grid: a full-bleed lattice of
 * hairlines with the studio's client marks at 55%, a frosted cell and a full
 * mark under the pointer, and a light that runs along the lines around it.
 * The title focuses in like the landing statement and the marks follow.
 */
export function Partners() {
  const [ref, shown] = useReveal<HTMLDivElement>(0.3);
  const gridRef = useRef<HTMLDivElement>(null);

  // The light follows the pointer in 8px steps, so the masked gradient repaints sparingly.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let frame = 0;
    let x = -9999;
    let y = -9999;
    const paint = () => {
      frame = 0;
      const box = grid.getBoundingClientRect();
      grid.style.setProperty('--mx', `${Math.round((x - box.left) / 8) * 8}px`);
      grid.style.setProperty('--my', `${Math.round((y - box.top) / 8) * 8}px`);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') grid.style.setProperty('--glow-on', '0.8');
    };
    const leave = () => grid.style.setProperty('--glow-on', '0');
    grid.addEventListener('pointermove', move, { passive: true });
    grid.addEventListener('pointerenter', enter);
    grid.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerenter', enter);
      grid.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <section id="clients" data-nav-tone="dark" className="relative z-10 py-28">
      <motion.div
        ref={ref}
        className="flex min-h-[calc(100svh-14rem)] flex-col items-center justify-center gap-[max(3vw,2.5rem)]"
        initial="hidden"
        animate={shown ? 'shown' : 'hidden'}
      >
        <FocusText
          as="h2"
          text={partners.title}
          delay={0.1}
          step={0.04}
          className="font-studio px-6 text-center text-[1.6rem] leading-[1.2] font-normal text-paper-soft/95 min-[481px]:text-[1.8rem] md:text-[2.06rem]"
        />

        <div ref={gridRef} className="partners-grid">
          <ul>
            {partners.logos.map((logo, i) => (
              <li key={logo.name}>
                <motion.span className="partners-logo" custom={(i % 5) + Math.floor(i / 5)} variants={logoIn}>
                  <Image src={logo.src} alt={logo.name} width={logo.width} height={logo.height} sizes="200px" />
                </motion.span>
              </li>
            ))}
          </ul>
          <div className="partners-glow" aria-hidden />
        </div>
      </motion.div>
    </section>
  );
}
