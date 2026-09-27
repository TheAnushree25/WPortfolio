'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useMotionValue, type MotionValue } from 'motion/react';

type SceneMotion = {
  /** 0 when the dark frame is fully in view, 1 once the light sheet has covered it. */
  cover: MotionValue<number>;
};

const SceneMotionContext = createContext<SceneMotion | null>(null);

export function useSceneMotion() {
  return useContext(SceneMotionContext);
}

/**
 * Pins a dark frame and lets the following light sections slide over it.
 * The frame itself drifts upward at 20% of scroll, settling by 170px — the
 * same rate measured on the reference hero — so the photograph recedes under
 * the rising light sheet instead of sitting still.
 */
export function CoverScene({ visual, children }: { visual: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const cover = useMotionValue(0);

  useEffect(() => {
    const update = () => {
      const scene = ref.current;
      if (!scene) return;
      // offsetTop stays stable while scrollY is already updated in the scroll
      // event, so this doesn't wait on a frame that background tabs throttle.
      const scrolled = Math.max(0, window.scrollY - scene.offsetTop);
      const vh = window.innerHeight || 1;
      const next = -Math.min(vh * 0.21, scrolled * 0.2);
      cover.set(Math.min(1, scrolled / vh));
      const frameEl = scene.firstElementChild as HTMLElement | null;
      if (frameEl) frameEl.style.transform = `translate3d(0, ${next}px, 0)`;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [cover]);

  return (
    <SceneMotionContext.Provider value={{ cover }}>
      <div ref={ref} className="relative isolate">
        <div className="sticky top-0 z-0 h-[100svh] min-h-[640px]">
          {visual}
        </div>
        <div className="relative z-10 bg-paper">{children}</div>
      </div>
    </SceneMotionContext.Provider>
  );
}
