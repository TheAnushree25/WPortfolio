'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { deck } from '@/content/site';
import { ease } from '@/lib/motion';
import { FocusText } from '@/components/ui/FocusText';

/**
 * The deck, read on the site: each page's black ground lifted away so the
 * living gradient moves behind the type and the work, pages rising into view
 * as they scroll up. The re-lit PDF opens or downloads from the top.
 */
export function DeckViewer() {
  return (
    <main className="font-studio relative z-10 px-[var(--pad-sides)] pt-36 pb-28 text-paper-soft">
      <motion.header
        className="mx-auto mb-16 flex max-w-[1500px] flex-wrap items-end justify-between gap-8"
        initial="hidden"
        animate="shown"
      >
        <div>
          <motion.p
            className="mb-3 text-[0.8rem] font-semibold tracking-[0.14em] uppercase opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            {deck.overline}
          </motion.p>
          <FocusText as="h1" text={deck.title} delay={0.15} step={0.04} className="text-[clamp(2rem,4vw,3.6rem)] leading-[1.1] font-normal" />
          <motion.p
            className="mt-4 max-w-[34rem] text-[clamp(1rem,1.2vw,1.2rem)] leading-[1.6] text-paper-soft/70"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: ease.expo, delay: 0.5 }}
          >
            {deck.intro}
          </motion.p>
        </div>
        <motion.div
          className="flex flex-wrap gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: ease.expo, delay: 0.7 }}
        >
          <a href={deck.pdf} target="_blank" rel="noreferrer" className="glass-button is-outlined">
            <span>{deck.open}</span>
          </a>
          <a href={deck.pdf} download="The-Atlas-Studio.pdf" className="glow-button">
            <span className="glow-button-label">
              {deck.download}
              <svg viewBox="0 0 12 14" fill="none" aria-hidden className="w-3">
                <path d="M9.5 4.8 5.55 8.75 1.6 4.8M5.55.55v7.87M.55 12.9h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <span className="glow-button-bg" aria-hidden />
          </a>
        </motion.div>
      </motion.header>

      <ol className="mx-auto flex max-w-[1500px] flex-col gap-[clamp(1.25rem,3vw,3rem)]">
        {deck.slides.map((src, i) => (
          <motion.li
            key={src}
            className="relative aspect-video overflow-hidden rounded-[14px] border border-paper-soft/10 shadow-[0_40px_90px_-30px_rgb(0_0_0_/_0.6)]"
            initial={{ opacity: 0, y: 60, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 1.1, ease: ease.expo }}
          >
            <Image
              src={src}
              alt={`${deck.overline} deck, page ${i + 1} of ${deck.slides.length}`}
              fill
              sizes="(max-width: 1560px) 94vw, 1500px"
              priority={i === 0}
              className="object-cover"
            />
          </motion.li>
        ))}
      </ol>
    </main>
  );
}
