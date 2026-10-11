import type { Variants } from 'motion/react';

/** Bezier curves the reference uses for appear, hover and scroll transitions. */
export const ease = {
  /** Framer's default appear curve — a soft, symmetrical settle. */
  appear: [0.44, 0, 0.56, 1],
  expo: [0.16, 1, 0.3, 1],
  quint: [0.22, 1, 0.36, 1],
  inOut: [0.76, 0, 0.24, 1],
} as const;

export type CharMotion = { index: number; delay: number; step?: number };

/**
 * Each character rises out of a blur into focus, one after another — the
 * landing statement's reveal, shared by every section's text. Once settled the
 * filter is dropped, so hundreds of revealed characters cost nothing to paint.
 */
export const focusChar: Variants = {
  hidden: { opacity: 0, y: '0.42em', filter: 'blur(10px)', transition: { duration: 0.35, ease: ease.appear } },
  shown: ({ index, delay, step = 0.026 }: CharMotion) => ({
    opacity: 1,
    y: '0em',
    filter: 'blur(0px)',
    transition: { duration: 0.9, ease: ease.expo, delay: delay + index * step },
    transitionEnd: { filter: 'none' },
  }),
};

/** The reduced-motion stand-in: a plain fade. */
export const stillChar: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.3 } },
  shown: ({ delay }: CharMotion) => ({ opacity: 1, transition: { duration: 0.6, delay } }),
};
