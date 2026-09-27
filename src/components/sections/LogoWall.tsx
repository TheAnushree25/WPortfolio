import { wordmarks } from '@/content/site';
import { Marquee } from '@/components/ui/Marquee';

/**
 * Full-bleed band of partner wordmarks. Each cell is a fixed 268px slot with a
 * hairline divider on its right edge, matching the reference rhythm.
 */
export function LogoWall() {
  return (
    <section className="relative z-10 w-full bg-paper py-[120px]">
      <span className="block h-px w-full bg-line opacity-65" />
      <Marquee duration={38} className="h-[180px] items-center">
        {wordmarks.map((word) => (
          <span
            key={word}
            className="relative flex h-[180px] w-[268px] items-center justify-center text-[28px] leading-none font-extrabold tracking-[-0.03em] text-ink-900 after:absolute after:top-0 after:right-0 after:h-full after:w-px after:bg-line after:opacity-65"
          >
            {word}
          </span>
        ))}
      </Marquee>
      <span className="block h-px w-full bg-line opacity-65" />
    </section>
  );
}
