'use client';

import Image from 'next/image';
import { useMotionValue, useTransform } from 'motion/react';
import * as motion from 'motion/react-client';
import { hero, images, site } from '@/content/site';
import { ease } from '@/lib/motion';
import { useSceneMotion } from '@/components/layout/CoverScene';
import { Grain } from '@/components/ui/Grain';
import { ProgressiveBlur } from '@/components/ui/ProgressiveBlur';

/** Panels retract from the centre line outward, column by column. */
const COLUMNS = 5;
const REVEAL_DELAY = 2.0;

export function Hero() {
  const scene = useSceneMotion();
  const fallback = useMotionValue(0);
  const cover = scene?.cover ?? fallback;

  // The blurred plate travels further than the sharp frame, so the two
  // separate as the light section slides over the hero.
  const blurY = useTransform(cover, [0, 1], ['0%', '22%']);
  const imageY = useTransform(cover, [0, 1], ['0%', '10%']);
  const imageScale = useTransform(cover, [0, 1], [1, 1.08]);
  const contentY = useTransform(cover, [0, 1], [0, -90]);
  const contentOpacity = useTransform(cover, [0, 0.7], [1, 0]);

  return (
    <section id="home" className="relative flex h-full min-h-[640px] w-full items-end overflow-hidden bg-ink">
      {/* Blurred plate — sits under the sharp frame and travels further. */}
      <motion.div className="absolute inset-[-6%] blur-[5px]" style={{ y: blurY, scale: 1.08 }} aria-hidden>
        <Image src={images.hero} alt="" fill sizes="100vw" className="object-cover object-center" />
      </motion.div>

      {/* Sharp artwork */}
      <motion.div className="absolute inset-0" style={{ y: imageY, scale: imageScale }}>
        <Image
          src={images.hero}
          alt="Portrait of the designer wearing wraparound sunglasses"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </motion.div>

      {/* Dark wash + grain */}
      <div className="absolute inset-0 bg-ink/80" />
      <Grain opacity={0.3} />

      {/* 7px brand rule pinned to the very top edge */}
      <span className="absolute inset-x-0 top-0 z-30 h-[7px] bg-brand" />

      <ProgressiveBlur height={180} side="top" />

      {/* Intro reveal: two rows of orange panels collapsing away from the seam */}
      <div className="pointer-events-none absolute inset-0 z-40 flex flex-col">
        {(['top', 'bottom'] as const).map((row) => (
          <div key={row} className={`flex h-1/2 w-full ${row === 'top' ? 'items-start' : 'items-end'}`}>
            {Array.from({ length: COLUMNS }).map((_, i) => (
              <motion.span
                key={i}
                className="h-full flex-1 bg-brand"
                initial={{ scaleY: 1 }}
                animate={{ scaleY: 0 }}
                transition={{ duration: 1.1, ease: ease.inOut, delay: REVEAL_DELAY + i * 0.08 }}
                style={{ transformOrigin: row === 'top' ? 'top' : 'bottom' }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Column rhythm over the artwork */}
      <div className="pointer-events-none absolute inset-0 z-10 flex">
        {Array.from({ length: COLUMNS }).map((_, i) => (
          <span key={i} className="h-full flex-1 border-r border-paper-soft/10 last:border-r-0" />
        ))}
      </div>

      {/* Copy */}
      <motion.div
        className="gutter relative z-30 flex w-full flex-col gap-8 pb-[34px] lg:flex-row lg:items-end lg:justify-between"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        <div className="flex flex-col gap-[30px]">
          <Line delay={REVEAL_DELAY + 0.45}>
            <h2 className="text-[clamp(1.75rem,2.8vw,2.5rem)] leading-[0.85] font-bold tracking-[-0.025em] text-paper-soft">
              {hero.eyebrow}
            </h2>
          </Line>
          <Line delay={REVEAL_DELAY + 0.55}>
            <h1 className="text-display text-paper-soft">
              {hero.title}
              <span className="text-brand">{site.brandSuffix}</span>
            </h1>
          </Line>
        </div>

        <motion.div
          className="flex max-w-[340px] flex-col items-start gap-[30px] lg:items-end lg:pb-2"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: ease.expo, delay: REVEAL_DELAY + 0.7 }}
        >
          <p className="text-[20px] leading-6 font-semibold tracking-[-0.1px] text-paper-soft lg:text-right">
            {hero.intro.join(' ')}
          </p>
          <ScrollCue />
        </motion.div>
      </motion.div>
    </section>
  );
}

/** Masked line that rises into place — used for the two hero headings. */
function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span
        className="block"
        initial={{ y: '110%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 1.1, ease: ease.expo, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function ScrollCue() {
  return (
    <motion.span
      aria-hidden
      className="text-paper-soft"
      animate={{ y: [0, 8, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 31 30" fill="none" className="size-[31px]">
        <path
          d="M15.5 4v22M6.5 17l9 9 9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.span>
  );
}
