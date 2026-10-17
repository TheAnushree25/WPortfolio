import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectViewer } from '@/components/work/ProjectViewer';
import { SystemViewer } from '@/components/work/SystemViewer';
import { getProject, projectSlugs } from '@/content/projects';

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return projectSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) return {};
  const title = `${project.title} — Atlas Studios`;
  const image = project.discipline === 'system' ? { url: project.cover.src, width: 2880, height: 1800 } : { url: project.cover.src, width: 1254, height: 1254 };
  return {
    title,
    description: project.summary,
    openGraph: { title, description: project.summary, type: 'article', images: [image] },
  };
}

/** A project on its own page: a shared link, or a reload of one opened from the work pages. */
export default async function ProjectPage({ params }: Params) {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return (
    <main>
      {project.discipline === 'system' ? <SystemViewer project={project} mode="page" /> : <ProjectViewer project={project} mode="page" />}
    </main>
  );
}
