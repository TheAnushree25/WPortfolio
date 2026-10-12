'use client';

import { useEffect } from 'react';
import type { ProjectData } from '@/content/work';
import { showProject } from '@/lib/work';

/**
 * Rendered by the intercepted /work/[slug] route while the home page stays
 * underneath: it hands the project to the stage and takes it back when the
 * route is left, so the stage can play the way in and the way out. The tab
 * is named after the project meanwhile (the page underneath keeps its own
 * metadata).
 */
export function OpenProject({ project }: { project: ProjectData }) {
  useEffect(() => {
    const title = document.title;
    document.title = `${project.title} — Atlas Studios`;
    const hide = showProject(project);
    return () => {
      hide();
      document.title = title;
    };
  }, [project]);
  return null;
}
