import { HeroScene } from '@/components/sections/Hero';
import { Works } from '@/components/sections/Works';
import { Practice } from '@/components/sections/Practice';
import { Story } from '@/components/sections/Story';
import { Partners } from '@/components/sections/Partners';
import { Process } from '@/components/sections/Process';
import { Testimonials } from '@/components/sections/Testimonials';
import { Finale } from '@/components/sections/Finale';
import { NextPage } from '@/components/sections/NextPage';

export default function HomePage() {
  return (
    <main data-nav-tone="dark" className="relative">
      <HeroScene />
      <Works />
      <Practice />
      <Story />
      <Partners />
      <Process />
      <Testimonials />
      <Finale />
      <NextPage />
    </main>
  );
}
