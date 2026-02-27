'use client';

/**
 * TunnelStatusIndicator — small status dot for the sidebar.
 * Green = at least one tunnel online, Red = all offline, Gray = none registered.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useTunnelConnections } from '@/hooks/tunnel/use-tunnel';

export function TunnelStatusIndicator() {
  const { data: connections } = useTunnelConnections();

  const hasOnline = connections?.some((c) => c.isLive);
  const hasConnections = connections && connections.length > 0;

  const color = hasOnline
    ? 'bg-emerald-500'
    : hasConnections
      ? 'bg-red-500'
      : 'bg-muted-foreground/30';

  const label = hasOnline
    ? 'Tunnel connected'
    : hasConnections
      ? 'Tunnel offline'
      : 'No tunnels';

  return (
    <div className="flex items-center gap-2" title={label}>
      <span className={cn('h-2 w-2 rounded-full', color)} />
      <span className="text-xs text-muted-foreground">Tunnel</span>
    </div>
  );
}
