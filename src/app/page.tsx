import { breaks, images } from '@/content/site';
import { CoverScene } from '@/components/layout/CoverScene';
import { Hero } from '@/components/sections/Hero';
import { Intro } from '@/components/sections/Intro';
import { LogoWall } from '@/components/sections/LogoWall';
import { Approach } from '@/components/sections/Approach';
import { StickyBreak } from '@/components/sections/StickyBreak';
import { Portfolio } from '@/components/sections/Portfolio';
import { Stats } from '@/components/sections/Stats';
import { Services } from '@/components/sections/Services';
import { Benefits } from '@/components/sections/Benefits';
import { Testimonials } from '@/components/sections/Testimonials';
import { Shots } from '@/components/sections/Shots';
import { Expertise } from '@/components/sections/Expertise';
import { Pricing } from '@/components/sections/Pricing';
import { Faq } from '@/components/sections/Faq';
import { Blog } from '@/components/sections/Blog';
import { Contact } from '@/components/sections/Contact';
import { Footer } from '@/components/layout/Footer';

/**
 * Each dark frame is pinned inside a scene. The light sections that follow
 * slide over it, and the next dark frame takes over when its scene begins.
 */
export default function HomePage() {
  return (
    <main className="relative">
      <CoverScene visual={<Hero />}>
        <Intro />
        <LogoWall />
        <Approach />
      </CoverScene>

      <CoverScene visual={<StickyBreak src={images.breakWork} alt={breaks.work} />}>
        <Portfolio />
        <Stats />
        <Services />
      </CoverScene>

      <CoverScene visual={<StickyBreak src={images.breakMarks} alt={breaks.marks} />}>
        <Benefits />
        <Testimonials />
        <Shots />
        <Expertise />
        <Pricing />
        <Faq />
      </CoverScene>

      <CoverScene visual={<StickyBreak src={images.breakClose} alt={breaks.close} />}>
        <Blog />
        <Contact />
        <Footer />
      </CoverScene>
    </main>
  );
}
