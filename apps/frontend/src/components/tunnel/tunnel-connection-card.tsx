'use client';

/**
 * TunnelConnectionCard — displays a single tunnel connection with status,
 * machine info, capabilities, and action buttons.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Wifi, WifiOff, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TunnelConnection } from '@/hooks/tunnel/use-tunnel';

interface TunnelConnectionCardProps {
  connection: TunnelConnection;
  onSelect?: (tunnelId: string) => void;
  onDelete?: (tunnelId: string) => void;
}

export function TunnelConnectionCard({ connection, onSelect, onDelete }: TunnelConnectionCardProps) {
  const isOnline = connection.isLive;
  const machineInfo = connection.machineInfo as Record<string, string> | undefined;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        'hover:border-border/60 hover:shadow-sm cursor-pointer',
        isOnline ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-card',
      )}
      onClick={() => onSelect?.(connection.tunnelId)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            isOnline ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground',
          )}>
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-sm">{connection.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isOnline ? (
                <Wifi className="h-3 w-3 text-emerald-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-muted-foreground" />
              )}
              <span className={cn(
                'text-xs',
                isOnline ? 'text-emerald-600' : 'text-muted-foreground',
              )}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(connection.tunnelId);
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(connection.tunnelId);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Machine Info */}
      {machineInfo && Object.keys(machineInfo).length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          {machineInfo.hostname && <span>{machineInfo.hostname}</span>}
          {machineInfo.platform && <span> &middot; {machineInfo.platform} {machineInfo.arch}</span>}
        </div>
      )}

      {/* Capabilities */}
      {connection.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {connection.capabilities.map((cap) => (
            <Badge key={cap} variant="secondary" className="text-xs">
              {cap}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
