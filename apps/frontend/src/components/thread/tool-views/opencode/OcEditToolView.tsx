'use client';

import React, { useState, useMemo } from 'react';
import {
  FileCode2,
  CheckCircle,
  AlertCircle,
  Plus,
  Minus,
  Columns2,
  Rows2,
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

function getFilename(path: string | undefined): string {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getDirectory(path: string | undefined): string {
  if (!path) return '';
  const idx = path.lastIndexOf('/');
  if (idx < 0) return '';
  return path.substring(0, idx);
}

// ============================================================================
// Unified diff line renderer
// ============================================================================

function DiffLinesView({ patch, filename }: { patch: string; filename: string }) {
  const diffLines = useMemo(() => patch.split('\n').slice(4), [patch]);

  // Extract code content (without +/-/space prefix) for highlighting
  const codeLines = useMemo(
    () =>
      diffLines.map((line) => {
        if (line.startsWith('@@') || line === '') return '';
        return line.length > 0 ? line.substring(1) : '';
      }),
    [diffLines],
  );

  const highlighted = useDiffHighlight(codeLines, filename);

  return (
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
  );
}

// ============================================================================
// Side-by-side diff renderer
// ============================================================================

interface SideBySideLine {
  left: { num: number | null; content: string; type: 'unchanged' | 'deleted' | 'empty' };
  right: { num: number | null; content: string; type: 'unchanged' | 'added' | 'empty' };
}

function parsePatchToSideBySide(patch: string): SideBySideLine[] {
  const lines = patch.split('\n').slice(4); // skip header
  const result: SideBySideLine[] = [];
  let leftNum = 0;
  let rightNum = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        leftNum = parseInt(match[1], 10) - 1;
        rightNum = parseInt(match[2], 10) - 1;
      }
      result.push({
        left: { num: null, content: line, type: 'unchanged' },
        right: { num: null, content: '', type: 'empty' },
      });
      i++;
      continue;
    }

    if (line.startsWith('-')) {
      const deletions: string[] = [];
      while (i < lines.length && lines[i].startsWith('-')) {
        deletions.push(lines[i].substring(1));
        i++;
      }
      const additions: string[] = [];
      while (i < lines.length && lines[i].startsWith('+')) {
        additions.push(lines[i].substring(1));
        i++;
      }
      const maxLen = Math.max(deletions.length, additions.length);
      for (let j = 0; j < maxLen; j++) {
        const hasLeft = j < deletions.length;
        const hasRight = j < additions.length;
        result.push({
          left: {
            num: hasLeft ? ++leftNum : null,
            content: hasLeft ? deletions[j] : '',
            type: hasLeft ? 'deleted' : 'empty',
          },
          right: {
            num: hasRight ? ++rightNum : null,
            content: hasRight ? additions[j] : '',
            type: hasRight ? 'added' : 'empty',
          },
        });
      }
      continue;
    }

    if (line.startsWith('+')) {
      rightNum++;
      result.push({
        left: { num: null, content: '', type: 'empty' },
        right: { num: rightNum, content: line.substring(1), type: 'added' },
      });
      i++;
      continue;
    }

    // Context line
    leftNum++;
    rightNum++;
    result.push({
      left: { num: leftNum, content: line.startsWith(' ') ? line.substring(1) : line, type: 'unchanged' },
      right: { num: rightNum, content: line.startsWith(' ') ? line.substring(1) : line, type: 'unchanged' },
    });
    i++;
  }

  return result;
}

