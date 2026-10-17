'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { worksPage } from '@/content/site';
import { ease } from '@/lib/motion';

/** One frame a screen can show: a page of a deck, or a screen of a live site (`preview` may be empty for a lone card shot). */
export type ReelFrame = { src: string; preview: string };

/** A project as the screening room plays it: its frames, and the words under the screens. */
export type Reel = {
  slug: string;
  title: string;
  kind: string;
  discipline: 'system' | 'design';
  frames: ReelFrame[];
};

/** What the room is asked to show: everything, one discipline, or one project. */
export type RoomFocus = { slug: string } | { discipline: 'system' | 'design' } | null;

const SCREENS = 5;
/** The idle programme turns one screen over every few seconds, centre outward. */
const TURN = 2400;
const ORDER = [2, 1, 3, 0, 4];

type Slot = { reel: Reel; frame: ReelFrame };

/**
 * Studio Mirage's works backdrop in the studio's own light: an arc of five
 * screens standing on a floor that catches their glow. Left alone, the screens
 * run a programme of the work, turning over one at a time; pointed at a row or
 * a card, all five switch to it — the centre first, then outward — showing
 * five pages of the one project. The arc leans after the pointer.
 */
export function ScreeningRoom({ reels, focus }: { reels: Reel[]; focus: RoomFocus }) {
  const reduce = useReducedMotion() ?? false;
  const roomRef = useRef<HTMLDivElement>(null);

  // The idle programme: which project (and which of its frames) each screen shows.
  // One screen turns over per beat, centre outward, always to a project that
  // isn't already on the wall.
  const initialWall = useCallback(() => Array.from({ length: SCREENS }, (_, screen) => ({ reel: screen % Math.max(1, reels.length), frame: 0 })), [reels.length]);
  const [wall, setWall] = useState(initialWall);
  const nextReel = useRef(SCREENS);

  useEffect(() => {
    setWall(initialWall());
    nextReel.current = SCREENS;
  }, [initialWall, reels]);

  useEffect(() => {
    if (focus || reduce || reels.length <= 1) return;
    let beat = 0;
    const timer = window.setInterval(() => {
      const screen = ORDER[beat++ % SCREENS];
      setWall((current) => {
        const showing = new Set(current.map((slot) => slot.reel));
        let candidate = nextReel.current;
        for (let i = 0; i < reels.length && showing.has(candidate % reels.length) && reels.length > SCREENS; i++) candidate++;
        nextReel.current = candidate + 1;
        const reel = candidate % reels.length;
        const next = [...current];
        // Each time the programme comes round again, a project shows another of its frames.
        next[screen] = { reel, frame: Math.floor(candidate / reels.length) % reels[reel].frames.length };
        return next;
      });
    }, TURN);
    return () => window.clearInterval(timer);
  }, [focus, reduce, reels]);

  const slots = useMemo<Slot[]>(() => {
    if (!reels.length) return [];
    if (focus && 'slug' in focus) {
      const reel = reels.find((item) => item.slug === focus.slug);
      if (reel) {
        // Five pages of the one project, its opening page in the middle.
        const order = [3, 1, 0, 2, 4];
        return order.map((at) => ({ reel, frame: reel.frames[at % reel.frames.length] }));
      }
    }
    if (focus && 'discipline' in focus) {
      const pool = reels.filter((reel) => reel.discipline === focus.discipline);
      const list = pool.length ? pool : reels;
      // The discipline's leading projects, its first in the middle.
      const order = [3, 1, 0, 2, 4];
      return order.map((at) => {
        const reel = list[at % list.length];
        return { reel, frame: reel.frames[Math.floor(at / list.length) % reel.frames.length] };
      });
    }
    return wall.map(({ reel, frame }) => {
      const item = reels[reel % reels.length];
      return { reel: item, frame: item.frames[frame % item.frames.length] };
    });
  }, [focus, reels, wall]);

  // The arc leans after the pointer, on a spring.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 60, damping: 18, mass: 0.6 });
  const springY = useSpring(pointerY, { stiffness: 60, damping: 18, mass: 0.6 });
  const rotateY = useTransform(springX, (value) => `${value * 5}deg`);
  const rotateX = useTransform(springY, (value) => `${4 - value * 2.5}deg`);

  useEffect(() => {
    if (reduce) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerX.set((event.clientX / window.innerWidth) * 2 - 1);
      pointerY.set((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [pointerX, pointerY, reduce]);

  const centre = slots[2];

  return (
    <div ref={roomRef} aria-hidden className="screening">
      <motion.div className="screening-stage" style={reduce ? undefined : { rotateX, rotateY }}>
        {slots.map((slot, screen) => (
          <div key={screen} className="screening-screen" style={{ '--i': screen - 2 } as CSSProperties}>
            <span className="screening-panel">
              <AnimatePresence initial={false}>
                <motion.span
                  key={slot.frame.src}
                  className="screening-frame"
                  initial={{ opacity: 0, scale: 1.08, filter: 'blur(12px) brightness(1.6)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }}
                  exit={{ opacity: 0, transition: { duration: 0.9, ease: 'easeInOut', delay: 0.15 } }}
                  transition={{ duration: 1.1, ease: ease.expo, delay: reduce ? 0 : Math.abs(screen - 2) * 0.09 }}
                >
                  <Image
                    src={slot.frame.src}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 46vw, 26vw"
                    placeholder={slot.frame.preview ? 'blur' : 'empty'}
                    blurDataURL={slot.frame.preview || undefined}
                    className="screening-image"
                  />
                </motion.span>
              </AnimatePresence>
              <span className="screening-glass" />
            </span>
            {/* The screen's light on the floor: its own picture, flipped, blurred and fading away. */}
            <AnimatePresence initial={false}>
              <motion.span
                key={slot.frame.src}
                className="screening-reflection"
                style={{ backgroundImage: `url(${slot.frame.preview || slot.frame.src})` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
              />
            </AnimatePresence>
          </div>
        ))}
        <span className="screening-floor" />
      </motion.div>

      <div className="screening-caption">
        <span className="screening-caption-label">{worksPage.nowShowing}</span>
        <span className="screening-caption-roll">
        <AnimatePresence mode="popLayout" initial={false}>
          {centre && (
            <motion.span
              key={focus && 'discipline' in focus ? focus.discipline : centre.reel.slug}
              className="screening-caption-title"
              initial={{ y: '110%', opacity: 0, filter: 'blur(6px)' }}
              animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: '-110%', opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.6, ease: ease.expo }}
            >
              {focus && 'discipline' in focus ? (
                focus.discipline === 'system' ? worksPage.rows.systems.title : worksPage.rows.design.title
              ) : (
                <>
                  {centre.reel.title}
                  <span className="screening-caption-kind"> · {centre.reel.kind}</span>
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
        </span>
      </div>
    </div>
  );
}
