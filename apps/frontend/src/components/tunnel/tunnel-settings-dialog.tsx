'use client';

/**
 * TunnelSettingsDialog — Radix Dialog replacing the slide-in panel.
 *
 * Tabs: Permissions | Audit Log | Connection
 */

import React from 'react';
import { Monitor, Wifi, WifiOff, Shield, ScrollText, Info, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTunnelConnection, type TunnelConnection } from '@/hooks/tunnel/use-tunnel';
import { TunnelPermissionManager } from './tunnel-permission-manager';
import { TunnelAuditTable } from './tunnel-audit-table';

interface TunnelSettingsDialogProps {
  tunnel: TunnelConnection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TunnelSettingsDialog({ tunnel, open, onOpenChange }: TunnelSettingsDialogProps) {
  const { data: liveData } = useTunnelConnection(tunnel?.tunnelId || '');
  const conn = liveData || tunnel;

  if (!conn) return null;

  const isOnline = conn.isLive;
  const machineInfo = conn.machineInfo as Record<string, string> | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl border shrink-0',
              isOnline ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-muted border-border/50',
            )}>
              <Monitor className={cn('h-5 w-5', isOnline ? 'text-emerald-500' : 'text-foreground')} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold">{conn.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 mt-0.5">
                {isOnline ? (
                  <Wifi className="h-3 w-3 text-emerald-500" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                <span className={cn('text-xs', isOnline ? 'text-emerald-600' : '')}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                {machineInfo?.hostname && (
                  <span className="text-xs">· {machineInfo.hostname}</span>
                )}
              </DialogDescription>
            </div>
            <Badge variant={isOnline ? 'highlight' : 'secondary'} className="shrink-0">
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
        </DialogHeader>
        <Tabs defaultValue="permissions" className="w-full flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="">
              <TabsTrigger value="permissions" className="flex-1">
                <Shield className="h-3.5 w-3.5" />
                Permissions
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex-1">
                <ScrollText className="h-3.5 w-3.5" />
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="connection" className="flex-1">
                <Info className="h-3.5 w-3.5" />
                Connection
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            <TabsContent value="permissions">
              <TunnelPermissionManager tunnelId={conn.tunnelId} />
            </TabsContent>

            <TabsContent value="audit">
              <TunnelAuditTable tunnelId={conn.tunnelId} />
            </TabsContent>

            <TabsContent value="connection">
              <ConnectionInfoTab connection={conn} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Connection Info Tab ────────────────────────────────────────────────────

function ConnectionInfoTab({ connection }: { connection: TunnelConnection }) {
  const [copied, setCopied] = React.useState(false);
  const machineInfo = connection.machineInfo as Record<string, string> | undefined;

  const handleCopy = () => {
    navigator.clipboard.writeText(connection.tunnelId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rows: { label: string; value: string }[] = [
    { label: 'Tunnel ID', value: connection.tunnelId },
    { label: 'Status', value: connection.isLive ? 'Online' : 'Offline' },
    { label: 'Hostname', value: machineInfo?.hostname || 'Unknown' },
    { label: 'Platform', value: machineInfo?.platform ? `${machineInfo.platform} ${machineInfo.arch || ''}` : 'Unknown' },
    { label: 'OS Version', value: machineInfo?.osVersion || 'Unknown' },
    { label: 'Agent Version', value: machineInfo?.agentVersion || 'Unknown' },
    { label: 'Capabilities', value: connection.capabilities.join(', ') || 'None' },
    { label: 'Created', value: new Date(connection.createdAt).toLocaleString() },
  ];

  if (connection.lastHeartbeatAt) {
    rows.push({ label: 'Last Heartbeat', value: new Date(connection.lastHeartbeatAt).toLocaleString() });
  }

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
          <span className="text-xs text-muted-foreground">{row.label}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono">{row.value}</span>
            {row.label === 'Tunnel ID' && (
              <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