function SideBySideDiffView({ patch, filename }: { patch: string; filename: string }) {
  const rows = useMemo(() => parsePatchToSideBySide(patch), [patch]);

  const { leftLines, rightLines } = useMemo(() => {
    const left: string[] = [];
    const right: string[] = [];
    for (const row of rows) {
      left.push(row.left.content || '');
      right.push(row.right.content || '');
    }
    return { leftLines: left, rightLines: right };
  }, [rows]);

  const leftHighlighted = useDiffHighlight(leftLines, filename);
  const rightHighlighted = useDiffHighlight(rightLines, filename);

  return (
    <div className="select-text overflow-hidden">
      <table className="w-full font-mono text-[11px] leading-[1.6] border-collapse table-fixed">
        <tbody>
          {rows.map((row, i) => {
            const leftTokens = leftHighlighted?.[i];
            const rightTokens = rightHighlighted?.[i];
            const isLeftHunk = row.left.content.startsWith('@@');

            return (
              <tr key={i}>
                {/* Left side (old) */}
                <td className="w-8 min-w-8 text-right pr-2 select-none text-muted-foreground/30 align-top border-r border-border/20">
                  {row.left.num ?? ''}
                </td>
                <td
                  className={cn(
                    'px-2 whitespace-pre-wrap break-all border-r border-border/30 w-[calc(50%-2rem)]',
                    row.left.type === 'deleted' && 'bg-red-500/10',
                    row.left.type === 'empty' && 'bg-muted/5',
                    row.left.type === 'unchanged' && 'text-muted-foreground/60',
                  )}
                >
                  {isLeftHunk ? (
                    <span className="text-blue-500/60 text-[10px]">{row.left.content}</span>
                  ) : leftTokens && row.left.content ? (
                    <span dangerouslySetInnerHTML={{ __html: renderHighlightedLine(leftTokens, row.left.content) }} />
                  ) : (
                    <span className={cn(row.left.type === 'deleted' && 'text-red-600 dark:text-red-400')}>
                      {row.left.content || ' '}
                    </span>
                  )}
                </td>
                {/* Right side (new) */}
                <td className="w-8 min-w-8 text-right pr-2 select-none text-muted-foreground/30 align-top border-r border-border/20">
                  {row.right.num ?? ''}
                </td>
                <td
                  className={cn(
                    'px-2 whitespace-pre-wrap break-all w-[calc(50%-2rem)]',
                    row.right.type === 'added' && 'bg-emerald-500/10',
                    row.right.type === 'empty' && 'bg-muted/5',
                    row.right.type === 'unchanged' && 'text-muted-foreground/60',
                  )}
                >
                  {rightTokens && row.right.content ? (
                    <span dangerouslySetInnerHTML={{ __html: renderHighlightedLine(rightTokens, row.right.content) }} />
                  ) : (
                    <span className={cn(row.right.type === 'added' && 'text-emerald-600 dark:text-emerald-400')}>
                      {row.right.content || ' '}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// OcEditToolView
// ============================================================================

export function OcEditToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const filePath = (args.filePath as string) || (args.target_filepath as string) || '';
  const ocState = args._oc_state as any;

  const { openFile, toDisplayPath } = useOcFileOpen();

  const displayPath = toDisplayPath(filePath);
  const filename = getFilename(displayPath);
  const dir = getDirectory(displayPath);

  // Extract diff info from metadata
  const metadata = ocState?.metadata || {};
  const filediff = metadata?.filediff;
  const additions = filediff?.additions;
  const deletions = filediff?.deletions;

  const isError = toolResult?.success === false || !!toolResult?.error;

  // View mode: unified or split (side-by-side)
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('split');

  // Build diff patch from before/after or oldString/newString
  const { patch, hasDiff } = useMemo(() => {
    const before = filediff?.before ?? (args.oldString as string) ?? '';
    const after = filediff?.after ?? (args.newString as string) ?? '';

    if (before || after) {
      const patchText = createTwoFilesPatch(
        displayPath || 'file',
        displayPath || 'file',
        String(before),
        String(after),
        '',
        '',
      );
      return { patch: patchText, hasDiff: true, before: String(before), after: String(after) };
    }

    return { patch: '', hasDiff: false, before: '', after: '' };
  }, [filediff?.before, filediff?.after, args.oldString, args.newString, displayPath]);

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title="Editing File"
        subtitle={filename}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle
            icon={FileCode2}
            title={filename || 'Edit File'}
            subtitle={dir}
            onTitleClick={filePath ? () => openFile(filePath) : undefined}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {(additions != null || deletions != null) && (
              <div className="flex items-center gap-2 text-xs">
                {additions != null && (
                  <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <Plus className="h-3 w-3" />
                    {additions}
                  </span>
                )}
                {deletions != null && (
                  <span className="flex items-center gap-0.5 text-muted-foreground">
                    <Minus className="h-3 w-3" />
                    {deletions}
                  </span>
                )}
              </div>
            )}
            {/* View mode toggle */}
            {hasDiff && (
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => setViewMode('unified')}
                  className={cn(
                    'p-1 rounded transition-colors cursor-pointer',
                    viewMode === 'unified'
                      ? 'text-foreground bg-muted/60'
                      : 'text-muted-foreground/40 hover:text-muted-foreground',
                  )}
                  title="Unified view"
                >
                  <Rows2 className="size-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={cn(
                    'p-1 rounded transition-colors cursor-pointer',
                    viewMode === 'split'
                      ? 'text-foreground bg-muted/60'
                      : 'text-muted-foreground/40 hover:text-muted-foreground',
                  )}
                  title="Side-by-side view"
                >
                  <Columns2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          {hasDiff ? (
            <div className="bg-muted/30">
              {viewMode === 'split' ? (
                <SideBySideDiffView patch={patch} filename={displayPath || 'file'} />
              ) : (
                <DiffLinesView patch={patch} filename={displayPath || 'file'} />
              )}
            </div>
          ) : (
            <div className="p-3">
              <div className="text-sm text-muted-foreground">
                File edited: <span className="font-mono text-foreground">{displayPath}</span>
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
            <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 py-0.5 bg-muted">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Saved
            </Badge>
          )
        )}
      </ToolViewFooter>
    </Card>
  );
}
