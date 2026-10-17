'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Lenis from 'lenis';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { DeckPage, SystemProject } from '@/content/work';
import { ease } from '@/lib/motion';
import { boxOf, type ShotBox } from '@/lib/work';
import { cn } from '@/lib/utils';
import { FocusText } from '@/components/ui/FocusText';
import { Ambient, preloadPage } from './ViewerPage';
import { ChapterPill, ChapterRail, ChapterSheet, pad, type LaidChapter } from './ViewerIndex';
import { ViewerScroll } from './system/scroll';
import { Brief } from './system/Brief';
import { Stack } from './system/Stack';
import { Plan } from './system/Plan';
import { Journeys } from './system/Journeys';
import { Design } from './system/Design';
import { Screens } from './system/Screens';
import { Numbers } from './system/Numbers';

const copy = works.viewer;
const words = works.system;

/** The reading line, as a share of the screen's height: the chapter across it is the one being read. */
const READING_LINE = 0.42;
/** Past this share of the title card the reader is reading: the index and the pill come in. */
const READING_FROM = 0.55;
/** Jumps across more chapters than this cut through a chapter card instead of gliding. */
const GLIDE_LIMIT = 2;
const CURTAIN_IN = 320;
const CARD_HOLD = 520;

const lenisEase = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t));
const glideEase = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

/** An element's top within `container`, walking up its offset parents. */
function topWithin(element: HTMLElement | null, container: HTMLElement | null) {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== container) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  shown: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 1.1, ease: ease.expo, delay } }),
};
const fade: Variants = {
  hidden: { opacity: 0 },
  shown: (delay: number = 0) => ({ opacity: 1, transition: { duration: 0.6, delay } }),
};

type SystemViewerProps = {
  project: SystemProject;
  mode: 'overlay' | 'page';
  active?: boolean;
  shotSrc?: string;
  ready?: boolean;
  onReady?: (slug: string) => void;
  onClose?: () => void;
  onNext?: (slug: string, shot: ShotBox) => void;
};

type ChapterKey = 'brief' | 'stack' | 'plan' | 'journeys' | 'design' | 'screens' | 'numbers';

/**
 * A system's case study, read like the decks: the card's screen becomes the
 * title card, where the name focuses in; scrolling on, the chapters follow —
 * the brief, what it is built with and how the pieces talk, the site map, the
 * journeys people take through it, its design language, its screens and its
 * numbers. The index on the left follows the reading and travels anywhere: a
 * short way it glides, a long way it dips to a chapter card and cuts. The end
 * opens the next system.
 */
