'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { works } from '@/content/site';
import type { Chapter, DeckPage } from '@/content/work';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const copy = works.viewer;

/** A chapter with the pages it spans, counted from 0. */
export type LaidChapter = Chapter & { start: number; end: number };

export const pad = (value: number) => String(value).padStart(2, '0');

const range = (chapter: LaidChapter) =>
  chapter.start === chapter.end ? pad(chapter.start + 1) : `${pad(chapter.start + 1)}–${pad(chapter.end + 1)}`;

const marker = { type: 'spring', stiffness: 420, damping: 38 } as const;

/** A project's editions (FreightEasy's presentation and brochure), and how to switch between them. */
export type Editions = { options: { label: string; pages: number }[]; active: number; onPick: (index: number) => void };

/** The editions as a segmented switch: on the title card, in the index, and in the phone's sheet. */
export function EditionSwitch({ editions, placement }: { editions: Editions; placement: 'hero' | 'rail' | 'sheet' }) {
  return (
    <div className={cn('work-editions', placement !== 'hero' && 'is-compact')} role="radiogroup" aria-label={copy.editions}>
      {editions.options.map((option, index) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={index === editions.active}
          className="work-edition"
          onClick={() => editions.onPick(index)}
        >
          {index === editions.active && (
            <motion.span layoutId={`work-edition-pill-${placement}`} className="work-edition-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
          )}
          <span className="work-edition-label">{option.label}</span>
          <span className="work-edition-count">{option.pages}</span>
        </button>
      ))}
    </div>
  );
}

type ListProps = {
  chapters: LaidChapter[];
  active: number;
  onPick: (index: number) => void;
  /** Tells the rail which item the pointer is over, or null when it leaves. */
  onHover?: (index: number | null, item: HTMLElement | null) => void;
  /** Keeps the shared marker of the rail apart from the one in the sheet. */
  variant: 'rail' | 'sheet';
  /** Whether each chapter shows the pages it spans (decks do; a system's chapters have none). */
  ranges?: boolean;
};

/**
 * The chapters as a list. The active one carries a lit marker that slides
 * from chapter to chapter, and a hairline under its name fills as the
 * chapter is read (--chapter-progress, set by the viewer every frame).
 */
function ChapterList({ chapters, active, onPick, onHover, variant, ranges = true }: ListProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the active chapter in view when the list is taller than its room.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[active] as HTMLElement | undefined;
    if (!list || !item) return;
    const top = item.offsetTop - 28;
    const bottom = item.offsetTop + item.offsetHeight + 28;
    if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
  }, [active]);

  return (
    <motion.ol ref={listRef} layoutScroll className={cn('work-index', `is-${variant}`)} onPointerLeave={() => onHover?.(null, null)}>
      {chapters.map((chapter, index) => (
        <li key={`${chapter.title}-${chapter.start}`}>
          <button
            type="button"
            className={cn('work-index-item', index === active && 'is-active', index < active && 'is-read')}
            aria-current={index === active ? 'step' : undefined}
            onClick={() => onPick(index)}
            onPointerEnter={(event) => onHover?.(index, event.currentTarget)}
            onFocus={(event) => onHover?.(index, event.currentTarget)}
            onBlur={() => onHover?.(null, null)}
          >
            {index === active && <motion.span layoutId={`work-index-marker-${variant}`} className="work-index-marker" transition={marker} />}
            <span className="work-index-num">{pad(index + 1)}</span>
            <span className="work-index-title">{chapter.title}</span>
            {ranges && <span className="work-index-pages">{range(chapter)}</span>}
            <span aria-hidden className="work-index-bar" />
          </button>
        </li>
      ))}
    </motion.ol>
  );
}

type RailProps = {
  chapters: LaidChapter[];
  pages: DeckPage[];
  active: number;
  onPick: (index: number) => void;
  editions: Editions | null;
  /** The head's count; a deck counts its pages. */
  count?: string;
  ranges?: boolean;
};

/**
 * The index on the left, for wider screens. It arrives once the title card
 * has been scrolled past. Hovering a chapter floats its opening page beside
 * the rail, so the reader can see where a click will take them.
 */
