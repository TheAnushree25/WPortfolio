'use client';

import * as motion from 'motion/react-client';
import { stats } from '@/content/site';
import { fadeUp, stagger, viewport } from '@/lib/motion';
import { Counter } from '@/components/ui/Counter';
import { Divider } from '@/components/ui/Divider';
import { MaskedHeading } from './Intro';

export function Stats() {
  return (
    <section className="relative z-10 w-full bg-paper pb-40">
      <div className="gutter">
        <div className="shell flex flex-col gap-[10px]">
          <Divider marker />

          <div className="flex flex-col gap-10 pt-[50px] lg:flex-row lg:justify-between lg:gap-20">
            <motion.div
              className="flex shrink-0 items-center gap-3"
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
              <p className="text-label text-ink-800">{stats.label}</p>
            </motion.div>

            <div className="max-w-[968px]">
              <MaskedHeading text={stats.heading} />
            </div>
          </div>

          <motion.div
            className="grid grid-cols-1 gap-x-[150px] gap-y-16 pt-[100px] md:grid-cols-3"
            variants={stagger(0.14)}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            {stats.items.map((item) => (
              <motion.div key={item.title} variants={fadeUp} className="flex flex-col gap-8">
                <p className="text-stat text-center text-ink-900">
                  <Counter to={item.value} suffix={item.suffix} />
                </p>
                <span className="h-px w-full bg-line opacity-65" />
                <div className="flex flex-col gap-[5px]">
                  <h3 className="text-h4 font-semibold text-ink-900">{item.title}</h3>
                  <p className="text-label text-ink-500">{item.body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
