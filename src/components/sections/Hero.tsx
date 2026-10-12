'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// motion/react-client bundles its own MotionValue type, so values from these hooks
// only type-check against the motion components exported alongside them.
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { hero } from '@/content/site';
import { setIntroPlaying } from '@/lib/intro';
import { ease } from '@/lib/motion';
import { isNavigating, lockScroll, scrollTarget } from '@/lib/scroll';
import { useWork } from '@/lib/work';
import { IntroReel } from '@/components/hero/IntroReel';
import { LivingGradient } from '@/components/hero/LivingGradient';
import { AtlasWordmark, type WordmarkState } from '@/components/hero/AtlasWordmark';
import { AtlasEmblem } from '@/components/hero/AtlasEmblem';
import { StudioStatement } from '@/components/hero/StudioStatement';
import { MissionStatement } from '@/components/hero/MissionStatement';
import { FRAME, WORDMARK_BOX } from '@/components/hero/geometry';

type Slide = 'intro' | 'atlas' | 'studio' | 'mission';

/** Viewport heights the landing stays pinned while its slides play. */
const HOLD = 1.6;
/** After the reel dissolves, the wordmark lands before scrolling is handed back (ms). */
const LANDING_HOLD = 1600;
/** Each scene change keeps the page still until its moment has played (ms). */
const SPIN_HOLD = 2600;
const MISSION_HOLD = 1900;
/** The statement waits for the emblem to all but settle (s). */
const STATEMENT_DELAY = 2.2;

/** Scroll positions that call each slide; the gaps between them stop a resting page flickering. */
const studioAt = () => Math.min(64, window.innerHeight * 0.06);
const missionAt = () => window.innerHeight * 0.55;
const missionUntil = () => window.innerHeight * 0.42;

/**
 * The landing. The studio reel plays first; when it ends, the Atlas slide
 * assembles over the same blue light. Scrolling on brings in the studio slide —
 * the emblem turns twice and settles, the statement follows — then the mission
 * in the statement's own focus-in, before the page carries on. Scroll triggers
 * each scene and time plays it, so every transition runs complete however fast
 * the visitor scrolls. The light itself is fixed behind the whole page.
 */
