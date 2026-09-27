'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { faq } from '@/content/site';
import { ease, fadeUp, viewport } from '@/lib/motion';

export function Faq() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="relative z-10 w-full overflow-hidden bg-paper pb-[120px]">
      <div className="gutter">
        <div className="shell flex flex-col gap-10 lg:flex-row lg:gap-20">
          <motion.div
            className="flex shrink-0 items-center gap-3 lg:w-[400px]"
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
            <p className="text-label text-ink-800">{faq.label}</p>
          </motion.div>

          <div className="flex w-full flex-col lg:max-w-[888px]">
            {faq.items.map((item) => {
              const isOpen = open === item.index;
              return (
                <motion.div
                  key={item.index}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.4 }}
                  className="border-t border-line/65 last:border-b"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : item.index)}
                    className="group flex w-full items-center gap-6 py-[22px] text-left"
                  >
                    <span className="text-label w-[85px] shrink-0 text-ink-800">{item.index}</span>
                    <span className="text-label flex-1 text-ink-800 transition-opacity duration-300 group-hover:opacity-60">
                      {item.question}
                    </span>

                    {/* Plus rotates into a minus. */}
                    <span className="relative block size-[18px] shrink-0">
                      <motion.span
                        className="absolute top-0 left-1/2 h-[18px] w-[2px] -translate-x-1/2 rounded-full bg-ink-800"
                        animate={{ rotate: isOpen ? 90 : 0, opacity: isOpen ? 0 : 1 }}
                        transition={{ duration: 0.4, ease: ease.quint }}
                      />
                      <span className="absolute top-1/2 left-0 h-[2px] w-[18px] -translate-y-1/2 rounded-full bg-ink-800" />
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: ease.quint }}
                        className="overflow-hidden"
                      >
                        <p className="text-body max-w-[640px] pb-[22px] pl-[109px] text-ink-500">
                          {item.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
