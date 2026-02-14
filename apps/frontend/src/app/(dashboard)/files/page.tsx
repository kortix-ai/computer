'use client';

import { useFilesStore } from '@/features/files/store/files-store';
import { FileBrowser } from '@/features/files/components/file-browser';
import { FileViewer } from '@/features/files/components/file-viewer';
import { FileHistoryPanel } from '@/features/files/components/file-history-panel';
import { useFileEventInvalidation } from '@/features/files/hooks/use-file-events';
import { useServerStore } from '@/stores/server-store';
import { useCurrentProject } from '@/features/files/hooks/use-server-health';
import { Badge } from '@/components/ui/badge';
import { Server } from 'lucide-react';

export default function FilesPage() {
  const { view, selectedFilePath, historyFilePath } = useFilesStore();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const { data: project } = useCurrentProject();

  // Wire SSE events to auto-invalidate file queries when agent edits files
  useFileEventInvalidation();

  const projectName =
    project?.name || project?.worktree?.split('/').pop() || 'Project';

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold">Files</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs font-normal">
            <Server className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{projectName}</span>
          </Badge>
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {serverUrl.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'history' && historyFilePath ? (
          <FileHistoryPanel />
        ) : view === 'viewer' && selectedFilePath ? (
          <FileViewer />
        ) : (
          <FileBrowser />
        )}
      </div>
    </div>
  );
}
