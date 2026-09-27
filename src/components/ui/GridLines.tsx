'use client';

import * as motion from 'motion/react-client';
import { cn } from '@/lib/utils';
import { ease } from '@/lib/motion';

type GridLinesProps = {
  /** Number of columns. The reference always divides the viewport into five. */
  columns?: number;
  className?: string;
  lineClassName?: string;
  /** Columns wipe down in sequence when the section enters the viewport. */
  animate?: boolean;
};

/**
 * The hairline column rhythm that sits behind almost every section.
 * Rendered as N equal cells with a 1px right border.
 */
export function GridLines({
  columns = 5,
  className,
  lineClassName = 'border-line/65',
  animate = true,
}: GridLinesProps) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 flex', className)} aria-hidden>
      {Array.from({ length: columns }).map((_, i) => (
        <motion.span
          key={i}
          className={cn('h-full flex-1 border-r border-l first:border-l-0', lineClassName)}
          initial={animate ? { scaleY: 0, opacity: 0 } : false}
          whileInView={animate ? { scaleY: 1, opacity: 1 } : undefined}
          viewport={{ once: true, amount: 0.05 }}
          transition={{ duration: 1.1, ease: ease.expo, delay: i * 0.06 }}
          style={{ transformOrigin: 'top' }}
        />
      ))}
    </div>
  );
}
