'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { nav, site } from '@/content/site';
import { useIntroPlaying } from '@/lib/intro';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** After the reel hands over, the nav waits for the wordmark to land first. */
const AFTER_INTRO = 1100;

/**
 * Studio Mirage's header: the wordmark on the left; on the right two links and
 * a white contact pill with a turning glow behind it, over a band of graded
 * blur that keeps it legible above anything scrolling beneath. A dot marks the
 * link whose sections fill the middle of the screen. It stays out of the way
 * while the landing reel plays.
 */
export function Navbar() {
  const intro = useIntroPlaying();
  const [held, setHeld] = useState(intro);
  const [current, setCurrent] = useState<string | null>(null);
  // On the landing, section links are plain anchors for the smooth-scroll glide;
  // elsewhere they lead back to the landing.
  const home = usePathname() === '/';
  const Anchor = home ? 'a' : Link;
  const to = (hash: string) => (home ? hash : `/${hash}`);

  useEffect(() => {
    if (intro) {
      setHeld(true);
      return;
    }
    const timer = window.setTimeout(() => setHeld(false), AFTER_INTRO);
    return () => window.clearTimeout(timer);
  }, [intro]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const middle = window.innerHeight / 2;
      const here = nav.links.find((link) =>
        link.sections.some((id) => {
          const box = document.getElementById(id)?.getBoundingClientRect();
          return box ? box.top <= middle && box.bottom > middle : false;
        }),
      );
      setCurrent(here?.href ?? null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <motion.header
      className="site-header"
      // Starts out of view: the server renders the page with its reel up.
      initial={{ y: -120, opacity: 0 }}
      animate={{ y: held ? -120 : 0, opacity: held ? 0 : 1 }}
      transition={{ duration: 0.5, ease: ease.expo }}
      inert={held}
    >
      <div className="site-header-blur" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <Anchor
        href={home ? '#home' : '/'}
        className="absolute left-[var(--pad-sides)] text-[22px] leading-none font-black tracking-[-0.04em] text-paper-soft md:text-[26px]"
      >
        {site.wordmark}
        <span className="text-brand">{site.brandSuffix}</span>
      </Anchor>

      <nav
        aria-label="Main"
        className="font-studio flex items-center gap-[max(10px,4vw)] text-[0.9rem] font-semibold md:gap-[min(30px,4vw)] md:text-[0.85rem]"
      >
        {nav.links.map((link) => (
          <Anchor
            key={link.href}
            href={to(link.href)}
            // On phones Mirage gives each link extra room on its left for the dot.
            className={cn('site-header-link max-md:ml-2.5', current === link.href && 'is-active')}
            aria-current={current === link.href ? 'location' : undefined}
          >
            {link.label}
          </Anchor>
        ))}
        <Link href={nav.contact.href} className="glow-button">
          <span className="glow-button-label">{nav.contact.label}</span>
          <span className="glow-button-bg" aria-hidden />
        </Link>
      </nav>
    </motion.header>
  );
}
