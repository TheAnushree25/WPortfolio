'use client';

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useInView, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const words = works.system;

const track: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.22, delayChildren: 0.25 } },
};
const step: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: ease.expo }, transitionEnd: { filter: 'none' } },
};

/**
 * The journeys people take through the system, one person at a time: pick a
 * person and their route lays itself out step by step, the line filling as
 * each step lights, ending in what they leave with.
 */
export function Journeys({ study }: { study: SystemCase }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const seen = useInView(rootRef, { once: true, amount: 0.3 });
  const journey = study.journeys[active];
  const count = journey.steps.length;

  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    event.stopPropagation();
    const next = (active + (event.key === 'ArrowRight' ? 1 : -1) + study.journeys.length) % study.journeys.length;
    setActive(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };

  return (
    <div ref={rootRef} className="sys-journeys">
      <div className="sys-journey-tabs" role="tablist" aria-label={words.journeys} onKeyDown={onKeys}>
        {study.journeys.map((item, index) => (
          <button
            key={item.actor}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${id}-panel`}
            tabIndex={index === active ? 0 : -1}
            className={cn('sys-journey-tab', index === active && 'is-active')}
            onClick={() => setActive(index)}
          >
            {index === active && <motion.span layoutId={`${id}-pill`} className="sys-journey-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            <span className="sys-journey-tab-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="sys-journey-tab-label">{item.actor}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active}`}
          className="sys-journey"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          <p className="sys-journey-goal">{journey.goal}</p>
          <motion.ol
            className="sys-journey-steps"
            style={{ '--steps': count } as CSSProperties}
            variants={track}
            initial="hidden"
            animate={seen ? 'shown' : 'hidden'}
          >
            <span aria-hidden className="sys-journey-line">
              <motion.span
                className="sys-journey-fill"
                initial={{ scaleX: 0, scaleY: 0 }}
                animate={seen ? { scaleX: 1, scaleY: 1 } : { scaleX: 0, scaleY: 0 }}
                transition={{ duration: 0.22 * count + 0.4, ease: [0.45, 0, 0.2, 1], delay: 0.2 }}
              />
            </span>
            {journey.steps.map((item, index) => (
              <motion.li key={item.title} className="sys-journey-step" variants={step}>
                <span aria-hidden className="sys-journey-dot">
                  <span>{index + 1}</span>
                </span>
                <span className="sys-journey-step-title">{item.title}</span>
                <span className="sys-journey-step-detail">{item.detail}</span>
              </motion.li>
            ))}
          </motion.ol>
          <motion.p
            className="sys-journey-outcome"
            initial={{ opacity: 0, y: 14 }}
            animate={seen ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
            transition={{ duration: 0.8, ease: ease.expo, delay: 0.3 + 0.22 * count }}
          >
            <span className="sys-journey-outcome-label">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {words.outcome}
            </span>
            {journey.outcome}
          </motion.p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
