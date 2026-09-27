'use client';

import * as motion from 'motion/react-client';
import { approach } from '@/content/site';
import { ease, fadeUp, riseIn, stagger, viewport } from '@/lib/motion';
import { Chip, ProgressDots } from '@/components/ui/Badge';
import { PillButton } from '@/components/ui/PillButton';
import { SectionHeader } from '@/components/ui/SectionHeader';

export function Approach() {
  return (
    <section className="relative z-10 w-full overflow-hidden bg-paper pb-[100px]">
      <div className="gutter">
        <div className="shell flex flex-col gap-20">
          <div className="flex flex-col gap-[50px]">
            <SectionHeader label={approach.label} code={approach.code} />

            <motion.div
              className="grid grid-cols-1 gap-5 md:grid-cols-3"
              variants={stagger(0.12)}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              {approach.cards.map((card) => (
                <motion.article
                  key={card.index}
                  variants={riseIn}
                  className="group relative flex min-h-[355px] flex-col justify-between overflow-hidden rounded-[20px] bg-cream px-6 pt-6 pb-[34px]"
                >
                  <NoiseLayer />

                  <header className="relative flex items-start justify-between">
                    <h3 className="text-h4 text-ink-800">{card.index}</h3>
                    <ProgressDots active={card.progress} />
                  </header>

                  <div className="relative flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-[10px]">
                        <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
                        <h4 className="text-title text-ink-800" style={{ lineHeight: '26px' }}>
                          {card.title}
                        </h4>
                      </span>
                      {card.chip && <Chip>{card.chip}</Chip>}
                    </div>
                    <p className="text-body text-ink-700">{card.body}</p>
                  </div>

                  {/* Cards lift a few pixels on hover, as in the reference. */}
                  <span className="pointer-events-none absolute inset-0 rounded-[20px] ring-0 ring-brand/0 transition-[box-shadow] duration-500 group-hover:shadow-[0_18px_40px_-24px_rgb(9_9_9_/_0.35)]" />
                </motion.article>
              ))}
            </motion.div>
          </div>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={viewport}>
              <PillButton label={approach.cta.label} href={approach.cta.href} />
            </motion.div>

            <div className="flex w-full flex-col gap-[22px] lg:w-[672px]">
              <span className="h-px w-full bg-line opacity-65" />
              {approach.meters.map((meter, i) => (
                <div key={meter.label} className="flex flex-col gap-[22px]">
                  <motion.div
                    className="flex items-center justify-between pl-5"
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={viewport}
                    transition={{ duration: 0.7, ease: ease.expo, delay: 0.1 + i * 0.1 }}
                  >
                    <p className="text-label text-ink-800">{meter.label}</p>
                    <p className="text-label text-right text-ink-800">{meter.value}%</p>
                  </motion.div>
                  <span className="h-px w-full bg-line opacity-65" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Fine fractal-noise texture layered inside every cream surface. Generated
 * inline so it costs no request and tiles at a fixed 160px regardless of
 * the element it sits in.
 */
const NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export function NoiseLayer({ opacity = 0.25 }: { opacity?: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: NOISE_URL, backgroundRepeat: 'repeat', backgroundSize: '160px 160px', opacity }}
    />
  );
}
