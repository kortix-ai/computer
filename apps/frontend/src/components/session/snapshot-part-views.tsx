'use client';

import { useState, useMemo } from 'react';
import {
  GitCommitHorizontal,
  FileCode2,
  ChevronDown,
  ChevronRight,
  FileEdit,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { SnapshotPart, PatchPart } from '@/ui/types';

// ============================================================================
// OcSnapshotPartView — collapsible metadata card for snapshot parts
// ============================================================================

interface OcSnapshotPartViewProps {
  part: SnapshotPart;
  onViewDiff?: (snapshotHash: string) => void;
}

export function OcSnapshotPartView({ part, onViewDiff }: OcSnapshotPartViewProps) {
  const [copied, setCopied] = useState(false);
  const shortHash = part.snapshot.slice(0, 8);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(part.snapshot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
        'bg-muted/20 border border-border/40',
        'text-xs select-none max-w-full',
      )}
    >
      <GitCommitHorizontal className="size-3.5 text-blue-500/70 flex-shrink-0" />
      <span className="text-muted-foreground font-medium">Snapshot</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/60 font-mono text-[11px] text-muted-foreground transition-colors cursor-pointer"
            >
              {shortHash}
              {copied ? (
                <Check className="size-2.5 text-emerald-500" />
              ) : (
                <Copy className="size-2.5 opacity-50" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p>{copied ? 'Copied!' : 'Copy full hash'}</p>
            {!copied && <p className="text-muted-foreground font-mono text-[10px]">{part.snapshot}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {onViewDiff && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewDiff(part.snapshot);
          }}
          className="ml-auto px-2 py-0.5 rounded text-[11px] font-medium text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
        >
          View diff
        </button>
      )}
    </div>
  );
}

// ============================================================================
// OcPatchPartView — collapsible card showing files changed + expandable diff
// ============================================================================

interface OcPatchPartViewProps {
  part: PatchPart;
  sessionId?: string;
  onViewDiff?: (patchHash: string) => void;
}

export function OcPatchPartView({ part, onViewDiff }: OcPatchPartViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const shortHash = part.hash.slice(0, 8);
  const fileCount = part.files.length;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(part.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Guess file status from name patterns (heuristic since PatchPart doesn't provide status)
  const fileEntries = useMemo(() => {
    return part.files.map((file) => {
      const filename = file.split('/').pop() || file;
      return { path: file, filename };
    });
  }, [part.files]);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
            'bg-muted/20 hover:bg-muted/40 border border-border/40',
            'text-xs cursor-pointer transition-colors select-none max-w-full group',
          )}
        >
          {expanded ? (
            <ChevronDown className="size-3 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground flex-shrink-0" />
          )}
          <FileCode2 className="size-3.5 text-amber-500/70 flex-shrink-0" />
          <span className="text-muted-foreground font-medium">Patch</span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/60 font-mono text-[11px] text-muted-foreground transition-colors cursor-pointer"
                >
                  {shortHash}
                  {copied ? (
                    <Check className="size-2.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-2.5 opacity-50" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>{copied ? 'Copied!' : 'Copy full hash'}</p>
                {!copied && <p className="text-muted-foreground font-mono text-[10px]">{part.hash}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-muted-foreground/70">
            {fileCount} file{fileCount !== 1 ? 's' : ''} changed
          </span>
          {onViewDiff && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDiff(part.hash);
              }}
              className="ml-auto px-2 py-0.5 rounded text-[11px] font-medium text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
            >
              View diff
            </button>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
			<div className="mt-1 ml-5 pl-3 border-l border-border/40 space-y-0.5 py-1">
				{fileEntries.map((entry) => (
					<div key={entry.path} className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-muted-foreground">
						<FileEdit className="size-3 text-blue-400/60 flex-shrink-0" />
						<span className="font-mono truncate" title={entry.path}>
							{entry.path}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// SnapshotTimelineEntry — used in the Snapshots dialog timeline
// ============================================================================

export interface SnapshotTimelineItem {
  id: string;
  type: 'snapshot' | 'patch';
  messageId: string;
  /** For snapshot parts */
  snapshotHash?: string;
  /** For patch parts */
  patchHash?: string;
  files?: string[];
  /** Timestamp derived from parent message */
  timestamp?: number;
  /** Turn index (1-based) for display */
  turnIndex?: number;
}

interface SnapshotTimelineEntryProps {
  item: SnapshotTimelineItem;
  isLast: boolean;
  onViewDiff?: (hash: string) => void;
}

export function SnapshotTimelineEntry({ item, isLast, onViewDiff }: SnapshotTimelineEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const hash = item.snapshotHash || item.patchHash || '';
  const shortHash = hash.slice(0, 8);
  const fileCount = item.files?.length ?? 0;

  const formattedTime = useMemo(() => {
    if (!item.timestamp) return '';
    const d = new Date(item.timestamp);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [item.timestamp]);

  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[9px] top-[22px] bottom-0 w-px bg-border/50" />
      )}

      {/* Dot */}
      <div className="relative z-10 flex-shrink-0 mt-1.5">
        <div
          className={cn(
            'size-[18px] rounded-full flex items-center justify-center border-2',
            item.type === 'snapshot'
              ? 'border-blue-500/50 bg-blue-500/10'
              : 'border-amber-500/50 bg-amber-500/10',
          )}
        >
          {item.type === 'snapshot' ? (
            <GitCommitHorizontal className="size-2.5 text-blue-500" />
          ) : (
            <FileCode2 className="size-2.5 text-amber-500" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground">
            {item.type === 'snapshot' ? 'Snapshot' : 'Patch'}
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
            {shortHash}
          </span>
          {item.turnIndex != null && (
            <span className="text-[10px] text-muted-foreground/60">
              Turn {item.turnIndex}
            </span>
          )}
          {formattedTime && (
            <span className="text-[10px] text-muted-foreground/50">
              {formattedTime}
            </span>
          )}
        </div>

        {item.type === 'patch' && fileCount > 0 && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
                {fileCount} file{fileCount !== 1 ? 's' : ''} changed
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
				<div className="mt-1 space-y-0.5">
					{item.files!.map((file) => (
						<div key={file} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 font-mono pl-1">
							<FileEdit className="size-2.5 text-blue-400/50 flex-shrink-0" />
							<span className="truncate">{file}</span>
						</div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {onViewDiff && hash && (
          <button
            onClick={() => onViewDiff(hash)}
            className="mt-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-blue-500 hover:bg-blue-500/10 border border-blue-500/20 transition-colors cursor-pointer"
          >
            View diff
          </button>
        )}
      </div>
    </div>
  );
}
