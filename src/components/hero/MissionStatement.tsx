'use client';

import { motion } from 'motion/react';
import { focusChar, stillChar, type CharMotion } from '@/lib/motion';

type MissionStatementProps = {
  text: string;
  shown: boolean;
  reduce: boolean;
  /** Seconds before the first character arrives. */
  delay: number;
};

/** However long the line, the last character lands within about two seconds. */
const SWEEP = 1.3;

/**
 * The studio's mission, revealed with the statement's own focus-in. Characters
 * are grouped by word so the paragraph only ever wraps between words.
 */
export function MissionStatement({ text, shown, reduce, delay }: MissionStatementProps) {
  const words = text.split(' ');
  const step = Math.min(0.026, SWEEP / text.replace(/ /g, '').length);
  let index = 0;

  return (
    <motion.p
      className="font-studio mx-auto text-center leading-[1.32] font-medium tracking-[0.005em] text-paper-soft"
      style={{ fontSize: 'max(17px, calc(36 * var(--s)))', maxWidth: 'min(calc(1010 * var(--s)), 90%)' }}
      aria-label={text}
      initial="hidden"
      animate={shown ? 'shown' : 'hidden'}
    >
      {words.map((word, w) => (
        <span key={w}>
          <span aria-hidden className="inline-block whitespace-nowrap">
            {Array.from(word).map((glyph) => {
              const motionFor: CharMotion = { index: index++, delay, step };
              return (
                <motion.span
                  key={motionFor.index}
                  className="inline-block"
                  custom={motionFor}
                  variants={reduce ? stillChar : focusChar}
                >
                  {glyph}
                </motion.span>
              );
            })}
          </span>
          {w < words.length - 1 && ' '}
        </span>
      ))}
    </motion.p>
  );
}
