'use client';

import { useState, type FormEvent } from 'react';
import * as motion from 'motion/react-client';
import { contact } from '@/content/site';
import { ease, fadeUp, stagger, viewport } from '@/lib/motion';
import { PillButton } from '@/components/ui/PillButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CheckDot } from './Services';

export function Contact() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState('sending');
    // Wire this to your form endpoint (Resend, Formspree, a route handler…).
    window.setTimeout(() => setState('sent'), 900);
  };

  return (
    <section id="contact" className="relative z-10 w-full overflow-hidden bg-paper pb-[140px]">
      <div className="gutter">
        <div className="shell flex flex-col gap-[60px]">
          <SectionHeader label={contact.label} code={contact.code} />

          <div className="flex flex-col gap-12 lg:flex-row lg:justify-between lg:gap-20">
            <motion.div
              className="flex max-w-[490px] flex-col gap-[30px]"
              variants={stagger(0.1)}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              <motion.span variants={fadeUp}>
                <span className="text-badge inline-flex items-center gap-[10px] rounded-[10px] bg-brand-wash py-[9px] pr-[14px] pl-[10px] text-brand backdrop-blur-[5px]">
                  <span className="size-[13px] shrink-0 rounded-[3px] bg-brand" />
                  {contact.badge}
                </span>
              </motion.span>

              <motion.h2 variants={fadeUp} className="text-h2 text-ink-900">
                {contact.heading}
              </motion.h2>

              <motion.p variants={fadeUp} className="text-body max-w-[420px] text-ink-500">
                {contact.body}
              </motion.p>

              <motion.span variants={fadeUp} className="h-px w-full bg-line opacity-65" />

              <motion.ul variants={stagger(0.08)} className="flex flex-col gap-5">
                {contact.bullets.map((bullet) => (
                  <motion.li key={bullet} variants={fadeUp} className="flex items-center gap-[10px]">
                    <CheckDot tone="wash" />
                    <span className="text-meta text-ink-800">{bullet}</span>
                  </motion.li>
                ))}
              </motion.ul>

              <motion.div variants={fadeUp}>
                <PillButton label={contact.cta.label} href={contact.cta.href} />
              </motion.div>
            </motion.div>

            <motion.form
              onSubmit={onSubmit}
              className="flex w-full max-w-[685px] flex-col gap-4"
              variants={stagger(0.08)}
              initial="hidden"
              whileInView="show"
              viewport={viewport}
            >
              <motion.div variants={fadeUp}>
                <Field name="name" placeholder="Name*" />
              </motion.div>
              <motion.div variants={fadeUp}>
                <Field name="email" type="email" placeholder="Email*" />
              </motion.div>
              <motion.div variants={fadeUp}>
                <textarea
                  name="message"
                  required
                  placeholder="Message*"
                  rows={4}
                  className="text-label w-full resize-none rounded-lg bg-cream p-6 text-ink shadow-[inset_0_0_2px_0_rgb(0_0_0_/_0.05)] outline-none transition-shadow duration-300 focus:shadow-[inset_0_0_0_1.5px_var(--color-brand)]"
                />
              </motion.div>

              <motion.button
                variants={fadeUp}
                type="submit"
                disabled={state !== 'idle'}
                className="text-label relative h-[72px] overflow-hidden rounded-[10px] bg-ink-900 text-paper-soft transition-colors duration-500 hover:bg-brand disabled:opacity-80"
              >
                <motion.span
                  key={state}
                  className="block"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.4, ease: ease.quint }}
                >
                  {state === 'sent' ? 'Thanks — I’ll be in touch' : state === 'sending' ? 'Sending…' : contact.submit}
                </motion.span>
              </motion.button>
            </motion.form>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ name, placeholder, type = 'text' }: { name: string; placeholder: string; type?: string }) {
  return (
    <input
      name={name}
      type={type}
      required
      placeholder={placeholder}
      className="text-label h-[67px] w-full rounded-lg bg-cream px-6 text-ink shadow-[inset_0_0_2px_0_rgb(0_0_0_/_0.05)] outline-none transition-shadow duration-300 focus:shadow-[inset_0_0_0_1.5px_var(--color-brand)]"
    />
  );
}
