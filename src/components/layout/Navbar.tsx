'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { nav, site } from '@/content/site';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { RollText } from '@/components/ui/RollText';
import { PillButton } from '@/components/ui/PillButton';

/**
 * Fixed 54px nav inset 34px from every edge. It hides on downward scroll and
 * returns on the way back up; the active link is full opacity, the rest 50%.
 */
export function Navbar() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, 'change', (current) => {
    const previous = scrollY.getPrevious() ?? 0;
    setHidden(current > previous && current > 240);
  });

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <motion.header
        className="fixed inset-x-5 top-5 z-[120] md:inset-x-[34px] md:top-[34px]"
        animate={{ y: hidden ? -120 : 0, opacity: hidden ? 0 : 1 }}
        transition={{ duration: 0.5, ease: ease.expo }}
      >
        <nav className="flex h-[54px] items-center justify-between">
          <Link href="#home" className="text-[26px] leading-none font-black tracking-[-0.04em] text-paper-soft">
            VIPER<span className="text-brand">*</span>
          </Link>

          <ul className="hidden items-center gap-[50px] lg:flex">
            {nav.map((item, i) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={cn(
                    'group/roll flex items-start gap-[2px] transition-opacity duration-300 hover:opacity-100',
                    i === 0 ? 'opacity-100' : 'opacity-50',
                  )}
                >
                  <RollText
                    lineHeight={22}
                    gap={6}
                    className="text-[18px] font-semibold tracking-[-0.1px] text-paper-soft"
                  >
                    {item.label}
                  </RollText>
                  <span className="text-[10px] leading-3 font-bold tracking-[-0.1px] text-paper-soft">
                    {item.index}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <PillButton label="Get in touch" href="#contact" />
          </div>

          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="grid size-[54px] place-items-center rounded-full bg-cream md:hidden"
          >
            <span className="flex flex-col gap-[5px]">
              <span className="block h-[2px] w-5 rounded-full bg-ink" />
              <span className="block h-[2px] w-5 rounded-full bg-ink" />
            </span>
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[130] flex flex-col justify-between bg-brand px-5 pt-5 pb-10 md:hidden"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.7, ease: ease.inOut }}
          >
            <div className="flex h-[54px] items-center justify-between">
              <span className="text-[26px] leading-none font-black tracking-[-0.04em] text-paper-soft">
                VIPER<span className="text-ink">*</span>
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="grid size-[54px] place-items-center rounded-full bg-paper-soft text-ink"
              >
                <span className="relative block size-5">
                  <span className="absolute top-1/2 left-0 h-[2px] w-5 rotate-45 rounded-full bg-ink" />
                  <span className="absolute top-1/2 left-0 h-[2px] w-5 -rotate-45 rounded-full bg-ink" />
                </span>
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {nav.map((item, i) => (
                <motion.li
                  key={item.label}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: ease.expo, delay: 0.25 + i * 0.07 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline gap-3 border-b border-paper-soft/25 py-4 text-[44px] leading-none font-semibold tracking-[-0.03em] text-paper-soft"
                  >
                    {item.label}
                    <span className="text-[12px] font-bold">{item.index}</span>
                  </Link>
                </motion.li>
              ))}
            </ul>

            <p className="text-label text-paper-soft/80">{site.email}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
