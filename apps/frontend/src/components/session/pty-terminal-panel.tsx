'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Plus, X, Terminal, CircleDashed, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PtyTerminal, type PtyTerminalHandle } from './pty-terminal';
import { useOpenCodePtyList, useCreatePty, useRemovePty } from '@/hooks/opencode/use-opencode-pty';
import { useServerStore } from '@/stores/server-store';
import type { Pty } from '@kortix/opencode-sdk/v2/client';

// ============================================================================
// Per-instance localStorage persistence
// ============================================================================

const ACTIVE_TAB_KEY = 'pty-active-tabs';
const PTY_CACHE_KEY = 'pty-cached-lists';

function getPersistedActiveTab(serverId: string): string | null {
  try {
    const data = JSON.parse(localStorage.getItem(ACTIVE_TAB_KEY) || '{}');
    return data[serverId] ?? null;
  } catch {
    return null;
  }
}

function setPersistedActiveTab(serverId: string, tabId: string | null) {
  try {
    const data = JSON.parse(localStorage.getItem(ACTIVE_TAB_KEY) || '{}');
    if (tabId) {
      data[serverId] = tabId;
    } else {
      delete data[serverId];
    }
    localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(data));
  } catch {}
}

function getCachedPtyList(serverId: string): Pty[] {
  try {
    const data = JSON.parse(localStorage.getItem(PTY_CACHE_KEY) || '{}');
    return data[serverId] ?? [];
  } catch {
    return [];
  }
}

function setCachedPtyList(serverId: string, ptys: Pty[]) {
  try {
    const data = JSON.parse(localStorage.getItem(PTY_CACHE_KEY) || '{}');
    if (ptys.length > 0) {
      data[serverId] = ptys;
    } else {
      delete data[serverId];
    }
    localStorage.setItem(PTY_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// ============================================================================
// PtyTerminalPanel
// ============================================================================

interface PtyTerminalPanelProps {
  className?: string;
  /** The server this panel belongs to. */
  serverId: string;
  /** When true, panel stays mounted but hidden (preserves WebSocket connections). */
  hidden?: boolean;
}

export function PtyTerminalPanel({ className, serverId, hidden }: PtyTerminalPanelProps) {
  // Look up THIS panel's server URL (stable across instance switches)
  const serverUrl = useServerStore((s) => {
    const server = s.servers.find((srv) => srv.id === serverId);
    return server?.url ?? s.getActiveServerUrl();
  });
  // Only fetch PTYs when this panel is visible (active server)
  const { data: ptys, isLoading, refetch } = useOpenCodePtyList({ enabled: !hidden, serverUrl });
  const createPty = useCreatePty();
  const removePty = useRemovePty();
  const [activeId, setActiveIdRaw] = useState<string | null>(() => getPersistedActiveTab(serverId));
  const terminalRefs = useRef<Map<string, PtyTerminalHandle>>(new Map());

  // Wrap setActiveId to also persist to localStorage
  const setActiveId = useCallback((id: string | null) => {
    setActiveIdRaw(id);
    setPersistedActiveTab(serverId, id);
  }, [serverId]);

  // Only show running PTYs — exited ones should disappear.
  // Fall back to localStorage cache so tabs survive page refresh / instance switch.
  const cachedPtys = useMemo(() => getCachedPtyList(serverId), [serverId]);
  const runningPtys = useMemo(() => {
    const list = ptys?.filter((p) => p.status === 'running');
    return list && list.length > 0 ? list : cachedPtys.filter((p) => p.status === 'running');
  }, [ptys, cachedPtys]);

  // Persist running PTYs to localStorage whenever they change
  useEffect(() => {
    if (ptys) {
      const running = ptys.filter((p) => p.status === 'running');
      setCachedPtyList(serverId, running);
    }
  }, [ptys, serverId]);

  const activePty = useMemo(() => {
    if (activeId) {
      return runningPtys.find((p) => p.id === activeId) ?? null;
    }
    return runningPtys[0] ?? null;
  }, [activeId, runningPtys]);

  const handleCreate = useCallback(async () => {
    try {
      const newPty = await createPty.mutateAsync({
        env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });
      setActiveId(newPty.id);
    } catch (e) {
      console.error('[PtyTerminalPanel] Failed to create PTY:', e);
    }
  }, [createPty, setActiveId]);

  const handleClose = useCallback((id: string) => {
    // Kill the shell process (Ctrl+C + exit)
    terminalRefs.current.get(id)?.kill();
    terminalRefs.current.delete(id);
    if (activeId === id) {
      setActiveId(null);
    }
    // Give the shell time to exit, then remove the PTY record from the server
    setTimeout(async () => {
      try {
        await removePty.mutateAsync(id);
      } catch {
        // Shell already exited — just refetch to sync the list
        refetch();
      }
    }, 500);
  }, [removePty, activeId, refetch, setActiveId]);

  // When panel is hidden (inactive server), just keep terminals alive
  if (hidden) {
    return (
      <div className={cn('invisible pointer-events-none', className)}>
        {runningPtys.map((p) => (
          <PtyTerminal
            key={p.id}
            ref={(handle) => {
              if (handle) terminalRefs.current.set(p.id, handle);
              else terminalRefs.current.delete(p.id);
            }}
            pty={p}
            serverUrl={serverUrl}
            className="absolute inset-0 h-full w-full"
            hidden
          />
        ))}
      </div>
    );
  }

  // Empty state - no PTY sessions
  if (!isLoading && runningPtys.length === 0) {
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
        {runningPtys.map((p) => (
          <PtyTab
            key={p.id}
            pty={p}
            isActive={activePty?.id === p.id}
            onClick={() => {
              setActiveId(p.id);
            }}
            onClose={() => handleClose(p.id)}
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

      {/* Terminal area — render all terminals, show/hide via CSS to preserve state */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {runningPtys.map((p) => (
          <PtyTerminal
            key={p.id}
            ref={(handle) => {
              if (handle) {
                terminalRefs.current.set(p.id, handle);
              } else {
                terminalRefs.current.delete(p.id);
              }
            }}
            pty={p}
            serverUrl={serverUrl}
            className="absolute inset-0 h-full w-full"
            hidden={activePty?.id !== p.id}
          />
        ))}
        {!activePty && (
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
  onClose: () => void;
}) {
  const label = pty.title || pty.command || `Terminal ${pty.id.slice(0, 6)}`;
  const isRunning = pty.status === 'running';

  return (
    <div
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-shrink-0 p-1 -mr-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
