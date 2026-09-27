'use client';

import * as motion from 'motion/react-client';
import { intro } from '@/content/site';
import { fadeUp, riseIn, stagger, viewport, viewportEarly } from '@/lib/motion';
import { Divider } from '@/components/ui/Divider';
import { GridLines } from '@/components/ui/GridLines';
import { PillButton } from '@/components/ui/PillButton';
import { ParallaxImage } from '@/components/ui/ParallaxImage';

export function Intro() {
  return (
    <section id="about" className="relative z-10 w-full bg-paper pt-[100px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[834px]">
        <GridLines />
      </div>

      <div className="gutter relative">
        <div className="shell">
          <Divider marker />

          <div className="flex flex-col gap-10 pt-10 lg:flex-row lg:justify-between lg:gap-20">
            <motion.div
              className="flex shrink-0 items-center gap-3"
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
              <p className="text-label text-ink-800">{intro.label}</p>
            </motion.div>

            <div className="flex max-w-[968px] flex-col gap-[50px]">
              <div className="flex flex-col gap-16">
                <MaskedHeading text={intro.heading} />
                <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={viewport}>
                  <PillButton label={intro.cta.label} href={intro.cta.href} />
                </motion.div>
              </div>

              <motion.div
                className="flex flex-col gap-10 sm:flex-row sm:gap-[85px]"
                variants={stagger(0.12)}
                initial="hidden"
                whileInView="show"
                viewport={viewport}
              >
                {intro.columns.map((column) => (
                  <motion.div key={column.title} variants={fadeUp} className="flex flex-1 flex-col gap-10">
                    <span className="h-px w-full bg-line opacity-65" />
                    <div className="flex flex-col gap-5">
                      <h3 className="text-title text-ink-800" style={{ lineHeight: '26px' }}>
                        {column.title}
                      </h3>
                      <p className="text-body text-ink-500">{column.body}</p>
                    </div>
                    <span className="h-px w-full bg-line opacity-65" />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* Product triptych */}
        <motion.div
          className="shell grid grid-cols-1 gap-5 pt-[110px] pb-20 sm:grid-cols-3"
          variants={stagger(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={viewportEarly}
        >
          {intro.gallery.map((item) => (
            <motion.div key={item.alt} variants={riseIn}>
              <ParallaxImage
                src={item.src}
                alt={item.alt}
                className="aspect-[435/264] w-full rounded-[6px]"
                distance={70}
              />
            </motion.div>
          ))}
        </motion.div>

        <div className="shell">
          <Divider marker />
        </div>
      </div>
    </section>
  );
}

/** Word-by-word mask reveal for the large statement headings. */
export function MaskedHeading({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  return (
    <motion.h2
      className={`text-h3 text-ink-900 ${className}`}
      variants={stagger(0.022)}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: '110%' },
              show: { y: '0%', transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] } },
            }}
          >
            {word}
            {i < words.length - 1 ? '\u00A0' : ''}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  );
}
