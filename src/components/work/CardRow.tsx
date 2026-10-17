'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
// Same module as the hooks: motion/react-client declares a separate MotionValue type.
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { works } from '@/content/site';
import { ease } from '@/lib/motion';
import { jumpTo, lockScroll } from '@/lib/scroll';
import { boxOf, getWork, launchProject, registerCard, useWork } from '@/lib/work';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/ui/GlassButton';
import { preloadViewer, type ViewerKind } from '@/components/work/ProjectStage';

/** One card in a row: the shot it shows and the project behind it. */
export type RowCard = { slug: string; title: string; kind: string; src: string; focus: string };

/** The card's corner radius, which the lifted shot starts from. */
const RADIUS = 10;

/** Studio Mirage's content padding (shared with the sections below), and its row's end gutter. */
const PAD = 'var(--pad-content)';
const PAD_END = 'max(20px, 2vw)';
const GAP = 20;

/**
 * How long the section stays pinned: one screen plus however far the row
 * overflows it, worked out from the card geometry in CSS so the page has its
 * final length from the first paint — deep links below land where they should.
 * --card-ratio is a card's width over its height (9:16 posters, 16:10 screens).
 */
const TRACK_HEIGHT = `calc(100svh + max(0px, ${PAD} + var(--cards) * var(--card-h) * var(--card-ratio) + (var(--cards) - 1) * ${GAP}px + ${PAD_END} - 100vw))`;

const SHAPES = {
  /** The selected-work cards: tall posters. */
  poster: { section: 'works-cards', card: 'aspect-[9/16]', sizes: '(max-width: 768px) 60vw, 360px' },
  /** Systems: screens, as wide as a laptop's. */
  screen: { section: 'works-screens', card: 'aspect-[16/10]', sizes: '(max-width: 768px) 92vw, 820px' },
} as const;

type CardRowProps = {
  id: string;
  cards: readonly RowCard[];
  /** Whether a card opens its project in the viewer; the rest open their shot. */
  opens: (slug: string) => boolean;
  /** The heading above the row, inside the pinned frame. */
  header: ReactNode;
  shape?: keyof typeof SHAPES;
  /** Which viewer the cards open, fetched ahead of a click. */
  viewer?: ViewerKind;
  /** The card's pill. */
  cta?: string;
  /** Studio Mirage's index: while one card is pointed at, the others step back. */
  dim?: boolean;
  /** Told which card the pointer is over (or null), e.g. to name it in the header. */
  onHover?: (card: RowCard | null) => void;
  className?: string;
  style?: CSSProperties;
  /** Extras rendered after the row inside the section (the project stage). */
  children?: ReactNode;
};

/**
 * A row of cards that travels sideways while its section is pinned, after
 * Studio Mirage's 3D/Interactive/Immersive cards: the row covers exactly as
 * much ground as the page scrolls (a 1:1 scrub), over the page's living
 * gradient. Each card zooms its shot on hover, drifts its image against the
 * travel for depth and opens its project from anywhere on it: projects with a
 * viewer lift their shot into it at /work/<slug>, the others open the shot.
 */
