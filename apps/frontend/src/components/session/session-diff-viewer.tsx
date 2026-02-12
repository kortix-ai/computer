'use client';

import React, { useState, useMemo } from 'react';
import {
  FileCode2,
  FilePlus2,
  FileX2,
  FileEdit,
  ChevronRight,
  ChevronDown,
  GitCompareArrows,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenCodeSessionDiff } from '@/hooks/opencode/use-opencode-sessions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createTwoFilesPatch } from 'diff';
import type { FileDiff } from '@/ui/types';

// ============================================================================
// Diff line renderer
// ============================================================================

function DiffLines({ patch }: { patch: string }) {
  const lines = patch.split('\n');
  // Skip the first 4 header lines from createTwoFilesPatch
  const diffLines = lines.slice(4);

  return (
    <pre className="p-3 font-mono text-[11px] leading-[1.6] overflow-x-auto select-text">
      {diffLines.map((line, i) => {
        let cls = 'text-muted-foreground/60';
        if (line.startsWith('+')) cls = 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5';
        else if (line.startsWith('-')) cls = 'text-red-600 dark:text-red-400 bg-red-500/5';
        else if (line.startsWith('@@')) cls = 'text-blue-500/60 text-[10px]';
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        );
      })}
    </pre>
  );
}

// ============================================================================
// Single file diff card
// ============================================================================

function FileDiffCard({ diff }: { diff: FileDiff }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = useMemo(() => {
    switch (diff.status) {
      case 'added': return <FilePlus2 className="size-3.5 text-emerald-500" />;
      case 'deleted': return <FileX2 className="size-3.5 text-red-500" />;
      default: return <FileEdit className="size-3.5 text-blue-500" />;
    }
  }, [diff.status]);

  const statusLabel = useMemo(() => {
    switch (diff.status) {
      case 'added': return 'Added';
      case 'deleted': return 'Deleted';
      default: return 'Modified';
    }
  }, [diff.status]);

  const statusColor = useMemo(() => {
    switch (diff.status) {
      case 'added': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'deleted': return 'text-red-600 dark:text-red-400 bg-red-500/10';
      default: return 'text-blue-600 dark:text-blue-400 bg-blue-500/10';
    }
  }, [diff.status]);

  const patch = useMemo(() => {
    if (!diff.before && !diff.after) return '';
    return createTwoFilesPatch(
      diff.file, diff.file,
      diff.before || '', diff.after || '',
      '', '',
    );
  }, [diff.file, diff.before, diff.after]);

  const hasDiffContent = patch.length > 0;
  const filename = diff.file.split('/').pop() || diff.file;
  const directory = diff.file.includes('/') ? diff.file.substring(0, diff.file.lastIndexOf('/')) : '';

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden bg-card">
      {/* File header */}
      <button
        onClick={() => hasDiffContent && setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-left transition-colors',
          hasDiffContent && 'hover:bg-muted/40 cursor-pointer',
          !hasDiffContent && 'cursor-default',
        )}
      >
        {hasDiffContent && (
          expanded
            ? <ChevronDown className="size-3 text-muted-foreground/50 flex-shrink-0" />
            : <ChevronRight className="size-3 text-muted-foreground/50 flex-shrink-0" />
        )}
        {!hasDiffContent && <span className="w-3" />}

        {statusIcon}

        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
          <span className="text-xs font-medium text-foreground truncate">{filename}</span>
          {directory && (
            <span className="text-[10px] text-muted-foreground/50 truncate hidden sm:inline">
              {directory}
            </span>
          )}
        </div>

        {/* Status badge */}
        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', statusColor)}>
          {statusLabel}
        </span>

        {/* Addition/deletion counts */}
        <span className="flex items-center gap-1.5 text-[10px] whitespace-nowrap flex-shrink-0">
          {diff.additions > 0 && <span className="text-emerald-500">+{diff.additions}</span>}
          {diff.deletions > 0 && <span className="text-red-500">-{diff.deletions}</span>}
        </span>
      </button>

      {/* Expanded diff content */}
      {expanded && hasDiffContent && (
        <div className="border-t border-border/40 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-hidden">
          <DiffLines patch={patch} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Summary bar
// ============================================================================

function DiffSummaryBar({ diffs }: { diffs: FileDiff[] }) {
  const totals = useMemo(() => {
    let additions = 0, deletions = 0, added = 0, deleted = 0, modified = 0;
    for (const d of diffs) {
      additions += d.additions;
      deletions += d.deletions;
      if (d.status === 'added') added++;
      else if (d.status === 'deleted') deleted++;
      else modified++;
    }
    return { additions, deletions, added, deleted, modified };
  }, [diffs]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 bg-muted/20">
      <span className="text-xs text-muted-foreground">
        {diffs.length} {diffs.length === 1 ? 'file' : 'files'} changed
      </span>
      <div className="flex items-center gap-2 ml-auto text-[10px]">
        {totals.added > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <FilePlus2 className="size-3" /> {totals.added}
          </span>
        )}
        {totals.modified > 0 && (
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <FileEdit className="size-3" /> {totals.modified}
          </span>
        )}
        {totals.deleted > 0 && (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <FileX2 className="size-3" /> {totals.deleted}
          </span>
        )}
        <span className="text-muted-foreground/50 mx-1">|</span>
        {totals.additions > 0 && <span className="text-emerald-500">+{totals.additions}</span>}
        {totals.deletions > 0 && <span className="text-red-500 ml-1">-{totals.deletions}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// Main SessionDiffViewer
// ============================================================================

interface SessionDiffViewerProps {
  sessionId: string;
}

export function SessionDiffViewer({ sessionId }: SessionDiffViewerProps) {
  const { data: diffs, isLoading, error } = useOpenCodeSessionDiff(sessionId);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <GitCompareArrows className="size-4 text-muted-foreground/40" />
          <span className="text-xs font-medium text-muted-foreground">Changes</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4">
                <div className="h-3 w-3 bg-muted/30 rounded animate-pulse" />
                <div className="h-3 bg-muted/20 rounded animate-pulse" style={{ width: 120 + i * 40 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <GitCompareArrows className="size-4 text-muted-foreground/40" />
          <span className="text-xs font-medium text-muted-foreground">Changes</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-xs text-muted-foreground">Failed to load changes</p>
        </div>
      </div>
    );
  }

  if (!diffs || diffs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <GitCompareArrows className="size-4 text-muted-foreground/40" />
          <span className="text-xs font-medium text-muted-foreground">Changes</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <FileCode2 className="size-8 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No changes yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            File changes will appear here as the session progresses
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DiffSummaryBar diffs={diffs} />
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {diffs.map((diff, i) => (
            <FileDiffCard key={`${diff.file}-${i}`} diff={diff} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
