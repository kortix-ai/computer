'use client';

import React, { useMemo, useState } from 'react';
import {
  FileCode2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  ArrowRight,
  Trash2,
  PenLine,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { useOcFileOpen } from './useOcFileOpen';

interface PatchFile {
  relativePath: string;
  type: 'add' | 'update' | 'delete' | 'move';
  additions: number;
  deletions: number;
  before: string;
  after: string;
}

function getTypeConfig(type: string) {
  switch (type) {
    case 'add':
      return { label: 'Created', icon: Plus, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    case 'update':
      return { label: 'Patched', icon: PenLine, color: 'text-amber-500', bg: 'bg-amber-500/10' };
    case 'delete':
      return { label: 'Deleted', icon: Trash2, color: 'text-red-500', bg: 'bg-red-500/10' };
    case 'move':
      return { label: 'Moved', icon: ArrowRight, color: 'text-blue-500', bg: 'bg-blue-500/10' };
    default:
      return { label: type, icon: FileCode2, color: 'text-zinc-500', bg: 'bg-zinc-500/10' };
  }
}

function getFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getDirectory(path: string): string {
  const idx = path.lastIndexOf('/');
  if (idx < 0) return '';
  return path.substring(0, idx);
}

export function OcApplyPatchToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const ocState = args._oc_state as any;
  const rawOutput = toolResult?.output || ocState?.output || '';
  const metadata = ocState?.metadata || {};

  const { openFile, toDisplayPath } = useOcFileOpen();

  const isError = toolResult?.success === false || !!toolResult?.error;

  const files = useMemo(
    () => (Array.isArray(metadata.files) ? metadata.files : []) as PatchFile[],
    [metadata.files],
  );

  const totalAdditions = files.reduce((s, f) => s + (f.additions || 0), 0);
  const totalDeletions = files.reduce((s, f) => s + (f.deletions || 0), 0);

  const [expandedFile, setExpandedFile] = useState<number | null>(
    files.length === 1 ? 0 : null,
  );

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        icon={FileCode2}
        iconColor="text-blue-500 dark:text-blue-400"
        bgColor="bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60"
        title="Applying patches"
        subtitle={files.length > 0 ? `${files.length} files` : undefined}
        showProgress={true}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={FileCode2}
            title="Apply Patch"
            subtitle={files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : undefined}
          />
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {totalAdditions > 0 && (
              <span className="text-xs text-emerald-500 font-mono">+{totalAdditions}</span>
            )}
            {totalDeletions > 0 && (
              <span className="text-xs text-red-500 font-mono">-{totalDeletions}</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          {files.length > 0 ? (
            <div className="py-1">
              {files.map((file, i) => {
                const config = getTypeConfig(file.type);
                const TypeIcon = config.icon;
                const name = getFilename(file.relativePath);
                const dir = getDirectory(file.relativePath);
                const isExpanded = expandedFile === i;
                const hasDiff = file.type !== 'delete' && (file.before || file.after);

                return (
                  <div key={i} className={i > 0 ? 'border-t border-zinc-100 dark:border-zinc-800/60' : ''}>
                    {/* File header */}
                    <div
                      className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                      onClick={() => setExpandedFile(isExpanded ? null : i)}
                    >
                      {hasDiff ? (
                        isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )
                      ) : (
                        <div className="w-3.5" />
                      )}

                      <Badge variant="outline" className={`h-5 py-0 px-1.5 text-[10px] font-bold uppercase ${config.color} ${config.bg} border-none flex-shrink-0`}>
                        {config.label}
                      </Badge>

                      <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden flex-1">
                        <span
                          className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0 cursor-pointer hover:text-primary transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            openFile(file.relativePath);
                          }}
                        >
                          {name}
                        </span>
                        {dir && (
                          <span className="text-muted-foreground/40 truncate text-[10px]">{dir}</span>
                        )}
                      </span>

                      <div className="flex items-center gap-1.5 text-[10px] flex-shrink-0">
                        {file.additions > 0 && <span className="text-emerald-500">+{file.additions}</span>}
                        {file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
                      </div>
                    </div>

                    {/* Expanded diff */}
                    {isExpanded && hasDiff && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800/30">
                        <UnifiedMarkdown
                          content={`\`\`\`diff\n--- a/${file.relativePath}\n+++ b/${file.relativePath}\n${generateSimpleDiff(file.before, file.after)}\n\`\`\``}
                          isStreaming={false}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2.5 px-4 py-6 text-muted-foreground">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{rawOutput || 'Patch failed'}</p>
            </div>
          ) : rawOutput ? (
            <div className="p-4">
              <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{String(rawOutput).slice(0, 2000)}</pre>
            </div>
          ) : null}
        </ScrollArea>
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      >
        {!isStreaming && (
          isError ? (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900 text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-zinc-50 dark:bg-zinc-900">
              <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
              {files.length} {files.length === 1 ? 'file' : 'files'} patched
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}

/** Generate a simple unified diff (line-level) for display */
function generateSimpleDiff(before: string, after: string): string {
  if (!before && !after) return '';
  const oldLines = (before || '').split('\n');
  const newLines = (after || '').split('\n');

  const lines: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  // Simple line-by-line comparison (not a real diff algorithm, but good enough for display)
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      lines.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      lines.push(`-${oldLines[i]}`);
      i++;
    } else if (j < newLines.length) {
      lines.push(`+${newLines[j]}`);
      j++;
    }
    // Safety: prevent infinite loops
    if (lines.length > 500) {
      lines.push('... (truncated)');
      break;
    }
  }

  return lines.join('\n');
}
