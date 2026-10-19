'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { nav, site } from '@/content/site';
import { useIntroPlaying } from '@/lib/intro';
import { ease } from '@/lib/motion';
import { lockScroll, navigateTo } from '@/lib/scroll';
import { cn } from '@/lib/utils';
import { AtlasLogo } from '@/components/ui/AtlasLogo';

/** After the reel hands over, the nav waits for the wordmark to land first. */
const AFTER_INTRO = 1100;

/** Below this width the links fold into the menu (keep in step with .site-header-links). */
const MENU_UNDER = '(width < 40rem)';

/**
 * Studio Mirage's header: the studio's logo on the left; on the right two links and
 * a white contact pill with a turning glow behind it, over a band of graded
 * blur that keeps it legible above anything scrolling beneath. A dot marks the
 * link whose sections fill the middle of the screen. It stays out of the way
 * while the landing reel plays. On a phone the links fold into a menu that
 * opens out of its button as a circle of frosted light.
 */
export function Navbar() {
  const intro = useIntroPlaying();
  const [held, setHeld] = useState(intro);
  const [current, setCurrent] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // On the landing, section links are plain anchors for the smooth-scroll glide;
  // elsewhere they lead back to the landing. Page links (the work page) are links everywhere.
  const pathname = usePathname();
  const home = pathname === '/';
  const Anchor = home ? 'a' : Link;
  const to = (hash: string) => (home ? hash : `/${hash}`);
  const isCurrent = (href: string) => current === href || (!href.startsWith('#') && pathname.startsWith(href));

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

  const closeMenu = useCallback(() => setMenu(false), []);

  // A new page, or a screen wide enough for the links, puts the menu away.
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    const query = window.matchMedia(MENU_UNDER);
    const onChange = () => {
      if (!query.matches) setMenu(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      <motion.header
        className={cn('site-header', menu && 'is-menu-open')}
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

        <Anchor href={home ? '#home' : '/'} onClick={closeMenu} className="site-logo" aria-label={`${site.name}, home`}>
          <AtlasLogo title="" weight={0.4} className="h-full w-auto" />
        </Anchor>

        <nav
          aria-label="Main"
          className="font-studio flex items-center gap-[max(10px,4vw)] text-[0.9rem] font-semibold md:gap-[min(30px,4vw)] md:text-[0.85rem]"
        >
          <span className="site-header-links">
            {nav.links.map((link) => {
              const Tag = link.href.startsWith('#') ? Anchor : Link;
              const active = isCurrent(link.href);
              return (
                <Tag
                  key={link.href}
                  href={link.href.startsWith('#') ? to(link.href) : link.href}
                  // On phones Mirage gives each link extra room on its left for the dot.
                  className={cn('site-header-link max-md:ml-2.5', active && 'is-active')}
                  aria-current={active ? (link.href.startsWith('#') ? 'location' : 'page') : undefined}
                >
                  {link.label}
                </Tag>
              );
            })}
          </span>
          <Link href={nav.contact.href} className="glow-button" onClick={closeMenu}>
            <span className="glow-button-label">{nav.contact.label}</span>
            <span className="glow-button-bg" aria-hidden />
          </Link>
          <button
            type="button"
            className="site-menu-button"
            aria-expanded={menu}
            aria-controls="site-menu"
            aria-label={menu ? 'Close the menu' : 'Open the menu'}
            onClick={() => setMenu((open) => !open)}
          >
            <span aria-hidden />
            <span aria-hidden />
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>{menu && <SiteMenu home={home} isCurrent={isCurrent} onClose={closeMenu} />}</AnimatePresence>
    </>
  );
}

type SiteMenuProps = {
  home: boolean;
  isCurrent: (href: string) => boolean;
  onClose: () => void;
};

/** Where the menu button sits, which the menu opens out of and closes back into. */
function origin() {
  const button = document.querySelector('.site-menu-button')?.getBoundingClientRect();
  const x = button ? button.left + button.width / 2 : window.innerWidth - 40;
  const y = button ? button.top + button.height / 2 : 44;
  // Far enough to cover the farthest corner of the screen.
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;
  return { x, y, r };
}

/**
 * The phone's menu: the page frosts over in a circle of light that grows out
 * of the menu button; the links rise into it one after another, large, between
 * hairlines, with the studio's address and its elsewhere at the foot. Under
 * reduced motion it simply fades in and out.
 */
function SiteMenu({ home, isCurrent, onClose }: SiteMenuProps) {
  const reduce = useReducedMotion() ?? false;
  const [{ x, y, r }] = useState(origin);
  const release = useRef<(() => void) | null>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    release.current = lockScroll();
    firstLink.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      release.current?.();
      release.current = null;
    };
  }, [onClose]);

  /** A section of the landing: the page is let go first, then glides there. */
  const glide = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, hash: string) => {
      if (!home) return;
      const target = document.querySelector<HTMLElement>(hash);
      if (!target) return;
      event.preventDefault();
      release.current?.();
      release.current = null;
      onClose();
      requestAnimationFrame(() => navigateTo(target, -100));
    },
    [home, onClose],
  );

  const items = [
    ...nav.links.map((link) => ({ label: link.label, href: link.href })),
    { label: nav.contact.label, href: nav.contact.href },
  ];

  return (
    <motion.div
      id="site-menu"
      className="site-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      initial={reduce ? { opacity: 0 } : { clipPath: `circle(0px at ${x}px ${y}px)` }}
      animate={reduce ? { opacity: 1, transition: { duration: 0.25 } } : { clipPath: `circle(${r}px at ${x}px ${y}px)`, transition: { duration: 0.85, ease: ease.inOut } }}
      exit={reduce ? { opacity: 0, transition: { duration: 0.2 } } : { clipPath: `circle(0px at ${x}px ${y}px)`, transition: { duration: 0.6, ease: ease.inOut, delay: 0.1 } }}
    >
      <span className="site-menu-glow" aria-hidden />

      <ol className="site-menu-links">
        {items.map((item, i) => {
          const hash = item.href.startsWith('#');
          const active = isCurrent(item.href);
          return (
            <motion.li
              key={item.href}
              initial={reduce ? false : { opacity: 0, y: 36, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: ease.expo, delay: 0.22 + i * 0.07 } }}
              exit={reduce ? undefined : { opacity: 0, y: -12, filter: 'blur(6px)', transition: { duration: 0.3, ease: ease.inOut } }}
            >
              <Link
                ref={i === 0 ? firstLink : undefined}
                href={hash ? `/${item.href}` : item.href}
                className={cn('site-menu-link', active && 'is-active')}
                aria-current={active ? (hash ? 'location' : 'page') : undefined}
                onClick={(event) => (hash ? glide(event, item.href) : onClose())}
              >
                <span className="site-menu-number">{String(i + 1).padStart(2, '0')}</span>
                <span className="site-menu-label">{item.label}</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="site-menu-arrow">
                  <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </motion.li>
          );
        })}
      </ol>

      <motion.div
        className="site-menu-foot"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.8, ease: ease.expo, delay: 0.5 } }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      >
        <span className="site-menu-overline">Say hello</span>
        <a href={`mailto:${site.email}`} className="site-menu-mail">
          {site.email}
        </a>
        <span className="site-menu-social">
          <a href={site.instagram} target="_blank" rel="noreferrer">
            Instagram
          </a>
          <a href={site.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        </span>
      </motion.div>
    </motion.div>
  );
}
