import type { Metadata } from 'next';
import { worksPage } from '@/content/site';
import { worksData } from '@/content/projects';
import { PageLight } from '@/components/layout/PageLight';
import { WorksPage } from '@/components/works/WorksPage';
import { Finale } from '@/components/sections/Finale';
import { NextPage } from '@/components/sections/NextPage';

export const metadata: Metadata = {
  title: 'Selected work — Atlas Studios',
  description:
    'The systems Atlas Studios engineers — websites, platforms and AI, with their stacks, journeys and plans — and the brand identities it designs.',
  openGraph: { title: 'Selected work — Atlas Studios', type: 'website' },
};

/** The work page: both kinds of work, after Studio Mirage's, over the living light. */
export default function WorksRoute() {
  const { systems, designs, reels } = worksData();
  return (
    <>
      <PageLight />
      <main data-nav-tone="dark" className="relative">
        <WorksPage systems={systems} designs={designs} reels={reels} />
        <Finale />
        <NextPage content={worksPage.next} />
      </main>
    </>
  );
}
