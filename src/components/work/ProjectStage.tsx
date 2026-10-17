'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { animate } from 'motion/react';
import type { ProjectData } from '@/content/work';
import { holdPage, lockScroll } from '@/lib/scroll';
import {
  cardFor,
  clearLaunch,
  getWork,
  launchProject,
  setCovered,
  setLifted,
  useWork,
  type Box,
  type ShotBox,
} from '@/lib/work';

const loadDeckViewer = () => import('./ProjectViewer');
const loadSystemViewer = () => import('./SystemViewer');
const ProjectViewer = lazy(() => loadDeckViewer().then((module) => ({ default: module.ProjectViewer })));
const SystemViewer = lazy(() => loadSystemViewer().then((module) => ({ default: module.SystemViewer })));

/** Which viewer a card opens: a design's deck, or a system's case study. */
export type ViewerKind = 'design' | 'system';

/** Fetches the viewer's code ahead of a click (a card hovered or focused). */
export function preloadViewer(kind: ViewerKind = 'design') {
  void (kind === 'system' ? loadSystemViewer() : loadDeckViewer());
}

/** The lift: a slow start, a long travel and a soft landing, like a camera crane. */
const LIFT = { duration: 1.05, ease: [0.62, 0, 0.12, 1] } as const;
/** The return to the row, a touch quicker. */
const RETURN = { duration: 0.9, ease: [0.55, 0, 0.12, 1] } as const;
/** How long the page keeps its scrollbar under a rising shot, so nothing shifts while it can be seen (ms). */
const HOLD_AFTER = 420;
/** A launch the route never answers is called off (ms). */
const LAUNCH_TIMEOUT = 12000;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const mix = (from: Box, to: Box, t: number): Box => ({
  x: lerp(from.x, to.x, t),
  y: lerp(from.y, to.y, t),
  width: lerp(from.width, to.width, t),
  height: lerp(from.height, to.height, t),
});
const screen = (): Box => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
/** The title card's shot: the screen, covered, at the 1.06 its backdrop starts from. */
const covering = (): Box => {
  const { innerWidth: w, innerHeight: h } = window;
  return { x: -w * 0.03, y: -h * 0.03, width: w * 1.06, height: h * 1.06 };
};
const onScreen = (box: Box) =>
  box.x + box.width > 24 && box.x < window.innerWidth - 24 && box.y + box.height > 24 && box.y < window.innerHeight - 24;
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** A viewer on the stage: the one being read, or the next one waiting unseen under the shot. */
type Slot = { project: ProjectData; visible: boolean };

/**
 * Opens a project over the home page. A click lifts the card's shot off the
 * row exactly where it sits and carries it, growing and darkening, until it
 * fills the screen as the title card's backdrop; the viewer, mounted unseen
 * while the shot travels, takes over beneath it without a seam. Closing
 * reverses it: the shot returns over the deck and settles back into its
 * card. Moving to the next project from the end of a deck lifts that one in
 * the same way.
 *
 * The route (/work/[slug], intercepted) says which project is open; the
 * stage plays the transitions, so they run whether a click, the back button
 * or the forward button changed it.
 */
