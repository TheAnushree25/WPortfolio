import { cn } from '@/lib/utils';

type ProgressiveBlurProps = {
  /** Height of the blurred band. */
  height?: number;
  /** `top` blurs downward from the edge, `bottom` blurs upward. */
  side?: 'top' | 'bottom';
  layers?: number;
  className?: string;
};

/**
 * Eight stacked backdrop-filter layers, each doubling the blur radius and
 * masked to a progressively narrower band. Produces the smooth focus falloff
 * under the fixed navigation instead of a hard-edged blur.
 */
export function ProgressiveBlur({
  height = 180,
  side = 'top',
  layers = 8,
  className,
}: ProgressiveBlurProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-0 z-20', side === 'top' ? 'top-0' : 'bottom-0', className)}
      style={{ height }}
    >
      {Array.from({ length: layers }).map((_, i) => {
        const blur = 0.015625 * 2 ** i;
        const start = (i / layers) * 100;
        const mid = ((i + 1) / layers) * 100;
        const end = ((i + 2) / layers) * 100;
        const direction = side === 'top' ? 'to bottom' : 'to top';
        const mask = `linear-gradient(${direction}, rgba(0,0,0,1) ${start}%, rgba(0,0,0,1) ${mid}%, rgba(0,0,0,0) ${end}%)`;

        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}
