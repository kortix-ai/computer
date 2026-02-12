'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FolderOpen, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { useOpenCodeProjects } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
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
    if (!projects) return [];
    return [...projects].sort((a, b) => b.time.updated - a.time.updated);
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
    useTabStore.getState().openTab({
      id: `page:/projects/${projectId}`,
      title: projectName,
      type: 'project',
      href: `/projects/${projectId}`,
    });
    router.push(`/projects/${projectId}`);
    if (isMobile) setOpenMobile(false);
  };

  const handleAllProjectsClick = () => {
    onProjectChange(null);
    useTabStore.getState().openTab({
      id: 'page:/dashboard',
      title: 'Dashboard',
      type: 'dashboard',
      href: '/dashboard',
    });
    router.push('/dashboard');
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
          {/* All Projects */}
          <button
            onClick={handleAllProjectsClick}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-1.5 rounded-lg text-sm cursor-pointer',
              'transition-all duration-150 ease-out',
              activeProjectId === null
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            <FolderOpen className={cn(
              'h-4 w-4 flex-shrink-0',
              activeProjectId === null ? 'text-sidebar-accent-foreground' : 'text-muted-foreground/60',
            )} />
            <span className="truncate">All Projects</span>
          </button>

          {sortedProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project.id, getProjectDisplayName(project))}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-1.5 rounded-lg text-sm cursor-pointer',
                'transition-all duration-150 ease-out',
                activeProjectId === project.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <FolderOpen
                className={cn(
                  'h-4 w-4 flex-shrink-0',
                  activeProjectId === project.id ? 'text-sidebar-accent-foreground' : 'text-muted-foreground/60',
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
