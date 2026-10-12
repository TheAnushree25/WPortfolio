import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenProject } from '@/components/work/OpenProject';
import { getProject, projectSlugs } from '@/content/projects';

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return projectSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = getProject((await params).slug);
  return project ? { title: `${project.title} — Atlas Studios` } : {};
}

/**
 * A project opened from the home page: the URL changes to /work/<slug>, but
 * the home page stays where it is and the stage opens the project over it.
 * Loading the URL afresh gets the project's own page (app/work/[slug]).
 */
export default async function ProjectOverHome({ params }: Params) {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return <OpenProject project={project} />;
}
