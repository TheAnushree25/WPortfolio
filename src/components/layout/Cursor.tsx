'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

/**
 * 16px brand dot that trails the pointer and swells over interactive targets.
 * Hidden entirely on touch devices and when the pointer leaves the document.
 */
export function Cursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 900, damping: 60, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 900, damping: 60, mass: 0.3 });

  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const move = (event: PointerEvent) => {
      x.set(event.clientX - 8);
      y.set(event.clientY - 8);
      setVisible(true);
      setActive(Boolean((event.target as HTMLElement).closest('a, button, input, textarea, [data-cursor]')));
    };
    const leave = () => setVisible(false);

    window.addEventListener('pointermove', move);
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
    };
  }, [x, y]);

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[200] hidden size-4 rounded-full bg-brand mix-blend-normal md:block"
      style={{ x: sx, y: sy }}
      animate={{ opacity: visible ? 1 : 0, scale: active ? 2.4 : 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}