export function HeroScene() {
  const reduce = useReducedMotion() ?? false;
  const [slide, setSlide] = useState<Slide>('intro');
  const [fromReel, setFromReel] = useState(true);
  const [statementDelay, setStatementDelay] = useState(STATEMENT_DELAY);
  const scene = useMotionValue(0);
  const trackRef = useRef<HTMLElement>(null);
  const releaseReel = useRef<(() => void) | null>(null);
  const previous = useRef<Slide>('intro');
  // The light rests while a project covers the page.
  const covered = useWork((state) => state.covered);

  // The boot script already decided whether the reel plays.
  useEffect(() => {
    if (document.documentElement.dataset.intro !== 'playing') {
      setFromReel(false);
      return;
    }
    window.scrollTo(0, 0);
    const release = lockScroll();
    releaseReel.current = release;
    return () => {
      release();
      releaseReel.current = null;
    };
  }, []);

  const land = useCallback(() => {
    setSlide('atlas');
    setIntroPlaying(false);
    window.setTimeout(() => releaseReel.current?.(), LANDING_HOLD);
  }, []);

  // Deep links and reduced motion skip the reel: land on whichever slide the page is at.
  useEffect(() => {
    if (!fromReel && slide === 'intro') setSlide('atlas');
  }, [fromReel, slide]);

  const landed = slide !== 'intro';
  useEffect(() => {
    if (!landed) return;
    const onScroll = () => {
      const y = window.scrollY;
      setSlide((current) => {
        if (current === 'atlas') return y > studioAt() ? 'studio' : current;
        if (current === 'studio') {
          if (y < 4) return 'atlas';
          return y > missionAt() ? 'mission' : current;
        }
        if (current === 'mission') return y < missionUntil() ? 'studio' : current;
        return current;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [landed]);

  useEffect(() => {
    const was = previous.current;
    previous.current = slide;
    if (slide !== 'atlas' && slide !== 'intro') setFromReel(false);
    // Coming back from the mission, the emblem is already still: no wait for it.
    if (slide === 'studio') setStatementDelay(was === 'atlas' ? STATEMENT_DELAY : 0.3);

    const hold = slide === 'studio' && was === 'atlas' ? SPIN_HOLD : slide === 'mission' && was === 'studio' ? MISSION_HOLD : 0;
    const track = trackRef.current;
    // Never hold a visitor who is flying past, gliding to a nav link or arriving from below.
    const flying = track && scrollTarget() > track.offsetTop + track.offsetHeight - window.innerHeight;
    if (!hold || reduce || flying || isNavigating() || window.scrollY > window.innerHeight * HOLD) return;
    const release = lockScroll();
    const timer = window.setTimeout(release, hold);
    return () => {
      window.clearTimeout(timer);
      release();
    };
  }, [slide, reduce]);

  // The light morphs from the Atlas beams to the studio glow, and back.
  useEffect(() => {
    const controls = animate(scene, slide === 'studio' || slide === 'mission' ? 1 : 0, {
      duration: reduce ? 0 : 2.2,
      ease: [0.65, 0, 0.35, 1],
    });
    return () => controls.stop();
  }, [slide, reduce, scene]);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <LivingGradient scene={scene} running={!covered} />
      </div>

      <AnimatePresence initial={false}>{slide === 'intro' && <IntroReel key="reel" onEnd={land} />}</AnimatePresence>

      <section ref={trackRef} className="relative z-10" style={{ height: `${(1 + HOLD) * 100}svh` }}>
        <div className="sticky top-0 h-[100svh] min-h-[640px]">
          <Stage slide={slide} fromReel={fromReel} statementDelay={statementDelay} reduce={reduce} />
        </div>
      </section>
    </>
  );
}

type StageProps = {
  slide: Slide;
  fromReel: boolean;
  statementDelay: number;
  reduce: boolean;
};

const wordmarkState: Record<Slide, WordmarkState> = { intro: 'hidden', atlas: 'shown', studio: 'gone', mission: 'gone' };

/** The pinned frame: the Figma slides drawn on one 1440 × 807 canvas that scales with the screen. */
function Stage({ slide, fromReel, statementDelay, reduce }: StageProps) {
  const emblemShown = slide === 'studio' || slide === 'mission';

  return (
    <div id="home" data-nav-tone="dark" className="hero-stage relative h-full w-full overflow-hidden">
      <div className="hero-frame absolute inset-0">
        <FrameLines shown={slide !== 'intro'} reduce={reduce} />

        {/* Slide 1 — the wordmark, edge to edge with its baseline at 683.1 of 807. */}
        <div
          className="absolute"
          style={{
            left: `calc(${WORDMARK_BOX.x} * var(--u))`,
            width: `calc(${WORDMARK_BOX.width} * var(--u))`,
            bottom: `${((FRAME.height - (WORDMARK_BOX.y + WORDMARK_BOX.height)) / FRAME.height) * 100}%`,
          }}
        >
          <AtlasWordmark state={wordmarkState[slide]} delay={fromReel ? 0.55 : 0.2} reduce={reduce} label={hero.wordmark} />
        </div>
        <ScrollCue shown={slide === 'atlas'} delay={fromReel ? 2.4 : 0.6} label={hero.scrollCue} />

        {/* Slide 2 — the emblem at the frame's centre with the statement over it;
            slide 3 keeps the emblem, dimmed, behind the mission. */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: 'calc(466 * var(--s))', height: 'calc(466 * var(--s))' }}
          animate={{ opacity: slide === 'mission' ? 0.45 : 1, scale: slide === 'mission' ? 0.92 : 1 }}
          transition={{ duration: reduce ? 0 : 1.2, ease: ease.inOut }}
        >
          <AtlasEmblem shown={emblemShown} reduce={reduce} label={hero.emblem} />
        </motion.div>
        <div className="absolute inset-0 flex items-center justify-center">
          <StudioStatement lines={hero.statement} shown={slide === 'studio'} reduce={reduce} delay={reduce ? 0.2 : statementDelay} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center px-5">
          <MissionStatement text={hero.mission} shown={slide === 'mission'} reduce={reduce} delay={reduce ? 0.2 : 0.4} />
        </div>
      </div>
    </div>
  );
}

/** The frame's quarter lines, drawn down when the first slide arrives. */
function FrameLines({ shown, reduce }: { shown: boolean; reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {[25, 50, 75].map((left, i) => (
        <motion.span
          key={left}
          className="absolute inset-y-0 w-px bg-paper-soft/[0.08]"
          style={{ left: `${left}%`, originY: 0 }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: shown ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 1.6, ease: ease.expo, delay: shown ? 0.25 + i * 0.12 : 0 }}
        />
      ))}
    </div>
  );
}

/** Vertical “SCROLL” over a hairline that runs to the frame's bottom edge. */
function ScrollCue({ shown, delay, label }: { shown: boolean; delay: number; label: string }) {
  return (
    <motion.div
      className="pointer-events-none absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={{ duration: shown ? 1 : 0.4, ease: ease.appear, delay: shown ? delay : 0 }}
    >
      <span
        className="font-studio leading-none font-medium text-paper-soft/75 uppercase [writing-mode:vertical-rl]"
        style={{ fontSize: 'max(10px, calc(12 * var(--u)))', letterSpacing: '0.5em' }}
      >
        {label}
      </span>
      <span
        className="relative w-px overflow-hidden bg-paper-soft/35"
        style={{ height: 'calc(44 * var(--u))', marginTop: 'calc(20 * var(--u))' }}
      >
        <span className="absolute inset-0 animate-[scroll-drip_2.4s_cubic-bezier(0.76,0,0.24,1)_infinite] bg-gradient-to-b from-transparent via-paper-soft to-transparent" />
      </span>
    </motion.div>
  );
}

