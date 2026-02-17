'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  GitCommitHorizontal,
  History,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useOpenCodeMessages } from '@/hooks/opencode/use-opencode-sessions';
import {
  useOpenCodeConfig,
  useUpdateOpenCodeConfig,
} from '@/hooks/opencode/use-opencode-config';
import type { Config } from '@/hooks/opencode/use-opencode-config';
import {
  type SnapshotTimelineItem,
  SnapshotTimelineEntry,
} from '@/components/session/snapshot-part-views';
import { SessionDiffViewer } from '@/components/session/session-diff-viewer';
import type { MessageWithParts } from '@/ui/types';
import { toast } from '@/lib/toast';

// ============================================================================
// Extract snapshot/patch timeline items from session messages
// ============================================================================

function extractSnapshotTimeline(messages: MessageWithParts[] | undefined): SnapshotTimelineItem[] {
  if (!messages) return [];

  const items: SnapshotTimelineItem[] = [];
  let turnIndex = 0;

  for (const msg of messages) {
    if (msg.info.role === 'user') {
      turnIndex++;
      continue;
    }

    const timestamp = msg.info.role === 'assistant'
      ? (msg.info as any).time?.created
      : undefined;

    for (const part of msg.parts) {
      if (part.type === 'snapshot') {
        items.push({
          id: part.id,
          type: 'snapshot',
          messageId: part.messageID,
          snapshotHash: (part as any).snapshot,
          timestamp,
          turnIndex,
        });
      } else if (part.type === 'patch') {
        items.push({
          id: part.id,
          type: 'patch',
          messageId: part.messageID,
          patchHash: (part as any).hash,
          files: (part as any).files,
          timestamp,
          turnIndex,
        });
      }
    }
  }

  return items;
}

// ============================================================================
// SnapshotTimeline — main timeline view
// ============================================================================

interface SnapshotTimelineProps {
  sessionId: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

function SnapshotTimeline({ sessionId, isFullscreen, onToggleFullscreen }: SnapshotTimelineProps) {
  const { data: messages, isLoading } = useOpenCodeMessages(sessionId);
  const { data: config } = useOpenCodeConfig();
  const updateConfig = useUpdateOpenCodeConfig();
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const snapshotEnabled = config?.snapshot === true;

  const handleEnableSnapshots = useCallback(() => {
    updateConfig.mutate({ snapshot: true } as Partial<Config>, {
      onSuccess: () => toast.success('Snapshots enabled'),
      onError: (err) => toast.error(`Failed to enable snapshots: ${err.message}`),
    });
  }, [updateConfig]);

  const timelineItems = useMemo(
    () => extractSnapshotTimeline(messages),
    [messages],
  );

  // When a hash is selected, show the session diff viewer for that snapshot
  if (selectedHash) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-5 py-3 pr-12 border-b border-border/40">
          <button
            onClick={() => setSelectedHash(null)}
            className="text-xs text-blue-500 hover:text-blue-400 transition-colors cursor-pointer"
          >
            Back to timeline
          </button>
          <span className="text-xs text-muted-foreground/50">|</span>
          <span className="font-mono text-[10px] text-muted-foreground">{selectedHash.slice(0, 12)}</span>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="ml-auto p-1 rounded hover:bg-muted/40 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5 text-muted-foreground" />
              ) : (
                <Maximize2 className="size-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <SessionDiffViewer
            sessionId={sessionId}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-5 py-4 pr-12 border-b border-border/40">
          <History className="size-4 text-muted-foreground/40" />
          <span className="text-xs font-medium text-muted-foreground">Snapshots</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5">
                <div className="h-3 w-3 bg-muted/30 rounded-full animate-pulse" />
                <div className="h-3 bg-muted/20 rounded animate-pulse" style={{ width: 120 + i * 40 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state: different message depending on whether snapshots are enabled
  if (timelineItems.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 pr-12 border-b border-border/40">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground/40" />
            <span className="text-xs font-medium text-muted-foreground">Snapshots</span>
          </div>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1 rounded hover:bg-muted/40 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5 text-muted-foreground" />
              ) : (
                <Maximize2 className="size-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 min-h-[200px]">
          <GitCommitHorizontal className="size-10 text-muted-foreground/20 mb-4" />
          {snapshotEnabled ? (
            <>
              <p className="text-base text-muted-foreground">No snapshots yet</p>
              <p className="text-sm text-muted-foreground/50 mt-1.5">
                Snapshots are enabled. They will appear here as the agent makes changes during this session.
              </p>
            </>
          ) : (
            <>
              <p className="text-base text-muted-foreground">Snapshots are disabled</p>
              <p className="text-sm text-muted-foreground/50 mt-1.5 max-w-sm">
                Enable snapshots to create a git snapshot at each agentic step, so you can review the full evolution of file changes.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={handleEnableSnapshots}
                disabled={updateConfig.isPending}
              >
                {updateConfig.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <GitCommitHorizontal className="size-3.5" />
                )}
                Enable Snapshots
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 pr-12 border-b border-border/40">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground/60" />
          <span className="text-xs font-medium text-muted-foreground">Snapshots</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground/70 font-medium">
            {timelineItems.length}
          </span>
        </div>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="p-1 rounded hover:bg-muted/40 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="size-3.5 text-muted-foreground" />
            ) : (
              <Maximize2 className="size-3.5 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-5">
          {timelineItems.map((item, i) => (
            <SnapshotTimelineEntry
              key={item.id}
              item={item}
              isLast={i === timelineItems.length - 1}
              onViewDiff={setSelectedHash}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// SnapshotDialog — modal wrapper
// ============================================================================

interface SnapshotDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SnapshotDialog({ sessionId, open, onOpenChange }: SnapshotDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setIsFullscreen(false); onOpenChange(v); }}>
      <DialogContent
        className={cn(
          'flex flex-col p-0 gap-0 overflow-hidden transition-all duration-200',
          isFullscreen
            ? 'sm:max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] h-[calc(100vh-2rem)]'
            : 'sm:max-w-4xl max-h-[80vh]',
        )}
      >
        <VisuallyHidden><DialogTitle>Session Snapshots</DialogTitle></VisuallyHidden>
        <div className="flex-1 min-h-0 overflow-hidden">
          <SnapshotTimeline
            sessionId={sessionId}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((v) => !v)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
