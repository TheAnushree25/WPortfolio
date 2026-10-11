'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { hero } from '@/content/site';
import { provideFootage, reelDrawn, useFlag } from '@/lib/footage';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

type IntroReelProps = {
  /** Called once, when the reel ends or the visitor skips it. */
  onEnd: () => void;
};

const control =
  'flex h-11 items-center gap-3 rounded-full px-4 text-[12px] leading-none font-semibold tracking-[0.18em] text-paper-soft/80 uppercase transition-colors duration-300 hover:text-paper-soft focus-visible:outline focus-visible:outline-1 focus-visible:outline-paper-soft/60';

/**
 * The studio reel, full screen, before anything else. It starts muted — the
 * only way browsers allow it to start on its own — with sound one tap away.
 * The page light draws it, sharpened, with its own blue backdrop swapped for
 * the living gradient and the cursor's sand running through it; the video
 * element only shows itself where WebGL can't. It ends by dissolving: the
 * frame pushes in while it fades into the light of the first slide.
 */
export function IntroReel({ onEnd }: IntroReelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const drawn = useFlag(reelDrawn);
  const ended = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [sound, setSound] = useState(false);

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    onEnd();
  }, [onEnd]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Autoplay can still be refused (Low Power Mode, data saver); offer a play button then.
    video.muted = true;
    video.play().catch(() => setBlocked(true));

    // A reel that never loads (offline, no decoder) must not hold the landing hostage.
    // <source> failures don't reach the video's own error event, so watch for data instead.
    const guard = window.setTimeout(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) finish();
    }, 8000);

    let raf = 0;
    const track = () => {
      const bar = progressRef.current;
      if (bar && video.duration) bar.style.transform = `scaleX(${video.currentTime / video.duration})`;
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);

    // The light follows the overlay's own fade on the way out, and pushes in as it goes.
    const overlay = overlayRef.current;
    const fade = () => (overlay ? Number(getComputedStyle(overlay).opacity) : 1);
    provideFootage('reel', {
      video,
      fade,
      place: () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const ratio = (video.videoHeight || 1080) / (video.videoWidth || 1920);
        const push = 1 + 0.06 * (1 - fade());
        // Portrait screens keep the whole frame readable: a wide band with feathered edges.
        if (h > w) {
          const width = w * 1.25 * push;
          return { x: (w - width) / 2, y: (h - width * ratio) / 2, width, height: width * ratio, band: true };
        }
        const width = Math.max(w, h / ratio) * push;
        return { x: (w - width) / 2, y: (h - width * ratio) / 2, width, height: width * ratio };
      },
    });

    return () => {
      provideFootage('reel', null);
      window.clearTimeout(guard);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [finish]);

  const play = () => {
    videoRef.current
      ?.play()
      .then(() => setBlocked(false))
      .catch(finish);
  };

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !sound;
    video.muted = !next;
    // Mobile browsers only allow unmuted playback from inside the tap itself.
    if (next) video.play().catch(() => {});
    setSound(next);
  };

  return (
    <motion.div
      ref={overlayRef}
      data-intro-reel
      className="fixed inset-0 z-[140] overflow-hidden"
      exit={{ opacity: 0, scale: 1.06, filter: 'blur(24px)' }}
      transition={{ duration: 1.4, ease: ease.appear }}
    >
      <video
        ref={videoRef}
        className={cn(
          'absolute inset-0 size-full object-cover',
          // Portrait screens keep the whole frame readable: a wide band with feathered edges.
          'portrait:inset-auto portrait:top-1/2 portrait:left-1/2 portrait:aspect-video portrait:h-auto portrait:w-[125%] portrait:max-w-none portrait:-translate-x-1/2 portrait:-translate-y-1/2 portrait:[mask-image:linear-gradient(transparent,#000_16%,#000_84%,transparent)]',
          // Once the light is drawing the reel, the element keeps playing unseen.
          drawn && 'opacity-0',
        )}
        poster={hero.reel.poster}
        aria-label={hero.reel.label}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
      >
        <source src={hero.reel.small} type="video/mp4" media="(max-width: 900px)" />
        <source src={hero.reel.src} type="video/mp4" />
      </video>

      {blocked && (
        <button
          type="button"
          onClick={play}
          className="absolute top-1/2 left-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-paper-soft/30 bg-night/30 text-paper-soft backdrop-blur-md transition-colors duration-300 hover:bg-night/50"
          aria-label={hero.reel.play}
        >
          <svg viewBox="0 0 24 24" className="ml-1 size-7" fill="currentColor" aria-hidden>
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
        </button>
      )}

      <motion.div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-4 md:px-6 md:pb-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: ease.expo, delay: 1 }}
      >
        <button type="button" onClick={toggleSound} aria-pressed={sound} className={control}>
          <span className="flex h-3 items-end gap-[3px]" aria-hidden>
            {[0.55, 1, 0.7, 0.85].map((height, i) => (
              <span
                key={i}
                className="w-[2px] origin-bottom rounded-full bg-current transition-transform duration-500"
                style={{ height: '100%', transform: `scaleY(${sound ? height : 0.25})` }}
              />
            ))}
          </span>
          {sound ? hero.reel.soundOn : hero.reel.soundOff}
        </button>

        <button type="button" onClick={finish} className={control}>
          {hero.reel.skip}
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </motion.div>

      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-paper-soft/10">
        <span ref={progressRef} className="block h-full origin-left scale-x-0 bg-paper-soft/60" />
      </span>
    </motion.div>
  );
}
