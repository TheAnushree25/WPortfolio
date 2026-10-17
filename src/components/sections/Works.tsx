'use client';

import { motion } from 'motion/react';
import { works } from '@/content/site';
import { studies } from '@/content/work';
import { CardRow } from '@/components/work/CardRow';
import { ProjectStage } from '@/components/work/ProjectStage';

const opens = (slug: string) => slug in studies;

/**
 * Selected work, after Studio Mirage's 3D/Interactive/Immersive cards. The
 * section pins and the row of tall cards travels sideways exactly as far as
 * the page scrolls (a 1:1 scrub), over the page's living gradient. Each card
 * zooms its shot on hover, drifts its image slightly against the travel for
 * depth, and opens the full project from its glass button: projects with a
 * deck lift their shot into the work viewer at /work/<slug>, the others
 * open the shot itself.
 */
export function Works() {
  return (
    <CardRow
      id="work"
      cards={works.projects}
      opens={opens}
      header={
        <motion.header
          className="flex flex-wrap items-baseline justify-between gap-5"
          style={{ paddingInline: 'var(--pad-content)', paddingBottom: 'clamp(1rem, 3svh, 2rem)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.4, ease: 'linear' }}
        >
          <h2 className="font-studio text-[1.6rem] leading-[1.2] font-normal text-paper-soft/95 min-[481px]:text-[1.8rem] md:text-[2.06rem]">
            {works.title}
          </h2>
          <p className="font-studio text-base font-medium text-paper-soft/95">{works.tagline}</p>
        </motion.header>
      }
    >
      <ProjectStage />
    </CardRow>
  );
}
