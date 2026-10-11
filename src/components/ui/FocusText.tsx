'use client';

import { Fragment } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { focusChar, stillChar, type CharMotion } from '@/lib/motion';

type FocusTextProps = {
  /** One string, or one string per line. */
  text: string | readonly string[];
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  /** Seconds before the first character arrives. */
  delay?: number;
  /** Seconds between one character and the next. */
  step?: number;
  className?: string;
};

/**
 * Text that focuses in character by character, the way the landing statement
 * does. It plays when an ancestor motion element switches to its "shown"
 * variant, so a section can cue all of its lines together. Characters are
 * grouped by word, so lines still only break between words; screen readers
 * get the plain text.
 */
export function FocusText({ text, as: Tag = 'span', delay = 0, step = 0.026, className }: FocusTextProps) {
  const reduce = useReducedMotion();
  const lines = typeof text === 'string' ? [text] : text;
  let index = 0;

  return (
    <Tag className={className}>
      <span className="sr-only">{lines.join(' ')}</span>
      {lines.map((line, l) => {
        const words = line.split(' ');
        const content = words.map((word, w) => (
          <Fragment key={w}>
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
          </Fragment>
        ));
        return lines.length > 1 ? (
          <span key={l} aria-hidden className="block">
            {content}
          </span>
        ) : (
          <Fragment key={l}>{content}</Fragment>
        );
      })}
    </Tag>
  );
}
