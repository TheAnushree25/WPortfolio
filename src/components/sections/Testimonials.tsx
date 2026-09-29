'use client';

import Image from 'next/image';
import * as motion from 'motion/react-client';
import { testimonials } from '@/content/site';
import { riseIn, stagger, viewportEarly } from '@/lib/motion';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CentredHeading } from './CentredHeading';
import { NoiseLayer } from './Approach';

export function Testimonials() {
  return (
    <section className="relative z-10 w-full overflow-hidden bg-paper pt-[10px] pb-[110px]">
      <div className="gutter">
        <div className="shell flex flex-col gap-[50px]">
          <SectionHeader label={testimonials.label} code={testimonials.code} />

          <CentredHeading
            badge={testimonials.badge}
            heading={testimonials.heading}
            body={testimonials.body}
            cta={testimonials.cta}
          />

          <motion.div
            className="grid grid-cols-1 gap-5 pt-10 md:grid-cols-2 lg:grid-cols-3"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="show"
            viewport={viewportEarly}
          >
            {testimonials.items.map((item) => (
              <motion.figure
                key={item.name}
                variants={riseIn}
                className="group relative flex flex-col gap-6 overflow-hidden rounded-[10px] bg-cream px-6 pt-6 pb-[30px] transition-shadow duration-500 hover:shadow-[0_18px_40px_-26px_rgb(9_9_9_/_0.4)]"
              >
                <NoiseLayer />

                <div className="relative flex items-start justify-between">
                  <span className="relative grid size-[50px] place-items-center overflow-hidden rounded-full bg-brand text-paper-soft">
                    {'avatar' in item && typeof item.avatar === 'string' ? (
                      <Image src={item.avatar} alt={item.name} fill sizes="50px" className="object-cover" />
                    ) : (
                      <Medal />
                    )}
                  </span>
                  <span className="grid size-10 place-items-center rounded-full bg-line text-ink shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)] transition-transform duration-500 group-hover:-rotate-45">
                    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
                      <path
                        d="M3 13 13 3M5.5 3H13v7.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>

                <span className="relative flex w-[120px]" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} />
                  ))}
                </span>

                <blockquote className="text-body relative text-ink-700">{item.quote}</blockquote>

                <div className="relative mt-auto flex flex-col gap-[10px]">
                  <span className="h-px w-full bg-line" />
                  <figcaption className="flex flex-col">
                    <span className="text-title flex items-center gap-[10px] text-ink">
                      {item.name}
                      <span className="size-1 rounded-full bg-ink" />
                      {item.role}
                    </span>
                    <span className="text-small text-ink/60">{item.company}</span>
                  </figcaption>
                </div>
              </motion.figure>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** Award mark shown where the reference places a client portrait. */
function Medal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
      <circle cx="12" cy="14" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 3h6l-1.5 5h-3L9 3Z" fill="currentColor" />
      <path d="m12 11.2.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3.9-1.8Z" fill="currentColor" />
    </svg>
  );
}

/** 24px brand star. Five of them sit in a 120px row, matching the reference. */
function Star() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-brand" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.4 14.6 8.9 21.6 9.5 16.4 14.1 18 21 12 17.4 6 21 7.6 14.1 2.4 9.5 9.4 8.9 12 2.4Z"
      />
    </svg>
  );
}
