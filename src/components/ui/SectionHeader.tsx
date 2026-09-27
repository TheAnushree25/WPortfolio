'use client';

import * as motion from 'motion/react-client';
import { cn } from '@/lib/utils';
import { fadeUp, stagger, viewport } from '@/lib/motion';
import { site } from '@/content/site';
import { Divider } from './Divider';

type SectionHeaderProps = {
  label: string;
  code?: string;
  /** Hide the rule when the section already sits under one. */
  rule?: boolean;
  className?: string;
};

/** The three-up meta row — dotted label, centred code, right-aligned year. */
export function SectionHeader({ label, code, rule = true, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex w-full flex-col gap-[34px]', className)}>
      {rule && <Divider />}
      <motion.div
        className="grid grid-cols-1 items-center gap-2 md:grid-cols-3"
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
      >
        <motion.div variants={fadeUp} className="flex items-center gap-3">
          <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
          <p className="text-label text-ink-800">{label}</p>
        </motion.div>
        {code && (
          <motion.p variants={fadeUp} className="text-label hidden text-center text-ink-800 md:block">
            {code}
          </motion.p>
        )}
        <motion.p variants={fadeUp} className="text-label hidden text-right text-ink-800 md:block">
          {site.year}
        </motion.p>
      </motion.div>
    </div>
  );
}
