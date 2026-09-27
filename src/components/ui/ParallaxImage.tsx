'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';

type ParallaxImageProps = {
  src: string;
  alt: string;
  /** Vertical travel in px across the full scroll range of the frame. */
  distance?: number;
  /** Extra height given to the inner image so the travel never exposes an edge. */
  overscan?: number;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
};

/**
 * Media frame whose image is taller than its mask and drifts as the frame
 * crosses the viewport — the parallax used on every product tile and card.
 */
export function ParallaxImage({
  src,
  alt,
  distance = 80,
  overscan = 0.28,
  className,
  imageClassName,
  sizes = '(max-width: 768px) 100vw, 33vw',
  priority = false,
}: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [-distance / 2, distance / 2]);

  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)}>
      <motion.div style={{ y, height: `${100 + overscan * 100}%` }} className="absolute inset-x-0 top-[-14%]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn('object-cover', imageClassName)}
        />
      </motion.div>
    </div>
  );
}
