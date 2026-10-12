import type Lenis from 'lenis';

let lenis: Lenis | null = null;
let locks = 0;
let heldY = 0;
let navigating = false;
let trips = 0;

/** SmoothScroll hands over its Lenis instance so locks can halt its glide. */
export function registerLenis(instance: Lenis | null) {
  lenis = instance;
}

/**
 * Glides to an anchor. While it travels, scenes it passes through must not
 * take a lock — a nav click has to arrive where it was sent.
 */
export function navigateTo(target: HTMLElement, offset = 0) {
  if (!lenis) {
    target.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const trip = ++trips;
  const arrive = () => {
    if (trip === trips) navigating = false;
  };
  navigating = true;
  lenis.scrollTo(target, { offset, onComplete: arrive });
  // A wheel nudge can interrupt the glide before onComplete fires.
  window.setTimeout(arrive, 2500);
}

/**
 * Glides a section flush with the top of the screen and keeps the page there
 * for `ms`, so its entrance plays out in full before the visitor moves on.
 * Input is swallowed from the first moment, so the glide can't be fought.
 * Returns a cancel that frees the page at once.
 */
export function settleOn(target: HTMLElement, ms: number) {
  const top = Math.round(target.getBoundingClientRect().top + window.scrollY);
  window.addEventListener('wheel', block, capture);
  window.addEventListener('touchmove', block, capture);
  window.addEventListener('keydown', blockKeys, { capture: true });
  let release: (() => void) | null = null;
  // Once there, a regular lock takes over (and drops the listeners when it ends).
  const pin = () => {
    release ??= lockScroll();
  };
  if (lenis) lenis.scrollTo(top, { duration: 0.9, force: true, onComplete: pin });
  else window.scrollTo({ top, behavior: 'smooth' });
  const arrived = window.setTimeout(pin, 1000);
  let done = false;
  const free = () => {
    if (done) return;
    done = true;
    window.clearTimeout(arrived);
    window.clearTimeout(timer);
    pin();
    release?.();
  };
  const timer = window.setTimeout(free, ms);
  return free;
}

/**
 * Rests the page under something that covers it whole (the work viewer):
 * Lenis stops, which takes the root's scrollbar away so it can't sit beside
 * the viewer's own. Returns the release.
 */
export function holdPage() {
  const held = lenis;
  if (held) {
    held.stop();
    return () => held.start();
  }
  const root = document.documentElement;
  const previous = root.style.overflow;
  root.style.overflow = 'hidden';
  return () => {
    root.style.overflow = previous;
  };
}

/** Moves the page to `y` at once, with or without Lenis. */
export function jumpTo(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}

/** True while a nav click is carrying the page somewhere. */
export function isNavigating() {
  return navigating;
}

/** Where the page is heading: Lenis' target during a glide, else where it is. */
export function scrollTarget() {
  return lenis ? lenis.targetScroll : window.scrollY;
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

function block(event: Event) {
  if (event.cancelable) event.preventDefault();
  // Capture phase on window runs before Lenis' own wheel listener sees the event.
  event.stopPropagation();
}

function blockKeys(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  // Space still presses a focused button; it only scrolls from the page itself.
  if (event.key === ' ' && target?.closest('button, a, [role="button"]')) return;
  if (SCROLL_KEYS.has(event.key)) block(event);
}

function hold() {
  if (Math.abs(window.scrollY - heldY) > 1) window.scrollTo(0, heldY);
}

const capture = { capture: true, passive: false } as const;

/**
 * Freezes the page — wheel, touch, keys and scrollbar drags — until the
 * returned release runs. Input is swallowed rather than hiding overflow, so the
 * scrollbar never disappears and the layout never jumps sideways. Locks nest:
 * the intro reel and a scene change can overlap safely.
 */
export function lockScroll() {
  if (locks === 0) {
    heldY = window.scrollY;
    // Stop any inertia already in flight so the page settles where it is.
    lenis?.scrollTo(heldY, { immediate: true, force: true });
    window.addEventListener('wheel', block, capture);
    window.addEventListener('touchmove', block, capture);
    window.addEventListener('keydown', blockKeys, { capture: true });
    window.addEventListener('scroll', hold, { passive: true });
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks > 0) return;
    window.removeEventListener('wheel', block, capture);
    window.removeEventListener('touchmove', block, capture);
    window.removeEventListener('keydown', blockKeys, { capture: true });
    window.removeEventListener('scroll', hold);
    // Lenis kept its own target while input was swallowed; resync it to the page.
    lenis?.scrollTo(window.scrollY, { immediate: true, force: true });
  };
}
