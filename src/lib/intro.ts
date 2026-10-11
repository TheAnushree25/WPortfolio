import { useSyncExternalStore } from 'react';

/**
 * Whether the landing reel is still playing. The boot script in the root layout
 * sets `data-intro` on <html> before first paint ("playing" or "skip"), so the
 * chrome can stay out of the reel's way from the very first frame.
 */
let playing: boolean | null = null;
const listeners = new Set<() => void>();

function read() {
  if (playing === null) playing = document.documentElement.dataset.intro === 'playing';
  return playing;
}

export function setIntroPlaying(next: boolean) {
  playing = next;
  document.documentElement.dataset.intro = next ? 'playing' : 'done';
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server always renders the landing with its reel up. */
export function useIntroPlaying() {
  return useSyncExternalStore(subscribe, read, () => true);
}
