'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { CircleDashed, Terminal } from 'lucide-react';
import { useKortixComputerStore } from '@/stores/kortix-computer-store';
import { useServerStore } from '@/stores/server-store';
import { useOpenCodePtyList, useRemovePty } from '@/hooks/opencode/use-opencode-pty';
import { useTabStore } from '@/stores/tab-store';

// Lazy-load terminal components to avoid SSR issues with xterm.js
const SSHTerminal = dynamic(
  () => import('@/components/thread/kortix-computer/components/SSHTerminal').then(mod => ({ default: mod.SSHTerminal })),
  { ssr: false }
);

const PtyTerminal = dynamic(
  () => import('@/components/session/pty-terminal').then(mod => ({ default: mod.PtyTerminal })),
  { ssr: false }
);

interface TerminalTabContentProps {
  /** The PTY ID this tab is bound to (extracted from tab id "terminal:<ptyId>") */
  ptyId: string;
  /** The tab ID for cleanup on close */
  tabId: string;
  /** Whether this tab is currently visible (for xterm resize/focus) */
  hidden?: boolean;
}

/**
 * Terminal tab content — renders a single PtyTerminal for one PTY session.
 * Each terminal tab maps 1:1 to a PTY process.
 *
 * For sandbox mode, renders SSHTerminal instead (shared across all terminal tabs).
 */
export function TerminalTabContent({ ptyId, tabId, hidden = false }: TerminalTabContentProps) {
  const currentSandboxId = useKortixComputerStore((s) => s.currentSandboxId);
  const serverUrl = useServerStore((s) => {
    const server = s.servers.find((srv) => srv.id === s.activeServerId);
    return server?.url ?? s.getActiveServerUrl();
  });

  const { data: ptys, isLoading } = useOpenCodePtyList();
  const removePty = useRemovePty();

  // Find the PTY object for this tab
  const pty = ptys?.find((p) => p.id === ptyId) ?? null;

  // If PTY disappears (killed externally), close the tab
  useEffect(() => {
    if (!isLoading && ptys && !pty) {
      useTabStore.getState().closeTab(tabId);
    }
  }, [isLoading, ptys, pty, tabId]);

  // Kill PTY on the server when tab is closed (component unmounts from DOM)
  useEffect(() => {
    const id = ptyId;
    return () => {
      // Remove PTY from the server — this kills the shell process
      removePty.mutateAsync(id).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId]);

  // Sandbox mode — shared SSH terminal
  if (currentSandboxId) {
    return (
      <div className="h-full w-full bg-background">
        <SSHTerminal sandboxId={currentSandboxId} className="h-full" />
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background">
        <CircleDashed className="h-6 w-6 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground mt-2">Connecting...</span>
      </div>
    );
  }

  // PTY not found (will auto-close via effect above)
  if (!pty) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background">
        <Terminal className="h-8 w-8 text-muted-foreground/30" />
        <span className="text-xs text-muted-foreground mt-2">Terminal session ended</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative bg-background">
      <PtyTerminal
        pty={pty}
        serverUrl={serverUrl}
        hidden={hidden}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
