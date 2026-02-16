'use client';

import React, { useMemo, useState } from 'react';
import {
  Search,
  CheckCircle,
  AlertCircle,
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
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

function getFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getDirectory(path: string): string {
  const idx = path.lastIndexOf('/');
  if (idx < 0) return '';
  return path.substring(0, idx);
}

/** Try to parse the output into a list of file paths (one per line) */
function parseFilePaths(output: string): string[] | null {
  if (!output) return null;
  const lines = output
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const pathLike = lines.filter(
    (l) => l.startsWith('/') || l.startsWith('./') || l.startsWith('~'),
  );
  if (pathLike.length >= lines.length * 0.7) {
    return pathLike;
  }
  return null;
}

interface GrepMatch {
  line: number;
  content: string;
}

interface GrepFileGroup {
  filePath: string;
  matches: GrepMatch[];
}

/** Parse grep output into structured file groups.
 *  Handles both single-newline and double-newline separated entries.
 *  Format: `/path/to/file: Line N: content Line N: content`
 */
function parseGrepOutput(
  output: string,
): { matchCount: number; groups: GrepFileGroup[] } | null {
  if (!output) return null;

  const text = String(output).trim();

  // Check for "Found N matches" header
  const headerMatch = text.match(/^Found\s+(\d+)\s+match[^\n]*/i);
  const matchCount = headerMatch ? parseInt(headerMatch[1], 10) : 0;

  // Remove the header line if present
  const body = headerMatch ? text.slice(headerMatch[0].length).trim() : text;
  if (!body) return null;

  const groups: GrepFileGroup[] = [];

  // Strategy: scan line-by-line. Each line starting with `/...path...:` begins a new file group.
  // Within a file group, extract "Line N: content" entries.
  const lines = body.split('\n');
  let currentFile: string | null = null;
  let currentContent = '';

  const flushGroup = () => {
    if (!currentFile || !currentContent) return;
    const matches: GrepMatch[] = [];
    // Split by "Line N:" occurrences
    const parts = currentContent.split(/(?=Line\s+\d+:)/g);
    for (const part of parts) {
      const lm = part.match(/^Line\s+(\d+):\s*([\s\S]*)/);
      if (lm) {
        const content = lm[2].trim().replace(/;$/, '');
        if (content) {
          matches.push({ line: parseInt(lm[1], 10), content });
        }
      }
    }
    if (matches.length > 0) {
      groups.push({ filePath: currentFile, matches });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line starts a new file entry (absolute path followed by `: Line N:`)
    const fileMatch = trimmed.match(/^(\/[^:]+?):\s*(Line\s+\d+:[\s\S]*)?$/);
    if (fileMatch) {
      // Flush previous group
      flushGroup();
      currentFile = fileMatch[1];
      currentContent = fileMatch[2] || '';
    } else if (currentFile) {
      // Continuation line — append to current content
      currentContent += ' ' + trimmed;
    }
  }
  // Flush last group
  flushGroup();

  if (groups.length === 0) return null;
  return {
    matchCount:
      matchCount || groups.reduce((sum, g) => sum + g.matches.length, 0),
    groups,
  };
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
  const include = (args.include as string) || '';
  const output = toolResult?.output || ocState?.output || '';

  const { openFile, openFileWithList, toDisplayPath } = useOcFileOpen();

  const toolLabel =
    ocTool === 'glob'
      ? 'Search Files'
      : ocTool === 'grep'
        ? 'Search Content'
        : ocTool === 'list'
          ? 'List Directory'
          : 'Search';

  // Build subtitle from available args
  const subtitleParts: string[] = [];
  if (pattern) subtitleParts.push(`pattern=${pattern}`);
  if (include) subtitleParts.push(`include=${include}`);
  if (path) subtitleParts.push(path);
  const subtitle = subtitleParts.join('  ') || undefined;

  const isError = toolResult?.success === false || !!toolResult?.error;

  // Try to parse output as file paths for glob/list tools
  const filePaths = useMemo(() => {
    if (ocTool === 'grep') return null;
    return parseFilePaths(String(output));
  }, [output, ocTool]);

  // Try to parse grep output into structured groups
  const grepResult = useMemo(() => {
    if (ocTool !== 'grep') return null;
    return parseGrepOutput(String(output));
  }, [output, ocTool]);

  const resultCount = filePaths?.length ?? grepResult?.matchCount ?? null;

  if (isStreaming && !toolResult) {
    return (
      <LoadingState
        title={toolLabel}
        subtitle={subtitle}
      />
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-muted/50 backdrop-blur-sm border-b p-2 px-4 space-y-2 overflow-hidden">
        <div className="flex flex-row items-center justify-between min-w-0 overflow-hidden">
          <ToolViewIconTitle
            icon={Search}
            title={toolLabel}
            subtitle={subtitle}
          />
          {resultCount != null && resultCount > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
              {filePaths
                ? `${resultCount} file${resultCount !== 1 ? 's' : ''}`
                : `${resultCount} match${resultCount !== 1 ? 'es' : ''}`}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          {filePaths && filePaths.length > 0 ? (
            <FilePathList
              paths={filePaths}
              toDisplayPath={toDisplayPath}
              onFileClick={(fp) => openFileWithList(fp, filePaths)}
            />
          ) : grepResult ? (
            <GrepResultList
              groups={grepResult.groups}
              toDisplayPath={toDisplayPath}
              onFileClick={(fp) => openFile(fp)}
            />
          ) : output ? (
            <div className="p-3">
              <UnifiedMarkdown content={String(output)} isStreaming={false} />
            </div>
          ) : (
            <div className="p-3">
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
        {!isStreaming &&
          (isError ? (
            <Badge
              variant="outline"
              className="h-6 py-0.5 bg-muted text-muted-foreground"
            >
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-6 py-0.5 bg-muted"
            >
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Done
            </Badge>
          ))}
      </ToolViewFooter>
    </Card>
  );
}

/* ---------- File path list (glob / list) ---------- */

function FilePathList({
  paths,
  toDisplayPath,
  onFileClick,
}: {
  paths: string[];
  toDisplayPath: (p: string) => string;
  onFileClick: (path: string) => void;
}) {
  return (
    <div className="py-1">
      {paths.map((fp, i) => {
        const dp = toDisplayPath(fp);
        const name = getFilename(dp);
        const dir = getDirectory(dp);

        return (
          <div
            key={i}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-muted transition-colors group"
            onClick={() => onFileClick(fp)}
            title={dp}
          >
            <FileText className="h-3.5 w-3.5 text-amber-500/70 dark:text-amber-400/70 flex-shrink-0 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" />
            <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0">
                {name}
              </span>
              {dir && (
                <span className="text-muted-foreground/40 truncate text-[11px]">
                  {dir}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Grep result list ---------- */

function GrepResultList({
  groups,
  toDisplayPath,
  onFileClick,
}: {
  groups: GrepFileGroup[];
  toDisplayPath: (p: string) => string;
  onFileClick: (path: string) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    groups.length === 1 ? 0 : null,
  );

  return (
    <div className="py-1.5 px-3 space-y-1.5">
      {groups.map((group, i) => {
        const dp = toDisplayPath(group.filePath);
        const name = getFilename(dp);
        const dir = getDirectory(dp);
        const isExpanded = expandedIndex === i;

        return (
          <div
            key={i}
            className="rounded-lg border border-border overflow-hidden bg-card"
          >
            {/* File header row */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted transition-colors group"
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <FileText className="h-3.5 w-3.5 text-amber-500/70 dark:text-amber-400/70 flex-shrink-0" />
              <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden flex-1">
                <span
                  className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0 cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileClick(group.filePath);
                  }}
                  title={dp}
                >
                  {name}
                </span>
                {dir && (
                  <span className="text-muted-foreground/40 truncate text-[11px]">
                    {dir}
                  </span>
                )}
              </span>
              <Badge
                variant="outline"
                className="h-5 py-0 text-[10px] flex-shrink-0 text-muted-foreground"
              >
                {group.matches.length}
              </Badge>
            </div>

            {/* Expanded match list */}
            {isExpanded && (
              <div className="border-t border-border">
                {group.matches.map((match, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-0 border-b last:border-b-0 border-border/60"
                  >
                    <span className="text-[11px] font-mono text-amber-600/70 dark:text-amber-400/50 w-12 text-right pr-3 py-1.5 flex-shrink-0 select-none">
                      {match.line}
                    </span>
                    <span className="text-[11px] font-mono text-foreground/80 py-1.5 pr-3 break-all leading-relaxed">
                      {match.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
