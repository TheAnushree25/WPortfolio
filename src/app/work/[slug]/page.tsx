import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectViewer } from '@/components/work/ProjectViewer';
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
  return {
    title,
    description: project.summary,
    openGraph: { title, description: project.summary, type: 'article', images: [{ url: project.cover.src, width: 1254, height: 1254 }] },
  };
}

/** A project on its own page: a shared link, or a reload of one opened from the home page. */
export default async function ProjectPage({ params }: Params) {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return (
    <main>
      <ProjectViewer project={project} mode="page" />
    </main>
  );
}
