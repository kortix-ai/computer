'use client';

import React, { useMemo, useState } from 'react';
import {
  FileCode2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Plus,
  ArrowRight,
  Trash2,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { useOcFileOpen } from './useOcFileOpen';
import { createTwoFilesPatch } from 'diff';
import { useDiffHighlight, renderHighlightedLine } from '@/hooks/use-diff-highlight';

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
      return { label: type, icon: FileCode2, color: 'text-muted-foreground', bg: 'bg-muted' };
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
        title="Applying patches"
        subtitle={files.length > 0 ? `${files.length} files` : undefined}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
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
                  <div key={i} className={i > 0 ? 'border-t border-border/60' : ''}>
                    {/* File header */}
                    <div
                      className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-muted transition-colors"
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
                      <PatchFileDiff before={file.before} after={file.after} filePath={file.relativePath} />
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
            <div className="p-3">
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
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              {files.length} {files.length === 1 ? 'file' : 'files'} patched
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}

/** Per-file diff display using proper diff algorithm */
function PatchFileDiff({ before, after, filePath }: { before: string; after: string; filePath: string }) {
  const patch = useMemo(() => {
    return createTwoFilesPatch(
      `a/${filePath}`, `b/${filePath}`,
      before || '', after || '',
      '', '',
    );
  }, [before, after, filePath]);

  const diffLines = useMemo(() => {
    const lines = patch.split('\n').slice(4); // skip header
    return lines;
  }, [patch]);

  // Extract code content (without +/-/space prefix) for highlighting
  const codeLines = useMemo(
    () =>
      diffLines.map((line) => {
        if (line.startsWith('@@') || line === '') return '';
        return line.length > 0 ? line.substring(1) : '';
      }),
    [diffLines],
  );

  const highlighted = useDiffHighlight(codeLines, filePath);

  return (
    <div className="border-t border-border/30 bg-muted/30 overflow-auto max-h-96">
      <pre className="p-3 font-mono text-[11px] leading-[1.6] select-text whitespace-pre-wrap break-all">
        {diffLines.map((line, i) => {
          const isAdd = line.startsWith('+');
          const isDel = line.startsWith('-');
          const isHunk = line.startsWith('@@');

          let cls = 'text-muted-foreground/60';
          if (isAdd) cls = 'bg-emerald-500/8';
          else if (isDel) cls = 'bg-red-500/8';
          else if (isHunk) cls = 'text-blue-500/60 text-[10px]';

          if (isHunk || line === '') {
            return (
              <div key={i} className={cls}>
                {line || ' '}
              </div>
            );
          }

          const prefix = line[0] || ' ';
          const highlightedTokens = highlighted?.[i];

          if (highlightedTokens) {
            const html = renderHighlightedLine(highlightedTokens, codeLines[i]);
            return (
              <div key={i} className={cls}>
                <span
                  className={cn(
                    isAdd && 'text-emerald-600 dark:text-emerald-400',
                    isDel && 'text-red-600 dark:text-red-400',
                  )}
                >
                  {prefix}
                </span>
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          }

          return (
            <div
              key={i}
              className={cn(
                cls,
                isAdd && 'text-emerald-600 dark:text-emerald-400',
                isDel && 'text-red-600 dark:text-red-400',
              )}
            >
              {line || ' '}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
