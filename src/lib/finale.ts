'use client';

import { useSyncExternalStore } from 'react';

/**
 * The finale's light. The closing section lays out a wordmark box and a globe
 * anchor; the page background (LivingGradient) asks it, every frame it draws,
 * where to paint the sand-formed wordmark and the globe. Asking in the
 * background's own frame keeps the light locked to the page with no lag.
 */

export type FinaleLight = {
  /** The wordmark's box in viewport CSS pixels, how far its sand has gathered (0–1), and its light sweep (-0.4–1.4, off outside). */
  mark: { x: number; y: number; width: number; height: number; form: number; sweep: number };
  /** The globe's centre and radius in viewport CSS pixels, its pole's tilt toward the viewer (radians), how much of it is drawn (0–1), its extra turn from scrolling (radians) and how strongly it shows (0–1). */
  globe: { x: number; y: number; r: number; tilt: number; draw: number; spin: number; fade: number };
};

type Measure = (now: number) => FinaleLight | null;

let measure: Measure | null = null;
const kickListeners = new Set<() => void>();

/** The finale hands over how to measure itself while it is near the screen, and takes it back after. */
export function provideFinale(next: Measure | null) {
  measure = next;
  kickFinale();
}

/** Where the light falls this frame, or null when the finale is out of sight. */
export function measureFinale(now: number) {
  return measure ? measure(now) : null;
}

/** Asks the background for a fresh frame even when it isn't animating (reduced motion), e.g. on scroll. */
export function kickFinale() {
  kickListeners.forEach((listener) => listener());
}

export function onFinaleKick(listener: () => void) {
  kickListeners.add(listener);
  return () => {
    kickListeners.delete(listener);
  };
}

// Whether the background can draw the wordmark; until it can, the section shows its own.
let drawn = false;
const drawnListeners = new Set<() => void>();

export function setFinaleDrawn(next: boolean) {
  if (drawn === next) return;
  drawn = next;
  drawnListeners.forEach((listener) => listener());
}

export function useFinaleDrawn() {
  return useSyncExternalStore(
    (listener) => {
      drawnListeners.add(listener);
      return () => drawnListeners.delete(listener);
    },
    () => drawn,
    () => false,
  );
}
