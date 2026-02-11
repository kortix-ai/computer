'use client';

import { use, Suspense } from 'react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { ProjectPage } from '@/components/project/project-page';

export default function ProjectPageRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <KortixLoader size="small" />
        </div>
      }
    >
      <ProjectPage projectId={projectId} />
    </Suspense>
  );
}
