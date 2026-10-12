'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Lenis from 'lenis';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { ProjectData } from '@/content/work';
import { ease } from '@/lib/motion';
import { boxOf, type ShotBox } from '@/lib/work';
import { cn } from '@/lib/utils';
import { FocusText } from '@/components/ui/FocusText';
import { Ambient, DeckPageView, preloadPage, shapeOf } from './ViewerPage';
import { ChapterPill, ChapterRail, ChapterSheet, EditionSwitch, pad, type Editions, type LaidChapter } from './ViewerIndex';

const copy = works.viewer;

/** The reading line, as a share of the screen's height: the page across it is the page being read. */
const READING_LINE = 0.42;
/** Past this share of the title card the reader is reading: the index and the pill come in. */
const READING_FROM = 0.55;
/** Jumps across more pages than this cut through a chapter card instead of gliding. */
const GLIDE_LIMIT = 3;
/** The chapter card: how long its curtain takes to close, and how long it holds once the cut is made (ms). */
const CURTAIN_IN = 320;
const CARD_HOLD = 520;

/** Lenis' weighted feel, the same as the page's. */
const lenisEase = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t));
/** Glides start gently, travel, and settle (an in-out quart). */
const glideEase = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const smooth = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** An element's top within `container`, walking up its offset parents; unlike a bounding box it ignores the pages' focus scale. */
function topWithin(element: HTMLElement | null, container: HTMLElement | null) {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== container) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

type Edition = ProjectData['editions'][number];

/** Each chapter's span of pages, and the chapter every page belongs to. */
function lay(edition: Edition) {
  const total = edition.pages.length;
  const chapters: LaidChapter[] = edition.chapters.map((chapter, index) => ({
    ...chapter,
    start: index === 0 ? 0 : chapter.page - 1,
    end: (edition.chapters[index + 1]?.page ?? total + 1) - 2,
  }));
  const chapterOf = new Array<number>(total).fill(0);
  chapters.forEach((chapter, index) => {
    for (let page = chapter.start; page <= chapter.end; page += 1) chapterOf[page] = index;
  });
  return { chapters, chapterOf };
}

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  shown: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 1.1, ease: ease.expo, delay } }),
};

/** The reduced-motion stand-in: the title card's lines simply fade in. */
const fade: Variants = {
  hidden: { opacity: 0 },
  shown: (delay: number = 0) => ({ opacity: 1, transition: { duration: 0.6, delay } }),
};

type ProjectViewerProps = {
  project: ProjectData;
  /** `overlay` over the home page (the stage plays its entrance), or a `page` of its own. */
  mode: 'overlay' | 'page';
  /** Overlay: false while it waits unseen under the stage's shot; only the active viewer takes keys. */
  active?: boolean;
  /** Overlay: the card's shot exactly as it was drawn, so the title card takes over without a seam. */
  shotSrc?: string;
  /** Overlay: false until the stage's shot has landed; the title waits for it. */
  ready?: boolean;
  /** Overlay: the title card's shot has painted (unseen, under the stage's). */
  onReady?: (slug: string) => void;
  /** Overlay: closes the project; on its own page the viewer leads back to the work. */
  onClose?: () => void;
  /** Overlay: the next project was chosen at the end of the deck. */
  onNext?: (slug: string, shot: ShotBox) => void;
};

/**
 * A project's deck, read like a film. The card's shot becomes the title
 * card, where the name focuses in; scrolling on, the pages arrive one after
 * another, each lifted into focus as it crosses the middle of the screen and
 * lighting the room in its own colours. The index on the left follows the
 * reading and travels anywhere in the deck: a short way it glides, a long
 * way it dips to a chapter card and cuts. The end of the deck opens the
 * next project.
 */
