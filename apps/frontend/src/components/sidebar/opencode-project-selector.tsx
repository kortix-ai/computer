'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { FolderGit2, ChevronDown, Check, Layers, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useOpenCodeProjects } from '@/hooks/opencode/use-opencode-sessions';
import type { OpenCodeProject } from '@/lib/api/opencode';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function getProjectDisplayName(project: OpenCodeProject): string {
  if (project.name) return project.name;
  if (project.worktree === '/' || project.id === 'global') return 'Global';
  // Extract folder name from worktree path
  const parts = project.worktree.split('/');
  return parts[parts.length - 1] || project.worktree;
}

interface OpenCodeProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectChange: (projectId: string | null) => void;
}

export function OpenCodeProjectSelector({
  selectedProjectId,
  onProjectChange,
}: OpenCodeProjectSelectorProps) {
  const { state, isMobile } = useSidebar();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: projects, isLoading } = useOpenCodeProjects();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId || !projects) return null;
    return projects.find((p) => p.id === selectedProjectId) || null;
  }, [selectedProjectId, projects]);

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) => b.time.updated - a.time.updated);
  }, [projects]);

  if (state === 'collapsed' && !isMobile) return null;

  if (isLoading) {
    return (
      <div className="w-full h-10 flex items-center justify-center">
        <KortixLoader size="small" />
      </div>
    );
  }

  if (!projects || projects.length === 0) return null;

  return (
    <div className="w-full relative" ref={dropdownRef}>
      {/* Trigger row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex-1 flex items-center gap-2 h-10 px-3 rounded-xl text-sm transition-colors',
            'bg-muted/50 border border-border hover:bg-muted/80',
            isOpen && 'bg-muted/80 ring-2 ring-primary/50'
          )}
        >
          <FolderGit2
            className="h-4 w-4 flex-shrink-0"
            style={selectedProject?.icon?.color ? { color: selectedProject.icon.color } : undefined}
          />
          <span className="flex-1 text-left truncate">
            {selectedProject ? getProjectDisplayName(selectedProject) : 'All Projects'}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-center">
            <p className="text-xs">Projects are automatically detected from your local directories when you run OpenCode.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {/* All Projects option */}
            <button
              onClick={() => {
                onProjectChange(null);
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors',
                selectedProjectId === null && 'bg-muted/40'
              )}
            >
              <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-left truncate">All Projects</span>
              {selectedProjectId === null && (
                <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              )}
            </button>

            {/* Divider */}
            <div className="h-px bg-border mx-2" />

            {/* Project list */}
            {sortedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  onProjectChange(project.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors',
                  selectedProjectId === project.id && 'bg-muted/40'
                )}
              >
                <FolderGit2
                  className="h-4 w-4 flex-shrink-0"
                  style={project.icon?.color ? { color: project.icon.color } : undefined}
                />
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate">{getProjectDisplayName(project)}</div>
                  <div className="text-xs text-muted-foreground truncate">{project.worktree}</div>
                </div>
                {selectedProjectId === project.id && (
                  <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