export function SystemViewer({ project, mode, active = true, shotSrc, ready: landed = true, onReady, onClose, onNext }: SystemViewerProps) {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const titleId = useId();
  const study = project.system;
  const screens = study.screens;
  const host = study.live ? study.live.label : project.title;

  const [chapter, setChapter] = useState(-1);
  const [reading, setReading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [card, setCard] = useState<{ number: string; title: string } | null>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const ready = mode === 'page' || landed;

  /** The chapters, each with the screen that previews it beside the index and lights the room. */
  const chapters = useMemo(() => {
    const at = (index: number) => screens[Math.min(screens.length - 1, index)] ?? screens[0];
    const list: { key: ChapterKey; title: string; preview: DeckPage }[] = [
      { key: 'brief', title: words.brief, preview: at(0) },
      { key: 'stack', title: words.stack, preview: at(1) },
      { key: 'plan', title: study.plan.title, preview: at(2) },
      { key: 'journeys', title: words.journeys, preview: at(3) },
      { key: 'design', title: words.design, preview: at(4) },
      { key: 'screens', title: words.screens, preview: at(5) },
      { key: 'numbers', title: words.numbers, preview: at(6) },
    ];
    return list;
  }, [screens, study.plan.title]);
  const laid: LaidChapter[] = useMemo(() => chapters.map((item, index) => ({ title: item.title, page: index + 1, start: index, end: index })), [chapters]);
  const previews = useMemo(() => chapters.map((item) => item.preview), [chapters]);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const shotRef = useRef<HTMLImageElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const lenisRef = useRef<Lenis | null>(null);
  const chapterRef = useRef(-1);
  const readingRef = useRef(false);
  const cutting = useRef(false);
  const geo = useRef({ tops: [] as number[], heights: [] as number[], hero: 1 });

  const close = useCallback(() => {
    if (onClose) onClose();
    else router.push('/works#systems');
  }, [onClose, router]);

  const measure = useCallback(() => {
    const content = contentRef.current;
    const g = geo.current;
    g.tops = sectionRefs.current.map((section) => topWithin(section, content));
    g.heights = sectionRefs.current.map((section) => section?.offsetHeight ?? 0);
    g.hero = heroRef.current?.offsetHeight ?? window.innerHeight;
  }, []);

  // Every scroll frame: the title card's exit, and which chapter is being read and how far.
  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!scroller || !root) return;
    const g = geo.current;
    const y = scroller.scrollTop;
    const height = scroller.clientHeight;
    const hero = Math.min(1, Math.max(0, y / Math.max(1, g.hero * 0.8)));
    root.style.setProperty('--hero', hero.toFixed(3));

    const line = y + height * READING_LINE;
    let current = -1;
    for (let i = 0; i < g.tops.length; i += 1) if (line >= g.tops[i]) current = i;
    if (current >= 0) {
      const atEnd = y >= scroller.scrollHeight - height - 2;
      const progress = atEnd ? 1 : Math.min(1, Math.max(0, (line - g.tops[current]) / Math.max(1, g.heights[current])));
      root.style.setProperty('--chapter-progress', progress.toFixed(3));
    }
    const isReading = hero >= READING_FROM;
    if (isReading !== readingRef.current) {
      readingRef.current = isReading;
      setReading(isReading);
    }
    if (current !== chapterRef.current) {
      chapterRef.current = current;
      setChapter(current);
    }
  }, []);

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
  }, [measure, update]);

  // The viewer's own weighted scroll, across the whole viewer.
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

  const targetOf = useCallback((index: number) => {
    const bar = barRef.current?.offsetHeight ?? 80;
    return Math.max(0, (geo.current.tops[index] ?? 0) - bar - 12);
  }, []);

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
    (index: number) => {
      if (cutting.current) return;
      const target = Math.max(0, Math.min(chapters.length - 1, index));
      const distance = Math.abs(target - Math.max(0, chapterRef.current));
      if (reduce) scrollTo(targetOf(target), false);
      else if (distance <= GLIDE_LIMIT) scrollTo(targetOf(target), true, Math.min(1.9, 1 + distance * 0.3));
      else {
        preloadPage(chapters[target].preview);
        cut({ number: pad(target + 1), title: chapters[target].title }, () => scrollTo(targetOf(target), false));
      }
    },
    [chapters, cut, reduce, scrollTo, targetOf],
  );

  // Keys: Escape closes (or the sheet first), the arrows move between chapters.
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
      if ((event.target as HTMLElement | null)?.closest('[role="tablist"], [role="radiogroup"]')) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' && chapterRef.current <= 0) scrollTo(0, !reduce);
      else goTo(chapterRef.current + (event.key === 'ArrowRight' ? 1 : -1));
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
    onNext(project.next.slug, { frame: boxOf(panel), image: boxOf(image), radius: 14, src: image.currentSrc || image.src, focus: project.next.cover.focus });
  };

  const current = chapter >= 0 ? laid[chapter] : null;
  const focus = { objectPosition: project.cover.focus };
  const lines = reduce ? fade : rise;

  const body: Record<ChapterKey, ReactNode> = {
    brief: <Brief study={study} host={host} cover={screens[0]} />,
    stack: <Stack study={study} />,
    plan: <Plan study={study} />,
    journeys: <Journeys study={study} />,
    design: <Design study={study} active={chapter >= 2} />,
    screens: <Screens study={study} host={host} />,
    numbers: <Numbers study={study} />,
  };

  return (
    <div
      ref={rootRef}
      className={cn('work-viewer is-system', reading && 'is-reading', ready && 'is-ready')}
      data-scroll-own=""
      role={mode === 'overlay' ? 'dialog' : undefined}
      aria-modal={mode === 'overlay' ? true : undefined}
      aria-labelledby={titleId}
      style={{ '--accent': project.accent } as CSSProperties}
    >
      <div aria-hidden className="work-ground">
        <div className="work-hero-shot">
          <div className="work-hero-shot-inner">
            {shotSrc && (
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
        <Ambient preview={chapter >= 0 ? chapters[chapter].preview.preview : null} />
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
                  key={chapter}
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
            {words.chapter} {Math.max(1, chapter + 1)} / {chapters.length}
          </span>
          <span aria-hidden className="work-counter-roll">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={Math.max(1, chapter + 1)}
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-100%', opacity: 0 }}
                transition={{ duration: 0.45, ease: ease.expo }}
              >
                {pad(Math.max(1, chapter + 1))}
              </motion.span>
            </AnimatePresence>
          </span>
          <span aria-hidden className="work-counter-total">/ {pad(chapters.length)}</span>
        </p>
        <div aria-hidden className="work-progress">
          {chapters.map((item, index) => (
            <span
              key={item.key}
              className={cn('work-progress-seg', index < chapter && 'is-done', index === chapter && 'is-active')}
              style={{ '--pages': 1 } as CSSProperties}
            >
              <span />
            </span>
          ))}
        </div>
      </header>

      <ChapterRail chapters={laid} pages={previews} active={chapter} onPick={goTo} editions={null} count={`${chapters.length} ${copy.chapters}`} ranges={false} />

      <motion.div ref={scrollerRef} layoutScroll className="work-scroller" tabIndex={-1}>
        <ViewerScroll.Provider value={scrollerRef}>
          <div ref={contentRef} className="work-content">
            <section ref={heroRef} className="work-hero" aria-labelledby={titleId}>
              <motion.div className="work-hero-copy" initial="hidden" animate={ready ? 'shown' : 'hidden'}>
                <motion.p className="work-eyebrow" variants={lines} custom={0.1}>
                  {words.eyebrow}
                  <span aria-hidden>·</span>
                  {study.industry}
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
                  <button type="button" className="glow-button" onClick={() => goTo(0)}>
                    <span className="glow-button-label">
                      {copy.start}
                      <svg viewBox="0 0 12 14" fill="none" aria-hidden className="w-3">
                        <path d="M10 8.2 6 12.2 2 8.2M6 1.4v10.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span aria-hidden className="glow-button-bg" />
                  </button>
                  {study.live && (
                    <a href={study.live.href} target="_blank" rel="noreferrer" className="glass-button">
                      <span>{words.visit}</span>
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-[14px]">
                        <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  )}
                  <span className="work-hero-meta">
                    {chapters.length} {copy.chapters} · {study.year}
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

            <div className="sys-chapters">
              {chapters.map((item, index) => (
                <section
                  key={item.key}
                  ref={(element) => {
                    sectionRefs.current[index] = element;
                  }}
                  className={cn('sys-chapter', `is-${item.key}`)}
                  aria-labelledby={`${titleId}-${index}`}
                >
                  <header className="work-mark sys-mark">
                    <span className="work-mark-num">{pad(index + 1)}</span>
                    <h2 id={`${titleId}-${index}`} className="work-mark-title">
                      {item.title}
                    </h2>
                    <span aria-hidden className="work-mark-line" />
                  </header>
                  {body[item.key]}
                </section>
              ))}
            </div>

            <section className="work-ending" aria-label={copy.next}>
              <p className="work-ending-label">{words.end}</p>
              <a href={`/work/${project.next.slug}`} className="work-next" onClick={pickNext}>
                <span className="work-next-shot">
                  <Image src={project.next.cover.src} alt="" fill sizes="(min-width: 1024px) 72rem, 100vw" quality={80} style={{ objectPosition: project.next.cover.focus }} />
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
        </ViewerScroll.Provider>
      </motion.div>

      <ChapterPill chapter={current} number={chapter} onOpen={() => setSheet(true)} />
      <ChapterSheet
        open={sheet}
        chapters={laid}
        active={chapter}
        total={chapters.length}
        count={`${chapters.length} ${copy.chapters}`}
        ranges={false}
        editions={null}
        onPick={goTo}
        onClose={() => setSheet(false)}
      />

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
