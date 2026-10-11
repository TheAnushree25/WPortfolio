'use client';

import { useSyncExternalStore } from 'react';

/**
 * Footage the page light draws itself: the landing reel, and the reel's
 * carousel that plays above the next-page sheet. Drawn in the background
 * shader, both keep the living gradient behind them and scatter into sand
 * under the cursor like the rest of the page.
 */
export type Footage = {
  video: HTMLVideoElement;
  /** 0–1, read every frame. */
  fade: () => number;
  /** Where to draw it this frame, in viewport CSS pixels; `band` feathers its top and bottom edges. */
  place: () => { x: number; y: number; width: number; height: number; band?: boolean };
};

const slots: { reel: Footage | null; clip: Footage | null } = { reel: null, clip: null };
const kicks = new Set<() => void>();

export function provideFootage(slot: 'reel' | 'clip', footage: Footage | null) {
  slots[slot] = footage;
  kicks.forEach((kick) => kick());
}

export function currentFootage() {
  return slots;
}

export function onFootage(listener: () => void) {
  kicks.add(listener);
  return () => {
    kicks.delete(listener);
  };
}

/** A tiny shared flag; components watch it with useFlag. */
function flag() {
  let value = false;
  const listeners = new Set<() => void>();
  return {
    set(next: boolean) {
      if (value === next) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    get: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Flag = ReturnType<typeof flag>;

export function useFlag(shared: Flag) {
  return useSyncExternalStore(shared.subscribe, shared.get, () => false);
}

/** Whether the light is drawing the reel; until it is, the reel shows its own video. */
export const reelDrawn = flag();

/** Whether the pointer is over the next-page sheet (the footer hands its stage to the carousel). */
export const teaserHover = flag();
