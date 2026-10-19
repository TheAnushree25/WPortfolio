'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { BrowserFrame, PhoneFrame, ScreenShot } from './Frames';
import { useViewerScroll } from './scroll';

const words = works.system;

const phonesIn: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
const phoneIn: Variants = {
  hidden: { opacity: 0, y: 60, rotate: -2 },
  shown: { opacity: 1, y: 0, rotate: 0, transition: { duration: 1.2, ease: ease.expo } },
};

/**
 * The product on screen. On wide screens one browser stays in view while the
 * reading carries it through the site, a page per stretch of scroll with its
 * caption lit beside it; phones get the same pages one after another. Then the
 * phone screens, side by side. An app plays the same way in a phone: its
 * screens are the sequence, and there is no browser to show.
 */
export function Screens({ study, host }: { study: SystemCase; host: string }) {
  const reduce = useReducedMotion() ?? false;
  const scroller = useViewerScroll();
  const app = study.platform === 'app';
  const desktops = study.screens.filter((screen) => screen.device === 'desktop');
  const phones = study.screens.filter((screen) => screen.device === 'phone');
  const sequence = app ? phones : desktops;
  const trio = app ? [] : phones.slice(0, 3);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The scroller is an ancestor, attached after this mounts: measure in a passive effect.
  const { scrollYProgress } = useScroll({ container: scroller ?? undefined, target: trackRef, offset: ['start 25%', 'end 75%'], layoutEffect: false });
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const next = Math.min(sequence.length - 1, Math.max(0, Math.floor(progress * sequence.length)));
    setIndex((current) => (current === next ? current : next));
  });
  const shown = sequence[index] ?? sequence[0];
  const ratio = sequence[0] ? sequence[0].width / sequence[0].height : 1.6;

  const slide = shown && (
    <AnimatePresence initial={false}>
      <motion.span
        key={shown.src}
        className="sys-screens-slide"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: '7%', scale: 1.02 }}
        animate={{ opacity: 1, y: '0%', scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: '-5%', scale: 0.99 }}
        transition={{ duration: 0.75, ease: ease.expo }}
      >
        <ScreenShot screen={shown} sizes={app ? '(min-width: 1024px) 340px, 80vw' : '(min-width: 1024px) min(980px, 56vw), 100vw'} alt={shown.caption} />
      </motion.span>
    </AnimatePresence>
  );

  return (
    <div className="sys-screens">
      {sequence.length > 0 && (
        <>
          <p className="sys-kicker">{app ? words.phone : words.desktop}</p>

          {/* Wide screens: one device, turning its screens as the reading goes. */}
          <div ref={trackRef} className={cn('sys-screens-track', app && 'is-app')} style={{ '--count': sequence.length, '--ratio': ratio } as CSSProperties}>
            <div className="sys-screens-sticky">
              <ol className="sys-screens-captions">
                {sequence.map((screen, i) => (
                  <li key={screen.src} className={cn('sys-screens-caption', i === index && 'is-active', i < index && 'is-past')}>
                    <span className="sys-screens-caption-num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{screen.caption}</span>
                  </li>
                ))}
              </ol>
              {app ? (
                <PhoneFrame className="sys-screens-phone">{slide}</PhoneFrame>
              ) : (
                <BrowserFrame host={host} className="sys-screens-browser">
                  {slide}
                </BrowserFrame>
              )}
            </div>
          </div>

          {/* Narrow screens: the same screens, one after another. */}
          <ol className={cn('sys-screens-stack', app && 'is-app')}>
            {sequence.map((screen) => (
              <motion.li
                key={screen.src}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.9, ease: ease.expo }}
              >
                {app ? (
                  <PhoneFrame>
                    <ScreenShot screen={screen} sizes="80vw" alt={screen.caption} />
                  </PhoneFrame>
                ) : (
                  <BrowserFrame host={host}>
                    <ScreenShot screen={screen} sizes="100vw" alt={screen.caption} />
                  </BrowserFrame>
                )}
                <span className="sys-screens-stack-caption">{screen.caption}</span>
              </motion.li>
            ))}
          </ol>
        </>
      )}

      {trio.length > 0 && (
        <>
          <p className="sys-kicker">{words.phone}</p>
          <motion.ul className="sys-phones" variants={phonesIn} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.25 }}>
            {trio.map((screen) => (
              <motion.li key={screen.src} className="sys-phones-item" variants={phoneIn}>
                <PhoneFrame>
                  <ScreenShot screen={screen} sizes="(min-width: 1024px) 300px, 70vw" alt={screen.caption} />
                </PhoneFrame>
                <span className="sys-phones-caption">{screen.caption}</span>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}
    </div>
  );
}
