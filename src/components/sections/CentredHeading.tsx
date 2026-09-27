'use client';

import * as motion from 'motion/react-client';
import { fadeUp, stagger, viewport } from '@/lib/motion';
import { Badge } from '@/components/ui/Badge';
import { PillButton } from '@/components/ui/PillButton';

type CentredHeadingProps = {
  badge: string;
  heading: string;
  body: string | readonly string[];
  cta?: { label: string; href: string };
};

/**
 * Badge → 110px display heading → 800px body → CTA. Repeated verbatim above
 * the portfolio, testimonials, photography, pricing and blog sections.
 */
export function CentredHeading({ badge, heading, body, cta }: CentredHeadingProps) {
  const lines = Array.isArray(body) ? body : [body as string];
  const words = heading.split(' ');

  return (
    <motion.div
      className="flex flex-col items-center gap-[30px] text-center"
      variants={stagger(0.08)}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
    >
      <motion.div variants={fadeUp}>
        <Badge>{badge}</Badge>
      </motion.div>

      <motion.h2 className="text-h1 max-w-[1000px] text-ink-900" variants={stagger(0.05)}>
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-[0.06em] align-bottom">
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: '110%' },
                show: { y: '0%', transition: { duration: 0.95, ease: [0.16, 1, 0.3, 1] } },
              }}
            >
              {word}
              {i < words.length - 1 ? '\u00A0' : ''}
            </motion.span>
          </span>
        ))}
      </motion.h2>

      <motion.p variants={fadeUp} className="text-body max-w-[800px] text-ink-500">
        {lines.join(' ')}
      </motion.p>

      {cta && (
        <motion.div variants={fadeUp}>
          <PillButton label={cta.label} href={cta.href} />
        </motion.div>
      )}
    </motion.div>
  );
}
