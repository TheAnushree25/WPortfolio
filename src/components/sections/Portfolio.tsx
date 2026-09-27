'use client';

import Image from 'next/image';
import Link from 'next/link';
import * as motion from 'motion/react-client';
import { portfolio, wordmarks } from '@/content/site';
import { riseIn, stagger, viewportEarly } from '@/lib/motion';
import { ProgressDots, Tag } from '@/components/ui/Badge';
import { GridLines } from '@/components/ui/GridLines';
import { Marquee } from '@/components/ui/Marquee';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CentredHeading } from './CentredHeading';
import { NoiseLayer } from './Approach';

export function Portfolio() {
  return (
    <section id="work" className="relative z-10 w-full bg-paper pt-[120px] pb-40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[834px]">
        <GridLines />
      </div>

      <div className="gutter relative">
        <div className="shell flex flex-col gap-[50px]">
          <SectionHeader label={portfolio.label} code={portfolio.code} />

          <CentredHeading
            badge={portfolio.badge}
            heading={portfolio.heading}
            body={portfolio.body}
            cta={portfolio.cta}
          />

          <div className="flex flex-col items-center gap-[10px]">
            <p className="text-[13px] leading-[15px] font-medium text-ink/60">{portfolio.partnersNote}</p>
            <div className="w-full max-w-[600px] py-[10px]">
              <Marquee duration={26} gap={40} className="h-20 items-center">
                {wordmarks.map((word) => (
                  <span
                    key={word}
                    className="grid size-20 place-items-center text-[15px] font-bold tracking-[-0.02em] text-ink/70"
                  >
                    {word}
                  </span>
                ))}
              </Marquee>
            </div>
          </div>

          <motion.div
            className="grid grid-cols-1 gap-5 pt-[60px] lg:grid-cols-2"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="show"
            viewport={viewportEarly}
          >
            {portfolio.projects.map((project) => (
              <motion.div key={project.title} variants={riseIn}>
                <ProjectCard project={project} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

type Project = (typeof portfolio.projects)[number];

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href="#work"
      className="group relative flex flex-col gap-5 overflow-hidden rounded-[20px] bg-cream px-[10px] pt-[10px] pb-5"
    >
      <NoiseLayer />

      <div className="relative aspect-[642/428] w-full overflow-hidden rounded-[10px]">
        <Image
          src={project.src}
          alt={project.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
        />
      </div>

      <div className="relative flex flex-col gap-3 px-4">
        <ProgressDots active={project.progress} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col">
            <p className="text-title text-ink">{project.title}</p>
            <p className="text-meta text-ink/60">{project.year}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
