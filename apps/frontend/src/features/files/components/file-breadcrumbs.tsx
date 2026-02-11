'use client';

import { ChevronRight, FolderRoot } from 'lucide-react';
import { useFilesStore } from '../store/files-store';
import { useCurrentProject } from '../hooks';
import { cn } from '@/lib/utils';

export function FileBreadcrumbs() {
  const currentPath = useFilesStore((s) => s.currentPath);
  const navigateToPath = useFilesStore((s) => s.navigateToPath);
  const { data: project } = useCurrentProject();

  const projectName = project?.name || project?.worktree?.split('/').pop() || 'Project';

  // Split the path into segments
  const segments =
    currentPath === '.' || currentPath === ''
      ? []
      : currentPath.split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
      {/* Root */}
      <button
        onClick={() => navigateToPath('.')}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors cursor-pointer shrink-0',
          'hover:bg-muted',
          segments.length === 0
            ? 'text-foreground font-medium'
            : 'text-muted-foreground',
        )}
      >
        <FolderRoot className="h-3.5 w-3.5" />
        <span className="truncate max-w-[120px]">{projectName}</span>
      </button>

      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const pathToHere = segments.slice(0, index + 1).join('/');

        return (
          <div key={pathToHere} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <button
              onClick={() => navigateToPath(pathToHere)}
              className={cn(
                'px-1.5 py-1 rounded-md transition-colors cursor-pointer truncate max-w-[150px]',
                'hover:bg-muted',
                isLast
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {segment}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
