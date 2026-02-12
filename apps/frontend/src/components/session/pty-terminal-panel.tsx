'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, X, Terminal, CircleDashed, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PtyTerminal } from './pty-terminal';
import { useOpenCodePtyList, useCreatePty, useRemovePty } from '@/hooks/opencode/use-opencode-pty';
import type { Pty } from '@kortix/opencode-sdk/v2/client';

// ============================================================================
// PtyTerminalPanel
// ============================================================================

interface PtyTerminalPanelProps {
  className?: string;
}

export function PtyTerminalPanel({ className }: PtyTerminalPanelProps) {
  const { data: ptys, isLoading, refetch } = useOpenCodePtyList();
  const createPty = useCreatePty();
  const removePty = useRemovePty();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-select first PTY if none selected
  const activePtys = useMemo(() => ptys?.filter((p) => p.status === 'running') ?? [], [ptys]);
  const allPtys = ptys ?? [];

  const activePty = useMemo(() => {
    if (activeId) {
      return allPtys.find((p) => p.id === activeId) ?? null;
    }
    return activePtys[0] ?? allPtys[0] ?? null;
  }, [activeId, activePtys, allPtys]);

  const handleCreate = useCallback(async () => {
    try {
      const newPty = await createPty.mutateAsync({});
      setActiveId(newPty.id);
    } catch (e) {
      console.error('[PtyTerminalPanel] Failed to create PTY:', e);
    }
  }, [createPty]);

  const handleClose = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removePty.mutateAsync(id);
      if (activeId === id) {
        setActiveId(null);
      }
    } catch (e) {
      console.error('[PtyTerminalPanel] Failed to remove PTY:', e);
    }
  }, [removePty, activeId]);

  // Empty state - no PTY sessions
  if (!isLoading && allPtys.length === 0) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border-2 border-zinc-200 dark:border-zinc-700">
              <Terminal className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No terminal sessions
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Terminal sessions will appear here when the agent spawns PTY processes, or you can create one.
              </p>
            </div>
            <button
              onClick={handleCreate}
              disabled={createPty.isPending}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900',
                'hover:bg-zinc-800 dark:hover:bg-zinc-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              {createPty.isPending ? 'Creating...' : 'New Terminal'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center', className)}>
        <CircleDashed className="h-6 w-6 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground mt-2">Loading terminals...</span>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col overflow-hidden', className)}>
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 overflow-x-auto">
        {allPtys.map((p) => (
          <PtyTab
            key={p.id}
            pty={p}
            isActive={activePty?.id === p.id}
            onClick={() => setActiveId(p.id)}
            onClose={(e) => handleClose(p.id, e)}
          />
        ))}
        <button
          onClick={handleCreate}
          disabled={createPty.isPending}
          className="flex-shrink-0 p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => refetch()}
          className="flex-shrink-0 p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer ml-auto"
          title="Refresh"
        >
          <RotateCw className="w-3 h-3" />
        </button>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activePty ? (
          <PtyTerminal
            key={activePty.id}
            pty={activePty}
            className="h-full w-full"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Select a terminal session
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tab component
// ============================================================================

function PtyTab({
  pty,
  isActive,
  onClick,
  onClose,
}: {
  pty: Pty;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  const label = pty.title || pty.command || `Terminal ${pty.id.slice(0, 6)}`;
  const isRunning = pty.status === 'running';

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer max-w-[160px]',
        isActive
          ? 'bg-white dark:bg-zinc-800 text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
    >
      <span className={cn(
        'size-1.5 rounded-full flex-shrink-0',
        isRunning ? 'bg-emerald-500' : 'bg-zinc-400',
      )} />
      <span className="truncate">{label}</span>
      <span
        role="button"
        onClick={onClose}
        className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-pointer"
      >
        <X className="w-2.5 h-2.5" />
      </span>
    </button>
  );
}
