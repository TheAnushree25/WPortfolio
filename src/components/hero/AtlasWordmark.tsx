'use client';

import { motion, type Variants } from 'motion/react';
import { ease } from '@/lib/motion';
import { FRAME, WORDMARK_BOX, WORDMARK_LETTERS } from './geometry';

export type WordmarkState = 'hidden' | 'shown' | 'gone';

type AtlasWordmarkProps = {
  state: WordmarkState;
  /** Seconds before the letters start arriving. */
  delay: number;
  reduce: boolean;
  label: string;
};

type LetterMotion = {
  /** Horizontal offset in % of the letter's own width: tracking in, and flying apart. */
  track: number;
  flee: number;
  delay: number;
  order: number;
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;
const centre = WORDMARK_BOX.x + WORDMARK_BOX.width / 2;

/** The word's mask for the light sweep: every letter, filling the same box. */
const MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_BOX.x} ${WORDMARK_BOX.y} ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}" preserveAspectRatio="none">${WORDMARK_LETTERS.map((l) => `<path d="${l.d}"/>`).join('')}</svg>`,
)}")`;

/**
 * The camera: eases back as the word arrives, then pushes through it toward
 * the studio slide. It pivots on the frame's centre, which sits above the word,
 * so the push carries the letters down and out of shot.
 */
const camera: Variants = {
  hidden: { scale: 1.06, y: '0%' },
  shown: (delay: number) => ({ scale: 1, y: '0%', transition: { duration: 2.8, ease: ease.expo, delay } }),
  gone: { scale: 1.45, y: '7%', transition: { duration: 1.2, ease: [0.55, 0, 0.75, 0.35] } },
};

const letter: Variants = {
  hidden: (m: LetterMotion) => ({ opacity: 0, x: `${m.track}%`, y: '22%', scale: 1.08, filter: 'blur(16px)' }),
  shown: (m: LetterMotion) => ({
    opacity: 1,
    x: '0%',
    y: '0%',
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      default: { duration: 2.1, ease: ease.expo, delay: m.delay + m.order * 0.1 },
      opacity: { duration: 1.1, ease: ease.appear, delay: m.delay + m.order * 0.1 },
    },
  }),
  gone: (m: LetterMotion) => ({
    opacity: 0,
    x: `${m.flee}%`,
    y: '-14%',
    scale: 1.3,
    filter: 'blur(14px)',
    transition: { duration: 1, ease: [0.6, 0, 0.8, 0.3], delay: (2 - m.order) * 0.04 },
  }),
};

const still: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.6 } },
  gone: { opacity: 0, transition: { duration: 0.4 } },
};

/**
 * “Atlas” as drawn in the Figma frame — white at 10%, spanning the frame from
 * 53.9px to 1383.8px with its baseline at 683.1px. Each letter is its own layer
 * so the word can assemble: letters track in from wider spacing and pull into
 * focus from the middle outward, then a light sweep crosses the settled word.
 */
export function AtlasWordmark({ state, delay, reduce, label }: AtlasWordmarkProps) {
  return (
    <motion.h1
      className="relative"
      style={{
        aspectRatio: `${WORDMARK_BOX.width} / ${WORDMARK_BOX.height}`,
        // The frame's centre, expressed in the word's own box.
        transformOrigin: `${pct(FRAME.width / 2 - WORDMARK_BOX.x, WORDMARK_BOX.width)} ${pct(FRAME.height / 2 - WORDMARK_BOX.y, WORDMARK_BOX.height)}`,
      }}
      variants={reduce ? undefined : camera}
      custom={delay}
      initial="hidden"
      animate={state}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden className="absolute inset-0 opacity-10">
        {WORDMARK_LETTERS.map((l, i) => {
          const mid = l.box.x + l.box.width / 2;
          const spread = ((mid - centre) / l.box.width) * 100;
          const motionFor: LetterMotion = { track: spread * 0.14, flee: spread * 0.32, delay, order: Math.abs(i - 2) };
          return (
            <motion.svg
              key={l.id}
              viewBox={`${l.box.x} ${l.box.y} ${l.box.width} ${l.box.height}`}
              className="absolute overflow-visible"
              style={{
                left: pct(l.box.x - WORDMARK_BOX.x, WORDMARK_BOX.width),
                top: pct(l.box.y - WORDMARK_BOX.y, WORDMARK_BOX.height),
                width: pct(l.box.width, WORDMARK_BOX.width),
                height: pct(l.box.height, WORDMARK_BOX.height),
                transformOrigin: '50% 100%',
              }}
              custom={motionFor}
              variants={reduce ? still : letter}
            >
              <path d={l.d} fill="#fff" />
            </motion.svg>
          );
        })}
      </div>

      {!reduce && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ maskImage: MASK, WebkitMaskImage: MASK, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 w-[38%] bg-[linear-gradient(100deg,transparent_20%,rgb(255_255_255_/_0.3)_50%,transparent_80%)]"
            initial={{ x: '-120%' }}
            animate={state === 'shown' ? { x: '280%' } : { x: '-120%' }}
            transition={state === 'shown' ? { duration: 1.8, ease: ease.inOut, delay: delay + 1.5 } : { duration: 0 }}
          />
        </div>
      )}
    </motion.h1>
  );
}
