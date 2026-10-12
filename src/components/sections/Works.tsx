'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
// Same module as the hooks: motion/react-client declares a separate MotionValue type.
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { works } from '@/content/site';
import { studies } from '@/content/work';
import { ease } from '@/lib/motion';
import { jumpTo, lockScroll } from '@/lib/scroll';
import { boxOf, getWork, launchProject, registerCard, useWork } from '@/lib/work';
import { GlassButton } from '@/components/ui/GlassButton';
import { ProjectStage, preloadViewer } from '@/components/work/ProjectStage';

type Project = (typeof works.projects)[number];

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
 */
const TRACK_HEIGHT = `calc(100svh + max(0px, ${PAD} + var(--cards) * var(--card-h) * 0.5625 + (var(--cards) - 1) * ${GAP}px + ${PAD_END} - 100vw))`;

/**
 * Selected work, after Studio Mirage's 3D/Interactive/Immersive cards. The
 * section pins and the row of tall cards travels sideways exactly as far as
 * the page scrolls (a 1:1 scrub), over the page's living gradient. Each card
 * zooms its shot on hover, drifts its image slightly against the travel for
 * depth, and opens the full project from its glass button: projects with a
 * deck lift their shot into the work viewer at /work/<slug>, the others
 * open the shot itself.
 */
export function Works() {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const geometry = useRef({ top: 0, pin: 1, travel: 0 });
  const [open, setOpen] = useState<Project | null>(null);
  const x = useMotionValue(0);
  const { scrollY } = useScroll();

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
    (project: Project, card: HTMLElement) => {
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
      id="work"
      data-nav-tone="dark"
      className="works-cards relative z-10"
      style={{ paddingBottom: 'max(10vw, 8rem)', '--cards': works.projects.length } as CSSProperties}
    >
      <div ref={trackRef} style={{ height: TRACK_HEIGHT }}>
        <div ref={stickyRef} className="sticky top-0 flex h-[100svh] flex-col overflow-hidden" style={{ paddingTop: 'clamp(3rem, 16svh, 150px)' }}>
          <motion.header
            className="flex flex-wrap items-baseline justify-between gap-5"
            style={{ paddingInline: PAD, paddingBottom: 'clamp(1rem, 3svh, 2rem)' }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.4, ease: 'linear' }}
          >
            <h2 className="font-studio text-[1.6rem] leading-[1.2] font-normal text-paper-soft/95 min-[481px]:text-[1.8rem] md:text-[2.06rem]">
              {works.title}
            </h2>
            <p className="font-studio text-base font-medium text-paper-soft/95">{works.tagline}</p>
          </motion.header>

          <div ref={viewportRef} className="w-full overflow-hidden">
            <motion.ul
              ref={rowRef}
              className="flex w-max will-change-transform"
              style={{ x, gap: GAP, paddingLeft: PAD, paddingRight: PAD_END }}
            >
              {works.projects.map((project, i) => (
                <Card key={project.slug} project={project} index={i} x={x} onOpen={setOpen} onOpenStudy={openStudy} onReveal={reveal} />
              ))}
            </motion.ul>
          </div>
        </div>
      </div>

      <ShotViewer project={open} onClose={() => setOpen(null)} />
      <ProjectStage />
    </section>
  );
}

type CardProps = {
  project: Project;
  index: number;
  x: MotionValue<number>;
  onOpen: (project: Project) => void;
  onOpenStudy: (project: Project, card: HTMLElement) => void;
  onReveal: (card: HTMLElement) => void;
};

/** How far a card's image drifts against the travel, as a share of the card's width. */
const DRIFT = 5;

/** The card's "Explore the project" pill: a label inside the card-wide link, not a control of its own. */
const pill = (
  <span aria-hidden className="glass-button absolute bottom-5 left-1/2 -translate-x-1/2">
    <span>{works.cta}</span>
    <svg viewBox="0 0 16 16" fill="none" className="size-[14px]">
      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

function Card({ project, index, x, onOpen, onOpenStudy, onReveal }: CardProps) {
  const router = useRouter();
  const ref = useRef<HTMLLIElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const centre = useRef(0);
  const study = project.slug in studies;
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
    preloadViewer();
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
      className="group relative aspect-[9/16] h-[var(--card-h)] flex-none overflow-hidden rounded-[10px] bg-night"
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
          sizes="(max-width: 768px) 60vw, 360px"
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
          aria-label={`${works.cta}: ${project.title}`}
          onPointerEnter={warm}
          onFocus={warm}
          onClick={openFromLink}
        >
          {pill}
        </Link>
      ) : (
        <button type="button" className="works-card-hit" onClick={() => onOpen(project)} aria-label={`${works.cta}: ${project.title}`}>
          {pill}
        </button>
      )}
    </motion.li>
  );
}

/** The whole shot, uncropped, with its name — a native modal, so focus and Esc come for free. */
function ShotViewer({ project, onClose }: { project: Project | null; onClose: () => void }) {
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
