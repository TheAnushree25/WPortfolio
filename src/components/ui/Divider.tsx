'use client';

import * as motion from 'motion/react-client';
import { cn } from '@/lib/utils';
import { ease } from '@/lib/motion';

type DividerProps = {
  /** Renders the small plus marker centred on the rule. */
  marker?: boolean;
  className?: string;
};

/** Hairline rule that draws itself outward from the centre, with an optional plus. */
export function Divider({ marker = false, className }: DividerProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <motion.div
        className="h-px w-full bg-line opacity-65"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1.2, ease: ease.expo }}
      />
      {marker && (
        <motion.span
          aria-hidden
          className="absolute top-1/2 left-1/2 block size-[9px] -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, rotate: -90 }}
          whileInView={{ opacity: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8, ease: ease.expo, delay: 0.25 }}
        >
          <span className="absolute top-0 left-1/2 h-[9px] w-px -translate-x-1/2 rounded-full bg-ink-900" />
          <span className="absolute top-1/2 left-0 h-px w-[9px] -translate-y-1/2 rounded-full bg-ink-900" />
        </motion.span>
      )}
    </div>
  );
}
