'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FolderOpen, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { useOpenCodeProjects } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import type { Project } from '@/hooks/opencode/use-opencode-sessions';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
  const { state, isMobile, setOpenMobile } = useSidebar();
  const [isOpen, setIsOpen] = useState(true);
  const { data: projects, isLoading } = useOpenCodeProjects();
  const router = useRouter();
  const pathname = usePathname();

  const sortedProjects = useMemo(() => {
    if (!Array.isArray(projects)) return [];
    return [...projects].sort((a, b) => {
      // Global project always first
      const aIsGlobal = a.id === 'global' || a.worktree === '/';
      const bIsGlobal = b.id === 'global' || b.worktree === '/';
      if (aIsGlobal && !bIsGlobal) return -1;
      if (!aIsGlobal && bIsGlobal) return 1;
      return (b.time?.updated ?? 0) - (a.time?.updated ?? 0);
    });
  }, [projects]);

  // Derive active project from URL
  const activeProjectId = useMemo(() => {
    const match = pathname?.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : selectedProjectId;
  }, [pathname, selectedProjectId]);

  if (state === 'collapsed' && !isMobile) return null;
  if (!projects || projects.length === 0) return null;

  const handleProjectClick = (projectId: string, projectName: string) => {
    onProjectChange(projectId);
    openTabAndNavigate({
      id: `page:/projects/${projectId}`,
      title: projectName,
      type: 'project',
      href: `/projects/${projectId}`,
    }, router);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Section header — px-5 aligns label with item text (px-2 outer + px-3 item) */}
      <div className="px-5 pt-1">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full py-1.5 group cursor-pointer">
            <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              Projects
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground/40 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="px-2 space-y-0.5 pb-1">
          {sortedProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project.id, getProjectDisplayName(project))}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-1.5 rounded-xl text-sm cursor-pointer',
                'transition-colors duration-150',
                activeProjectId === project.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
              )}
            >
              <FolderOpen
                className={cn(
                  'h-4 w-4 flex-shrink-0',
                  activeProjectId === project.id ? 'text-sidebar-accent-foreground' : 'text-muted-foreground/50',
                )}
                style={project.icon?.color ? { color: project.icon.color } : undefined}
              />
              <span className="truncate">{getProjectDisplayName(project)}</span>
            </button>
          ))}

          {sortedProjects.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground/40 px-3 py-2">
              No projects detected
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
