'use client';

import Image from 'next/image';
import * as motion from 'motion/react-client';
import { services } from '@/content/site';
import { fadeUp, riseIn, stagger, viewport } from '@/lib/motion';
import { ProgressDots } from '@/components/ui/Badge';
import { PillButton } from '@/components/ui/PillButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NoiseLayer } from './Approach';

export function Services() {
  return (
    <section className="relative z-10 w-full overflow-hidden bg-cream pt-10 pb-[120px]">
      <NoiseLayer opacity={0.2} />

      <div className="gutter relative">
        <div className="shell flex flex-col gap-20">
          <SectionHeader label={services.label} code={services.code} />

          <div className="flex flex-col gap-14 lg:flex-row lg:justify-between lg:gap-20">
            {/* Left rail */}
            <div className="flex w-full max-w-[430px] flex-col gap-[30px]">
              <motion.h2
                className="text-h2 text-ink-900"
                variants={stagger(0.06)}
                initial="hidden"
                whileInView="show"
                viewport={viewport}
              >
                {services.heading.map((line) => (
                  <span key={line} className="block overflow-hidden pb-[0.05em]">
                    <motion.span
                      className="block"
                      variants={{
                        hidden: { y: '110%' },
                        show: { y: '0%', transition: { duration: 0.95, ease: [0.16, 1, 0.3, 1] } },
                      }}
                    >
                      {line}
                    </motion.span>
                  </span>
                ))}
              </motion.h2>

              <motion.p
                className="text-body text-ink-700"
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={viewport}
              >
                {services.body}
              </motion.p>

              <span className="h-px w-full bg-line-strong" />

              <motion.ul
                className="flex flex-col gap-5"
                variants={stagger(0.1)}
                initial="hidden"
                whileInView="show"
                viewport={viewport}
              >
                {services.bullets.map((bullet) => (
                  <motion.li key={bullet} variants={fadeUp} className="flex items-center gap-[10px]">
                    <CheckDot />
                    <span className="text-[17px] leading-5 font-semibold tracking-[-0.1px] text-ink-800">
                      {bullet}
                    </span>
                  </motion.li>
                ))}
              </motion.ul>

              <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={viewport}>
                <PillButton label={services.cta.label} href={services.cta.href} tone="line" />
              </motion.div>
            </div>

            {/* Right stack */}
            <motion.div
              className="flex w-full max-w-[735px] flex-col gap-[14px]"
              variants={stagger(0.1)}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              {services.items.map((item) => (
                <motion.article
                  key={item.title}
                  variants={riseIn}
                  className="group flex items-center gap-[10px] overflow-hidden rounded-[10px] bg-line p-2 pr-6 shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)] transition-colors duration-500 hover:bg-line/70"
                >
                  <div className="relative h-[82px] w-[124px] shrink-0 overflow-hidden rounded-[5px]">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="124px"
                      className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-title truncate text-ink">{item.title}</p>
                    <p className="text-action text-ink/60">{item.kicker}</p>
                  </div>
                  <ProgressDots active={item.progress} />
                </motion.article>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Soft pink circle with a brand tick — used in services and pricing lists. */
export function CheckDot({ tone = 'soft' }: { tone?: 'soft' | 'wash' }) {
  return (
    <span
      className={`grid size-[23px] shrink-0 place-items-center rounded-full ${
        tone === 'soft' ? 'bg-brand-soft' : 'bg-brand/20'
      }`}
    >
      <svg viewBox="0 0 12 12" fill="none" className="size-[13px] text-brand" aria-hidden>
        <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
