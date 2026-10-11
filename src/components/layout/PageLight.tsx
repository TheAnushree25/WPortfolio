'use client';

import { useMotionValue } from 'motion/react';
import { LivingGradient } from '@/components/hero/LivingGradient';

/**
 * The living gradient behind pages other than the landing, which lights its
 * own: the studio glow, swinging every two seconds, with the cursor's sand.
 */
export function PageLight() {
  const scene = useMotionValue(1);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <LivingGradient scene={scene} running />
    </div>
  );
}
