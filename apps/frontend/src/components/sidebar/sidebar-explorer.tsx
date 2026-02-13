'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  RefreshCw,
  FolderUp,
  Upload,
  FolderPlus,
  MessageSquare,
  FolderTree,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFilesStore } from '@/features/files/store/files-store';
import { useFileList, useServerHealth, useGitStatus, buildGitStatusMap } from '@/features/files/hooks';
import {
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
} from '@/features/files/hooks/use-file-mutations';
import { useFileEventInvalidation } from '@/features/files/hooks/use-file-events';
import { downloadFile } from '@/features/files/api/opencode-files';
import { FileTreeItem } from '@/features/files/components/file-tree-item';
import { FileBreadcrumbs } from '@/features/files/components/file-breadcrumbs';
import { FileSearch } from '@/features/files/components/file-search';
import type { FileNode } from '@/features/files/types';
import { toast } from '@/lib/toast';
import { useTabStore } from '@/stores/tab-store';

// ============================================================================
// Panel type
// ============================================================================

export type SidebarPanel = 'sessions' | 'files';

// ============================================================================
// Sidebar panel switcher tabs
// ============================================================================

interface SidebarPanelTabsProps {
  active: SidebarPanel;
  onChange: (panel: SidebarPanel) => void;
}

export function SidebarPanelTabs({ active, onChange }: SidebarPanelTabsProps) {
  return (
    <div className="flex items-center gap-0.5 px-2 pt-3 pb-1">
      <button
        onClick={() => onChange('sessions')}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
          active === 'sessions'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Sessions
      </button>
      <button
        onClick={() => onChange('files')}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
          active === 'files'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        <FolderTree className="h-3.5 w-3.5" />
        Files
      </button>
    </div>
  );
}

// ============================================================================
// Compact file browser for sidebar
// ============================================================================

interface SidebarFileBrowserProps {
  /** When true, clicking a file opens it as a tab in the main content area instead of the sidebar viewer */
  openFileAsTab?: boolean;
}

