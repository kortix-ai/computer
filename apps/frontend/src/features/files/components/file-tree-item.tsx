'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileSpreadsheet,
  FileType,
  File as FileIcon,
  ChevronRight,
  Download,
  History,
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

/** Git status for display purposes */
export type GitStatusType = 'added' | 'deleted' | 'modified';

interface FileTreeItemProps {
  node: FileNode;
  onClick: () => void;
  onDownload?: (node: FileNode) => void;
  onRename?: (node: FileNode, newName: string) => void;
  onDelete?: (node: FileNode) => void;
  onHistory?: (node: FileNode) => void;
  /** All sibling names in the current directory, for duplicate detection */
  siblingNames?: string[];
  /** Git status for this file/directory */
  gitStatus?: GitStatusType;
}

/** File extension to icon mapping */
function getNodeIcon(node: FileNode) {
  if (node.type === 'directory') {
    return <Folder className="h-4 w-4 text-blue-400 shrink-0" />;
  }

  const ext = node.name.split('.').pop()?.toLowerCase() || '';

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext)) {
    return <FileImage className="h-4 w-4 text-purple-400 shrink-0" />;
  }
  // Video
  if (['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) {
    return <FileVideo className="h-4 w-4 text-pink-400 shrink-0" />;
  }
  // Spreadsheets
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
    return <FileSpreadsheet className="h-4 w-4 text-green-400 shrink-0" />;
  }
  // Code files
  if ([
    'ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp',
    'h', 'hpp', 'cs', 'swift', 'kt', 'php', 'vue', 'svelte',
  ].includes(ext)) {
    return <FileCode className="h-4 w-4 text-yellow-400 shrink-0" />;
  }
  // Markdown/text
  if (['md', 'mdx', 'txt', 'rst'].includes(ext)) {
    return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
  // PDF/docs
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx'].includes(ext)) {
    return <FileType className="h-4 w-4 text-red-400 shrink-0" />;
  }

  return <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
}

/** Git status → text color class */
const gitStatusTextColor: Record<GitStatusType, string> = {
  added: 'text-green-500 dark:text-green-400',
  modified: 'text-yellow-500 dark:text-yellow-400',
  deleted: 'text-red-500 dark:text-red-400',
};

/** Git status → badge label */
const gitStatusLabel: Record<GitStatusType, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

/** Git status → badge color class */
const gitStatusBadgeColor: Record<GitStatusType, string> = {
  added: 'text-green-500 dark:text-green-400',
  modified: 'text-yellow-500 dark:text-yellow-400',
  deleted: 'text-red-500 dark:text-red-400',
};

/** Get selection end index: before extension for files, full length for folders */
function getNameSelectionEnd(name: string, isDirectory: boolean): number {
  if (isDirectory) return name.length;
  const dotIdx = name.lastIndexOf('.');
  return dotIdx > 0 ? dotIdx : name.length;
}

export function FileTreeItem({ node, onClick, onDownload, onRename, onDelete, onHistory, siblingNames, gitStatus }: FileTreeItemProps) {
  const hasContextMenu = onDownload || onRename || onDelete || onHistory;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Check for duplicate name (exclude current node's own name)
  const nameConflict = useMemo(() => {
    if (!isRenaming || !renameName.trim() || !siblingNames) return false;
    const trimmed = renameName.trim().toLowerCase();
    if (trimmed === node.name.toLowerCase()) return false; // same name is fine
    return siblingNames.some((n) => n.toLowerCase() === trimmed);
  }, [isRenaming, renameName, siblingNames, node.name]);

  // Auto-focus and select when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = renameInputRef.current;
          if (el) {
            el.focus();
            const selEnd = getNameSelectionEnd(el.value, node.type === 'directory');
            el.setSelectionRange(0, selEnd);
          }
        });
      });
    }
  }, [isRenaming, node.type]);

  const startRenaming = () => {
    setRenameName(node.name);
    setIsRenaming(true);
  };

  const confirmRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name && !nameConflict && onRename) {
      onRename(node, trimmed);
    }
    setIsRenaming(false);
    setRenameName('');
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameName('');
  };

  const content = isRenaming ? (
    <div
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md',
        node.ignored && 'opacity-50',
      )}
    >
      {getNodeIcon(node)}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <input
          type="text"
          ref={renameInputRef}
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !nameConflict) confirmRename();
            if (e.key === 'Escape') cancelRename();
          }}
          onBlur={() => {
            if (!nameConflict) confirmRename();
            else cancelRename();
          }}
          className={cn(
            'w-full text-sm bg-transparent border rounded px-1.5 py-0.5 outline-none selection:bg-primary/15 selection:text-foreground',
            nameConflict ? 'border-red-500/60' : 'border-primary',
          )}
        />
        {nameConflict && (
          <p className="text-[11px] text-red-400">
            A file or folder with that name already exists
          </p>
        )}
      </div>
    </div>
  ) : (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded-md transition-colors cursor-pointer',
        'hover:bg-muted/80',
        node.ignored && 'opacity-50',
      )}
    >
      {getNodeIcon(node)}
      <span className={cn('truncate flex-1', gitStatus && gitStatusTextColor[gitStatus])}>
        {node.name}
      </span>
      {gitStatus && (
        <span className={cn('text-[10px] font-semibold leading-none shrink-0', gitStatusBadgeColor[gitStatus])}>
          {gitStatusLabel[gitStatus]}
        </span>
      )}
      {node.type === 'directory' && (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
    </button>
  );

  if (!hasContextMenu) {
    return content;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {content}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <ChevronRight className="mr-2 h-4 w-4" />
          {node.type === 'directory' ? 'Open folder' : 'Open file'}
        </ContextMenuItem>

        {node.type === 'file' && onDownload && (
          <ContextMenuItem onClick={() => onDownload(node)}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </ContextMenuItem>
        )}

        {node.type === 'file' && onHistory && (
          <ContextMenuItem onClick={() => onHistory(node)}>
            <History className="mr-2 h-4 w-4" />
            View History
          </ContextMenuItem>
        )}

        <ContextMenuItem
          onClick={() => {
            navigator.clipboard.writeText(node.path);
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy path
        </ContextMenuItem>

        {onRename && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => {
              setTimeout(() => startRenaming(), 100);
            }}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </ContextMenuItem>
          </>
        )}

        {onDelete && (
          <>
            {!onRename && <ContextMenuSeparator />}
            <ContextMenuItem
              onClick={() => onDelete(node)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
