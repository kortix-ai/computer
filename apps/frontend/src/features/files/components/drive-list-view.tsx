'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Folder,
  MoreVertical,
  Download,
  History,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  ClipboardCopy,
  RefreshCw,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { useFilesStore, type SortField } from '../store/files-store';

// ─── List Row ───────────────────────────────────────────────────────────────

interface ListRowProps {
  node: FileNode;
  onClick: () => void;
  onDoubleClick?: () => void;
  onDownload?: (node: FileNode) => void;
  onRename?: (node: FileNode, newName: string) => void;
  onDelete?: (node: FileNode) => void;
  onHistory?: (node: FileNode) => void;
  onCopy?: (node: FileNode) => void;
  onCut?: (node: FileNode) => void;
  onDropMove?: (sourcePath: string, targetDirPath: string) => void;
  onOpenInTab?: (node: FileNode) => void;
  isDownloadingItem?: boolean;
  gitStatus?: GitStatusType;
  isCut?: boolean;
}

function ListRow({
  node,
  onClick,
  onDoubleClick,
  onDownload,
  onRename,
  onDelete,
  onHistory,
  onCopy,
  onCut,
  onDropMove,
  onOpenInTab,
  isDownloadingItem,
  isCut,
}: ListRowProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const contextTriggerRef = useRef<HTMLDivElement>(null);

  const isDir = node.type === 'directory';

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
    onDropMove?.(sourcePath, node.path);
  }, [isDir, node.path, onDropMove]);

  const startRenaming = useCallback(() => {
    setRenameName(node.name);
    setIsRenaming(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = renameInputRef.current;
        if (el) {
          el.focus();
          if (isDir) {
            el.setSelectionRange(0, el.value.length);
          } else {
            const dotIdx = el.value.lastIndexOf('.');
            el.setSelectionRange(0, dotIdx > 0 ? dotIdx : el.value.length);
          }
        }
      });
    });
  }, [node.name, isDir]);

  const confirmRename = useCallback(() => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name) {
      onRename?.(node, trimmed);
    }
    setIsRenaming(false);
  }, [renameName, node, onRename]);

  // Programmatically open context menu on 3-dot click
  const handleDotsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const trigger = contextTriggerRef.current;
    if (trigger) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      trigger.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: rect.left,
          clientY: rect.bottom,
        }),
      );
    }
  }, []);

  const ext = !isDir && node.name.includes('.') ? node.name.split('.').pop()?.toUpperCase() || '—' : '—';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={contextTriggerRef}
          draggable={!isRenaming}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={isRenaming ? undefined : onClick}
          onDoubleClick={isRenaming ? undefined : onDoubleClick}
          className={cn(
            'group grid grid-cols-[1fr_80px_80px_40px] items-center gap-4 px-4 h-10 cursor-pointer select-none',
            'transition-colors duration-100',
            'hover:bg-muted/40',
            'border-b border-border/20 last:border-b-0',
            isCut && 'opacity-40',
            isDragging && 'opacity-30',
            isDragOver && 'bg-primary/[0.08] ring-1 ring-primary/30',
          )}
        >
          {/* Name column */}
          <div className="flex items-center gap-3 min-w-0">
            {isDir
              ? <Folder className="h-5 w-5 text-muted-foreground shrink-0" />
              : getFileIcon(node.name, { className: 'h-5 w-5 shrink-0', variant: 'monochrome' })
            }
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                onBlur={confirmRename}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-sm bg-transparent border-b border-primary/50 py-0 outline-none min-w-0"
              />
            ) : (
              <span className={cn(
                'text-sm truncate',
                node.ignored && 'opacity-50',
                node.name.startsWith('.') && 'text-muted-foreground',
              )}>
                {node.name}
              </span>
            )}
          </div>

          {/* Type column */}
          <span className="text-xs text-muted-foreground truncate">
            {isDir ? 'Folder' : ext}
          </span>

          {/* Size column */}
          <span className="text-xs text-muted-foreground">
            —
          </span>

          {/* Actions column */}
          <div className="flex justify-end">
            {!isRenaming && (
              <button
                onClick={handleDotsClick}
                className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity cursor-pointer"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          {isDir ? 'Open folder' : 'Preview'}
        </ContextMenuItem>
        {!isDir && onOpenInTab && (
          <ContextMenuItem onClick={() => onOpenInTab(node)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in tab
          </ContextMenuItem>
        )}
        {onDownload && (
          <ContextMenuItem onClick={() => onDownload(node)} disabled={isDownloadingItem}>
            {isDownloadingItem ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {isDownloadingItem ? 'Zipping...' : isDir ? 'Download as zip' : 'Download'}
          </ContextMenuItem>
        )}
        {!isDir && onHistory && (
          <ContextMenuItem onClick={() => onHistory(node)}>
            <History className="mr-2 h-4 w-4" />
            View history
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {onCopy && (
          <ContextMenuItem onClick={() => onCopy(node)}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy
          </ContextMenuItem>
        )}
        {onCut && (
          <ContextMenuItem onClick={() => onCut(node)}>
            <Scissors className="mr-2 h-4 w-4" />
            Cut
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.path)}>
          <Copy className="mr-2 h-4 w-4" />
          Copy path
        </ContextMenuItem>
        <ContextMenuSeparator />
        {onRename && (
          <ContextMenuItem onClick={() => setTimeout(startRenaming, 100)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem onClick={() => onDelete(node)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── Main List View ─────────────────────────────────────────────────────────

interface DriveListViewProps {
  dirs: FileNode[];
  files: FileNode[];
  onNavigateToDir: (node: FileNode) => void;
  onOpenFile: (node: FileNode) => void;
  onPreviewFile: (node: FileNode) => void;
  onDownload: (node: FileNode) => void;
  onDownloadDir: (node: FileNode) => void;
  onRename: (node: FileNode, newName: string) => void;
  onDelete: (node: FileNode) => void;
  onHistory: (node: FileNode) => void;
  onCopy: (node: FileNode) => void;
  onCut: (node: FileNode) => void;
  onDropMove: (sourcePath: string, targetDirPath: string) => void;
  onOpenInTab: (node: FileNode) => void;
  gitStatusMap: Map<string, GitStatusType>;
  clipboardPath?: string;
  clipboardOperation?: string;
  isDirDownloading: (path: string) => boolean;
}

export function DriveListView({
  dirs,
  files,
  onNavigateToDir,
  onOpenFile,
  onPreviewFile,
  onDownload,
  onDownloadDir,
  onRename,
  onDelete,
  onHistory,
  onCopy,
  onCut,
  onDropMove,
  onOpenInTab,
  gitStatusMap,
  clipboardPath,
  clipboardOperation,
  isDirDownloading,
}: DriveListViewProps) {
  const sortBy = useFilesStore((s) => s.sortBy);
  const sortOrder = useFilesStore((s) => s.sortOrder);
  const setSortBy = useFilesStore((s) => s.setSortBy);
  const toggleSortOrder = useFilesStore((s) => s.toggleSortOrder);

  const handleHeaderClick = (field: SortField) => {
    if (sortBy === field) {
      toggleSortOrder();
    } else {
      setSortBy(field);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const allItems = [...dirs, ...files];

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <p className="text-sm text-muted-foreground">This folder is empty</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Drop files here or use the New button to get started
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_80px_80px_40px] items-center gap-4 px-4 h-9 border-b border-border/40 bg-muted/20 sticky top-0 z-10">
        <button
          onClick={() => handleHeaderClick('name')}
          className="flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors text-left"
        >
          Name
          <SortIcon field="name" />
        </button>
        <button
          onClick={() => handleHeaderClick('type')}
          className="flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
        >
          Type
          <SortIcon field="type" />
        </button>
        <button
          onClick={() => handleHeaderClick('size')}
          className="flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
        >
          Size
          <SortIcon field="size" />
        </button>
        <span />
      </div>

      {/* Rows */}
      {dirs.map((node) => (
        <ListRow
          key={node.path}
          node={node}
          onClick={() => onNavigateToDir(node)}
          onDownload={onDownloadDir}
          isDownloadingItem={isDirDownloading(node.path)}
          onRename={onRename}
          onDelete={onDelete}
          onCopy={onCopy}
          onCut={onCut}
          onDropMove={onDropMove}
          isCut={clipboardOperation === 'cut' && clipboardPath === node.path}
        />
      ))}
      {files.map((node) => (
        <ListRow
          key={node.path}
          node={node}
          onClick={() => onPreviewFile(node)}
          onDoubleClick={() => onOpenFile(node)}
          onDownload={onDownload}
          onRename={onRename}
          onDelete={onDelete}
          onHistory={onHistory}
          onCopy={onCopy}
          onCut={onCut}
          onOpenInTab={onOpenInTab}
          gitStatus={gitStatusMap.get(node.path)}
          isCut={clipboardOperation === 'cut' && clipboardPath === node.path}
        />
      ))}
    </div>
  );
}
