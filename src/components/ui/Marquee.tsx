import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MarqueeProps = {
  children: ReactNode;
  /** Seconds for one full loop. */
  duration?: number;
  direction?: 'left' | 'right';
  gap?: number;
  className?: string;
  itemClassName?: string;
};

/**
 * CSS-driven infinite marquee. The track is duplicated once and translated by
 * exactly -50%, so the seam is never visible and the loop needs no JS.
 */
export function Marquee({
  children,
  duration = 40,
  direction = 'left',
  gap = 0,
  className,
  itemClassName,
}: MarqueeProps) {
  const items = Children.toArray(children);

  return (
    <div className={cn('group/marquee relative flex w-full overflow-hidden', className)}>
      {[0, 1].map((copy) => (
        <ul
          key={copy}
          aria-hidden={copy === 1}
          className="flex shrink-0 items-center [animation:marquee-x_var(--dur)_linear_infinite] group-hover/marquee:[animation-play-state:paused]"
          style={{
            gap,
            paddingRight: gap,
            ['--dur' as string]: `${duration}s`,
            ['--marquee-shift' as string]: direction === 'left' ? '-100%' : '100%',
            animationDirection: direction === 'left' ? 'normal' : 'reverse',
          }}
        >
          {items.map((child, i) => (
            <li key={i} className={cn('shrink-0', itemClassName)}>
              {child}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
