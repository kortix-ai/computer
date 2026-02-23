'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  FileCode2,
  FileImage,
  FileVideo,
  FileSpreadsheet,
  FileType,
  FileJson,
  FileTerminal,
  FileArchive,
  FileAudio,
  FileCog,
  FileKey,
  FileLock,
  FileMusic,
  FileBadge,
  FileBox,
  FileChartLine,
  File as FileIcon,
  ChevronRight,
  Download,
  History,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  ClipboardCopy,
  CircleAlert,
  AlertTriangle,
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
  onCopy?: (node: FileNode) => void;
  onCut?: (node: FileNode) => void;
  /** Called when another item is dropped onto this directory */
  onDropMove?: (sourcePath: string, targetDirPath: string) => void;
  /** All sibling names in the current directory, for duplicate detection */
  siblingNames?: string[];
  /** Git status for this file/directory */
  gitStatus?: GitStatusType;
  /** Whether this item is currently cut (pending move) */
  isCut?: boolean;
  /** LSP diagnostic counts for this item (aggregated for directories) */
  diagnosticCounts?: { errors: number; warnings: number };
}

// Custom MIME type for internal drag-and-drop
const DRAG_MIME = 'application/x-file-tree-path';

/** Icon class shorthand */
const IC = 'h-4 w-4 shrink-0';

