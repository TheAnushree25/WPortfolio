'use client';

import Image from 'next/image';
import Link from 'next/link';
import * as motion from 'motion/react-client';
import { footer, images, site } from '@/content/site';
import { fadeUp, stagger, viewport } from '@/lib/motion';
import { PillButton } from '@/components/ui/PillButton';
import { RollText } from '@/components/ui/RollText';
import { NoiseLayer } from '@/components/sections/Approach';

export function Footer() {
  return (
    <footer className="relative z-10 w-full bg-paper px-4 pb-4">
      <div className="relative flex flex-col gap-20 overflow-hidden rounded-[10px] bg-cream p-4">
        <NoiseLayer opacity={0.2} />

        {/* Hero banner */}
        <motion.div
          className="relative h-[410px] w-full overflow-hidden rounded-[5px]"
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewport}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <Image
            src={images.footer}
            alt="Man wearing sunglasses"
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="text-[clamp(3rem,9vw,7rem)] leading-none font-black tracking-[-0.04em] text-paper-soft mix-blend-difference">
              VIPER<span className="text-brand">*</span>
            </span>
          </span>
        </motion.div>

        {/* Body */}
        <motion.div
          className="relative grid grid-cols-1 gap-12 px-4 lg:grid-cols-[1fr_auto_auto] lg:gap-20 lg:px-[60px]"
          variants={stagger(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          <motion.div variants={fadeUp} className="flex max-w-[564px] flex-col gap-5">
            <h2 className="text-h3 text-ink/40">{footer.heading}</h2>
            <Link href={`mailto:${site.email}`} className="text-h3 text-ink-900 transition-colors hover:text-brand">
              {site.email}
            </Link>
            <p className="text-meta max-w-[420px] text-ink/60">{footer.body}</p>
            <div className="pt-4">
              <PillButton label={footer.cta.label} href={footer.cta.href} tone="line" />
            </div>
          </motion.div>

          <motion.nav variants={fadeUp} className="w-full lg:w-[445px]">
            <ul className="flex flex-col">
              {footer.links.map((link, i) => (
                <li key={link.label} className="group/roll relative">
                  {/* Active (and hovered) rows pick up a second rule above the label. */}
                  <span
                    className={`absolute inset-x-0 top-0 h-px origin-left bg-line-strong transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      i === 0 ? 'scale-x-100' : 'scale-x-0 group-hover/roll:scale-x-100'
                    }`}
                  />
                  <Link href={link.href} className="flex items-center justify-between py-[11px]">
                    <span className="flex items-baseline gap-2">
                      <span className="text-chip text-ink">{link.index}</span>
                      <RollText lineHeight={26} gap={0} className="text-label text-ink" hoverClassName="text-brand">
                        {link.label}
                      </RollText>
                    </span>
                    <span className="relative block size-[18px] overflow-hidden text-ink">
                      <span className="flex w-max gap-[10px] transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/roll:-translate-x-[28px]">
                        <Arrow />
                        <Arrow />
                      </span>
                    </span>
                  </Link>
                  <span className="block h-px bg-line-strong" />
                </li>
              ))}
            </ul>
          </motion.nav>

          <motion.div variants={fadeUp} className="flex items-start">
            <span className="text-tag inline-flex items-center rounded-[10px] bg-paper-soft px-[14px] py-2 text-ink/80 shadow-[0_0_4px_0_rgb(0_0_0_/_0.05)]">
              {footer.badge}
            </span>
          </motion.div>
        </motion.div>

        {/* Baseline */}
        <div className="relative px-4 lg:px-[60px]">
          <span className="block h-px w-full bg-line-strong" />
          <div className="flex flex-col items-center justify-between gap-4 py-5 sm:flex-row">
            <p className="text-label text-ink-800">{site.copyright}</p>
            <Link href="#home" className="group/roll">
              <RollText lineHeight={26} gap={10} className="text-label text-ink-800" hoverClassName="text-brand">
                {footer.backToTop}
              </RollText>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0" aria-hidden>
      <path
        d="M4 9h10M10 5l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
