'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  FolderUp,
  Upload,
  FolderPlus,
  FilePlus,
  MessageSquare,
  FolderTree,
  Clipboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useFilesStore } from '@/features/files/store/files-store';
import { useFileList, useServerHealth, useGitStatus, buildGitStatusMap } from '@/features/files/hooks';
import {
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
  useFileCreate,
  useFileCopy,
} from '@/features/files/hooks/use-file-mutations';
import { useFileEventInvalidation } from '@/features/files/hooks/use-file-events';
import { downloadFile } from '@/features/files/api/opencode-files';
import { FileTreeItem, DRAG_MIME } from '@/features/files/components/file-tree-item';
import { FileBreadcrumbs } from '@/features/files/components/file-breadcrumbs';
import { FileSearch } from '@/features/files/components/file-search';
import type { FileNode } from '@/features/files/types';
import { toast } from '@/lib/toast';
import { useTabStore, openTabAndNavigate } from '@/stores/tab-store';
import { useDiagnosticsStore } from '@/stores/diagnostics-store';

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
// Parent drop target for sidebar
// ============================================================================

function SidebarParentDropTarget({
  currentPath,
  onClick,
  onDropMove,
}: {
  currentPath: string;
  onClick: () => void;
  onDropMove: (sourcePath: string, targetDirPath: string) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);

  const parentPath = useMemo(() => {
    const lastSlash = currentPath.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : currentPath.slice(0, lastSlash);
  }, [currentPath]);

  return (
    <button
      onClick={onClick}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        counterRef.current++;
        setIsDragOver(true);
      }}
      onDragLeave={() => {
        counterRef.current--;
        if (counterRef.current <= 0) {
          counterRef.current = 0;
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        counterRef.current = 0;
        setIsDragOver(false);
        const sourcePath = e.dataTransfer.getData(DRAG_MIME);
        if (!sourcePath) return;
        onDropMove(sourcePath, parentPath === '.' ? '' : parentPath);
      }}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded-md transition-colors cursor-pointer',
        'hover:bg-muted/80 text-muted-foreground',
        isDragOver && 'bg-primary/15 ring-1 ring-primary/40',
      )}
    >
      <FolderUp className="h-4 w-4 shrink-0" />
      <span>..</span>
    </button>
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

  // Clipboard
  const clipboard = useFilesStore((s) => s.clipboard);
  const copyToClipboard = useFilesStore((s) => s.copyToClipboard);
  const cutToClipboard = useFilesStore((s) => s.cutToClipboard);
  const clearClipboard = useFilesStore((s) => s.clearClipboard);

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
  const createMutation = useFileCreate();
  const copyMutation = useFileCopy();

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileCreateInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Auto-focus and select all text when folder input appears
  useEffect(() => {
    if (isCreatingFolder) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = folderInputRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(0, el.value.length);
          }
        });
      });
    }
  }, [isCreatingFolder]);

  // Auto-focus for file create input
  useEffect(() => {
    if (isCreatingFile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = fileCreateInputRef.current;
          if (el) {
            el.focus();
            const dotIdx = el.value.lastIndexOf('.');
            el.setSelectionRange(0, dotIdx > 0 ? dotIdx : el.value.length);
          }
        });
      });
    }
  }, [isCreatingFile]);

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

  const isRootPath = currentPath === '/' || currentPath === '.' || currentPath === '';
  const normalizedCurrentPath = isRootPath ? '' : currentPath.replace(/\/$/, '');

  // Check if file name already exists
  const fileNameExists = useMemo(() => {
    if (!isCreatingFile || !newFileName.trim() || !files) return false;
    const name = newFileName.trim().toLowerCase();
    return files.some((f) => f.name.toLowerCase() === name);
  }, [isCreatingFile, newFileName, files]);

  // All sibling names
  const siblingNames = useMemo(() => {
    if (!files) return [];
    return files.map((f) => f.name);
  }, [files]);

  // Build per-entry diagnostic counts from the diagnostics store.
  const diagByFile = useDiagnosticsStore((s) => s.byFile);
  const diagnosticCountsMap = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    if (!files || Object.keys(diagByFile).length === 0) return map;

    for (const node of files) {
      let errors = 0;
      let warnings = 0;

      if (node.type === 'file') {
        const diags = diagByFile[node.path];
        if (diags) {
          for (const d of diags) {
            if (d.severity === 1) errors++;
            else if (d.severity === 2) warnings++;
          }
        }
      } else {
        const prefix = node.path.endsWith('/') ? node.path : node.path + '/';
        for (const [filePath, diags] of Object.entries(diagByFile)) {
          if (filePath.startsWith(prefix) || filePath === node.path) {
            for (const d of diags) {
              if (d.severity === 1) errors++;
              else if (d.severity === 2) warnings++;
            }
          }
        }
      }

      if (errors > 0 || warnings > 0) {
        map.set(node.path, { errors, warnings });
      }
    }
    return map;
  }, [files, diagByFile]);

  const handleFileClick = useCallback(
    (node: FileNode) => {
      if (node.type === 'directory') {
        navigateToPath(node.path);
      } else if (openFileAsTab) {
        // Open as a tab in the main content area
        const tabId = `file:${node.path}`;
        openTabAndNavigate({
          id: tabId,
          title: node.name,
          type: 'file',
          href: `/files/${encodeURIComponent(node.path)}`,
        });
      } else {
        const allFiles = fileItems.map((f) => f.path);
        const index = allFiles.indexOf(node.path);
        openFileWithList(node.path, allFiles, Math.max(0, index));
      }
    },
    [fileItems, navigateToPath, openFileWithList, openFileAsTab],
  );

  const handleNavigateUp = useCallback(() => {
    if (isRootPath) return;
    // Strip the last path segment. If the path has no slash (e.g. ".agent-browser"
    // from root listing), go to root '/'. Otherwise remove the trailing /segment.
    const lastSlash = currentPath.lastIndexOf('/');
    const parent = lastSlash <= 0 ? '/' : currentPath.slice(0, lastSlash);
    navigateToPath(parent);
  }, [isRootPath, currentPath, navigateToPath]);

  const handleDownload = useCallback(async (node: FileNode) => {
    try {
      await downloadFile(node.path, node.name);
      toast.success(`Downloaded ${node.name}`);
    } catch {
      toast.error(`Failed to download ${node.name}`);
    }
  }, []);

  const handleRename = useCallback(
    async (node: FileNode, newName: string) => {
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
          targetPath: isRootPath ? undefined : currentPath,
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        event.target.value = '';
      }
    },
    [uploadMutation, isRootPath, currentPath],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    const folderPath = normalizedCurrentPath
      ? `${normalizedCurrentPath}/${newFolderName.trim()}`
      : newFolderName.trim();
    try {
      await mkdirMutation.mutateAsync({ dirPath: folderPath });
      toast.success(`Created folder: ${newFolderName.trim()}`);
    } catch (err) {
      toast.error(`Failed to create folder: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingFolder(false);
      setNewFolderName('');
    }
  }, [mkdirMutation, normalizedCurrentPath, newFolderName]);

  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) {
      setIsCreatingFile(false);
      return;
    }
    const filePath = normalizedCurrentPath
      ? `${normalizedCurrentPath}/${newFileName.trim()}`
      : newFileName.trim();
    try {
      await createMutation.mutateAsync({ filePath });
      toast.success(`Created file: ${newFileName.trim()}`);
    } catch (err) {
      toast.error(`Failed to create file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingFile(false);
      setNewFileName('');
    }
  }, [createMutation, normalizedCurrentPath, newFileName]);

  // Copy/Cut handlers
  const handleCopy = useCallback(
    (node: FileNode) => {
      copyToClipboard(node.path, node.name, node.type);
      toast.success(`Copied "${node.name}" to clipboard`);
    },
    [copyToClipboard],
  );

  const handleCut = useCallback(
    (node: FileNode) => {
      cutToClipboard(node.path, node.name, node.type);
      toast.success(`Cut "${node.name}" to clipboard`);
    },
    [cutToClipboard],
  );

  // Drag-and-drop move handler
  const handleDropMove = useCallback(
    async (sourcePath: string, targetDirPath: string) => {
      const sourceName = sourcePath.split('/').pop() || '';
      const destPath = targetDirPath ? `${targetDirPath}/${sourceName}` : sourceName;

      if (sourcePath === destPath) return;

      try {
        await renameMutation.mutateAsync({ from: sourcePath, to: destPath });
        toast.success(`Moved "${sourceName}" to ${targetDirPath.split('/').pop() || 'root'}`);
      } catch (err) {
        toast.error(`Failed to move: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [renameMutation],
  );

  // Paste handler
  const handlePaste = useCallback(async () => {
    if (!clipboard) return;

    const destDir = normalizedCurrentPath;
    let destName = clipboard.name;

    if (files) {
      const existingNames = new Set(files.map((f) => f.name.toLowerCase()));
      if (existingNames.has(destName.toLowerCase())) {
        if (clipboard.operation === 'copy') {
          const ext = destName.includes('.') ? destName.substring(destName.lastIndexOf('.')) : '';
          const baseName = ext ? destName.substring(0, destName.lastIndexOf('.')) : destName;
          let counter = 0;
          let candidate = `${baseName} (copy)${ext}`;
          while (existingNames.has(candidate.toLowerCase())) {
            counter++;
            candidate = `${baseName} (copy ${counter + 1})${ext}`;
          }
          destName = candidate;
        } else {
          const sourceDir = clipboard.path.substring(0, clipboard.path.lastIndexOf('/')) || '.';
          const normalizedSourceDir = sourceDir === '' ? '.' : sourceDir;
          const normalizedDestDir = destDir === '' ? '.' : destDir;
          if (normalizedSourceDir === normalizedDestDir) {
            toast.error('Item is already in this directory');
            return;
          }
        }
      }
    }

    const destPath = destDir ? `${destDir}/${destName}` : destName;

    try {
      if (clipboard.operation === 'copy') {
        if (clipboard.type === 'file') {
          await copyMutation.mutateAsync({ sourcePath: clipboard.path, destPath });
          toast.success(`Copied "${clipboard.name}" here`);
        } else {
          await mkdirMutation.mutateAsync({ dirPath: destPath });
          toast.success(`Created copy of folder "${clipboard.name}" here (empty)`);
        }
      } else {
        await renameMutation.mutateAsync({ from: clipboard.path, to: destPath });
        toast.success(`Moved "${clipboard.name}" here`);
        clearClipboard();
      }
    } catch (err) {
      toast.error(`Failed to paste: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [clipboard, normalizedCurrentPath, files, copyMutation, renameMutation, mkdirMutation, clearClipboard]);

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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => { setIsCreatingFile(true); setNewFileName('untitled.txt'); }}
            disabled={createMutation.isPending}
            title="New file"
          >
            <FilePlus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setIsCreatingFolder(true); setNewFolderName('New Folder'); }} disabled={mkdirMutation.isPending} title="New folder">
            <FolderPlus className="h-3 w-3" />
          </Button>
          {clipboard && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary"
              onClick={handlePaste}
              disabled={copyMutation.isPending || renameMutation.isPending}
              title={`Paste "${clipboard.name}" (${clipboard.operation})`}
            >
              <Clipboard className="h-3 w-3" />
            </Button>
          )}
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
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="p-1 min-h-full">
                {/* Go up — also a drop target for moving items to parent */}
                {!isRootPath && (
                  <SidebarParentDropTarget
                    currentPath={currentPath}
                    onClick={handleNavigateUp}
                    onDropMove={handleDropMove}
                  />
                )}

                {/* New folder inline input */}
                {isCreatingFolder && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <FolderPlus className="h-4 w-4 text-blue-400 shrink-0" />
                    <input
                      type="text"
                      ref={folderInputRef}
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                      }}
                      onBlur={handleCreateFolder}
                      className="flex-1 text-sm bg-transparent border border-primary rounded px-1.5 py-0.5 outline-none selection:bg-primary/15 selection:text-foreground"
                    />
                  </div>
                )}

                {/* New file inline input */}
                {isCreatingFile && (
                  <div className="flex flex-col gap-0.5 px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <FilePlus className="h-4 w-4 text-green-400 shrink-0" />
                      <input
                        type="text"
                        ref={fileCreateInputRef}
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !fileNameExists) handleCreateFile();
                          if (e.key === 'Escape') { setIsCreatingFile(false); setNewFileName(''); }
                        }}
                        onBlur={() => {
                          if (!fileNameExists) handleCreateFile();
                          else { setIsCreatingFile(false); setNewFileName(''); }
                        }}
                        className={cn(
                          'flex-1 text-sm bg-transparent border rounded px-1.5 py-0.5 outline-none selection:bg-primary/15 selection:text-foreground',
                          fileNameExists ? 'border-red-500/60' : 'border-primary',
                        )}
                      />
                    </div>
                    {fileNameExists && (
                      <p className="text-[11px] text-red-400 pl-6">
                        A file or folder with that name already exists
                      </p>
                    )}
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
                    onCopy={handleCopy}
                    onCut={handleCut}
                    onDropMove={handleDropMove}
                    siblingNames={siblingNames}
                    gitStatus={gitStatusMap.get(node.path)}
                    isCut={clipboard?.operation === 'cut' && clipboard.path === node.path}
                    diagnosticCounts={diagnosticCountsMap.get(node.path)}
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
                    onCopy={handleCopy}
                    onCut={handleCut}
                    onDropMove={handleDropMove}
                    siblingNames={siblingNames}
                    gitStatus={gitStatusMap.get(node.path)}
                    isCut={clipboard?.operation === 'cut' && clipboard.path === node.path}
                    diagnosticCounts={diagnosticCountsMap.get(node.path)}
                  />
                ))}

                {/* Empty directory */}
                {files.length === 0 && !isCreatingFolder && !isCreatingFile && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-xs text-muted-foreground">Empty directory</p>
                  </div>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem
                onClick={() => {
                  setTimeout(() => {
                    setNewFileName('untitled.txt');
                    setIsCreatingFile(true);
                  }, 100);
                }}
                disabled={createMutation.isPending}
              >
                <FilePlus className="mr-2 h-4 w-4" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setTimeout(() => {
                    setNewFolderName('New Folder');
                    setIsCreatingFolder(true);
                  }, 100);
                }}
                disabled={mkdirMutation.isPending}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </ContextMenuItem>
              {clipboard && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={handlePaste}
                    disabled={copyMutation.isPending || renameMutation.isPending}
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    Paste{' '}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {clipboard.operation === 'cut' ? 'Move' : 'Copy'}
                    </span>
                  </ContextMenuItem>
                </>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>

      {/* Clipboard indicator */}
      {clipboard && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-t border-border/40 bg-muted/30 text-[11px] text-muted-foreground shrink-0">
          <span className="truncate">
            {clipboard.operation === 'cut' ? 'Moving' : 'Copying'}:{' '}
            <span className="font-medium text-foreground">{clipboard.name}</span>
          </span>
          <button
            onClick={clearClipboard}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