export function ProjectViewer({ project, mode, active = true, shotSrc, ready: landed = true, onReady, onClose, onNext }: ProjectViewerProps) {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const titleId = useId();
  const [editionIndex, setEditionIndex] = useState(0);
  const edition = project.editions[editionIndex];
  const total = edition.pages.length;
  const { chapters, chapterOf } = useMemo(() => lay(edition), [edition]);
  const [page, setPage] = useState(-1);
  const [reading, setReading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [card, setCard] = useState<{ number: string; title: string } | null>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const ready = mode === 'page' || landed;
  const chapter = page < 0 ? -1 : chapterOf[page];

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const shotRef = useRef<HTMLImageElement>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  const markRefs = useRef<(HTMLElement | null)[]>([]);
  const lenisRef = useRef<Lenis | null>(null);
  const pageRef = useRef(-1);
  const readingRef = useRef(false);
  const cutting = useRef(false);
  const toFirstPage = useRef(false);
  const laid = useRef({ chapters, chapterOf, total });
  laid.current = { chapters, chapterOf, total };
  // Where every page and chapter mark sits in the scroller, measured once per layout.
  const geo = useRef({ tops: [] as number[], heights: [] as number[], marks: [] as number[], hero: 1, focus: [] as number[], near: new Set<number>() });

  const close = useCallback(() => {
    if (onClose) onClose();
    else router.push('/#work');
  }, [onClose, router]);

  const measure = useCallback(() => {
    const g = geo.current;
    const content = contentRef.current;
    const { total: count, chapters: list } = laid.current;
    g.tops = [];
    g.heights = [];
    for (let i = 0; i < count; i += 1) {
      const element = pageRefs.current[i] ?? null;
      g.tops.push(topWithin(element, content));
      g.heights.push(element?.offsetHeight ?? 0);
    }
    g.marks = list.map((_, i) => topWithin(markRefs.current[i] ?? null, content));
    g.hero = heroRef.current?.offsetHeight ?? window.innerHeight;
    g.focus = [];
    g.near = new Set();
  }, []);

  // Every scroll frame: the title card's exit, each page's focus, and which page and chapter are being read.
  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!scroller || !root) return;
    const g = geo.current;
    const { chapters: list, chapterOf: owner } = laid.current;
    const y = scroller.scrollTop;
    const height = scroller.clientHeight;

    const hero = Math.min(1, Math.max(0, y / Math.max(1, g.hero * 0.8)));
    root.style.setProperty('--hero', hero.toFixed(3));

    const line = y + height * READING_LINE;
    // The page being read is the one filling most of the screen (the one in focus).
    let current = -1;
    let most = 0;
    const near = new Set<number>();
    for (let i = 0; i < g.tops.length; i += 1) {
      const top = g.tops[i] - y;
      const bottom = top + g.heights[i];
      if (bottom < -height * 0.5 || top > height * 1.5) continue;
      near.add(i);
      const visible = Math.min(bottom, height) - Math.max(top, 0);
      if (visible > most + 0.5) {
        most = visible;
        current = i;
      }
      const seen = visible / Math.max(1, Math.min(g.heights[i], height));
      const focus = smooth(0.18, 0.9, seen);
      if (Math.abs((g.focus[i] ?? -1) - focus) > 0.004) {
        g.focus[i] = focus;
        pageRefs.current[i]?.style.setProperty('--focus', focus.toFixed(3));
      }
    }
    // Between pages (the title card above, the ending below) the nearest end of the deck counts.
    if (current < 0 && g.tops.length) current = line > g.tops[0] ? g.tops.length - 1 : -1;
    // Only the pages near the screen are promoted to their own layers.
    for (const i of g.near) if (!near.has(i)) pageRefs.current[i]?.classList.remove('is-near');
    for (const i of near) if (!g.near.has(i)) pageRefs.current[i]?.classList.add('is-near');
    g.near = near;

    // How far through its chapter the reading line has come.
    if (current >= 0) {
      const span = list[owner[current]];
      const start = g.marks[owner[current]] ?? g.tops[span.start];
      const end = g.tops[span.end] + g.heights[span.end];
      const atEnd = y >= scroller.scrollHeight - height - 2;
      const progress = atEnd ? 1 : Math.min(1, Math.max(0, (line - start) / Math.max(1, end - start)));
      root.style.setProperty('--chapter-progress', progress.toFixed(3));
    }

    const isReading = hero >= READING_FROM;
    if (isReading !== readingRef.current) {
      readingRef.current = isReading;
      setReading(isReading);
    }
    if (current !== pageRef.current) {
      pageRef.current = current;
      setPage(current);
    }
  }, []);

  // Measure on every change of layout; follow the scroller.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const remeasure = () => {
      measure();
      update();
    };
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(content);
    observer.observe(scroller);
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }, [measure, update, editionIndex]);

  // The viewer's own weighted scroll. It listens across the whole viewer, so a
  // wheel over the index or the bar still moves the pages; the index scrolls
  // itself when it overflows.
  useEffect(() => {
    const root = rootRef.current;
    const wrapper = scrollerRef.current;
    const content = contentRef.current;
    if (reduce || !root || !wrapper || !content) return;
    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: root,
      autoRaf: true,
      duration: 1.15,
      easing: lenisEase,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
      smoothWheel: true,
      allowNestedScroll: true,
      overscroll: false,
    });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduce]);

  const scrollTo = useCallback((y: number, glide: boolean, duration = 1.2) => {
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(y, glide ? { duration, easing: glideEase, force: true } : { immediate: true, force: true });
    else scrollerRef.current?.scrollTo({ top: y });
  }, []);

  /** Where to scroll to show a page: centred under the bar when it fits, its top under the bar when it doesn't. */
  const targetOf = useCallback((index: number, withMark: boolean) => {
    const g = geo.current;
    const { chapters: list, chapterOf: owner } = laid.current;
    const height = scrollerRef.current?.clientHeight ?? window.innerHeight;
    const bar = barRef.current?.offsetHeight ?? 80;
    const opens = list[owner[index]]?.start === index;
    const top = withMark && opens ? g.marks[owner[index]] : g.tops[index];
    const span = g.tops[index] + g.heights[index] - top;
    const room = height - bar;
    return span <= room ? top - bar - (room - span) / 2 : top - bar - 20;
  }, []);

  /** Closes the curtain on a chapter card, cuts while it is shut, and opens it again. */
  const cut = useCallback((title: { number: string; title: string }, jump: () => void) => {
    if (cutting.current) return;
    cutting.current = true;
    setCard(title);
    window.setTimeout(() => {
      jump();
      window.setTimeout(() => {
        setCard(null);
        cutting.current = false;
      }, CARD_HOLD);
    }, CURTAIN_IN);
  }, []);

  const goTo = useCallback(
    (index: number, withMark = false) => {
      const { total: count, chapters: list, chapterOf: owner } = laid.current;
      if (!count || cutting.current) return;
      const target = Math.max(0, Math.min(count - 1, index));
      const distance = Math.abs(target - Math.max(0, pageRef.current));
      if (reduce) scrollTo(targetOf(target, withMark), false);
      else if (distance <= GLIDE_LIMIT) scrollTo(targetOf(target, withMark), true, Math.min(1.9, 1 + distance * 0.25));
      else {
        // While the curtain is shut the page it opens on is already on its way.
        preloadPage(edition.pages[target]);
        preloadPage(edition.pages[target + 1]);
        const opened = owner[target];
        cut({ number: pad(opened + 1), title: list[opened].title }, () => scrollTo(targetOf(target, withMark), false));
      }
    },
    [cut, edition.pages, reduce, scrollTo, targetOf],
  );

  const goToChapter = useCallback((index: number) => goTo(laid.current.chapters[index].start, true), [goTo]);

  const switchEdition = useCallback(
    (index: number) => {
      if (index === editionIndex || cutting.current) return;
      // From the title card only the pages below change; mid-deck, cut to the new edition's first page.
      if (reduce || pageRef.current < 0) {
        setEditionIndex(index);
        return;
      }
      cut({ number: '', title: project.editions[index].label }, () => {
        toFirstPage.current = true;
        setEditionIndex(index);
      });
    },
    [cut, editionIndex, project.editions, reduce],
  );

  // After a cut to another edition, land on its first page once it has been laid out.
  useEffect(() => {
    if (!toFirstPage.current) return;
    toFirstPage.current = false;
    measure();
    scrollTo(targetOf(0, true), false);
  }, [editionIndex, measure, scrollTo, targetOf]);

  // Keys: Escape closes (or the sheet first), the arrows turn the page.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (sheet) setSheet(false);
        else close();
        return;
      }
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      if ((event.target as HTMLElement | null)?.closest('[role="radiogroup"]')) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' && pageRef.current <= 0) scrollTo(0, !reduce);
      else goTo(pageRef.current + (event.key === 'ArrowRight' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, goTo, reduce, scrollTo, sheet]);

  // The stage waits for the title card's shot to be painted before it lets go of its own.
  const slug = project.slug;
  useEffect(() => {
    if (mode !== 'overlay' || !onReady) return;
    let cancelled = false;
    const done = () => {
      if (!cancelled) onReady(slug);
    };
    const shot = shotRef.current;
    if (shot) shot.decode().then(done, done);
    else requestAnimationFrame(done);
    return () => {
      cancelled = true;
    };
  }, [mode, onReady, slug]);

  // Keyboard scrolling works from the first moment the deck is shown.
  useEffect(() => {
    if (ready) scrollerRef.current?.focus({ preventScroll: true });
  }, [ready]);

  const pickNext = (event: MouseEvent<HTMLAnchorElement>) => {
    if (mode !== 'overlay' || !onNext) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const panel = event.currentTarget;
    const image = panel.querySelector('img');
    if (!image) return;
    onNext(project.next.slug, {
      frame: boxOf(panel),
      image: boxOf(image),
      radius: 14,
      src: image.currentSrc || image.src,
      focus: project.next.cover.focus,
    });
  };

  const current = chapter >= 0 ? chapters[chapter] : null;
  const focus = { objectPosition: project.cover.focus };
  const lines = reduce ? fade : rise;
  const editions: Editions | null =
    project.editions.length > 1
      ? { options: project.editions.map((option) => ({ label: option.label, pages: option.pages.length })), active: editionIndex, onPick: switchEdition }
      : null;

  return (
    <div
      ref={rootRef}
      className={cn('work-viewer', reading && 'is-reading', ready && 'is-ready')}
      data-scroll-own=""
      role={mode === 'overlay' ? 'dialog' : undefined}
      aria-modal={mode === 'overlay' ? true : undefined}
      aria-labelledby={titleId}
      style={{ '--accent': project.accent } as CSSProperties}
    >
      {/* The ground: the card's shot behind the title card, then the light of the page in view. */}
      <div aria-hidden className="work-ground">
        <div className="work-hero-shot">
          <div className="work-hero-shot-inner">
            {shotSrc && (
              // The exact file the card was showing, already decoded: the stage hands over onto it.
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={shotRef} src={shotSrc} alt="" className="work-cover-img" style={focus} />
            )}
            <Image
              src={project.cover.src}
              alt=""
              fill
              priority
              sizes="100vw"
              quality={80}
              className={cn('work-cover-img transition-opacity duration-700', coverLoaded || !shotSrc ? 'opacity-100' : 'opacity-0')}
              style={focus}
              onLoad={() => setCoverLoaded(true)}
            />
          </div>
          <div className="work-shade" />
          <div className="work-hero-glow" />
        </div>
        <Ambient preview={page >= 0 ? edition.pages[page].preview : null} />
        <div className="work-vignette" />
        <div className="work-grain" />
      </div>

      <header ref={barRef} className="work-bar">
        <div aria-hidden className="site-header-blur">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <button type="button" className="work-close" onClick={close} aria-label={mode === 'overlay' ? copy.close : copy.back}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <p className="work-bar-title" aria-hidden={!reading}>
          <span className="work-bar-name">{project.title}</span>
          <span className="work-bar-chapter">
            <AnimatePresence mode="popLayout" initial={false}>
              {current && (
                <motion.span
                  key={`${editionIndex}-${chapter}`}
                  initial={{ y: '110%', opacity: 0, filter: 'blur(6px)' }}
                  animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
                  exit={{ y: '-110%', opacity: 0, filter: 'blur(6px)' }}
                  transition={{ duration: 0.55, ease: ease.expo }}
                >
                  {current.title}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </p>
        <p className="work-counter">
          <span className="sr-only">
            {Math.max(1, page + 1)} / {total}
          </span>
          <span aria-hidden className="work-counter-roll">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={Math.max(1, page + 1)}
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-100%', opacity: 0 }}
                transition={{ duration: 0.45, ease: ease.expo }}
              >
                {pad(Math.max(1, page + 1))}
              </motion.span>
            </AnimatePresence>
          </span>
          <span aria-hidden className="work-counter-total">/ {pad(total)}</span>
        </p>
        <div aria-hidden className="work-progress">
          {chapters.map((span, index) => (
            <span
              key={`${editionIndex}-${index}`}
              className={cn('work-progress-seg', index < chapter && 'is-done', index === chapter && 'is-active')}
              style={{ '--pages': span.end - span.start + 1 } as CSSProperties}
            >
              <span />
            </span>
          ))}
        </div>
      </header>

      <ChapterRail chapters={chapters} pages={edition.pages} active={chapter} onPick={goToChapter} editions={editions} />

      <motion.div ref={scrollerRef} layoutScroll className="work-scroller" tabIndex={-1}>
        <div ref={contentRef} className="work-content">
          <section ref={heroRef} className="work-hero" aria-labelledby={titleId}>
            <motion.div className="work-hero-copy" initial="hidden" animate={ready ? 'shown' : 'hidden'}>
              <motion.p className="work-eyebrow" variants={lines} custom={0.1}>
                {copy.eyebrow}
                <span aria-hidden>·</span>
                {total} {copy.pages}
              </motion.p>
              <h1 id={titleId} className="work-title">
                <FocusText text={project.title} delay={0.25} step={0.05} />
              </h1>
              <motion.p className="work-kind" variants={lines} custom={0.6}>
                {project.kind}
              </motion.p>
              <motion.p className="work-summary" variants={lines} custom={0.75}>
                {project.summary}
              </motion.p>
              <motion.div className="work-hero-actions" variants={lines} custom={0.9}>
                <button type="button" className="glow-button" onClick={() => goTo(0, true)}>
                  <span className="glow-button-label">
                    {copy.start}
                    <svg viewBox="0 0 12 14" fill="none" aria-hidden className="w-3">
                      <path d="M10 8.2 6 12.2 2 8.2M6 1.4v10.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span aria-hidden className="glow-button-bg" />
                </button>
                {editions && <EditionSwitch editions={editions} placement="hero" />}
                <span className="work-hero-meta">
                  {chapters.length} {copy.chapters}
                </span>
              </motion.div>
            </motion.div>
            <div aria-hidden className="work-scroll-cue">
              <span>{copy.scroll}</span>
              <span className="work-scroll-cue-line">
                <span />
              </span>
            </div>
          </section>

          <div className="work-pages">
            {chapters.map((span, index) => (
              <section key={`${editionIndex}-${span.start}`} className="work-chapter" aria-labelledby={`${titleId}-${index}`}>
                <header
                  ref={(element) => {
                    markRefs.current[index] = element;
                  }}
                  className={cn('work-mark work-measure', shapeOf(edition.pages[span.start]))}
                  style={{ '--ratio': edition.pages[span.start].width / edition.pages[span.start].height } as CSSProperties}
                >
                  <span className="work-mark-num">{pad(index + 1)}</span>
                  <h2 id={`${titleId}-${index}`} className="work-mark-title">
                    {span.title}
                  </h2>
                  <span aria-hidden className="work-mark-line" />
                  <span className="work-mark-pages">
                    {span.start === span.end ? `p. ${span.start + 1}` : `pp. ${span.start + 1}–${span.end + 1}`}
                  </span>
                </header>
                {edition.pages.slice(span.start, span.end + 1).map((deckPage, offset) => {
                  const number = span.start + offset;
                  return (
                    <DeckPageView
                      key={deckPage.src}
                      ref={(element) => {
                        pageRefs.current[number] = element;
                      }}
                      page={deckPage}
                      priority={number === 0}
                      label={`${project.title}, ${edition.label.toLowerCase()} page ${number + 1} of ${total}: ${span.title}`}
                    />
                  );
                })}
              </section>
            ))}
          </div>

          <section className="work-ending" aria-label={copy.next}>
            <p className="work-ending-label">{copy.end}</p>
            {/* A plain link on the project's own page: a fresh load of the next one. Over the home page the stage carries it. */}
            <a href={`/work/${project.next.slug}`} className="work-next" onClick={pickNext}>
              <span className="work-next-shot">
                <Image
                  src={project.next.cover.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 72rem, 100vw"
                  quality={80}
                  style={{ objectPosition: project.next.cover.focus }}
                />
              </span>
              <span aria-hidden className="work-shade" />
              <span className="work-next-copy">
                <span className="work-eyebrow">{copy.next}</span>
                <span className="work-next-title">{project.next.title}</span>
                <span className="work-next-kind">{project.next.kind}</span>
              </span>
              <span className="glass-button work-next-cta">
                <span>{copy.view}</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-[14px]">
                  <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>
            <button type="button" className="work-ending-back" onClick={close}>
              {copy.back}
            </button>
          </section>
        </div>
      </motion.div>

      <ChapterPill chapter={current} number={chapter} onOpen={() => setSheet(true)} />
      <ChapterSheet
        open={sheet}
        chapters={chapters}
        active={chapter}
        total={total}
        editions={editions}
        onPick={goToChapter}
        onClose={() => setSheet(false)}
      />

      {/* The chapter card a long jump cuts through. */}
      <AnimatePresence>
        {card && (
          <motion.div
            key="curtain"
            aria-hidden
            className="work-curtain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: CURTAIN_IN / 1000, ease: 'easeIn' } }}
            exit={{ opacity: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
          >
            <motion.div
              className="work-curtain-copy"
              initial={{ opacity: 0, y: 14, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: ease.expo, delay: 0.12 } }}
              exit={{ opacity: 0, y: -10, filter: 'blur(8px)', transition: { duration: 0.35 } }}
            >
              {card.number && <span className="work-curtain-num">{card.number}</span>}
              <span className="work-curtain-title">{card.title}</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
