'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { pricing, site } from '@/content/site';
import { ease, riseIn, stagger, viewport } from '@/lib/motion';
import { Chip, ProgressDots } from '@/components/ui/Badge';
import { Divider } from '@/components/ui/Divider';
import { PillButton } from '@/components/ui/PillButton';
import { CentredHeading } from './CentredHeading';
import { CheckDot } from './Services';
import { NoiseLayer } from './Approach';

type Cycle = 'monthly' | 'annual';

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>('annual');

  return (
    <section className="relative z-10 w-full overflow-hidden bg-paper pt-[100px] pb-[120px]">
      <div className="gutter">
        <div className="shell flex flex-col gap-20">
          {/* Meta row with the billing switch in the middle */}
          <div className="flex flex-col gap-[34px]">
            <Divider />
            <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-3">
              <div className="flex items-center gap-3">
                <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
                <p className="text-label text-ink-800">{pricing.label}</p>
              </div>

              <div className="flex items-center justify-center gap-[10px]">
                <span className="text-label text-ink-800">{pricing.cycles.monthly}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cycle === 'annual'}
                  aria-label={`Show ${pricing.cycles.monthly.toLowerCase()} or ${pricing.cycles.annual.toLowerCase()}`}
                  onClick={() => setCycle((c) => (c === 'annual' ? 'monthly' : 'annual'))}
                  className="flex h-[30px] w-[58px] items-center rounded-full bg-brand p-[2px] shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]"
                >
                  <motion.span
                    className="size-[26px] rounded-full bg-paper shadow-[0_0_4px_0_rgb(0_0_0_/_0.05)]"
                    animate={{ x: cycle === 'annual' ? 28 : 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  />
                </button>
                <span className="text-label text-ink-800">{pricing.cycles.annual}</span>
              </div>

              <p className="text-label hidden text-right text-ink-800 md:block">{site.year}</p>
            </div>
          </div>

          <CentredHeading
            badge={pricing.badge}
            heading={pricing.heading}
            body={pricing.body}
            cta={pricing.cta}
          />

          <motion.div
            className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            {pricing.plans.map((plan) => (
              <motion.article
                key={plan.name}
                variants={riseIn}
                className="relative flex flex-col gap-10 overflow-hidden rounded-[20px] bg-cream p-[14px]"
              >
                <NoiseLayer />

                <div className="relative flex flex-col gap-5 px-[10px] pt-[10px]">
                  <div className="flex items-start justify-between">
                    <div className="flex items-end gap-2">
                      {/* Price rolls vertically when the billing cycle flips. */}
                      <span className="relative block h-[35px] overflow-hidden">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={cycle}
                            className="text-h4 block text-ink-800"
                            initial={{ y: '100%' }}
                            animate={{ y: '0%' }}
                            exit={{ y: '-100%' }}
                            transition={{ duration: 0.45, ease: ease.quint }}
                          >
                            {cycle === 'annual' ? plan.annual : plan.monthly}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                    </div>
                    <ProgressDots active={plan.progress} />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-[10px]">
                      <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
                      <h3 className="text-title text-ink-800" style={{ lineHeight: '26px' }}>
                        {plan.name}
                      </h3>
                    </span>
                    {plan.tag && <Chip>{plan.tag}</Chip>}
                  </div>

                  <span className="h-px w-full bg-line" />
                  <p className="text-body max-w-[330px] text-ink-700">{plan.body}</p>

                  <div className="pt-2">
                    <PillButton label={plan.cta.label} href={plan.cta.href} tone="line" />
                  </div>
                </div>

                <div className="relative flex flex-col gap-5 rounded-[10px] bg-line px-[26px] pt-[26px] pb-8 shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]">
                  <p className="text-[18px] leading-6 font-medium tracking-[-0.1px] text-ink">
                    {pricing.includedLabel}
                  </p>
                  <ul className="flex flex-col gap-[13px]">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-[10px]">
                        <CheckDot />
                        <span className="text-meta text-ink/80">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