export function CardRow({ id, cards, opens, header, shape = 'poster', viewer = 'design', cta = works.cta, dim = false, onHover, className, style, children }: CardRowProps) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const geometry = useRef({ top: 0, pin: 1, travel: 0 });
  const [open, setOpen] = useState<RowCard | null>(null);
  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const look = SHAPES[shape];

  /** Moves the page to where the row holds this card mid-screen (the viewer returns a shot to it). */
  const reveal = useCallback((card: HTMLElement) => {
    const { top, pin, travel } = geometry.current;
    if (travel <= 0) {
      jumpTo(top);
      return;
    }
    const offset = Math.min(0, Math.max(-travel, window.innerWidth / 2 - (card.offsetLeft + card.offsetWidth / 2)));
    jumpTo(top + (-offset / travel) * pin);
  }, []);

  /** Lifts the card's shot off the row and opens its project; the stage carries it from here. */
  const openStudy = useCallback(
    (project: RowCard, card: HTMLElement) => {
      const image = card.querySelector('img');
      if (!image || getWork().launch || getWork().project) return;
      launchProject(project.slug, {
        frame: boxOf(card),
        image: boxOf(image),
        radius: RADIUS,
        src: image.currentSrc || image.src,
        focus: project.focus,
      });
      router.push(`/work/${project.slug}`, { scroll: false });
    },
    [router],
  );

  // The row covers its measured overflow across the pinned stretch, so both
  // ends land exactly even where CSS and the browser round differently.
  const follow = useCallback(() => {
    const { top, pin, travel } = geometry.current;
    x.set(-Math.min(Math.max((window.scrollY - top) / pin, 0), 1) * travel);
  }, [x]);

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const sticky = stickyRef.current;
      const viewport = viewportRef.current;
      const row = rowRef.current;
      if (!track || !sticky || !viewport || !row) return;
      geometry.current = {
        top: track.getBoundingClientRect().top + window.scrollY,
        pin: Math.max(1, track.offsetHeight - sticky.offsetHeight),
        travel: Math.max(0, row.scrollWidth - viewport.clientWidth),
      };
      follow();
    };
    measure();
    // Anything that reflows above the section (fonts, the hero) moves where the pin starts.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [follow]);

  useMotionValueEvent(scrollY, 'change', follow);

  return (
    <section
      id={id}
      data-nav-tone="dark"
      className={cn(look.section, 'relative z-10', dim && 'works-dim', className)}
      style={{ paddingBottom: 'max(10vw, 8rem)', '--cards': cards.length, ...style } as CSSProperties}
    >
      <div ref={trackRef} style={{ height: TRACK_HEIGHT }}>
        <div ref={stickyRef} className="sticky top-0 flex h-[100svh] flex-col overflow-hidden" style={{ paddingTop: 'clamp(3rem, 16svh, 150px)' }}>
          {header}

          <div ref={viewportRef} className="w-full overflow-hidden">
            <motion.ul
              ref={rowRef}
              className="flex w-max will-change-transform"
              style={{ x, gap: GAP, paddingLeft: PAD, paddingRight: PAD_END }}
              onPointerLeave={() => onHover?.(null)}
            >
              {cards.map((project, i) => (
                <Card
                  key={project.slug}
                  project={project}
                  index={i}
                  x={x}
                  shape={shape}
                  study={opens(project.slug)}
                  viewer={viewer}
                  cta={cta}
                  onOpen={setOpen}
                  onOpenStudy={openStudy}
                  onReveal={reveal}
                  onHover={onHover}
                />
              ))}
            </motion.ul>
          </div>
        </div>
      </div>

      <ShotViewer project={open} onClose={() => setOpen(null)} />
      {children}
    </section>
  );
}

type CardProps = {
  project: RowCard;
  index: number;
  x: MotionValue<number>;
  shape: keyof typeof SHAPES;
  study: boolean;
  viewer: ViewerKind;
  cta: string;
  onOpen: (project: RowCard) => void;
  onOpenStudy: (project: RowCard, card: HTMLElement) => void;
  onReveal: (card: HTMLElement) => void;
  onHover?: (card: RowCard | null) => void;
};

/** How far a card's image drifts against the travel, as a share of the card's width. */
const DRIFT = 5;

