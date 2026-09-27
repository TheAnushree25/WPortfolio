import { cn } from '@/lib/utils';

type RollTextProps = {
  children: string;
  /** Height of one line in px — the stack travels exactly this far plus the gap. */
  lineHeight?: number;
  gap?: number;
  className?: string;
  /** Colour applied to the duplicate that rolls into view. */
  hoverClassName?: string;
};

/**
 * The reference renders every interactive label twice, stacked vertically inside
 * an overflow-hidden window, and slides the stack up by one line on hover.
 */
export function RollText({
  children,
  lineHeight = 20,
  gap = 5,
  className,
  hoverClassName,
}: RollTextProps) {
  return (
    <span className="relative block overflow-hidden" style={{ height: lineHeight }}>
      {/* Both visible copies are decorative; this one carries the accessible name. */}
      <span className="sr-only">{children}</span>
      <span
        className="flex flex-col transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/roll:-translate-y-[var(--roll)]"
        style={{ gap, ['--roll' as string]: `${lineHeight + gap}px` }}
      >
        <span aria-hidden className={cn('block', className)} style={{ lineHeight: `${lineHeight}px` }}>
          {children}
        </span>
        <span
          aria-hidden
          className={cn('block', className, hoverClassName)}
          style={{ lineHeight: `${lineHeight}px` }}
        >
          {children}
        </span>
      </span>
    </span>
  );
}