/** File extension / filename to icon mapping */
function getNodeIcon(node: FileNode) {
  if (node.type === 'directory') {
    return <Folder className={`${IC} text-blue-400`} />;
  }

  const name = node.name.toLowerCase();
  const ext = name.split('.').pop() || '';

  // ── Special filenames ──────────────────────────────────────────
  if (name === 'dockerfile' || name === 'docker-compose.yml' || name === 'docker-compose.yaml') {
    return <FileBox className={`${IC} text-sky-400`} />;
  }
  if (name === '.env' || name.startsWith('.env.')) {
    return <FileKey className={`${IC} text-yellow-500`} />;
  }
  if (name === 'package.json' || name === 'package-lock.json' || name === 'pnpm-lock.yaml' || name === 'yarn.lock' || name === 'bun.lockb') {
    return <FileBox className={`${IC} text-green-400`} />;
  }
  if (name === 'license' || name === 'license.md' || name === 'license.txt') {
    return <FileBadge className={`${IC} text-amber-400`} />;
  }
  if (name === '.gitignore' || name === '.gitattributes' || name === '.gitmodules') {
    return <FileCog className={`${IC} text-orange-400`} />;
  }
  if (name === 'makefile' || name === 'cmakelists.txt') {
    return <FileTerminal className={`${IC} text-amber-500`} />;
  }

  // ── By extension ───────────────────────────────────────────────

  // TypeScript
  if (ext === 'ts' || ext === 'tsx') {
    return <FileCode2 className={`${IC} text-blue-400`} />;
  }
  // JavaScript
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return <FileCode2 className={`${IC} text-yellow-400`} />;
  }
  // Python
  if (ext === 'py' || ext === 'pyi' || ext === 'pyx' || ext === 'pyw') {
    return <FileCode className={`${IC} text-sky-400`} />;
  }
  // Rust
  if (ext === 'rs') {
    return <FileCode className={`${IC} text-orange-400`} />;
  }
  // Go
  if (ext === 'go') {
    return <FileCode className={`${IC} text-cyan-400`} />;
  }
  // Ruby
  if (ext === 'rb' || ext === 'erb' || ext === 'gemspec') {
    return <FileCode className={`${IC} text-red-400`} />;
  }
  // Java / Kotlin
  if (ext === 'java' || ext === 'kt' || ext === 'kts') {
    return <FileCode className={`${IC} text-orange-500`} />;
  }
  // C / C++ / Objective-C
  if (ext === 'c' || ext === 'cpp' || ext === 'cc' || ext === 'cxx' || ext === 'h' || ext === 'hpp' || ext === 'hxx' || ext === 'm' || ext === 'mm') {
    return <FileCode className={`${IC} text-blue-500`} />;
  }
  // C#
  if (ext === 'cs') {
    return <FileCode className={`${IC} text-violet-400`} />;
  }
  // Swift
  if (ext === 'swift') {
    return <FileCode className={`${IC} text-orange-400`} />;
  }
  // PHP
  if (ext === 'php') {
    return <FileCode className={`${IC} text-indigo-400`} />;
  }
  // Vue / Svelte
  if (ext === 'vue') {
    return <FileCode2 className={`${IC} text-emerald-400`} />;
  }
  if (ext === 'svelte') {
    return <FileCode2 className={`${IC} text-orange-500`} />;
  }
  // HTML
  if (ext === 'html' || ext === 'htm') {
    return <FileCode className={`${IC} text-orange-400`} />;
  }
  // CSS / SCSS / LESS
  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less' || ext === 'styl') {
    return <FileCode className={`${IC} text-pink-400`} />;
  }

  // JSON
  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') {
    return <FileJson className={`${IC} text-yellow-500`} />;
  }
  // YAML / TOML
  if (ext === 'yaml' || ext === 'yml' || ext === 'toml') {
    return <FileCog className={`${IC} text-purple-400`} />;
  }
  // XML
  if (ext === 'xml' || ext === 'xsl' || ext === 'xslt' || ext === 'wsdl') {
    return <FileCode className={`${IC} text-amber-500`} />;
  }

  // Shell / Terminal
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish' || ext === 'bat' || ext === 'cmd' || ext === 'ps1') {
    return <FileTerminal className={`${IC} text-green-400`} />;
  }

  // Markdown / Text
  if (ext === 'md' || ext === 'mdx' || ext === 'txt' || ext === 'rst' || ext === 'rtf') {
    return <FileText className={`${IC} text-muted-foreground`} />;
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'tiff', 'tif'].includes(ext)) {
    return <FileImage className={`${IC} text-purple-400`} />;
  }
  // Video
  if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'ogv'].includes(ext)) {
    return <FileVideo className={`${IC} text-pink-400`} />;
  }
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext)) {
    return <FileAudio className={`${IC} text-teal-400`} />;
  }
  // Music (midi)
  if (ext === 'mid' || ext === 'midi') {
    return <FileMusic className={`${IC} text-teal-400`} />;
  }

  // Spreadsheets
  if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) {
    return <FileSpreadsheet className={`${IC} text-green-400`} />;
  }
  // PDF / Documents
  if (ext === 'pdf') {
    return <FileType className={`${IC} text-red-500`} />;
  }
  if (['doc', 'docx', 'odt'].includes(ext)) {
    return <FileType className={`${IC} text-blue-500`} />;
  }
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return <FileType className={`${IC} text-orange-500`} />;
  }

  // Archives
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz', 'zst'].includes(ext)) {
    return <FileArchive className={`${IC} text-amber-500`} />;
  }

  // Config files
  if (['ini', 'cfg', 'conf', 'properties', 'editorconfig'].includes(ext)) {
    return <FileCog className={`${IC} text-gray-400`} />;
  }
  // Dotfiles / RC files
  if (name.startsWith('.') && (name.endsWith('rc') || name.endsWith('rc.js') || name.endsWith('rc.json') || name.endsWith('rc.yml'))) {
    return <FileCog className={`${IC} text-gray-400`} />;
  }
  if (ext === 'eslintrc' || name.includes('eslint') || name.includes('prettier') || name.includes('babel')) {
    return <FileCog className={`${IC} text-purple-400`} />;
  }
  // tsconfig, etc
  if (name.startsWith('tsconfig') || name.startsWith('jsconfig')) {
    return <FileCog className={`${IC} text-blue-400`} />;
  }

  // Lock files / security
  if (ext === 'lock' || ext === 'pem' || ext === 'crt' || ext === 'cer' || ext === 'key') {
    return <FileLock className={`${IC} text-yellow-500`} />;
  }

  // Database / SQL
  if (ext === 'sql' || ext === 'sqlite' || ext === 'db' || ext === 'sqlite3') {
    return <FileChartLine className={`${IC} text-blue-400`} />;
  }

  // Protobuf / GraphQL
  if (ext === 'proto' || ext === 'graphql' || ext === 'gql') {
    return <FileCode2 className={`${IC} text-pink-500`} />;
  }

  // WASM
  if (ext === 'wasm' || ext === 'wat') {
    return <FileBox className={`${IC} text-violet-500`} />;
  }

  // Log files
  if (ext === 'log') {
    return <FileText className={`${IC} text-gray-400`} />;
  }

  // Fallback
  return <FileIcon className={`${IC} text-muted-foreground`} />;
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

