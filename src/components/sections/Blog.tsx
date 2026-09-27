'use client';

import Image from 'next/image';
import Link from 'next/link';
import * as motion from 'motion/react-client';
import { blog } from '@/content/site';
import { riseIn, stagger, viewportEarly } from '@/lib/motion';
import { Tag } from '@/components/ui/Badge';
import { GridLines } from '@/components/ui/GridLines';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CentredHeading } from './CentredHeading';

export function Blog() {
  return (
    <section id="blog" className="relative z-10 w-full bg-paper pt-[120px] pb-[140px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[834px]">
        <GridLines />
      </div>

      <div className="gutter relative">
        <div className="shell flex flex-col gap-20">
          <SectionHeader label={blog.label} code={blog.code} />

          <CentredHeading badge={blog.badge} heading={blog.heading} body={blog.body} cta={blog.cta} />

          <motion.div
            className="grid grid-cols-1 gap-5 md:grid-cols-3"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="show"
            viewport={viewportEarly}
          >
            {blog.posts.map((post) => (
              <motion.article key={post.title} variants={riseIn}>
                <Link href="#blog" className="group flex flex-col gap-5">
                  <span className="relative block aspect-[435/312] w-full overflow-hidden rounded-[10px] bg-cream">
                    <Image
                      src={post.src}
                      alt={post.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    />
                  </span>
                  <div className="flex items-start justify-between gap-4 px-4">
                    <div className="flex flex-col">
                      <p className="text-title text-ink">{post.title}</p>
                      <p className="text-meta text-ink/60">{post.date}</p>
                    </div>
                    <Tag tone="cream">{post.tag}</Tag>
                  </div>
                </Link>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
