'use client';

import { useMemo, useCallback, useState, useRef } from 'react';
import {
  Search,
  RefreshCw,
  FolderUp,
  ServerOff,
  Upload,
  FolderPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFilesStore } from '../store/files-store';
import { useFileList, useServerHealth } from '../hooks';
import { useFileUpload, useFileDelete, useFileMkdir, useFileRename } from '../hooks/use-file-mutations';
import { downloadFile } from '../api/opencode-files';
import { useServerStore } from '@/stores/server-store';
import type { FileNode } from '../types';
import { FileBreadcrumbs } from './file-breadcrumbs';
import { FileTreeItem } from './file-tree-item';
import { FileSearch } from './file-search';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

export function FileBrowser() {
  const currentPath = useFilesStore((s) => s.currentPath);
  const navigateToPath = useFilesStore((s) => s.navigateToPath);
  const openFile = useFilesStore((s) => s.openFile);
  const openFileWithList = useFilesStore((s) => s.openFileWithList);
  const isSearchOpen = useFilesStore((s) => s.isSearchOpen);
  const toggleSearch = useFilesStore((s) => s.toggleSearch);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());

  const { data: health, isLoading: isHealthLoading } = useServerHealth();
  const {
    data: files,
    isLoading,
    error,
    refetch,
  } = useFileList(currentPath, {
    enabled: health?.healthy === true,
  });

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

  // Build file list for prev/next navigation in viewer
  const handleFileClick = useCallback(
    (node: FileNode) => {
      if (node.type === 'directory') {
        navigateToPath(node.path);
      } else {
        const allFiles = fileItems.map((f) => f.path);
        const index = allFiles.indexOf(node.path);
        openFileWithList(node.path, allFiles, Math.max(0, index));
      }
    },
    [fileItems, navigateToPath, openFileWithList],
  );

  // Navigate up one level
  const handleNavigateUp = useCallback(() => {
    if (currentPath === '.' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    navigateToPath(parts.length > 0 ? parts.join('/') : '.');
  }, [currentPath, navigateToPath]);

  // Download a file
  const handleDownload = useCallback(async (node: FileNode) => {
    try {
      await downloadFile(node.path, node.name);
      toast.success(`Downloaded ${node.name}`);
    } catch (err) {
      toast.error(`Failed to download ${node.name}`);
    }
  }, []);

  // Rename a file/folder
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

  // Delete a file/folder
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

  // Upload file
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

  // Create folder
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
  if (!isHealthLoading && !health?.healthy) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <ServerOff className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-medium">Server not reachable</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Could not connect to the OpenCode server at{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {serverUrl}
            </code>
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Make sure <code className="text-xs bg-muted px-1.5 py-0.5 rounded">opencode serve</code> or{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">opencode web</code> is running.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <FileBreadcrumbs />
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            title="Upload file"
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setIsCreatingFolder(true);
              setNewFolderName('New Folder');
            }}
            disabled={mkdirMutation.isPending}
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleSearch}
            title="Search files (Ctrl+P)"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Hidden file input for uploads */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Search overlay */}
      {isSearchOpen && <FileSearch />}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {isLoading && (
          <div className="p-3 space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Failed to load files
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* File entries */}
        {!isLoading && !error && files && (
          <div className="p-1.5">
            {/* Go up */}
            {currentPath !== '.' && currentPath !== '' && (
              <button
                onClick={handleNavigateUp}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded-md transition-colors cursor-pointer',
                  'hover:bg-muted/80 text-muted-foreground',
                )}
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
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false);
                      setNewFolderName('');
                    }
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
              />
            ))}

            {/* Empty directory */}
            {files.length === 0 && !isCreatingFolder && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Empty directory
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
