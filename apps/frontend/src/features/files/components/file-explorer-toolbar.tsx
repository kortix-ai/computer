'use client';

import {
  Search,
  PanelLeftClose,
  PanelLeft,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFilesStore } from '../store/files-store';
import { useCurrentProject } from '../hooks';
import { useInvalidateFileList } from '../hooks/use-file-list';
import { getFileIcon } from './file-icon';

/**
 * Minimal top toolbar for the file explorer page.
 * Shows: sidebar toggle | open file path | search + refresh + project badge
 */
export function FileExplorerToolbar() {
  const isSidebarCollapsed = useFilesStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useFilesStore((s) => s.toggleSidebar);
  const toggleSearch = useFilesStore((s) => s.toggleSearch);
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath);

  const { data: project } = useCurrentProject();
  const invalidateFileList = useInvalidateFileList();

  const projectName = project?.name || project?.worktree?.split('/').pop() || 'Project';
  const fileName = selectedFilePath?.split('/').pop() || '';

  return (
    <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/20 shrink-0 h-9">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={toggleSidebar}
        title={isSidebarCollapsed ? 'Show explorer' : 'Hide explorer'}
      >
        {isSidebarCollapsed ? (
          <PanelLeft className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Open file indicator */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 text-xs">
        {selectedFilePath ? (
          <>
            {getFileIcon(fileName, { className: 'h-3.5 w-3.5 shrink-0' })}
            <span className="truncate text-muted-foreground">
              {selectedFilePath}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/50 italic">No file open</span>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggleSearch}
          title="Search files (\u2318P)"
        >
          <Search className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => invalidateFileList()}
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Badge variant="outline" className="gap-1 text-[10px] font-normal h-5 px-1.5 ml-1">
          <Server className="h-2.5 w-2.5" />
          <span className="truncate max-w-[140px]">{projectName}</span>
        </Badge>
      </div>
    </div>
  );
}