export function ProjectStage() {
  const router = useRouter();
  const requested = useWork((state) => state.project);
  const launch = useWork((state) => state.launch);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  /** The project whose title card may play. */
  const [revealed, setRevealed] = useState<string | null>(null);
  /** The file a card was drawing when it was lifted, handed to that project's title card. */
  const [shot, setShot] = useState<{ slug: string; src: string } | null>(null);

  const layerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);

  /** Bumped by every new sequence; an older one stops at its next step. */
  const run = useRef(0);
  const tween = useRef<{ stop: () => void } | null>(null);
  /** The project on stage, and whether its shot has landed over the whole screen. */
  const staged = useRef<{ slug: string; landed: boolean } | null>(null);
  /** Viewers whose title-card shot has been painted. */
  const painted = useRef(new Set<string>());
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  /** Where the shot is drawn right now, so an interrupted move carries on from there. */
  const placed = useRef<{ outer: Box; inner: Box; radius: number; shade: number } | null>(null);
  const page = useRef({ lock: null as (() => void) | null, hold: null as (() => void) | null, timer: 0, inert: [] as Element[] });

  // The stage lives at the end of <body>, above everything but the cursor.
  useEffect(() => {
    const element = document.createElement('div');
    element.dataset.workStage = '';
    document.body.appendChild(element);
    setHost(element);
    return () => element.remove();
  }, []);

  // ---- The page beneath -------------------------------------------------

  const coverPage = useCallback(() => {
    const state = page.current;
    if (!state.inert.length) {
      state.inert = Array.from(document.body.children).filter(
        (element) =>
          !element.hasAttribute('data-work-stage') && !element.hasAttribute('inert') && !['SCRIPT', 'NEXTJS-PORTAL'].includes(element.tagName),
      );
      state.inert.forEach((element) => element.setAttribute('inert', ''));
    }
    if (state.hold || state.lock) return;
    // Input stops at once; the scrollbar goes only once the shot hides the page.
    state.lock = lockScroll();
    state.timer = window.setTimeout(() => {
      state.hold = holdPage();
      state.lock?.();
      state.lock = null;
    }, HOLD_AFTER);
  }, []);

  /** The page shows again (its scrollbar back, its controls live). */
  const revealPage = useCallback(() => {
    const state = page.current;
    window.clearTimeout(state.timer);
    state.hold?.();
    state.hold = null;
    state.inert.forEach((element) => element.removeAttribute('inert'));
    state.inert = [];
  }, []);

  /** Keeps the page still while the shot lands. */
  const stillPage = useCallback(() => {
    page.current.lock ??= lockScroll();
  }, []);

  const freePage = useCallback(() => {
    const state = page.current;
    state.lock?.();
    state.lock = null;
  }, []);

  // ---- The shot -----------------------------------------------------------

  const place = useCallback((outer: Box, inner: Box, radius: number, shade: number) => {
    const box = frameRef.current;
    const image = imageRef.current;
    if (!box || !image) return;
    placed.current = { outer, inner, radius, shade };
    box.style.transform = `translate3d(${outer.x}px, ${outer.y}px, 0)`;
    box.style.width = `${outer.width}px`;
    box.style.height = `${outer.height}px`;
    box.style.borderRadius = `${radius}px`;
    image.style.transform = `translate3d(${inner.x - outer.x}px, ${inner.y - outer.y}px, 0)`;
    image.style.width = `${inner.width}px`;
    image.style.height = `${inner.height}px`;
    if (shadeRef.current) shadeRef.current.style.opacity = String(shade);
  }, []);

  /**
   * Runs `step` from 0 to 1; resolves when done, or at once when a newer move
   * stops it. With reduced motion every move becomes a brief dissolve.
   */
  const play = useCallback((options: { duration: number; ease: readonly number[] | string }, step: (t: number) => void) => {
    tween.current?.stop();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise<void>((resolve) => {
      const controls = animate(0, 1, {
        duration: still ? Math.min(options.duration, 0.2) : options.duration,
        ease: options.ease as never,
        onUpdate: step,
        onComplete: () => resolve(),
      });
      tween.current = {
        stop: () => {
          controls.stop();
          resolve();
        },
      };
    });
  }, []);

  const layerOn = () => layerRef.current?.classList.contains('is-on') ?? false;
  const opacityOf = (element: HTMLElement | null) => Number(element?.style.opacity || 0);

  const setLayer = useCallback((on: boolean) => {
    layerRef.current?.classList.toggle('is-on', on);
    if (!on && frameRef.current) frameRef.current.style.opacity = '0';
  }, []);

  /** Puts a picture on the shot and waits until it can be drawn. */
  const load = useCallback(async (src: string, focus: string) => {
    const image = imageRef.current;
    if (!image) return;
    image.style.objectPosition = focus;
    if (image.getAttribute('src') !== src) image.src = src;
    await image.decode().catch(() => undefined);
  }, []);

  // ---- Handing over to the viewer -------------------------------------------

  /** The project has arrived: its viewer mounts unseen under the shot, so it is ready the moment the shot lands. */
  const prepare = useCallback((project: ProjectData) => {
    if (slotsRef.current.some((slot) => slot.project.slug === project.slug)) return;
    setSlots((list) => [...list.filter((slot) => slot.visible), { project, visible: false }]);
  }, []);

  /** The shot has landed and the viewer under it has painted its title card: show it and let the shot go. */
  const handOver = useCallback(async () => {
    // Out of whatever React is doing (an effect, a commit) before committing the swap.
    await Promise.resolve();
    const stage = staged.current;
    const project = getWork().project;
    if (!stage?.landed || !project || project.slug !== stage.slug) return;
    if (!slotsRef.current.some((slot) => slot.project.slug === project.slug)) {
      prepare(project);
      return;
    }
    if (!painted.current.has(project.slug)) return;
    const token = run.current;
    // Commit the swap before the shot starts to go, so nothing shows through.
    flushSync(() => {
      setSlots([{ project, visible: true }]);
      setRevealed(project.slug);
    });
    if (backdropRef.current) backdropRef.current.style.opacity = '0';
    const frameElement = frameRef.current;
    await play({ duration: 0.28, ease: 'easeOut' }, (t) => {
      if (frameElement) frameElement.style.opacity = String(1 - t);
    });
    if (token !== run.current) return;
    setLayer(false);
    clearLaunch();
  }, [play, prepare, setLayer]);

  const viewerPainted = useCallback(
    (slug: string) => {
      painted.current.add(slug);
      void handOver();
    },
    [handOver],
  );

  // ---- The moves ------------------------------------------------------------

  /**
   * Carries a shot from where it sits to the whole screen. Over the home page
   * the night closes in behind it; over a deck (the next project) the deck
   * stays in view until the shot has covered it.
   */
  const lift = useCallback(
    async (slug: string, from: ShotBox) => {
      const token = ++run.current;
      staged.current = { slug, landed: false };
      setShot({ slug, src: from.src });
      // A shot already moving (the back button pressed mid-way, then forward) carries on from where it is.
      const start =
        layerOn() && placed.current ? placed.current : { outer: from.frame, inner: from.image, radius: from.radius, shade: 0 };
      await load(from.src, from.focus);
      if (token !== run.current) return;
      const backdrop = backdropRef.current;
      const over = slotsRef.current.some((slot) => slot.visible);
      const night = opacityOf(backdrop);
      if (frameRef.current) frameRef.current.style.opacity = '1';
      place(start.outer, start.inner, start.radius, start.shade);
      if (backdrop && over) backdrop.style.opacity = '0';
      setLayer(true);
      setLifted(slug);
      coverPage();
      await play(LIFT, (t) => {
        place(mix(start.outer, screen(), t), mix(start.inner, covering(), t), lerp(start.radius, 0, t), lerp(start.shade, 1, t));
        if (backdrop && !over) backdrop.style.opacity = String(Math.min(1, night + t * 1.8));
      });
      if (token !== run.current) return;
      staged.current.landed = true;
      setCovered(true);
      void handOver();
    },
    [coverPage, handOver, load, place, play, setLayer],
  );

  /** No card to lift from (the forward button, or its card off screen): the shot fades up over the page instead. */
  const fadeUp = useCallback(
    async (project: ProjectData) => {
      const token = ++run.current;
      staged.current = { slug: project.slug, landed: false };
      setShot(null);
      prepare(project);
      await load(project.cover.src, project.cover.focus);
      if (token !== run.current) return;
      const backdrop = backdropRef.current;
      const frameElement = frameRef.current;
      const over = slotsRef.current.some((slot) => slot.visible);
      const from = layerOn() ? opacityOf(frameElement) : 0;
      place(screen(), covering(), 0, 1);
      if (frameElement) frameElement.style.opacity = String(from);
      setLayer(true);
      setLifted(project.slug);
      coverPage();
      await play({ duration: 0.6, ease: [0.4, 0, 0.2, 1] }, (t) => {
        if (frameElement) frameElement.style.opacity = String(lerp(from, 1, t));
        if (backdrop && !over) backdrop.style.opacity = String(Math.max(opacityOf(backdrop), t));
      });
      if (token !== run.current) return;
      staged.current.landed = true;
      setCovered(true);
      void handOver();
    },
    [coverPage, handOver, load, place, play, prepare, setLayer],
  );

  /** Brings the shot back over the deck and settles it into its card. */
  const land = useCallback(
    async (slug: string) => {
      const token = ++run.current;
      const reading = slotsRef.current.find((slot) => slot.visible)?.project ?? null;
      const card = cardFor(slug);
      const backdrop = backdropRef.current;
      const frameElement = frameRef.current;
      staged.current = null;

      // 1. Over an open deck, the shot fades up at full screen first (or the
      //    rest of the way, if it was still fading out as the deck arrived).
      const showing = layerOn() ? opacityOf(frameElement) : 0;
      if (reading && showing < 1) {
        if (!layerOn()) {
          const start = card?.measure();
          await load(start?.src ?? reading.cover.src, start?.focus ?? reading.cover.focus);
          if (token !== run.current) return;
          place(screen(), covering(), 0, 1);
          if (frameElement) frameElement.style.opacity = '0';
          setLayer(true);
        }
        await play({ duration: 0.45, ease: [0.4, 0, 0.2, 1] }, (t) => {
          if (frameElement) frameElement.style.opacity = String(lerp(showing, 1, t));
        });
        if (token !== run.current) return;
      }

      // 2. Under it the deck goes and the page comes back, held still.
      const from = placed.current ?? { outer: screen(), inner: covering(), radius: 0, shade: 1 };
      const night = layerOn() ? Math.max(opacityOf(backdrop), opacityOf(frameElement)) : 1;
      if (backdrop) backdrop.style.opacity = String(night);
      setSlots([]);
      setRevealed(null);
      setShot(null);
      painted.current.clear();
      setCovered(false);
      revealPage();
      await frame();
      await frame();
      if (token !== run.current) return;

      // 3. The shot settles back into its card, wherever the row has it now
      //    (bringing the card into view first if the deck chain moved on).
      let target = card?.measure() ?? null;
      if (card && (!target || !onScreen(target.frame))) {
        card.reveal();
        await frame();
        await frame();
        target = card.measure();
      }
      if (token !== run.current) return;
      stillPage();
      if (target) {
        const end = target;
        await play(RETURN, (t) => {
          place(mix(from.outer, end.frame, t), mix(from.inner, end.image, t), lerp(from.radius, end.radius, t), lerp(from.shade, 0, t));
          if (backdrop) backdrop.style.opacity = String(Math.min(night, (1 - t) * 1.8));
        });
      } else {
        const fade = opacityOf(frameElement) || 1;
        await play({ duration: 0.5, ease: 'easeOut' }, (t) => {
          if (frameElement) frameElement.style.opacity = String(fade * (1 - t));
          if (backdrop) backdrop.style.opacity = String(night * (1 - t));
        });
      }
      if (token !== run.current) return;
      setLayer(false);
      placed.current = null;
      if (backdrop) backdrop.style.opacity = '0';
      setLifted(null);
      clearLaunch();
      freePage();
      card?.focus();
    },
    [freePage, load, place, play, revealPage, setLayer, stillPage],
  );

  // ---- What sets it all off -------------------------------------------------

  // A click lifted a card (or the end of a deck chose the next one): start now, before the route answers.
  useEffect(() => {
    if (!launch || staged.current?.slug === launch.slug) return;
    void lift(launch.slug, launch.shot);
  }, [launch, lift]);

  // The route changed what is open: prepare, swap or close.
  useEffect(() => {
    const stage = staged.current;
    if (requested) {
      if (stage?.slug === requested.slug) {
        prepare(requested);
        void handOver();
        return;
      }
      if (getWork().launch?.slug === requested.slug) return;
      const reading = slotsRef.current.some((slot) => slot.visible);
      const shotBox = reading ? null : cardFor(requested.slug)?.measure();
      if (shotBox && onScreen(shotBox.frame)) {
        prepare(requested);
        void lift(requested.slug, shotBox);
      } else void fadeUp(requested);
      return;
    }
    const leaving = stage?.slug ?? slotsRef.current.find((slot) => slot.visible)?.project.slug;
    if (leaving) void land(leaving);
  }, [requested, fadeUp, handOver, land, lift, prepare]);

  // A launch that never arrives (the visitor went back before the route answered) is called off.
  useEffect(() => {
    if (!launch) return;
    const callOff = () => {
      if (getWork().project?.slug !== launch.slug && staged.current?.slug === launch.slug) void land(launch.slug);
    };
    const timer = window.setTimeout(callOff, LAUNCH_TIMEOUT);
    window.addEventListener('popstate', callOff);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', callOff);
    };
  }, [launch, land]);

  // The browser went back to an entry Next.js didn't make (a #hash typed into
  // the address bar): the URL has left the project but the route hasn't, so
  // follow the URL.
  useEffect(() => {
    if (!requested) return;
    let timer = 0;
    const check = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (getWork().project && !window.location.pathname.startsWith('/work/')) {
          router.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`, { scroll: false });
        }
      }, 300);
    };
    window.addEventListener('popstate', check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', check);
    };
  }, [requested, router]);

  // Leaving the home page altogether: give the page back.
  useEffect(
    () => () => {
      tween.current?.stop();
      revealPage();
      freePage();
      setCovered(false);
      setLifted(null);
      clearLaunch();
    },
    [freePage, revealPage],
  );

  const next = useCallback(
    (slug: string, from: ShotBox) => {
      if (getWork().launch) return;
      launchProject(slug, from);
      router.replace(`/work/${slug}`, { scroll: false });
    },
    [router],
  );

  const close = useCallback(() => router.back(), [router]);

  if (!host) return null;
  return createPortal(
    <>
      {slots.map(({ project, visible }) => {
        const shared = {
          mode: 'overlay',
          active: visible,
          shotSrc: shot?.slug === project.slug ? shot.src : undefined,
          ready: visible && revealed === project.slug,
          onReady: viewerPainted,
          onClose: close,
          onNext: next,
        } as const;
        return (
          <div key={project.slug} className={visible ? undefined : 'work-stage-waiting'}>
            <Suspense fallback={null}>
              {project.discipline === 'system' ? <SystemViewer project={project} {...shared} /> : <ProjectViewer project={project} {...shared} />}
            </Suspense>
          </div>
        );
      })}
      <div ref={layerRef} aria-hidden className="work-stage">
        <div ref={backdropRef} className="work-stage-backdrop" />
        <div ref={frameRef} className="work-stage-frame">
          {/* Its picture is set as it lifts: the exact file the card was drawing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageRef} alt="" />
          <div ref={shadeRef} className="work-shade" />
        </div>
      </div>
    </>,
    host,
  );
}
