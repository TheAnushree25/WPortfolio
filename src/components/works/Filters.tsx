'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { worksPage } from '@/content/site';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const copy = worksPage.filters;

export type FilterState = { disciplines: ReadonlySet<string>; industries: ReadonlySet<string> };

type FiltersProps = {
  disciplines: readonly { key: string; label: string }[];
  industries: readonly string[];
  value: FilterState;
  onChange: (next: FilterState) => void;
};

const toggled = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

/**
 * Studio Mirage's filters: a glass pill that opens a frosted panel with the
 * choices in columns, each one dimmed until it is on. Escape or a click
 * elsewhere closes it. On phones the pill rides at the foot of the screen.
 */
export function Filters({ disciplines, industries, value, onChange }: FiltersProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = value.disciplines.size + value.industries.size;

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="works-filters">
      <button
        type="button"
        className={cn('works-filter-btn', open && 'is-open')}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((state) => !state)}
      >
        {copy.label}
        {count > 0 && <span className="works-filter-count">{count}</span>}
        <svg viewBox="0 0 10 10" aria-hidden className="works-filter-chevron">
          <path d="M3.5 2 7 5 3.5 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-panel`}
            className="works-filter-panel"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ duration: 0.35, ease: ease.expo }}
          >
            <span aria-hidden className="works-filter-glass" />
            <div className="works-filter-columns">
              <fieldset>
                <legend>{copy.discipline}</legend>
                {disciplines.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={value.disciplines.has(option.key)}
                    className={cn('works-filter-option', value.disciplines.has(option.key) && 'is-on')}
                    onClick={() => onChange({ ...value, disciplines: toggled(value.disciplines, option.key) })}
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
              <fieldset>
                <legend>{copy.industry}</legend>
                <div className="works-filter-grid">
                  {industries.map((industry) => (
                    <button
                      key={industry}
                      type="button"
                      aria-pressed={value.industries.has(industry)}
                      className={cn('works-filter-option', value.industries.has(industry) && 'is-on')}
                      onClick={() => onChange({ ...value, industries: toggled(value.industries, industry) })}
                    >
                      {industry}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The filters that are on, as chips under the title, each one a way to turn itself off. */
export function FilterChips({ value, labels, onChange }: { value: FilterState; labels: Record<string, string>; onChange: (next: FilterState) => void }) {
  const chips = [
    ...[...value.disciplines].map((key) => ({ key, label: labels[key] ?? key, kind: 'disciplines' as const })),
    ...[...value.industries].map((key) => ({ key, label: key, kind: 'industries' as const })),
  ];
  return (
    <AnimatePresence initial={false}>
      {chips.length > 0 && (
        <motion.div
          className="works-chips"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: ease.expo }}
        >
          <div className="works-chips-row">
            {chips.map((chip) => (
              <button
                key={`${chip.kind}-${chip.key}`}
                type="button"
                className="works-chip"
                onClick={() => onChange({ ...value, [chip.kind]: toggled(value[chip.kind], chip.key) })}
              >
                {chip.label}
                <svg viewBox="0 0 10 10" aria-hidden>
                  <path d="m2.5 2.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
          <button type="button" className="works-chips-clear" onClick={() => onChange({ disciplines: new Set(), industries: new Set() })}>
            {copy.clear}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
