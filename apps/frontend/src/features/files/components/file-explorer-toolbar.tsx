'use client';

import {
  Search,
  PanelLeftClose,
  PanelLeft,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFilesStore } from '../store/files-store';
import { useCurrentProject } from '../hooks';
import { useInvalidateFileList } from '../hooks/use-file-list';
import { getFileIcon } from './file-icon';

/**
 * Minimal top toolbar — sidebar toggle | file path | search + refresh
 */
export function FileExplorerToolbar() {
  const isSidebarCollapsed = useFilesStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useFilesStore((s) => s.toggleSidebar);
  const toggleSearch = useFilesStore((s) => s.toggleSearch);
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath);
  const showHidden = useFilesStore((s) => s.showHidden);
  const toggleHidden = useFilesStore((s) => s.toggleHidden);

  const { data: project } = useCurrentProject();
  const invalidateFileList = useInvalidateFileList();

  const projectName = project?.name || project?.worktree?.split('/').pop() || 'Project';
  const fileName = selectedFilePath?.split('/').pop() || '';

  return (
    <div className="flex items-center gap-1.5 px-1.5 border-b border-border/50 bg-background shrink-0 h-8">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground/60 hover:text-foreground"
        onClick={toggleSidebar}
        title={isSidebarCollapsed ? 'Show explorer' : 'Hide explorer'}
      >
        {isSidebarCollapsed ? (
          <PanelLeft className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Separator */}
      <div className="w-px h-3.5 bg-border/40 shrink-0" />

      {/* Open file path / project name */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 text-[11px]">
        {selectedFilePath ? (
          <>
            {getFileIcon(fileName, { className: 'h-3.5 w-3.5 shrink-0' })}
            <span className="truncate text-muted-foreground/80">
              {selectedFilePath}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/40 text-[10px] select-none">{projectName}</span>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-0 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 hover:text-foreground ${showHidden ? 'text-foreground' : 'text-muted-foreground/60'}`}
          onClick={toggleHidden}
          title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
        >
          {showHidden ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
          onClick={toggleSearch}
          title="Search files"
        >
          <Search className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
          onClick={() => invalidateFileList()}
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
