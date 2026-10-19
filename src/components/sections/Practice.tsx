'use client';

import { motion } from 'motion/react';
import { practice } from '@/content/site';
import { FocusText } from '@/components/ui/FocusText';
import { useHeldReveal } from '@/lib/reveal';

/**
 * The studio's fields, after Studio Mirage's expertise listing, filling one
 * screen: the title holds the first quarter, four columns spread over the rest.
 * Type scales with the viewport so the block holds the screen at any size;
 * tablets set the columns two by two under the title, and phones give each
 * field a hairline row, its name on the left and its items beside it.
 * Every line focuses in like the landing statement — the title first, then the
 * columns from left to right, each heading leading its items down — while the
 * page holds the screen still until the last item lands. Items rest at 60%
 * and brighten under the pointer.
 */
export function Practice() {
  const [ref, shown] = useHeldReveal<HTMLElement>(2700);

  return (
    <section ref={ref} id="expertise" data-nav-tone="dark" className="screen-block relative z-10">
      <motion.div className="practice" initial="hidden" animate={shown ? 'shown' : 'hidden'}>
        <div className="practice-head">
          <FocusText
            as="h2"
            text={practice.title}
            delay={0.1}
            step={0.03}
            className="font-studio text-[clamp(1.6rem,3.4vw,4rem)] leading-[1.15] font-normal text-paper-soft/95"
          />
        </div>

        {/* On desktop the columns take their longest item and share out the rest, so no entry wraps. */}
        <div className="practice-columns">
          {practice.columns.map((column, c) => {
            const start = 0.45 + c * 0.14;
            return (
              <div key={column.heading} className="practice-column">
                <FocusText
                  as="h3"
                  text={column.heading}
                  delay={start}
                  step={0.022}
                  className="practice-heading font-studio text-[clamp(0.8rem,0.95vw,1.15rem)] leading-[1.2] font-semibold text-paper-soft/95 uppercase"
                />
                <ul>
                  {column.items.map((item, i) => (
                    <li
                      key={item}
                      className="font-studio text-[clamp(15px,1.2vw,1.5rem)] leading-[2] font-medium text-paper-soft/95 opacity-60 transition-opacity duration-[800ms] hover:opacity-100"
                    >
                      <FocusText text={item} delay={start + 0.18 + i * 0.07} step={0.014} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}
