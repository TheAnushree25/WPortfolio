import type { Transition, Variants } from 'motion/react';

/** Bezier curves the reference uses for appear, hover and scroll transitions. */
export const ease = {
  /** Framer's default appear curve — a soft, symmetrical settle. */
  appear: [0.44, 0, 0.56, 1],
  expo: [0.16, 1, 0.3, 1],
  quint: [0.22, 1, 0.36, 1],
  inOut: [0.76, 0, 0.24, 1],
} as const;

/** Text and buttons roll their duplicate label up by exactly one line height. */
export const rollTransition: Transition = { duration: 0.45, ease: ease.quint };

export const viewport = { once: true, amount: 0.25 } as const;
export const viewportEarly = { once: true, amount: 0.12 } as const;

/** Standard element reveal: fade + 30px rise. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: ease.appear } },
};

/** Softer variant used for long body copy. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.9, ease: ease.appear } },
};

/** Cards and media tiles scale up very slightly as they fade in. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 46, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.9, ease: ease.expo } },
};

/** Wrapper that walks its children in sequence. */
export function stagger(step = 0.09, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: step, delayChildren: delay } },
  };
}

/** Per-word mask reveal used on the large display headings. */
export const wordMask: Variants = {
  hidden: { y: '110%' },
  show: { y: '0%', transition: { duration: 0.9, ease: ease.expo } },
};
