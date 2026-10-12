'use client';

import { useCallback, useState, type CSSProperties, type Ref } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DeckPage } from '@/content/work';
import { cn } from '@/lib/utils';

export type PageShape = 'is-wide' | 'is-square' | 'is-tall';

/** Slides fill the reading column; square and portrait pages are held to the screen. */
export function shapeOf(page: DeckPage): PageShape {
  const ratio = page.width / page.height;
  return ratio > 1.2 ? 'is-wide' : ratio < 0.85 ? 'is-tall' : 'is-square';
}

/** How wide each shape is drawn (mirrors .work-measure in globals.css), so the browser picks the right file. */
const SIZES: Record<PageShape, string> = {
  'is-wide': '(min-width: 1024px) min(1500px, calc(100vw - 26rem)), calc(100vw - 2rem)',
  'is-square': '(min-width: 1024px) min(900px, calc(100vh - 10rem)), calc(100vw - 2rem)',
  'is-tall': '(min-width: 1024px) 880px, calc(100vw - 2rem)',
};

/** Both renderings of a page, for srcset. */
export const srcSetOf = (page: DeckPage) => `${page.half} ${Math.round(page.width / 2)}w, ${page.src} ${page.width}w`;

/** Starts fetching a page the way its <img> will ask for it, so a jump lands on it already loaded. */
export function preloadPage(page: DeckPage | undefined) {
  if (!page) return;
  const image = new Image();
  image.sizes = SIZES[shapeOf(page)];
  image.srcset = srcSetOf(page);
  image.src = page.src;
}

type DeckPageViewProps = {
  page: DeckPage;
  label: string;
  priority: boolean;
  ref: Ref<HTMLElement>;
};

/**
 * One page of the deck. Until its file arrives the page shows its own 24px
 * rendering, blurred, in its own tone; then it develops into focus like a
 * print in the tray. The viewer sets --focus as the page nears the middle
 * of the screen, which lifts it out of the dark.
 *
 * The files are the two sizes scripts/work/build.py rendered, served as they
 * are (the image optimiser would only re-encode pages already at size).
 */
export function DeckPageView({ page, label, priority, ref }: DeckPageViewProps) {
  const [loaded, setLoaded] = useState(false);
  const shape = shapeOf(page);
  // A page already in the cache can finish loading before React is listening.
  const watch = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <figure
      ref={ref}
      className={cn('work-page work-measure', shape, loaded && 'is-loaded')}
      style={{ '--ratio': page.width / page.height, '--tone': page.tone } as CSSProperties}
    >
      <span aria-hidden className="work-page-placeholder" style={{ backgroundImage: `url(${page.preview})` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={watch}
        src={page.src}
        srcSet={srcSetOf(page)}
        sizes={SIZES[shape]}
        width={page.width}
        height={page.height}
        alt={label}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        className="work-page-image"
        onLoad={() => setLoaded(true)}
      />
    </figure>
  );
}

/**
 * The light behind the pages: the page in view, shrunk to 24px, blurred and
 * blown up behind it, so the room takes its colour from whatever is on
 * screen. It is drawn small and scaled up on the GPU, which keeps the blur
 * cheap; a change of page dissolves from one light into the next.
 */
export function Ambient({ preview }: { preview: string | null }) {
  return (
    <div className="work-ambient">
      <AnimatePresence initial={false}>
        {preview && (
          <motion.img
            key={preview}
            src={preview}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