export function SidebarFileBrowser({ openFileAsTab = false }: SidebarFileBrowserProps) {
  const currentPath = useFilesStore((s) => s.currentPath);
  const navigateToPath = useFilesStore((s) => s.navigateToPath);
  const openFileWithList = useFilesStore((s) => s.openFileWithList);
  const isSearchOpen = useFilesStore((s) => s.isSearchOpen);
  const toggleSearch = useFilesStore((s) => s.toggleSearch);

  const { data: health } = useServerHealth();
  const {
    data: files,
    isLoading,
    error,
    refetch,
  } = useFileList(currentPath, {
    enabled: health?.healthy === true,
  });

  // Git status
  const { data: gitStatuses } = useGitStatus({ enabled: health?.healthy === true });
  const gitStatusMap = useMemo(() => buildGitStatusMap(gitStatuses), [gitStatuses]);

  // Hook up SSE file events for real-time updates
  useFileEventInvalidation();

  // Mutations
  const uploadMutation = useFileUpload();
  const deleteMutation = useFileDelete();
  const mkdirMutation = useFileMkdir();
  const renameMutation = useFileRename();

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Separate dirs and files, sorted
  const { dirs, fileItems } = useMemo(() => {
    if (!files) return { dirs: [] as FileNode[], fileItems: [] as FileNode[] };
    const dirs = files
      .filter((f) => f.type === 'directory')
      .sort((a, b) => a.name.localeCompare(b.name));
    const fileItems = files
      .filter((f) => f.type === 'file')
      .sort((a, b) => a.name.localeCompare(b.name));
    return { dirs, fileItems };
  }, [files]);

  const handleFileClick = useCallback(
    (node: FileNode) => {
      if (node.type === 'directory') {
        navigateToPath(node.path);
      } else if (openFileAsTab) {
        // Open as a tab in the main content area
        const tabId = `file:${node.path}`;
        useTabStore.getState().openTab({
          id: tabId,
          title: node.name,
          type: 'file',
          href: `/files/${encodeURIComponent(node.path)}`,
        });
        // Use pushState to avoid full navigation
        window.history.pushState(null, '', `/files/${encodeURIComponent(node.path)}`);
      } else {
        const allFiles = fileItems.map((f) => f.path);
        const index = allFiles.indexOf(node.path);
        openFileWithList(node.path, allFiles, Math.max(0, index));
      }
    },
    [fileItems, navigateToPath, openFileWithList, openFileAsTab],
  );

  const handleNavigateUp = useCallback(() => {
    if (currentPath === '.' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    navigateToPath(parts.length > 0 ? parts.join('/') : '.');
  }, [currentPath, navigateToPath]);

  const handleDownload = useCallback(async (node: FileNode) => {
    try {
      await downloadFile(node.path, node.name);
      toast.success(`Downloaded ${node.name}`);
    } catch {
      toast.error(`Failed to download ${node.name}`);
    }
  }, []);

  const handleRename = useCallback(
    async (node: FileNode) => {
      const newName = window.prompt('New name:', node.name);
      if (!newName || newName === node.name) return;
      const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      try {
        await renameMutation.mutateAsync({ from: node.path, to: newPath });
        toast.success(`Renamed to ${newName}`);
      } catch (err) {
        toast.error(`Failed to rename: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [renameMutation],
  );

  const handleDelete = useCallback(
    async (node: FileNode) => {
      const confirmed = window.confirm(
        `Delete ${node.type === 'directory' ? 'folder' : 'file'} "${node.name}"?`,
      );
      if (!confirmed) return;
      try {
        await deleteMutation.mutateAsync({ filePath: node.path });
        toast.success(`Deleted ${node.name}`);
      } catch (err) {
        toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [deleteMutation],
  );

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) return;
      const file = event.target.files[0];
      try {
        await uploadMutation.mutateAsync({
          file,
          targetPath: currentPath === '.' ? undefined : currentPath,
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        event.target.value = '';
      }
    },
    [uploadMutation, currentPath],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    const folderPath =
      currentPath === '.' || currentPath === ''
        ? newFolderName.trim()
        : `${currentPath}/${newFolderName.trim()}`;
    try {
      await mkdirMutation.mutateAsync({ dirPath: folderPath });
      toast.success(`Created folder: ${newFolderName.trim()}`);
    } catch (err) {
      toast.error(`Failed to create folder: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingFolder(false);
      setNewFolderName('');
    }
  }, [mkdirMutation, currentPath, newFolderName]);

  // Server not reachable
  if (!health?.healthy) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
        <p className="text-xs text-muted-foreground">Server not reachable</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Compact header: breadcrumbs + actions */}
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border/40 shrink-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          <FileBreadcrumbs />
        </div>
        <div className="flex items-center gap-0 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleUpload} disabled={uploadMutation.isPending} title="Upload file">
            <Upload className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setIsCreatingFolder(true); setNewFolderName('New Folder'); }} disabled={mkdirMutation.isPending} title="New folder">
            <FolderPlus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleSearch} title="Search files">
            <Search className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Hidden file input for uploads */}
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInputChange} />

      {/* Search overlay */}
      {isSearchOpen && <FileSearch />}

      {/* File list */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {isLoading && (
          <div className="p-2 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-md" />
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <p className="text-xs text-muted-foreground">Failed to load files</p>
            <Button variant="outline" size="sm" className="h-7 text-xs mt-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && files && (
          <div className="p-1">
            {/* Go up */}
            {currentPath !== '.' && currentPath !== '' && (
              <button
                onClick={handleNavigateUp}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded-md transition-colors cursor-pointer hover:bg-muted/80 text-muted-foreground"
              >
                <FolderUp className="h-4 w-4 shrink-0" />
                <span>..</span>
              </button>
            )}

            {/* New folder inline input */}
            {isCreatingFolder && (
              <div className="flex items-center gap-2 px-3 py-1.5">
                <FolderPlus className="h-4 w-4 text-blue-400 shrink-0" />
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                  }}
                  onBlur={handleCreateFolder}
                  autoFocus
                  className="flex-1 text-sm bg-transparent border border-primary rounded px-1.5 py-0.5 outline-none"
                />
              </div>
            )}

            {/* Directories first */}
            {dirs.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                onClick={() => handleFileClick(node)}
                onRename={handleRename}
                onDelete={handleDelete}
                gitStatus={gitStatusMap.get(node.path)}
              />
            ))}

            {/* Then files */}
            {fileItems.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                onClick={() => handleFileClick(node)}
                onDownload={handleDownload}
                onRename={handleRename}
                onDelete={handleDelete}
                gitStatus={gitStatusMap.get(node.path)}
              />
            ))}

            {/* Empty directory */}
            {files.length === 0 && !isCreatingFolder && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs text-muted-foreground">Empty directory</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
