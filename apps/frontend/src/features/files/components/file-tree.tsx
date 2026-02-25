'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Upload,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Download,
  History,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  ClipboardCopy,
  Clipboard,
  CircleAlert,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilesStore } from '../store/files-store';
import { useFileList, useGitStatus, buildGitStatusMap, useServerHealth } from '../hooks';
import {
  useFileUpload,
  useFileDelete,
  useFileMkdir,
  useFileRename,
  useFileCreate,
  useFileCopy,
} from '../hooks/use-file-mutations';
import { downloadFile } from '../api/opencode-files';
import type { FileNode } from '../types';
import { getFileIcon } from './file-icon';
import { DRAG_MIME } from './file-tree-item';
import type { GitStatusType } from './file-tree-item';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiagnosticsStore } from '@/stores/diagnostics-store';
import { toast } from '@/lib/toast';

// ─── Recursive tree node ────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  gitStatusMap: Map<string, GitStatusType>;
  diagnosticCountsMap: Map<string, { errors: number; warnings: number }>;
  onRename: (node: FileNode, newName: string) => void;
  onDelete: (node: FileNode) => void;
  onCopy: (node: FileNode) => void;
  onCut: (node: FileNode) => void;
  onDropMove: (sourcePath: string, targetDirPath: string) => void;
}

const gitStatusTextColor: Record<GitStatusType, string> = {
  added: 'text-green-500 dark:text-green-400',
  modified: 'text-yellow-500 dark:text-yellow-400',
  deleted: 'text-red-500 dark:text-red-400',
};

const gitStatusBadgeColor: Record<GitStatusType, string> = {
  added: 'text-green-500 dark:text-green-400',
  modified: 'text-yellow-500 dark:text-yellow-400',
  deleted: 'text-red-500 dark:text-red-400',
};

const gitStatusLabel: Record<GitStatusType, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

