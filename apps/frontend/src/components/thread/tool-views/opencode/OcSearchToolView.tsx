'use client';

import React, { useMemo } from 'react';
import { Search, CheckCircle, AlertCircle, FileText, FolderOpen } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';

function getFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getDirectory(path: string): string {
  const idx = path.lastIndexOf('/');
  if (idx < 0) return '';
  return path.substring(0, idx + 1);
}

/** Try to parse the output into a list of file paths (one per line) */
function parseFilePaths(output: string): string[] | null {
  if (!output) return null;
  const lines = output.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  // Heuristic: if most lines look like file paths, treat as file list
  const pathLike = lines.filter((l) => l.startsWith('/') || l.startsWith('./') || l.startsWith('~'));
  if (pathLike.length >= lines.length * 0.7) {
    return pathLike;
  }
  return null;
}

export function OcSearchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocTool = (args._oc_tool as string) || 'search';
  const ocState = args._oc_state as any;

  const pattern = (args.pattern as string) || '';
  const path = (args.path as string) || '';
  const output = toolResult?.output || (ocState?.output) || '';

  const openFileInComputer = useKortixComputerStore((s) => s.openFileInComputer);

  const toolLabel = ocTool === 'glob' ? 'Search Files'
    : ocTool === 'grep' ? 'Search Content'
    : ocTool === 'list' ? 'List Directory'
    : 'Search';

  const subtitle = pattern || path || undefined;

  const isError = toolResult?.success === false || !!toolResult?.error;

  // Try to parse output as file paths for glob/list tools
  const filePaths = useMemo(() => {
    if (ocTool === 'grep') return null; // grep output has content, not just paths
    return parseFilePaths(String(output));
  }, [output, ocTool]);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={Search}
        iconColor="text-amber-500 dark:text-amber-400"
        bgColor="bg-gradient-to-b from-amber-100 to-amber-50 shadow-inner dark:from-amber-800/40 dark:to-amber-900/60"
        title={toolLabel}
        subtitle={subtitle}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={Search}
            title={toolLabel}
            subtitle={subtitle}
          />
          {filePaths && filePaths.length > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {filePaths.length} file{filePaths.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          {filePaths && filePaths.length > 0 ? (
            <FilePathList
              paths={filePaths}
              onFileClick={(fp) => openFileInComputer(fp, filePaths)}
            />
          ) : output ? (
            <div className="p-4">
              <UnifiedMarkdown content={String(output)} isStreaming={false} />
            </div>
          ) : (
            <div className="p-4">
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mb-2 opacity-40" />
                <span className="text-sm">No results found</span>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          isError ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              Done
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}

function toShortDir(dir: string): string {
  return dir
    .replace(/^\/Users\/[^/]+\//, '~/')
    .replace(/^\/home\/[^/]+\//, '~/')
    .replace(/\/$/, '');
}

function FilePathList({
  paths,
  onFileClick,
}: {
  paths: string[];
  onFileClick: (path: string) => void;
}) {
  return (
    <div className="py-1">
      {paths.map((fp, i) => {
        const dir = getDirectory(fp);
        const name = getFilename(fp);
        const shortDir = toShortDir(dir);

        return (
          <div
            key={i}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group"
            onClick={() => onFileClick(fp)}
            title={fp}
          >
            <FileText className="h-3.5 w-3.5 text-amber-500/70 dark:text-amber-400/70 flex-shrink-0 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" />
            <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0">{name}</span>
              <span className="text-muted-foreground/40 truncate text-[11px]">{shortDir}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
