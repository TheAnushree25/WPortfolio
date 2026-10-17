'use client';

import { useEffect, useRef } from 'react';
import { animate, motion, useInView, useReducedMotion, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';

const words = works.system;

const grid: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  shown: { opacity: 1, y: 0, transition: { duration: 1, ease: ease.expo } },
};

/** "1,046" → 0 … 1,046; "41.4k" → 0.0k … 41.4k; anything without a number stays as it is. */
function Figure({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  useEffect(() => {
    const element = ref.current;
    const match = value.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
    if (!element || !match || !seen || reduce) return;
    const [, before, digits, after] = match;
    const target = Number(digits.replace(/,/g, ''));
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    const grouped = digits.includes(',');
    const format = (n: number) =>
      `${before}${grouped ? n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals)}${after}`;
    const controls = animate(0, target, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: (n) => (element.textContent = format(n)) });
    return () => {
      controls.stop();
      element.textContent = value;
    };
  }, [reduce, seen, value]);

  return (
    <span ref={ref} className="sys-figure-value">
      {value}
    </span>
  );
}

/**
 * The system in numbers, counted up as they arrive (after Studio Mirage's key
 * figures), and the engineering behind them, a line each.
 */
export function Numbers({ study }: { study: SystemCase }) {
  return (
    <div className="sys-numbers">
      <motion.ul className="sys-figures" variants={grid} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.3 }}>
        {study.figures.map((figure) => (
          <motion.li key={figure.label} className="sys-figure" variants={rise}>
            <Figure value={figure.value} />
            <span className="sys-figure-label">{figure.label}</span>
          </motion.li>
        ))}
      </motion.ul>

      <p className="sys-kicker">{words.highlights}</p>
      <motion.ul className="sys-highlights" variants={grid} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.15 }}>
        {study.highlights.map((item, index) => (
          <motion.li key={item.title} className="sys-highlight" variants={rise}>
            <span className="sys-highlight-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="sys-highlight-title">{item.title}</span>
            <span className="sys-highlight-detail">{item.detail}</span>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
