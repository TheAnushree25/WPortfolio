'use client';

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import type { Screen } from '@/content/work';
import { cn } from '@/lib/utils';

/** Both renderings of a screen, for srcset. */
const srcSetOf = (screen: Screen) => `${screen.half} ${Math.round(screen.width / 2)}w, ${screen.src} ${screen.width}w`;

type ShotProps = {
  screen: Screen;
  /** How wide the shot is drawn, so the browser picks the right file. */
  sizes: string;
  alt: string;
  priority?: boolean;
  className?: string;
};

/**
 * A captured screen. Until its file arrives it shows its own 24px rendering,
 * blurred, in its own tone; then it develops into focus, like the deck pages.
 */
export function ScreenShot({ screen, sizes, alt, priority = false, className }: ShotProps) {
  const [loaded, setLoaded] = useState(false);
  // A screen already in the cache can finish loading before React is listening.
  const watch = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <span className={cn('sys-shot', loaded && 'is-loaded', className)} style={{ '--tone': screen.tone, aspectRatio: `${screen.width} / ${screen.height}` } as CSSProperties}>
      <span aria-hidden className="sys-shot-placeholder" style={{ backgroundImage: `url(${screen.preview})` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={watch}
        src={screen.src}
        srcSet={srcSetOf(screen)}
        sizes={sizes}
        width={screen.width}
        height={screen.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className="sys-shot-image"
        onLoad={() => setLoaded(true)}
      />
    </span>
  );
}

/** A screen as a desktop browser shows it: the window's bar, its address, and the page. */
export function BrowserFrame({ host, children, className, style }: { host: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn('sys-browser', className)} style={style}>
      <span aria-hidden className="sys-browser-bar">
        <span className="sys-browser-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="sys-browser-url">
          <svg viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="2.5" y="5.5" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
            <path d="M4 5.5V4a2 2 0 1 1 4 0v1.5" stroke="currentColor" strokeWidth="1.1" />
          </svg>
          {host}
        </span>
      </span>
      <span className="sys-browser-view">{children}</span>
    </span>
  );
}

/** A screen as a phone shows it: a rounded body, the island, and the page. */
export function PhoneFrame({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn('sys-phone', className)} style={style}>
      <span aria-hidden className="sys-phone-island" />
      <span className="sys-phone-view">{children}</span>
    </span>
  );
}

/** The host a live link points at, without its scheme or trailing slash. */
export const hostOf = (href: string) => href.replace(/^https?:\/\//, '').replace(/\/$/, '');