export { DRAG_MIME };

export function FileTreeItem({ node, onClick, onDownload, onRename, onDelete, onHistory, onCopy, onCut, onDropMove, siblingNames, gitStatus, isCut, diagnosticCounts }: FileTreeItemProps) {
  const hasContextMenu = onDownload || onRename || onDelete || onHistory || onCopy || onCut;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

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

  // --- Drag source handlers ---
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, node.path);
    e.dataTransfer.setData('text/plain', node.name);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  }, [node.path, node.name]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // --- Drop target handlers (directories only) ---
  const isDropTarget = node.type === 'directory' && !!onDropMove;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDropTarget) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, [isDropTarget]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isDropTarget) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  }, [isDropTarget]);

  const handleDragLeave = useCallback(() => {
    if (!isDropTarget) return;
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, [isDropTarget]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isDropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const sourcePath = e.dataTransfer.getData(DRAG_MIME);
    if (!sourcePath) return;

    // Don't drop onto self or into own subtree
    if (sourcePath === node.path || node.path.startsWith(sourcePath + '/')) return;

    onDropMove!(sourcePath, node.path);
  }, [isDropTarget, node.path, onDropMove]);

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
      draggable={!isRenaming}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded-md transition-colors cursor-pointer',
        'hover:bg-muted/80',
        node.ignored && 'opacity-50',
        isCut && 'opacity-40',
        isDragging && 'opacity-30',
        isDragOver && 'bg-primary/15 ring-1 ring-primary/40',
      )}
    >
      {getNodeIcon(node)}
      <span className={cn('truncate flex-1', gitStatus && gitStatusTextColor[gitStatus])}>
        {node.name}
      </span>
      {/* Right-side indicators: git status + diagnostics */}
      {(gitStatus || (diagnosticCounts && (diagnosticCounts.errors > 0 || diagnosticCounts.warnings > 0))) && (
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {diagnosticCounts && diagnosticCounts.errors > 0 && (
            <span className="inline-flex items-center gap-0.5 text-red-500">
              <CircleAlert className="h-3 w-3" />
              <span className="text-[10px] font-semibold leading-none">{diagnosticCounts.errors}</span>
            </span>
          )}
          {diagnosticCounts && diagnosticCounts.warnings > 0 && (
            <span className="inline-flex items-center gap-0.5 text-yellow-500">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-[10px] font-semibold leading-none">{diagnosticCounts.warnings}</span>
            </span>
          )}
          {gitStatus && (
            <span className={cn('text-[10px] font-semibold leading-none', gitStatusBadgeColor[gitStatus])}>
              {gitStatusLabel[gitStatus]}
            </span>
          )}
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

        <ContextMenuSeparator />

        {onCopy && (
          <ContextMenuItem
            onClick={() => onCopy(node)}
          >
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy
          </ContextMenuItem>
        )}

        {onCut && (
          <ContextMenuItem
            onClick={() => onCut(node)}
          >
            <Scissors className="mr-2 h-4 w-4" />
            Cut
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
