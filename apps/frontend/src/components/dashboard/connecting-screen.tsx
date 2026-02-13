'use client';

import { useState } from 'react';
import { useSandboxConnectionStore } from '@/stores/sandbox-connection-store';
import { useServerStore } from '@/stores/server-store';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { InstanceManagerDialog } from '@/components/sidebar/server-selector';
import { WifiOff, RefreshCw, ArrowLeftRight } from 'lucide-react';

/**
 * ConnectingScreen — overlay shown in the main content area when the
 * active sandbox is not yet reachable. Positioned absolutely within
 * the content container so the sidebar remains fully accessible.
 *
 * Includes a "Switch Instance" button so the user can open the
 * instance manager and pick a different server without needing the sidebar.
 *
 * States:
 *   - 'connecting'  : initial connection attempt — spinner
 *   - 'unreachable' : failed after retries — error + auto-retry indicator
 *   - 'connected'   : hidden (renders null)
 */
export function ConnectingScreen() {
  const status = useSandboxConnectionStore((s) => s.status);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const servers = useServerStore((s) => s.servers);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (status === 'connected') return null;

  const serverLabel = activeServer?.label || 'Instance';
  const serverUrl = activeServer?.url?.replace(/^https?:\/\//, '') || '';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 max-w-md px-8 text-center">
          {status === 'connecting' && (
            <ConnectingState label={serverLabel} url={serverUrl} />
          )}
          {status === 'unreachable' && (
            <UnreachableState label={serverLabel} url={serverUrl} />
          )}

          {/* Switch Instance button — always visible */}
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

function ConnectingState({ label, url }: { label: string; url: string }) {
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
          Setting up your sandbox environment...
        </p>
      </div>
    </>
  );
}

function UnreachableState({ label, url }: { label: string; url: string }) {
  return (
    <>
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 border border-border/50">
        <WifiOff className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          Sandbox Unreachable
        </h2>
        {url && (
          <p className="text-sm text-muted-foreground font-mono">{url}</p>
        )}
        <p className="text-sm text-muted-foreground/70">
          Unable to reach the sandbox. It may be starting up or temporarily
          unavailable.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>Retrying automatically...</span>
      </div>
    </>
  );
}
