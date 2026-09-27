'use client';

import Image from 'next/image';
import { useMotionValue, useTransform } from 'motion/react';
import * as motion from 'motion/react-client';
import { Grain } from '@/components/ui/Grain';
import { useSceneMotion } from '@/components/layout/CoverScene';

type StickyBreakProps = {
  src: string;
  alt: string;
};

/**
 * Full-bleed image that the following light sections slide over. The artwork
 * eases from 1.14× down to 1× and drifts as the sheet covers it — the same
 * handoff the reference uses between every dark frame and the white page.
 */
export function StickyBreak({ src, alt }: StickyBreakProps) {
  const scene = useSceneMotion();
  const fallback = useMotionValue(0);
  const cover = scene?.cover ?? fallback;

  const scale = useTransform(cover, [0, 1], [1.14, 1]);
  const y = useTransform(cover, [0, 1], ['-6%', '8%']);

  return (
    <section className="relative h-full min-h-[640px] w-full overflow-hidden bg-ink">
      <motion.div className="absolute inset-0" style={{ scale, y }}>
        <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" />
      </motion.div>
      <Grain opacity={0.22} />
      <div className="pointer-events-none absolute inset-0 flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-full flex-1 border-r border-paper-soft/10 last:border-r-0" />
        ))}
      </div>
    </section>
  );
}
