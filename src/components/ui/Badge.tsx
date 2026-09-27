import { cn } from '@/lib/utils';

/** Translucent brand pill used above every centred heading. */
export function Badge({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        'text-badge inline-flex items-center gap-[10px] rounded-[10px] bg-brand-wash py-[9px] pr-[14px] pl-[10px] text-brand backdrop-blur-[5px]',
        className,
      )}
    >
      <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
      {children}
    </span>
  );
}

/** Small grey capsule used for project tags, plan tags and blog categories. */
export function Tag({ children, tone = 'line' }: { children: string; tone?: 'line' | 'cream' }) {
  return (
    <span
      className={cn(
        'text-tag inline-flex items-center rounded-[44px] px-5 py-[9px] text-ink/80 shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]',
        tone === 'line' ? 'bg-line' : 'bg-cream',
      )}
    >
      {children}
    </span>
  );
}

/** Uppercase micro-chip ("FREE", "MOST PICK"). */
export function Chip({ children }: { children: string }) {
  return (
    <span className="text-chip inline-flex items-center rounded-[44px] bg-line px-4 py-[9px] text-ink shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]">
      {children}
    </span>
  );
}

/** Three-step progress dots shown on cards. */
export function ProgressDots({ active, total = 3 }: { active: number; total?: number }) {
  return (
    <span className="flex items-center gap-[6px]" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn('size-[10px] rounded-full transition-colors', i < active ? 'bg-brand' : 'bg-line-strong')}
        />
      ))}
    </span>
  );
}
