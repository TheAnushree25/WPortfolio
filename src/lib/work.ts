import { useSyncExternalStore } from 'react';
import type { ProjectData } from '@/content/work';

/**
 * The work viewer's shared state. The selected-work row lifts a card's shot
 * when it is clicked, the intercepted /work/[slug] route hands over the
 * project it loaded, and the stage (ProjectStage) plays the transitions
 * between them. Kept outside React so the three can live in different trees.
 */

/** A rectangle in viewport CSS pixels. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * A shot as it sits on screen: the frame that clips it and the image box
 * inside (a card's drift and hover zoom included), so the stage can lift it
 * off exactly where it is.
 */
export type ShotBox = { frame: Box; image: Box; radius: number; src: string; focus: string };

/** What the row offers the stage about one card. */
export type CardHandle = {
  /** The card's shot as it sits on screen now. */
  measure: () => ShotBox | null;
  /** Scrolls the row until the card is in view. */
  reveal: () => void;
  /** Hands focus back to the card's button. */
  focus: () => void;
};

type State = {
  /** The project the route has open. */
  project: ProjectData | null;
  /** The shot a click lifted, waiting for its project to arrive. */
  launch: { slug: string; shot: ShotBox } | null;
  /** The card whose shot is out on the stage; the row hides it meanwhile. */
  lifted: string | null;
  /** True while the viewer covers the whole page, so the page can rest. */
  covered: boolean;
};

const initial: State = { project: null, launch: null, lifted: null, covered: false };
let state = initial;
const listeners = new Set<() => void>();
const cards = new Map<string, CardHandle>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads one slice of the state; `select` must return a primitive or a stored object. */
export function useWork<T>(select: (current: State) => T) {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(initial),
  );
}

export function getWork() {
  return state;
}

/** A card was clicked: the stage lifts its shot while the route loads. */
export function launchProject(slug: string, shot: ShotBox) {
  set({ launch: { slug, shot } });
}

/** The stage has taken the launch it was waiting for. */
export function clearLaunch() {
  if (state.launch) set({ launch: null });
}

/** Called by the intercepted route; the returned cleanup runs when the route is left. */
export function showProject(project: ProjectData) {
  set({ project });
  return () => {
    if (state.project === project) set({ project: null });
  };
}

export function setLifted(slug: string | null) {
  if (state.lifted !== slug) set({ lifted: slug });
}

export function setCovered(covered: boolean) {
  if (state.covered !== covered) set({ covered });
}

export function registerCard(slug: string, handle: CardHandle) {
  cards.set(slug, handle);
  return () => {
    if (cards.get(slug) === handle) cards.delete(slug);
  };
}

export function cardFor(slug: string) {
  return cards.get(slug) ?? null;
}

/** The box of an element as it is drawn, transforms included. */
export function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}
