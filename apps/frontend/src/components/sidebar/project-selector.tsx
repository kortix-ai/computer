'use client';

import { useState, useMemo } from 'react';
import { FolderOpen, Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { useOpenCodeProjects } from '@/hooks/opencode/use-opencode-sessions';
import type { Project } from '@/hooks/opencode/use-opencode-sessions';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function getProjectDisplayName(project: Project): string {
  if (project.name) return project.name;
  if (project.worktree === '/' || project.id === 'global') return 'Global';
  const parts = project.worktree.split('/');
  return parts[parts.length - 1] || project.worktree;
}

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectChange: (projectId: string | null) => void;
}

export function ProjectSelector({
  selectedProjectId,
  onProjectChange,
}: ProjectSelectorProps) {
  const { state, isMobile } = useSidebar();
  const [isOpen, setIsOpen] = useState(true);
  const { data: projects, isLoading } = useOpenCodeProjects();

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) => b.time.updated - a.time.updated);
  }, [projects]);

  if (state === 'collapsed' && !isMobile) return null;
  if (!projects || projects.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="px-3">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full py-2 group">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Projects
            </span>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-center">
                  <p className="text-xs">Projects are auto-detected from your local directories</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-0.5 pb-2">
            {/* All Projects */}
            <button
              onClick={() => onProjectChange(null)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                selectedProjectId === null
                  ? 'bg-muted/80 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">All Projects</span>
            </button>

            {sortedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onProjectChange(project.id)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                  selectedProjectId === project.id
                    ? 'bg-muted/80 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <FolderOpen
                  className="h-4 w-4 flex-shrink-0"
                  style={project.icon?.color ? { color: project.icon.color } : undefined}
                />
                <span className="truncate">{getProjectDisplayName(project)}</span>
              </button>
            ))}

            {sortedProjects.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground/60 px-3 py-2">
                No tasks yet
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