function TreeNode({
  node,
  depth,
  gitStatusMap,
  diagnosticCountsMap,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onDropMove,
}: TreeNodeProps) {
  const expandedDirs = useFilesStore((s) => s.expandedDirs);
  const toggleDir = useFilesStore((s) => s.toggleDir);
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath);
  const openFile = useFilesStore((s) => s.openFile);
  const clipboard = useFilesStore((s) => s.clipboard);

  const isDir = node.type === 'directory';
  const isExpanded = isDir && expandedDirs.has(node.path);
  const isSelected = selectedFilePath === node.path;
  const isCut = clipboard?.operation === 'cut' && clipboard.path === node.path;
  const gitStatus = gitStatusMap.get(node.path);
  const diagCounts = diagnosticCountsMap.get(node.path);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Auto-focus rename input
  useEffect(() => {
    if (isRenaming) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = renameInputRef.current;
          if (el) {
            el.focus();
            const dotIdx = el.value.lastIndexOf('.');
            el.setSelectionRange(0, isDir ? el.value.length : (dotIdx > 0 ? dotIdx : el.value.length));
          }
        });
      });
    }
  }, [isRenaming, isDir]);

  const confirmRename = useCallback(() => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name) {
      onRename(node, trimmed);
    }
    setIsRenaming(false);
    setRenameName('');
  }, [renameName, node, onRename]);

  const handleClick = useCallback(() => {
    if (isDir) {
      toggleDir(node.path);
    } else {
      openFile(node.path);
    }
  }, [isDir, node.path, toggleDir, openFile]);

  // DnD handlers
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, node.path);
    e.dataTransfer.setData('text/plain', node.name);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  }, [node.path, node.name]);

  const handleDragEnd = useCallback(() => setIsDragging(false), []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDir || !e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, [isDir]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isDir || !e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  }, [isDir]);

  const handleDragLeave = useCallback(() => {
    if (!isDir) return;
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, [isDir]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const sourcePath = e.dataTransfer.getData(DRAG_MIME);
    if (!sourcePath || sourcePath === node.path || node.path.startsWith(sourcePath + '/')) return;
    onDropMove(sourcePath, node.path);
  }, [isDir, node.path, onDropMove]);

  const paddingLeft = 8 + depth * 16;

  const rowContent = isRenaming ? (
    <div
      className="flex items-center gap-1 w-full py-0.5"
      style={{ paddingLeft }}
    >
      {getFileIcon(node.name, { isDirectory: isDir, className: 'h-3.5 w-3.5 shrink-0' })}
      <input
        type="text"
        ref={renameInputRef}
        value={renameName}
        onChange={(e) => setRenameName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmRename();
          if (e.key === 'Escape') { setIsRenaming(false); setRenameName(''); }
        }}
        onBlur={() => confirmRename()}
        className="flex-1 text-xs bg-transparent border border-primary rounded px-1 py-0 outline-none min-w-0"
      />
    </div>
  ) : (
    <button
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-1 w-full py-[3px] text-xs text-left transition-colors cursor-pointer',
        'hover:bg-muted/80',
        isSelected && 'bg-primary/10 text-primary font-medium',
        isCut && 'opacity-40',
        isDragging && 'opacity-30',
        isDragOver && 'bg-primary/15 ring-1 ring-primary/40',
        node.ignored && 'opacity-50',
      )}
      style={{ paddingLeft }}
    >
      {/* Chevron for dirs */}
      {isDir ? (
        isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )
      ) : (
        <span className="w-3 shrink-0" />
      )}

      {/* Icon */}
      {isDir && isExpanded ? (
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />
      ) : (
        getFileIcon(node.name, { isDirectory: isDir, className: 'h-3.5 w-3.5 shrink-0' })
      )}

      {/* Name */}
      <span className={cn(
        'truncate flex-1',
        gitStatus && gitStatusTextColor[gitStatus],
        !gitStatus && node.name.startsWith('.') && 'opacity-60',
      )}>
        {node.name}
      </span>

      {/* Indicators */}
      {(gitStatus || (diagCounts && (diagCounts.errors > 0 || diagCounts.warnings > 0))) && (
        <span className="inline-flex items-center gap-1 shrink-0 pr-2">
          {diagCounts && diagCounts.errors > 0 && (
            <span className="inline-flex items-center gap-0.5 text-red-500">
              <CircleAlert className="h-2.5 w-2.5" />
              <span className="text-[9px] font-semibold leading-none">{diagCounts.errors}</span>
            </span>
          )}
          {diagCounts && diagCounts.warnings > 0 && (
            <span className="inline-flex items-center gap-0.5 text-yellow-500">
              <AlertTriangle className="h-2.5 w-2.5" />
              <span className="text-[9px] font-semibold leading-none">{diagCounts.warnings}</span>
            </span>
          )}
          {gitStatus && (
            <span className={cn('text-[9px] font-semibold leading-none', gitStatusBadgeColor[gitStatus])}>
              {gitStatusLabel[gitStatus]}
            </span>
          )}
        </span>
      )}
    </button>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {rowContent}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={handleClick}>
            <ChevronRight className="mr-2 h-4 w-4" />
            {isDir ? 'Open folder' : 'Open file'}
          </ContextMenuItem>
          {!isDir && (
            <ContextMenuItem onClick={() => downloadFile(node.path, node.name)}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </ContextMenuItem>
          )}
          {!isDir && (
            <ContextMenuItem onClick={() => useFilesStore.getState().openHistory(node.path)}>
              <History className="mr-2 h-4 w-4" />
              View History
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onCopy(node)}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCut(node)}>
            <Scissors className="mr-2 h-4 w-4" />
            Cut
          </ContextMenuItem>
          <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.path)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => {
            setTimeout(() => { setRenameName(node.name); setIsRenaming(true); }, 100);
          }}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDelete(node)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Recursive children */}
      {isDir && isExpanded && (
        <TreeNodeChildren
          dirPath={node.path}
          depth={depth + 1}
          gitStatusMap={gitStatusMap}
          diagnosticCountsMap={diagnosticCountsMap}
          onRename={onRename}
          onDelete={onDelete}
          onCopy={onCopy}
          onCut={onCut}
          onDropMove={onDropMove}
        />
      )}
    </>
  );
}

// ─── Lazy-loaded directory children ─────────────────────────────────────────

interface TreeNodeChildrenProps {
  dirPath: string;
  depth: number;
  gitStatusMap: Map<string, GitStatusType>;
  diagnosticCountsMap: Map<string, { errors: number; warnings: number }>;
  onRename: (node: FileNode, newName: string) => void;
  onDelete: (node: FileNode) => void;
  onCopy: (node: FileNode) => void;
  onCut: (node: FileNode) => void;
  onDropMove: (sourcePath: string, targetDirPath: string) => void;
}

function TreeNodeChildren({
  dirPath,
  depth,
  gitStatusMap,
  diagnosticCountsMap,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onDropMove,
}: TreeNodeChildrenProps) {
  const { data: children, isLoading } = useFileList(dirPath);

  const sorted = useMemo(() => {
    if (!children) return [];
    return [...children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [children]);

  if (isLoading) {
    return (
      <div className="py-0.5" style={{ paddingLeft: 8 + depth * 16 }}>
        <Skeleton className="h-4 w-20 rounded" />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div
        className="py-0.5 text-[10px] text-muted-foreground/50 italic"
        style={{ paddingLeft: 8 + depth * 16 + 16 }}
      >
        empty
      </div>
    );
  }

  return (
    <>
      {sorted.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={depth}
          gitStatusMap={gitStatusMap}
          diagnosticCountsMap={diagnosticCountsMap}
          onRename={onRename}
          onDelete={onDelete}
          onCopy={onCopy}
          onCut={onCut}
          onDropMove={onDropMove}
        />
      ))}
    </>
  );
}

