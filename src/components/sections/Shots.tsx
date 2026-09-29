'use client';

import Image from 'next/image';
import { shots } from '@/content/site';
import { Marquee } from '@/components/ui/Marquee';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CentredHeading } from './CentredHeading';

/**
 * Photography strip. Two counter-running marquees replace the interactive
 * gallery component the reference embeds here.
 */
export function Shots() {
  const [top, bottom] = [shots.gallery, [...shots.gallery].reverse()];

  return (
    <section className="relative z-10 w-full overflow-hidden bg-paper pb-60">
      <div className="gutter">
        <div className="shell flex flex-col gap-12">
          <SectionHeader label={shots.label} code={shots.code} />
          <CentredHeading badge={shots.badge} heading={shots.heading} body={shots.body} cta={shots.cta} />
        </div>
      </div>

      <div className="mt-16 flex flex-col gap-5">
        <Marquee duration={44} gap={20} className="items-center">
          {top.map((item, i) => (
            <Frame key={`${item.alt}-${i}`} src={item.src} alt={item.alt} />
          ))}
        </Marquee>
        <Marquee duration={52} gap={20} direction="right" className="items-center">
          {bottom.map((item, i) => (
            <Frame key={`${item.alt}-r-${i}`} src={item.src} alt={item.alt} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}

function Frame({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="group relative block h-[260px] w-[380px] overflow-hidden rounded-[10px] bg-cream shadow-[inset_0_0_4px_0_rgb(0_0_0_/_0.05)]">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="380px"
        className="object-contain p-12 mix-blend-multiply transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.07]"
      />
    </span>
  );
}
