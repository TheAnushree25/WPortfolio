'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type GrainProps = {
  opacity?: number;
  className?: string;
};

/**
 * Animated film grain painted to a canvas — the same 0.3-opacity noise layer
 * that sits over the dark hero and the full-bleed image breaks.
 */
export function Grain({ opacity = 0.3, className }: GrainProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let raf = 0;
    let tile: ImageData | null = null;

    const TILE = 180;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
    };

    const makeTile = () => {
      const data = ctx.createImageData(TILE, TILE);
      const buf = data.data;
      for (let i = 0; i < buf.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        buf[i] = v;
        buf[i + 1] = v;
        buf[i + 2] = v;
        buf[i + 3] = 26;
      }
      return data;
    };

    const draw = () => {
      // Repaint the noise every third frame; a full refresh each frame reads as
      // static rather than grain and costs far more.
      if (frame % 3 === 0) {
        tile = makeTile();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const temp = document.createElement('canvas');
        temp.width = TILE;
        temp.height = TILE;
        temp.getContext('2d')?.putImageData(tile, 0, 0);
        const pattern = ctx.createPattern(temp, 'repeat');
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      frame += 1;
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
      style={{ opacity }}
    />
  );
}
