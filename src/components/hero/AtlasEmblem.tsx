'use client';

import { useId } from 'react';
import { motion, type Variants } from 'motion/react';
import { ease } from '@/lib/motion';
import { EMBLEM } from './geometry';

type AtlasEmblemProps = {
  shown: boolean;
  reduce: boolean;
  label: string;
};

/** Lets the wordmark clear the frame before the emblem starts its turn. */
const ENTER = 0.3;
/** The spin's deceleration ends here; the lock-in glow keys off it. */
const SETTLE = ENTER + 2.4;
const EXIT = 0.6;

/**
 * Two full turns, out of depth: the emblem winds up, spins twice and eases to
 * a stop upright while it scales up, sharpens and un-tilts toward the camera.
 * Leaving, it simply fades back; the turn resets once it is out of sight.
 */
const spin: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.42,
    rotate: -720,
    rotateX: 38,
    filter: 'blur(12px)',
    transition: {
      default: { duration: EXIT, ease: [0.4, 0, 1, 1] },
      rotate: { duration: 0, delay: EXIT },
      rotateX: { duration: 0, delay: EXIT },
    },
  },
  shown: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    rotateX: 0,
    filter: 'blur(0px)',
    transition: {
      rotate: { duration: 2.9, ease: [0.5, 0, 0.1, 1], delay: ENTER },
      rotateX: { duration: 2.6, ease: ease.expo, delay: ENTER },
      scale: { duration: 2.4, ease: ease.expo, delay: ENTER },
      opacity: { duration: 0.9, ease: ease.appear, delay: ENTER },
      filter: { duration: 1.6, ease: ease.appear, delay: ENTER },
    },
  },
};

const fade: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.4 } },
  shown: { opacity: 1, transition: { duration: 0.8 } },
};

/** The ring draws itself around while the emblem turns. */
const ring: Variants = {
  hidden: { pathLength: 0, transition: { duration: 0, delay: EXIT } },
  shown: { pathLength: 1, transition: { duration: 2.2, ease: [0.65, 0, 0.35, 1], delay: ENTER + 0.1 } },
};

const glint: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.3 } },
  shown: { opacity: [0, 0.9, 0], transition: { duration: 1.6, times: [0, 0.3, 1], ease: 'easeOut', delay: SETTLE - 0.4 } },
};

const bloom: Variants = {
  hidden: { opacity: 0, scale: 0.6, transition: { duration: EXIT } },
  shown: {
    opacity: [0, 0.85, 0.3],
    scale: [0.6, 1.12, 1],
    transition: { duration: 2.2, times: [0, 0.35, 1], ease: 'easeOut', delay: SETTLE - 0.5 },
  },
};

/**
 * The studio slide's emblem, drawn from its Figma export at 33% opacity: a 2px
 * ring shaded from #0027A4 to #C3CFFD, the A in a white hairline, and the
 * swoosh under its crossbar running #082BFF → #10B6FF.
 */
export function AtlasEmblem({ shown, reduce, label }: AtlasEmblemProps) {
  const id = useId().replace(/:/g, '');
  const ringFill = `${id}-ring`;
  const swooshFill = `${id}-swoosh`;
  const soften = `${id}-soften`;
  const state = shown ? 'shown' : 'hidden';

  return (
    <motion.div className="relative size-full [perspective:1400px]" initial="hidden" animate={state}>
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute inset-[14%] rounded-full bg-[radial-gradient(closest-side,rgb(8_43_255_/_0.32),transparent)] blur-2xl"
          variants={bloom}
        />
      )}

      <motion.div role="img" aria-label={label} className="relative size-full" variants={reduce ? fade : spin}>
        <svg viewBox={`0 0 ${EMBLEM.size} ${EMBLEM.size}`} className="size-full overflow-visible">
          <defs>
            {/* Lightest at the top right, deepest across the bottom left. */}
            <linearGradient id={ringFill} gradientUnits="userSpaceOnUse" x1="83.9" y1="410.7" x2="382.1" y2="55.3">
              <stop offset="0.15" stopColor="#0027A4" />
              <stop offset="1" stopColor="#C3CFFD" />
            </linearGradient>
            <linearGradient id={swooshFill} gradientUnits="userSpaceOnUse" x1="195" y1="0" x2="332" y2="0">
              <stop offset="0" stopColor="#082BFF" />
              <stop offset="1" stopColor="#10B6FF" />
            </linearGradient>
            <filter id={soften} x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          <g opacity={0.33}>
            <motion.circle
              cx={EMBLEM.ring.cx}
              cy={EMBLEM.ring.cy}
              r={EMBLEM.ring.r}
              fill="none"
              stroke={`url(#${ringFill})`}
              strokeWidth={EMBLEM.ring.stroke}
              variants={reduce ? undefined : ring}
            />
            <path d={EMBLEM.outline} fill="none" stroke="#fff" strokeWidth={1} />
            <path d={EMBLEM.swoosh} fill={`url(#${swooshFill})`} />
          </g>

          {!reduce && (
            <motion.path d={EMBLEM.swoosh} fill={`url(#${swooshFill})`} filter={`url(#${soften})`} variants={glint} />
          )}
        </svg>
      </motion.div>
    </motion.div>
  );
}
