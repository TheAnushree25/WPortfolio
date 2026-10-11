'use client';

import { motion } from 'motion/react';
import { focusChar, stillChar, type CharMotion } from '@/lib/motion';

type StudioStatementProps = {
  lines: readonly string[];
  shown: boolean;
  reduce: boolean;
  /** Seconds before the first character arrives. */
  delay: number;
};

/**
 * “We are a 360 design and tech studio”, set as in the Figma frame: Medium 56px
 * on the 1440 frame with 13% tracking and a 75.3px line pitch, centred over the
 * emblem with its baselines at 389.6 and 465. Characters focus in one after
 * another once the emblem has settled.
 */
export function StudioStatement({ lines, shown, reduce, delay }: StudioStatementProps) {
  let index = 0;

  return (
    <motion.h2
      className="font-studio text-center leading-[1.345] font-medium tracking-[0.13em] text-paper-soft uppercase"
      // Centred, the block's baselines sit 3.8px above the frame's; nudge them onto it.
      style={{ fontSize: 'calc(56 * var(--s))', translate: '0 calc(3.8 * var(--s))' }}
      aria-label={lines.join(' ')}
      initial="hidden"
      animate={shown ? 'shown' : 'hidden'}
    >
      {lines.map((line, lineIndex) => (
        <span key={line} aria-hidden className="block whitespace-pre">
          {/* Figma centres the first line with its trailing space, which shifts it left. */}
          {Array.from(lineIndex === 0 ? `${line} ` : line).map((glyph) => {
            const motionFor: CharMotion = { index: index++, delay };
            return (
              <motion.span
                key={motionFor.index}
                // Figma tracks between characters only; CSS would also pad the line's end.
                className="inline-block last:-me-[0.13em]"
                custom={motionFor}
                variants={reduce ? stillChar : focusChar}
              >
                {glyph === ' ' ? ' ' : glyph}
              </motion.span>
            );
          })}
        </span>
      ))}
    </motion.h2>
  );
}
