'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { useOpenCodeProjects } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { KortixLoader } from '@/components/ui/kortix-loader';

function getProjectDisplayName(project: any): string {
  if (project.name) return project.name;
  if (project.worktree === '/' || project.id === 'global') return 'Global';
  const parts = project.worktree.split('/');
  return parts[parts.length - 1] || project.worktree;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: projects, isLoading } = useOpenCodeProjects();

  const sortedProjects = useMemo(() => {
    if (!Array.isArray(projects)) return [];
    return [...projects].sort((a, b) => {
      const aIsGlobal = a.id === 'global' || a.worktree === '/';
      const bIsGlobal = b.id === 'global' || b.worktree === '/';
      if (aIsGlobal && !bIsGlobal) return -1;
      if (!aIsGlobal && bIsGlobal) return 1;
      return (b.time?.updated ?? 0) - (a.time?.updated ?? 0);
    });
  }, [projects]);

  const handleProjectClick = (project: any) => {
    const name = getProjectDisplayName(project);
    openTabAndNavigate({
      id: `page:/projects/${project.id}`,
      title: name,
      type: 'project',
      href: `/projects/${project.id}`,
    }, router);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <KortixLoader size="small" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight mb-8">Projects</h1>

        {sortedProjects.length === 0 ? (
          <div className="rounded-xl border border-border/50 p-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">No projects yet</p>
            <p className="text-sm text-muted-foreground/60">
              Projects are detected automatically from your workspace.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedProjects.map((project) => {
              const name = getProjectDisplayName(project);
              return (
                <button
                  key={project.id}
                  onClick={() => handleProjectClick(project)}
                  className="flex items-center gap-4 w-full px-5 py-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 transition-colors duration-150 cursor-pointer text-left"
                >
                  <FolderOpen
                    className="h-5 w-5 flex-shrink-0 text-muted-foreground/50"
                    style={project.icon?.color ? { color: project.icon.color } : undefined}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    {project.worktree && project.worktree !== '/' && (
                      <p className="text-xs text-muted-foreground/50 truncate mt-0.5 font-mono">
                        {project.worktree}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
