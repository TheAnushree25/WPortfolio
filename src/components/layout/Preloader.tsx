'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { site } from '@/content/site';
import { ease } from '@/lib/motion';

/**
 * Full-bleed brand panel shown on first paint. The wordmark fades in, holds,
 * then the panel splits into five columns that wipe upward in sequence —
 * handing straight over to the hero's own column reveal.
 */
export function Preloader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const body = document.body;
    body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      setDone(true);
      body.style.overflow = '';
    }, 1900);
    return () => {
      window.clearTimeout(timer);
      body.style.overflow = '';
    };
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div className="fixed inset-0 z-[150] flex" exit={{ transition: { duration: 0 } }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.span
              key={i}
              className="h-full flex-1 bg-brand"
              initial={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ duration: 0.9, ease: ease.inOut, delay: i * 0.06 }}
            />
          ))}

          <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            exit={{ opacity: 0, transition: { duration: 0.35, ease: ease.appear } }}
          >
            <motion.span
              className="text-[clamp(3rem,10vw,7rem)] leading-none font-black tracking-[-0.04em] text-paper-soft"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: ease.expo }}
            >
              {site.wordmark}
              <span className="text-paper-soft/60">{site.brandSuffix}</span>
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