// ─── Main tree sidebar ──────────────────────────────────────────────────────

export function FileTree() {
  const currentPath = useFilesStore((s) => s.currentPath);
  const clipboard = useFilesStore((s) => s.clipboard);
  const copyToClipboard = useFilesStore((s) => s.copyToClipboard);
  const cutToClipboard = useFilesStore((s) => s.cutToClipboard);
  const clearClipboard = useFilesStore((s) => s.clearClipboard);
  const toggleSearch = useFilesStore((s) => s.toggleSearch);

  const { data: health } = useServerHealth();

  // Git status
  const { data: gitStatuses } = useGitStatus({ enabled: health?.healthy === true });
  const gitStatusMap = useMemo(() => buildGitStatusMap(gitStatuses), [gitStatuses]);

  // Diagnostics
  const diagByFile = useDiagnosticsStore((s) => s.byFile);
  const diagnosticCountsMap = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    for (const [filePath, diags] of Object.entries(diagByFile)) {
      let errors = 0;
      let warnings = 0;
      for (const d of diags) {
        if (d.severity === 1) errors++;
        else if (d.severity === 2) warnings++;
      }
      if (errors > 0 || warnings > 0) {
        map.set(filePath, { errors, warnings });
        // Propagate to ancestor directories
        const parts = filePath.split('/');
        for (let i = 1; i < parts.length; i++) {
          const dirPath = parts.slice(0, i).join('/');
          const existing = map.get(dirPath) || { errors: 0, warnings: 0 };
          map.set(dirPath, {
            errors: existing.errors + errors,
            warnings: existing.warnings + warnings,
          });
        }
      }
    }
    return map;
  }, [diagByFile]);

  // Mutations
  const renameMutation = useFileRename();
  const deleteMutationHook = useFileDelete();
  const mkdirMutation = useFileMkdir();
  const createMutation = useFileCreate();
  const uploadMutation = useFileUpload();
  const copyMutation = useFileCopy();

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  // Inline create states
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileCreateInputRef = useRef<HTMLInputElement>(null);
  const folderCreateInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingFile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = fileCreateInputRef.current;
          if (el) { el.focus(); const d = el.value.lastIndexOf('.'); el.setSelectionRange(0, d > 0 ? d : el.value.length); }
        });
      });
    }
  }, [isCreatingFile]);

  useEffect(() => {
    if (isCreatingFolder) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = folderCreateInputRef.current;
          if (el) { el.focus(); el.setSelectionRange(0, el.value.length); }
        });
      });
    }
  }, [isCreatingFolder]);

  const handleRename = useCallback(async (node: FileNode, newName: string) => {
    if (!newName || newName === node.name) return;
    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    try {
      await renameMutation.mutateAsync({ from: node.path, to: newPath });
      toast.success(`Renamed to ${newName}`);
    } catch (err) {
      toast.error(`Failed to rename: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [renameMutation]);

  const handleDelete = useCallback((node: FileNode) => { setDeleteTarget(node); }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutationHook.mutateAsync({ filePath: deleteTarget.path });
      toast.success(`Deleted ${deleteTarget.name}`);
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutationHook]);

  const handleCopy = useCallback((node: FileNode) => {
    copyToClipboard(node.path, node.name, node.type);
    toast.success(`Copied "${node.name}"`);
  }, [copyToClipboard]);

  const handleCut = useCallback((node: FileNode) => {
    cutToClipboard(node.path, node.name, node.type);
    toast.success(`Cut "${node.name}"`);
  }, [cutToClipboard]);

  const handleDropMove = useCallback(async (sourcePath: string, targetDirPath: string) => {
    const sourceName = sourcePath.split('/').pop() || '';
    const destPath = targetDirPath ? `${targetDirPath}/${sourceName}` : sourceName;
    if (sourcePath === destPath) return;
    try {
      await renameMutation.mutateAsync({ from: sourcePath, to: destPath });
      toast.success(`Moved "${sourceName}"`);
    } catch (err) {
      toast.error(`Failed to move: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [renameMutation]);

  const handlePaste = useCallback(async () => {
    if (!clipboard) return;
    const isRootPath = currentPath === '/' || currentPath === '.' || currentPath === '';
    const destDir = isRootPath ? '' : currentPath.replace(/\/$/, '');
    const destPath = destDir ? `${destDir}/${clipboard.name}` : clipboard.name;
    try {
      if (clipboard.operation === 'copy') {
        if (clipboard.type === 'file') {
          await copyMutation.mutateAsync({ sourcePath: clipboard.path, destPath });
          toast.success(`Copied "${clipboard.name}" here`);
        } else {
          await mkdirMutation.mutateAsync({ dirPath: destPath });
          toast.success(`Created copy of folder "${clipboard.name}" (empty)`);
        }
      } else {
        await renameMutation.mutateAsync({ from: clipboard.path, to: destPath });
        toast.success(`Moved "${clipboard.name}" here`);
        clearClipboard();
      }
    } catch (err) {
      toast.error(`Failed to paste: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [clipboard, currentPath, copyMutation, renameMutation, mkdirMutation, clearClipboard]);

  const isRootPath = currentPath === '/' || currentPath === '.' || currentPath === '';
  const normalizedCurrentPath = isRootPath ? '' : currentPath.replace(/\/$/, '');

  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) { setIsCreatingFile(false); return; }
    const filePath = normalizedCurrentPath ? `${normalizedCurrentPath}/${newFileName.trim()}` : newFileName.trim();
    try {
      await createMutation.mutateAsync({ filePath });
      toast.success(`Created ${newFileName.trim()}`);
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingFile(false);
      setNewFileName('');
    }
  }, [createMutation, normalizedCurrentPath, newFileName]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) { setIsCreatingFolder(false); return; }
    const folderPath = normalizedCurrentPath ? `${normalizedCurrentPath}/${newFolderName.trim()}` : newFolderName.trim();
    try {
      await mkdirMutation.mutateAsync({ dirPath: folderPath });
      toast.success(`Created folder: ${newFolderName.trim()}`);
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingFolder(false);
      setNewFolderName('');
    }
  }, [mkdirMutation, normalizedCurrentPath, newFolderName]);

  const handleUpload = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      await uploadMutation.mutateAsync({ file, targetPath: isRootPath ? undefined : currentPath });
      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      e.target.value = '';
    }
  }, [uploadMutation, isRootPath, currentPath]);

  // Keyboard: Ctrl+V paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboard, handlePaste]);

  return (
    <div className="flex flex-col h-full">
      {/* Tree header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setNewFileName('untitled.txt'); setIsCreatingFile(true); }} title="New file">
            <FilePlus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setNewFolderName('New Folder'); setIsCreatingFolder(true); }} title="New folder">
            <FolderPlus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleUpload} title="Upload">
            <Upload className="h-3 w-3" />
          </Button>
          {clipboard && (
            <Button variant="ghost" size="icon" className="h-5 w-5 text-primary" onClick={handlePaste} title={`Paste "${clipboard.name}"`}>
              <Clipboard className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInputChange} />

      {/* Tree content */}
      <ScrollArea className="flex-1 overflow-hidden min-h-0">
        <div className="py-1">
          {/* Inline create inputs */}
          {isCreatingFile && (
            <div className="flex items-center gap-1 px-3 py-1">
              <FilePlus className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <input
                type="text"
                ref={fileCreateInputRef}
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFile(); if (e.key === 'Escape') { setIsCreatingFile(false); setNewFileName(''); } }}
                onBlur={() => handleCreateFile()}
                className="flex-1 text-xs bg-transparent border border-primary rounded px-1 py-0 outline-none min-w-0"
              />
            </div>
          )}
          {isCreatingFolder && (
            <div className="flex items-center gap-1 px-3 py-1">
              <FolderPlus className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <input
                type="text"
                ref={folderCreateInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); } }}
                onBlur={() => handleCreateFolder()}
                className="flex-1 text-xs bg-transparent border border-primary rounded px-1 py-0 outline-none min-w-0"
              />
            </div>
          )}

          {/* Root tree */}
          <TreeNodeChildren
            dirPath="/workspace"
            depth={0}
            gitStatusMap={gitStatusMap}
            diagnosticCountsMap={diagnosticCountsMap}
            onRename={handleRename}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onCut={handleCut}
            onDropMove={handleDropMove}
          />
        </div>
      </ScrollArea>

      {/* Clipboard indicator */}
      {clipboard && (
        <div className="flex items-center justify-between gap-1 px-2 py-1 border-t bg-muted/30 text-[10px] text-muted-foreground shrink-0">
          <span className="truncate">
            {clipboard.operation === 'cut' ? 'Move' : 'Copy'}: <span className="font-medium text-foreground">{clipboard.name}</span>
          </span>
          <button onClick={clearClipboard} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer">
            Cancel
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent
          className="sm:max-w-md"
          onOpenAutoFocus={(e) => { e.preventDefault(); deleteButtonRef.current?.focus(); }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === 'directory' ? 'folder' : 'file'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{deleteTarget?.name}&quot;</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutationHook.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              ref={deleteButtonRef}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleteMutationHook.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutationHook.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
