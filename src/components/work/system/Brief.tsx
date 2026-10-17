'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { works } from '@/content/site';
import type { Screen, SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';
import { FocusText } from '@/components/ui/FocusText';
import { BrowserFrame, ScreenShot } from './Frames';
import { useViewerScroll } from './scroll';

const words = works.system;

/**
 * The brief, set large and focusing in as it arrives, beside the facts of the
 * job; then the product itself, in its browser, tipping up to face the reader
 * as it rises into view.
 */
export function Brief({ study, host, cover }: { study: SystemCase; host: string; cover: Screen }) {
  const reduce = useReducedMotion() ?? false;
  const scroller = useViewerScroll();
  const stageRef = useRef<HTMLDivElement>(null);
  // The scroller is an ancestor, attached after this mounts: measure in a passive effect.
  const { scrollYProgress } = useScroll({ container: scroller ?? undefined, target: stageRef, offset: ['start end', 'center center'], layoutEffect: false });
  const rotateX = useTransform(scrollYProgress, [0, 1], [26, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.84, 1]);
  const y = useTransform(scrollYProgress, [0, 1], ['8%', '0%']);
  const glow = useTransform(scrollYProgress, [0.3, 1], [0, 1]);

  return (
    <div className="sys-brief">
      <motion.div className="sys-brief-grid" initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.35 }}>
        <FocusText as="p" text={study.brief} className="sys-lede" delay={0.05} step={Math.min(0.018, 1.2 / study.brief.length)} />
        <motion.dl
          className="sys-facts"
          variants={{ hidden: { opacity: 0, y: 24 }, shown: { opacity: 1, y: 0, transition: { duration: 1, ease: ease.expo, delay: 0.5 } } }}
        >
          {study.facts.map((fact) => (
            <div key={fact.label} className="sys-fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
          {study.live && (
            <div className="sys-fact is-link">
              <dt>{words.visit}</dt>
              <dd>
                <a href={study.live.href} target="_blank" rel="noreferrer">
                  {study.live.label}
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </dd>
            </div>
          )}
        </motion.dl>
      </motion.div>

      <div ref={stageRef} className="sys-brief-stage">
        <motion.div className="sys-brief-tilt" style={reduce ? undefined : { rotateX, scale, y, transformPerspective: 1600 }}>
          <motion.span aria-hidden className="sys-brief-glow" style={reduce ? undefined : { opacity: glow }} />
          <BrowserFrame host={host}>
            <ScreenShot screen={cover} sizes="(min-width: 1024px) min(1100px, 70vw), 100vw" alt={cover.caption} />
          </BrowserFrame>
        </motion.div>
      </div>
    </div>
  );
}
