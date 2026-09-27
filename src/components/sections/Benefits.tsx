'use client';

import Image from 'next/image';
import * as motion from 'motion/react-client';
import { benefits } from '@/content/site';
import { riseIn, stagger, viewport } from '@/lib/motion';
import { GridLines } from '@/components/ui/GridLines';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NoiseLayer } from './Approach';

export function Benefits() {
  return (
    <section className="relative z-10 w-full bg-paper py-[120px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[834px]">
        <GridLines />
      </div>

      <div className="gutter relative">
        <div className="shell flex flex-col gap-20">
          <SectionHeader label={benefits.label} code={benefits.code} />

          <motion.div
            className="grid grid-cols-1 gap-5 md:grid-cols-3"
            variants={stagger(0.13)}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            <motion.div variants={riseIn}>
              <SpeedCard />
            </motion.div>
            <motion.div variants={riseIn}>
              <PlatformCard />
            </motion.div>
            <motion.div variants={riseIn}>
              <SupportCard />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function SpeedCard() {
  const { speed } = benefits;
  return (
    <article className="group relative flex h-[600px] flex-col items-center overflow-hidden rounded-[10px] bg-mist">
      <Image
        src={speed.src}
        alt={speed.alt}
        fill
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
      />
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-paper via-paper/85 to-transparent" />
      <div className="relative flex flex-col items-center gap-1 px-10 pt-[75px] text-center">
        <p className="text-title text-ink">{speed.title}</p>
        <p className="text-[15px] leading-4 font-medium tracking-[-0.1px] text-ink/60">{speed.body}</p>
      </div>
      <motion.span
        className="absolute bottom-[100px] grid size-[72px] place-items-center rounded-[40px] bg-brand text-paper-soft"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-8" aria-hidden>
          <path
            d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"
            fill="currentColor"
          />
        </svg>
      </motion.span>
    </article>
  );
}

function PlatformCard() {
  const { platform } = benefits;
  return (
    <article className="group relative flex h-[600px] items-end justify-center overflow-hidden rounded-[10px] bg-brand shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]">
      <div className="absolute inset-x-[22px] top-[22px] bottom-0 overflow-hidden rounded-[5px] bg-paper-soft p-6 shadow-[0_0_4px_0_rgb(0_0_0_/_0.05)]">
        <NoiseLayer />
        <div className="relative flex flex-col items-center gap-[10px]">
          <p className="text-eyebrow text-center text-ink/60">{platform.eyebrow}</p>
          <h3 className="text-center text-[clamp(2.5rem,4vw,3.625rem)] leading-[0.86] font-semibold tracking-[-0.026em] text-ink">
            {platform.title}
          </h3>
        </div>
      </div>
      <motion.div
        className="relative h-[514px] w-[339px] overflow-hidden rounded-t-[57px]"
        initial={{ y: 80 }}
        whileInView={{ y: 0 }}
        viewport={viewport}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <Image
          src={platform.src}
          alt={platform.alt}
          fill
          sizes="339px"
          className="object-cover object-top transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
        />
      </motion.div>
    </article>
  );
}

function SupportCard() {
  const { support } = benefits;
  return (
    <article className="group relative flex h-[600px] flex-col justify-start overflow-hidden rounded-[10px] bg-ink p-6">
      <Image src={support.bg} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover opacity-55" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/40 to-ink/90" />

      <div className="relative flex flex-col gap-[22px]">
        <p className="text-eyebrow text-paper-soft/60">{support.eyebrow}</p>
        <h3 className="text-h3 text-paper-soft">{support.title}</h3>
        <p className="text-meta max-w-[387px] text-paper-soft/60">{support.body}</p>
      </div>

      <motion.div
        className="absolute inset-x-6 bottom-[-30px] mx-auto h-[408px] w-[329px] overflow-hidden rounded-t-[57px]"
        initial={{ y: 60 }}
        whileInView={{ y: 0 }}
        viewport={viewport}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      >
        <Image
          src={support.src}
          alt={support.alt}
          fill
          sizes="329px"
          className="object-cover object-top transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
        />
      </motion.div>
    </article>
  );
}
