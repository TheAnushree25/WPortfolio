'use client';

import * as motion from 'motion/react-client';
import { expertise, images } from '@/content/site';
import { fadeUp, stagger, viewport } from '@/lib/motion';
import { PillButton } from '@/components/ui/PillButton';
import { ParallaxImage } from '@/components/ui/ParallaxImage';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NoiseLayer } from './Approach';

export function Expertise() {
  return (
    <section className="relative z-10 w-full overflow-hidden bg-cream pt-10 pb-[120px]">
      <NoiseLayer opacity={0.2} />

      <div className="gutter relative">
        <div className="shell flex flex-col gap-20">
          <SectionHeader label={expertise.label} code={expertise.code} />

          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
            <motion.div
              className="w-full lg:w-[686px]"
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={viewport}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              <ParallaxImage
                src={images.expertise}
                alt={expertise.alt}
                className="aspect-[686/660] w-full rounded-[16px]"
                distance={90}
                sizes="(max-width: 1024px) 100vw, 686px"
              />
            </motion.div>

            <motion.div
              className="flex max-w-[498px] flex-col gap-6"
              variants={stagger(0.1)}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              <motion.span variants={fadeUp}>
                <span className="text-badge inline-flex items-center gap-[10px] rounded-[10px] bg-brand-tint py-[9px] pr-[14px] pl-[10px] text-brand backdrop-blur-[5px]">
                  <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
                  {expertise.badge}
                </span>
              </motion.span>

              <motion.h2 className="text-h3 text-ink-900" variants={stagger(0.06)}>
                {expertise.heading.map((line) => (
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

              <motion.div variants={fadeUp} className="flex flex-col gap-5">
                <h3 className="text-title text-ink-800" style={{ lineHeight: '26px' }}>
                  {expertise.subheading}
                </h3>
                <p className="text-body max-w-[380px] text-ink-500">{expertise.body}</p>
              </motion.div>

              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-6 pt-4">
                <PillButton label={expertise.cta.label} href={expertise.cta.href} tone="line" />
                <p className="text-small text-ink/60">{expertise.rating}</p>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
