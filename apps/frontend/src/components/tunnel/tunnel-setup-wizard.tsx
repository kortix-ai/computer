'use client';

/**
 * TunnelSetupWizard — inline setup card for creating a new tunnel connection.
 *
 * Flow: Enter name → Create → Copy the connect command → Done.
 * The command includes the tunnel ID, one-time setup token, and API URL.
 */

import React, { useState } from 'react';
import { Terminal, Copy, Check, X, Monitor, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCreateTunnelConnection, type TunnelConnectionCreateResponse } from '@/hooks/tunnel/use-tunnel';

interface TunnelSetupWizardProps {
  onDone?: () => void;
}

export function TunnelSetupWizard({ onDone }: TunnelSetupWizardProps) {
  const [name, setName] = useState('');
  const [created, setCreated] = useState<TunnelConnectionCreateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useCreateTunnelConnection();

  const handleCreate = async () => {
    const tunnelName = name.trim() || getDefaultMachineName();
    try {
      const result = await createMutation.mutateAsync({
        name: tunnelName,
        capabilities: ['filesystem', 'shell'],
      });
      setCreated(result);
      toast.success('Connection created');
    } catch {
      toast.error('Failed to create connection');
    }
  };

  const apiUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8008/v1/tunnel`
    : 'http://localhost:8008/v1/tunnel';

  const connectCommand = created
    ? `npx @kortix/agent-tunnel connect --tunnel-id ${created.tunnelId} --token ${created.setupToken} --api-url ${apiUrl}`
    : '';

  const copyCommand = () => {
    navigator.clipboard.writeText(connectCommand).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // ─── After creation: show the connect command ──────────────────────
  if (created) {
    return (
      <div className="rounded-2xl border bg-card p-5 sm:p-6 max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-emerald-500/10 border border-emerald-500/20">
              <Check className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Connection Created</h3>
              <p className="text-xs text-muted-foreground">Run this in your terminal to connect</p>
            </div>
          </div>
          {onDone && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDone}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Command block */}
        <div
          className="relative group rounded-xl bg-muted/60 border border-border/50 p-4 pr-12 cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={copyCommand}
        >
          <div className="flex items-start gap-3">
            <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <code className="text-xs sm:text-sm font-mono break-all leading-relaxed select-all">
              {connectCommand}
            </code>
          </div>
          <div className="absolute top-3 right-3 p-1.5 rounded-md bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity">
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>

        <p className="text-xs text-amber-600 dark:text-amber-400">
          Save this command — the token is shown only once.
        </p>

        {onDone && (
          <Button variant="outline" size="sm" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    );
  }

  // ─── Initial: name input + create ──────────────────────────────────
  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50">
            <Monitor className="h-4.5 w-4.5 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">New Connection</h3>
            <p className="text-xs text-muted-foreground">Connect your local machine to Kortix</p>
          </div>
        </div>
        {onDone && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDone}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !createMutation.isPending && handleCreate()}
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder={getDefaultMachineName()}
          autoFocus
        />

        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="w-full"
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Connection'
          )}
        </Button>
      </div>
    </div>
  );
}

function getDefaultMachineName(): string {
  if (typeof navigator === 'undefined') return 'My Machine';
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'My Mac';
  if (ua.includes('Windows')) return 'My PC';
  if (ua.includes('Linux')) return 'My Linux Machine';
  return 'My Machine';
}
