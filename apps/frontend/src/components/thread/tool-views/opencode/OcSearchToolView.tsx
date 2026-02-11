'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle, AlertCircle, FileText, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { UnifiedMarkdown } from '@/components/markdown/unified-markdown';
import { getClient } from '@/lib/opencode-sdk';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';

/** Module-level worktree cache — survives re-renders & re-mounts */
let _worktreeCache: string | null = null;

/** Strip worktree prefix from an absolute path → project-relative */
function toRelative(absPath: string, worktree: string): string {
  if (!worktree || worktree === '/') return absPath;
  const prefix = worktree.endsWith('/') ? worktree : worktree + '/';
  if (absPath.startsWith(prefix)) return absPath.slice(prefix.length);
  if (absPath === worktree) return '.';
  return absPath;
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

/** Try to parse the output into a list of file paths (one per line) */
function parseFilePaths(output: string): string[] | null {
  if (!output) return null;
  const lines = output.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const pathLike = lines.filter((l) => l.startsWith('/') || l.startsWith('./') || l.startsWith('~'));
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

/** Parse grep output into structured file groups */
function parseGrepOutput(output: string): { matchCount: number; groups: GrepFileGroup[] } | null {
  if (!output) return null;

  const text = String(output).trim();

  // Check for "Found N matches" header
  const headerMatch = text.match(/^Found\s+(\d+)\s+match/i);
  const matchCount = headerMatch ? parseInt(headerMatch[1], 10) : 0;

  // Remove the header line if present
  const body = headerMatch ? text.slice(headerMatch[0].length).trim() : text;
  if (!body) return null;

  const groups: GrepFileGroup[] = [];

  // Split into blocks by file path. Each block starts with an absolute path followed by ":"
  const blocks = body.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Try to extract file path from the start of the block
    const fileMatch = trimmed.match(/^(\/[^:]+?):\s*/);
    if (!fileMatch) continue;

    const filePath = fileMatch[1];
    const rest = trimmed.slice(fileMatch[0].length);

    // Extract "Line N: content" entries
    const matches: GrepMatch[] = [];
    const lineRegex = /Line\s+(\d+):\s*(.*?)(?=\s*(?:Line\s+\d+:|$))/gs;
    let m: RegExpExecArray | null;
    while ((m = lineRegex.exec(rest)) !== null) {
      matches.push({
        line: parseInt(m[1], 10),
        content: m[2].trim().replace(/;$/, ''),
      });
    }

    if (matches.length > 0) {
      groups.push({ filePath, matches });
    }
  }

  if (groups.length === 0) return null;
  return { matchCount: matchCount || groups.reduce((sum, g) => sum + g.matches.length, 0), groups };
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
  const [worktree, setWorktree] = useState<string | null>(_worktreeCache);

  // Fetch worktree directly from the SDK on mount
  useEffect(() => {
    if (_worktreeCache) {
      setWorktree(_worktreeCache);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const client = getClient();
        const res = await client.path.get();
        const pathData = res.data;
        console.log('[OcSearchToolView] path.get() full response:', JSON.stringify(pathData));
        if (!cancelled && pathData) {
          // Try worktree first, fall back to directory
          const wt = pathData.worktree || pathData.directory || '';
          if (wt) {
            _worktreeCache = wt;
            setWorktree(wt);
            console.log('[OcSearchToolView] Using path:', wt);
          }
        }
      } catch (err) {
        console.error('[OcSearchToolView] Failed to fetch path info:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Convert absolute path → relative for display */
  const toDisplayPath = (absPath: string): string => {
    if (!absPath || !absPath.startsWith('/')) return absPath;
    if (worktree) return toRelative(absPath, worktree);
    return absPath;
  };

  /** Fetch worktree on-demand (for click handlers) */
  const fetchWorktree = async (): Promise<string | null> => {
    let wt = worktree || _worktreeCache;
    if (wt) return wt;
    try {
      const client = getClient();
      const res = await client.path.get();
      const pathData = res.data;
      console.log('[OcSearchToolView] on-demand path.get():', JSON.stringify(pathData));
      wt = pathData?.worktree || pathData?.directory || '';
      if (wt) {
        _worktreeCache = wt;
        setWorktree(wt);
      }
      return wt || null;
    } catch (err) {
      console.error('[OcSearchToolView] Failed to fetch worktree on click:', err);
      return null;
    }
  };

  /** Open a file — resolve to relative path first */
  const handleOpenFile = async (filePath: string) => {
    if (!filePath.startsWith('/')) {
      openFileInComputer(filePath);
      return;
    }
    const wt = await fetchWorktree();
    const resolved = wt ? toRelative(filePath, wt) : filePath;
    console.log('[OcSearchToolView] openFile wt=' + wt, filePath, '→', resolved);
    openFileInComputer(resolved);
  };

  /** Open a file with navigation list */
  const handleOpenFileWithList = async (filePath: string, allPaths: string[]) => {
    if (!filePath.startsWith('/')) {
      openFileInComputer(filePath, allPaths);
      return;
    }
    const wt = await fetchWorktree();
    if (wt) {
      const resolved = toRelative(filePath, wt);
      const resolvedList = allPaths.map((p) => toRelative(p, wt));
      console.log('[OcSearchToolView] openFileWithList wt=' + wt, filePath, '→', resolved);
      openFileInComputer(resolved, resolvedList);
    } else {
      console.log('[OcSearchToolView] openFileWithList NO worktree, using absolute:', filePath);
      openFileInComputer(filePath, allPaths);
    }
  };

  const toolLabel = ocTool === 'glob' ? 'Search Files'
    : ocTool === 'grep' ? 'Search Content'
    : ocTool === 'list' ? 'List Directory'
    : 'Search';

  const subtitle = pattern || path || undefined;

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

  const resultCount = filePaths?.length
    ?? grepResult?.matchCount
    ?? null;

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
          {resultCount != null && resultCount > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {filePaths
                ? `${resultCount} file${resultCount !== 1 ? 's' : ''}`
                : `${resultCount} match${resultCount !== 1 ? 'es' : ''}`
              }
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
              onFileClick={(fp) => handleOpenFileWithList(fp, filePaths)}
            />
          ) : grepResult ? (
            <GrepResultList
              groups={grepResult.groups}
              toDisplayPath={toDisplayPath}
              onFileClick={(fp) => handleOpenFile(fp)}
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
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group"
            onClick={() => onFileClick(fp)}
            title={dp}
          >
            <FileText className="h-3.5 w-3.5 text-amber-500/70 dark:text-amber-400/70 flex-shrink-0 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" />
            <span className="text-xs min-w-0 flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-foreground font-medium font-mono whitespace-nowrap flex-shrink-0">{name}</span>
              {dir && <span className="text-muted-foreground/40 truncate text-[11px]">{dir}</span>}
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
    groups.length === 1 ? 0 : null
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
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950"
          >
            {/* File header row */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group"
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
                  onClick={(e) => { e.stopPropagation(); onFileClick(group.filePath); }}
                  title={dp}
                >
                  {name}
                </span>
                {dir && <span className="text-muted-foreground/40 truncate text-[11px]">{dir}</span>}
              </span>
              <Badge variant="outline" className="h-5 py-0 text-[10px] flex-shrink-0 text-muted-foreground">
                {group.matches.length}
              </Badge>
            </div>

            {/* Expanded match list */}
            {isExpanded && (
              <div className="border-t border-zinc-200 dark:border-zinc-800">
                {group.matches.map((match, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-0 border-b last:border-b-0 border-zinc-100 dark:border-zinc-800/60"
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