export function ChapterRail({ chapters, pages, active, onPick, editions, count, ranges = true }: RailProps) {
  const railRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<{ index: number; y: number } | null>(null);

  const hover = (index: number | null, item: HTMLElement | null) => {
    const rail = railRef.current;
    if (index === null || !item || !rail) {
      setPreview(null);
      return;
    }
    const box = item.getBoundingClientRect();
    const frame = rail.getBoundingClientRect();
    setPreview({ index, y: box.top + box.height / 2 - frame.top });
  };

  const shown = preview ? chapters[preview.index] : null;
  const page = shown ? pages[shown.start] : null;

  return (
    <nav ref={railRef} className="work-rail" aria-label={copy.index}>
      <p className="work-rail-head">
        <span>{copy.index}</span>
        <span>{count ?? `${pages.length} ${copy.pages}`}</span>
      </p>
      {editions && <EditionSwitch editions={editions} placement="rail" />}
      <ChapterList
        chapters={chapters}
        active={active}
        variant="rail"
        ranges={ranges}
        onHover={hover}
        onPick={(index) => {
          // The preview has done its work once the chapter is chosen.
          setPreview(null);
          onPick(index);
        }}
      />

      <AnimatePresence>
        {shown && page && preview && (
          <motion.div
            key="preview"
            aria-hidden
            className="work-index-preview"
            initial={{ opacity: 0, scale: 0.94, x: -12, y: preview.y }}
            animate={{ opacity: 1, scale: 1, x: 0, y: preview.y }}
            exit={{ opacity: 0, scale: 0.96, x: -8, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <span className="work-index-preview-frame" style={{ aspectRatio: `${page.width} / ${page.height}`, background: page.tone }}>
              {/* The page's half-size rendering, the one the reader's phone would load too. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.half} alt="" decoding="async" />
            </span>
            <span className="work-index-preview-label">
              <span>{pad(preview.index + 1)}</span> {shown.title}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

type PillProps = { chapter: LaidChapter | null; number: number; onOpen: () => void };

/** On phones the index folds into a pill at the foot of the screen: the chapter, and a ring filling as it is read. */
export function ChapterPill({ chapter, number, onOpen }: PillProps) {
  return (
    <button type="button" className="work-pill" onClick={onOpen} aria-label={`${copy.index}: ${chapter?.title ?? ''}`} aria-haspopup="dialog">
      <svg viewBox="0 0 36 36" aria-hidden className="work-pill-ring">
        <circle cx="18" cy="18" r="15" pathLength={100} />
        <circle cx="18" cy="18" r="15" pathLength={100} className="is-fill" />
      </svg>
      <span className="work-pill-num">{pad(Math.max(1, number + 1))}</span>
      <span className="work-pill-title">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={chapter?.title ?? 'none'}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-110%', opacity: 0 }}
            transition={{ duration: 0.45, ease: ease.expo }}
          >
            {chapter?.title}
          </motion.span>
        </AnimatePresence>
      </span>
      <svg viewBox="0 0 12 12" aria-hidden className="work-pill-chevron">
        <path d="M3 7.5 6 4.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

type SheetProps = {
  open: boolean;
  chapters: LaidChapter[];
  active: number;
  total: number;
  onPick: (index: number) => void;
  onClose: () => void;
  editions: Editions | null;
  /** The head's count; a deck counts its pages. */
  count?: string;
  ranges?: boolean;
};

/**
 * The index as a sheet rising from the foot of the screen; picking a chapter
 * closes it and goes there. It is dragged down by its head, so the list
 * itself still scrolls under a thumb.
 */
export function ChapterSheet({ open, chapters, active, total, onPick, onClose, editions, count, ranges = true }: SheetProps) {
  const drag = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="work-sheet-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal
            aria-label={copy.index}
            className="work-sheet"
            initial={{ y: '105%' }}
            animate={{ y: '0%' }}
            exit={{ y: '105%' }}
            transition={{ duration: 0.55, ease: ease.expo }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="work-sheet-head" onPointerDown={(event) => drag.start(event)}>
              <span aria-hidden className="work-sheet-grip" />
              <p className="work-rail-head">
                <span>{copy.index}</span>
                <span>{count ?? `${total} ${copy.pages}`}</span>
              </p>
            </div>
            {editions && (
              <EditionSwitch
                placement="sheet"
                editions={{
                  ...editions,
                  onPick: (index) => {
                    onClose();
                    editions.onPick(index);
                  },
                }}
              />
            )}
            <ChapterList
              chapters={chapters}
              active={active}
              variant="sheet"
              ranges={ranges}
              onPick={(index) => {
                onClose();
                onPick(index);
              }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