/** The card's pill: a label inside the card-wide link, not a control of its own. */
const pill = (label: string) => (
  <span aria-hidden className="glass-button absolute bottom-5 left-1/2 -translate-x-1/2">
    <span>{label}</span>
    <svg viewBox="0 0 16 16" fill="none" className="size-[14px]">
      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

function Card({ project, index, x, shape, study, viewer, cta, onOpen, onOpenStudy, onReveal, onHover }: CardProps) {
  const router = useRouter();
  const ref = useRef<HTMLLIElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const centre = useRef(0);
  // While its shot is out on the stage the card leaves an empty place in the row.
  const lifted = useWork((state) => state.lifted === project.slug);

  useEffect(() => {
    if (!study) return;
    return registerCard(project.slug, {
      measure: () => {
        const card = ref.current;
        const image = card?.querySelector('img');
        if (!card || !image) return null;
        return { frame: boxOf(card), image: boxOf(image), radius: RADIUS, src: image.currentSrc || image.src, focus: project.focus };
      },
      reveal: () => {
        if (ref.current) onReveal(ref.current);
      },
      focus: () => linkRef.current?.focus({ preventScroll: true }),
    });
  }, [study, project.slug, project.focus, onReveal]);

  // Hovering or focusing a card fetches its project and the viewer, so the click opens at once.
  const warm = () => {
    router.prefetch(`/work/${project.slug}`);
    preloadViewer(viewer);
    onHover?.(project);
  };

  const openFromLink = (event: MouseEvent<HTMLAnchorElement>) => {
    // New tabs and windows get the project's own page.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (ref.current) onOpenStudy(project, ref.current);
  };

  useEffect(() => {
    const measure = () => {
      const card = ref.current;
      if (card) centre.current = card.offsetLeft + card.offsetWidth / 2;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // −1 at the left edge of the screen, 1 at the right: the shot leans the other way.
  const drift = useTransform(x, (offset) => {
    // Motion evaluates this once while rendering on the server, before there is a window.
    const width = typeof window === 'undefined' ? 1440 : window.innerWidth || 1;
    const position = Math.max(-1, Math.min(1, (centre.current + offset - width / 2) / (width / 2)));
    return `${-position * DRIFT}%`;
  });

  return (
    <motion.li
      ref={ref}
      className={cn('group relative h-[var(--card-h)] flex-none overflow-hidden rounded-[10px] bg-night', SHAPES[shape].card)}
      style={{ visibility: lifted ? 'hidden' : undefined }}
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.9, ease: ease.expo, delay: Math.min(index, 4) * 0.07 }}
    >
      <motion.div className="absolute inset-y-0 -inset-x-[7%]" style={{ x: drift }}>
        <Image
          src={project.src}
          alt={`${project.title} — ${project.kind}`}
          fill
          sizes={SHAPES[shape].sizes}
          className="object-cover transition-transform duration-200 ease-out group-hover:scale-110"
          style={{ objectPosition: project.focus }}
        />
      </motion.div>

      {/* The whole card is the way in; the glass pill is its label, and lights up wherever the pointer is on the card. */}
      {study ? (
        <Link
          ref={linkRef}
          href={`/work/${project.slug}`}
          scroll={false}
          className="works-card-hit"
          aria-label={`${cta}: ${project.title}`}
          onPointerEnter={warm}
          onFocus={warm}
          onClick={openFromLink}
        >
          {pill(cta)}
        </Link>
      ) : (
        <button
          type="button"
          className="works-card-hit"
          onClick={() => onOpen(project)}
          onPointerEnter={() => onHover?.(project)}
          onFocus={() => onHover?.(project)}
          aria-label={`${cta}: ${project.title}`}
        >
          {pill(cta)}
        </button>
      )}
    </motion.li>
  );
}

/** The whole shot, uncropped, with its name — a native modal, so focus and Esc come for free. */
function ShotViewer({ project, onClose }: { project: RowCard | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !project) return;
    dialog.showModal();
    const release = lockScroll();
    return () => {
      release();
      if (dialog.open) dialog.close();
    };
  }, [project]);

  return (
    <dialog
      ref={ref}
      aria-label={project?.title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-none max-w-none overflow-visible border-0 bg-transparent p-0 text-paper-soft backdrop:bg-night/75 backdrop:backdrop-blur-md"
    >
      {project && (
        <motion.figure
          key={project.title}
          className="flex w-[min(86vw,76svh)] flex-col gap-5"
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: ease.expo }}
        >
          <div className="relative aspect-square w-full overflow-hidden rounded-[10px] bg-night">
            <Image src={project.src} alt={`${project.title} — ${project.kind}`} fill sizes="(max-width: 768px) 86vw, 76vh" className="object-cover" />
          </div>
          <figcaption className="flex items-center justify-between gap-6">
            <span className="flex flex-col gap-1">
              <span className="font-studio text-[1.6rem] leading-none font-medium">{project.title}</span>
              <span className="text-sm text-paper-soft/60">{project.kind}</span>
            </span>
            <GlassButton
              onClick={onClose}
              icon={
                <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3">
                  <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              }
            >
              {works.close}
            </GlassButton>
          </figcaption>
        </motion.figure>
      )}
    </dialog>
  );
}
