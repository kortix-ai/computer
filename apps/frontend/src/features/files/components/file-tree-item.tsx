'use client';

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

interface FileTreeItemProps {
  node: FileNode;
  onClick: () => void;
  onDownload?: (node: FileNode) => void;
  onRename?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
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

export function FileTreeItem({ node, onClick, onDownload, onRename, onDelete }: FileTreeItemProps) {
  const hasContextMenu = onDownload || onRename || onDelete;

  const content = (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded-md transition-colors cursor-pointer',
        'hover:bg-muted/80',
        node.ignored && 'opacity-50',
      )}
    >
      {getNodeIcon(node)}
      <span className="truncate flex-1">{node.name}</span>
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
            <ContextMenuItem onClick={() => onRename(node)}>
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
