import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RollText } from './RollText';

type PillButtonProps = {
  label: string;
  href: string;
  /** `cream` sits on white sections, `line` sits on cream sections. */
  tone?: 'cream' | 'line';
  className?: string;
};

/**
 * Signature CTA. A 44px brand circle sits inside a 54px pill; on hover the
 * circle scales up until it floods the pill, the arrow pair slides one slot,
 * and the label rolls to its light duplicate.
 */
export function PillButton({ label, href, tone = 'cream', className }: PillButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group/roll relative inline-flex h-[54px] shrink-0 items-center gap-4 overflow-hidden rounded-[50px] py-[7px] pr-6 pl-[7px]',
        'shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]',
        tone === 'cream' ? 'bg-cream' : 'bg-line',
        className,
      )}
    >
      {/* Flood layer: a circle that outgrows the pill. */}
      <span
        aria-hidden
        className="absolute top-[5px] left-[5px] size-11 rounded-full bg-brand transition-transform duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/roll:scale-[16]"
      />

      {/* Arrow window: two icons 10px apart, shifted by 28px on hover. */}
      <span className="relative z-10 grid size-10 place-items-center">
        <span className="block size-[18px] overflow-hidden">
          <span className="flex gap-[10px] transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/roll:-translate-x-[28px]">
            <ArrowIcon />
            <ArrowIcon />
          </span>
        </span>
      </span>

      <RollText
        className="text-action whitespace-nowrap text-ink"
        hoverClassName="text-paper-soft"
      >
        {label}
      </RollText>
    </Link>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="size-[18px] shrink-0 text-paper-soft"
    >
      <path
        d="M3 9h12M10 4l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
