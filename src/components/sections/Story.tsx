'use client';

import { motion } from 'motion/react';
import { story } from '@/content/site';
import { FocusText } from '@/components/ui/FocusText';
import { useHeldReveal } from '@/lib/reveal';

/** However long a paragraph, its last character lands about a second after its first. */
const SWEEP = 1;

/**
 * Who Atlas is, after Studio Mirage's two-column texts, on a screen of its
 * own: the line on the left, the story on the right, type scaled to the
 * viewport. The line focuses in like the landing statement, then each
 * paragraph follows in turn, and the page holds still until the last lands.
 */
export function Story() {
  const [ref, shown] = useHeldReveal<HTMLElement>(3200);

  return (
    <section ref={ref} id="about" data-nav-tone="dark" className="screen-block relative z-10">
      <motion.div
        className="flex w-full flex-col items-start justify-between gap-[max(4vw,2rem)] min-[481px]:flex-row min-[481px]:flex-wrap"
        initial="hidden"
        animate={shown ? 'shown' : 'hidden'}
      >
        <div className="min-w-[min(18rem,100%)] flex-[0_1_calc(50%-max(4vw,2rem))] md:pr-[min(10vw,2rem)]">
          <FocusText
            as="h2"
            text={story.title}
            delay={0.1}
            step={0.03}
            className="font-studio text-[clamp(1.5rem,2.9vw,3.4rem)] leading-[1.2] font-semibold tracking-[0.02em] text-paper-soft/95 uppercase"
          />
        </div>

        <div className="flex min-w-[min(18rem,100%)] flex-[0_1_calc(50%-max(4vw,2rem))] flex-col gap-[1.6em] md:pl-[min(10vw,2rem)]">
          {story.paragraphs.map((paragraph, p) => (
            <FocusText
              key={paragraph}
              as="p"
              text={paragraph}
              delay={0.5 + p * 0.22}
              step={Math.min(0.02, SWEEP / paragraph.replace(/ /g, '').length)}
              className="font-studio text-[clamp(1rem,1.3vw,1.4rem)] leading-[1.6] font-medium text-paper-soft/95"
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
