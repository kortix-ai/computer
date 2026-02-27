'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSandboxConnectionStore } from '@/stores/sandbox-connection-store';
import { useServerStore } from '@/stores/server-store';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { InstanceManagerDialog } from '@/components/sidebar/server-selector';
import {
  WifiOff,
  RefreshCw,
  ArrowLeftRight,
} from 'lucide-react';
import { toast } from '@/lib/toast';

/**
 * ConnectingScreen — overlay shown when the active instance is not reachable.
 *
 * Two modes:
 *   1. **First connection** (never connected before) — full-screen blocking overlay
 *      with spinner. User can still switch instances.
 *   2. **Reconnecting** (was connected, then lost connection) — non-blocking banner
 *      at the top of the screen. User can continue using the app (read cached data,
 *      switch instances, etc.) while reconnection happens in the background.
 *
 * Shows reconnect attempt count, time since disconnect, and auto-retry status.
 */
export function ConnectingScreen() {
  const status = useSandboxConnectionStore((s) => s.status);
  const initialCheckDone = useSandboxConnectionStore((s) => s.initialCheckDone);
  const wasConnected = useSandboxConnectionStore((s) => s.wasConnected);
  const reconnectAttempts = useSandboxConnectionStore((s) => s.reconnectAttempts);
  const disconnectedAt = useSandboxConnectionStore((s) => s.disconnectedAt);
  const lastConnectedAt = useSandboxConnectionStore((s) => s.lastConnectedAt);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const servers = useServerStore((s) => s.servers);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Don't show anything until the first health check completes
  if (!initialCheckDone) return null;
  if (status === 'connected') return null;

  const serverLabel = activeServer?.label || 'Instance';
  const serverUrl = activeServer?.url?.replace(/^https?:\/\//, '') || '';

  // If the user was previously connected — show a non-blocking top banner
  if (wasConnected) {
    return (
      <>
        <ReconnectBanner
          serverLabel={serverLabel}
          serverUrl={serverUrl}
          reconnectAttempts={reconnectAttempts}
          disconnectedAt={disconnectedAt}
          status={status}
          onSwitchInstance={() => setDialogOpen(true)}
        />
        <InstanceManagerDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  // First-time connection — full-screen blocking overlay
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 max-w-md px-8 text-center">
          {status === 'connecting' && (
            <FirstConnectState label={serverLabel} url={serverUrl} />
          )}
          {status === 'unreachable' && (
            <UnreachableState
              label={serverLabel}
              url={serverUrl}
              reconnectAttempts={reconnectAttempts}
              provider={activeServer?.provider}
            />
          )}

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-foreground bg-muted/60 hover:bg-muted border border-border/50 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Switch Instance
          </button>
        </div>
      </div>

      <InstanceManagerDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

// ── Reconnect toast hook (mounted alongside the screen) ──

export function useConnectionToasts() {
  const status = useSandboxConnectionStore((s) => s.status);
  const wasConnected = useSandboxConnectionStore((s) => s.wasConnected);
  const initialCheckDone = useSandboxConnectionStore((s) => s.initialCheckDone);

  // Track previous status to detect transitions
  const prevStatusRef = useRef<SandboxConnectionStatus | null>(null);

  useEffect(() => {
    if (!initialCheckDone) return;

    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    // Skip the very first status (no transition yet)
    if (prev === null) return;

    // Connected -> unreachable: show disconnect toast
    if (prev === 'connected' && (status === 'unreachable' || status === 'connecting') && wasConnected) {
      toast.error('Instance connection lost. Reconnecting...', {
        duration: 4000,
      });
    }

    // Unreachable/connecting -> connected: show recovery toast
    if ((prev === 'unreachable' || prev === 'connecting') && status === 'connected' && wasConnected) {
      toast.success('Instance reconnected!', {
        duration: 3000,
      });
    }
  }, [status, wasConnected, initialCheckDone]);
}

type SandboxConnectionStatus = 'connecting' | 'connected' | 'unreachable';

// ============================================================================
// Sub-components
// ============================================================================

/** Non-blocking floating pill shown at bottom-right when reconnecting */
function ReconnectBanner({
  serverLabel,
  serverUrl,
  reconnectAttempts,
  disconnectedAt,
  status,
  onSwitchInstance,
}: {
  serverLabel: string;
  serverUrl: string;
  reconnectAttempts: number;
  disconnectedAt: number | null;
  status: SandboxConnectionStatus;
  onSwitchInstance: () => void;
}) {
  const elapsed = useElapsedTime(disconnectedAt);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 bg-background/95 backdrop-blur-xl border border-border/60 rounded-full shadow-lg">
        {/* Pulsing dot */}
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>

        {/* Label */}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Reconnecting
          {elapsed && <span className="text-muted-foreground/50"> · {elapsed}</span>}
        </span>

        {/* Switch button */}
        <button
          type="button"
          onClick={onSwitchInstance}
          className="flex items-center gap-1 h-6 px-2.5 text-[11px] font-medium text-foreground bg-muted/60 hover:bg-muted rounded-full transition-colors cursor-pointer"
        >
          <ArrowLeftRight className="h-2.5 w-2.5" />
          Switch
        </button>
      </div>
    </div>
  );
}

/** Full-screen state for first connection */
function FirstConnectState({ label, url }: { label: string; url: string }) {
  return (
    <>
      <KortixLoader size="large" />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          Connecting to {label}
        </h2>
        {url && (
          <p className="text-sm text-muted-foreground font-mono">{url}</p>
        )}
        <p className="text-sm text-muted-foreground/70">
          Setting up your environment...
        </p>
      </div>
    </>
  );
}

/** Full-screen state when unreachable on first connect */
function UnreachableState({
  label,
  url,
  reconnectAttempts,
  provider,
}: {
  label: string;
  url: string;
  reconnectAttempts: number;
  provider?: string;
}) {
  const isLocalDocker = provider === 'local_docker';

  return (
    <>
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 border border-border/50">
        <WifiOff className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          {isLocalDocker ? 'Local Sandbox Unreachable' : 'Instance Unreachable'}
        </h2>
        {url && (
          <p className="text-sm text-muted-foreground font-mono">{url}</p>
        )}
        <p className="text-sm text-muted-foreground/70">
          {isLocalDocker ? (
            <>
              Unable to reach the local Docker sandbox.
              Make sure Docker is running and the container has started.
            </>
          ) : (
            <>
              Unable to reach <span className="font-medium text-foreground/80">{label}</span>.
              It may be starting up or temporarily unavailable.
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Retrying automatically...
        </span>
        {reconnectAttempts > 0 && (
          <span className="px-1.5 py-0.5 bg-muted/40 rounded text-[10px] font-mono">
            Attempt {reconnectAttempts}
          </span>
        )}
      </div>
    </>
  );
}

// ── Utility hook ──

/** Returns a human-readable elapsed time string, updating every second */
function useElapsedTime(since: number | null): string | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!since) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [since]);

  return useMemo(() => {
    if (!since) return null;
    const seconds = Math.floor((now - since) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }, [since, now]);
}
