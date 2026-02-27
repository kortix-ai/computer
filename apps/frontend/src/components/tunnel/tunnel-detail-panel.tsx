'use client';


import React, { useState } from 'react';
import { X, Monitor, Wifi, WifiOff, Shield, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTunnelConnection, type TunnelConnection } from '@/hooks/tunnel/use-tunnel';
import { TunnelPermissionManager } from './tunnel-permission-manager';
import { TunnelAuditTable } from './tunnel-audit-table';

interface TunnelDetailPanelProps {
  tunnel: TunnelConnection | null;
  open: boolean;
  onClose: () => void;
}

export function TunnelDetailPanel({ tunnel, open, onClose }: TunnelDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'permissions' | 'audit'>('permissions');

  const { data: liveData } = useTunnelConnection(tunnel?.tunnelId || '');
  const conn = liveData || tunnel;

  if (!conn) return null;

  const isOnline = conn.isLive;
  const machineInfo = conn.machineInfo as Record<string, string> | undefined;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 2xl:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          'h-screen transition-all duration-300 ease-in-out bg-background border-l',
          'fixed top-0 right-0 z-40 2xl:relative 2xl:z-auto',
          open ? 'w-[580px]' : 'w-0',
          'overflow-hidden',
        )}
      >
        <div className="flex flex-col h-full w-[580px]">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex items-center justify-center w-9 h-9 rounded-[10px] border',
                isOnline ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-muted border-border/50',
              )}>
                <Monitor className={cn('h-4.5 w-4.5', isOnline ? 'text-emerald-500' : 'text-foreground')} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{conn.name}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isOnline ? (
                    <Wifi className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className={cn('text-xs', isOnline ? 'text-emerald-600' : 'text-muted-foreground')}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                  {machineInfo?.hostname && (
                    <span className="text-xs text-muted-foreground">· {machineInfo.hostname}</span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {conn.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 px-4 py-2 border-b">
              {conn.capabilities.map((cap) => (
                <Badge key={cap} variant="secondary" className="text-xs">{cap}</Badge>
              ))}
            </div>
          )}

          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('permissions')}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
                activeTab === 'permissions'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              Permissions
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
                activeTab === 'audit'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ScrollText className="h-3.5 w-3.5" />
              Audit Log
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'permissions' ? (
              <TunnelPermissionManager tunnelId={conn.tunnelId} />
            ) : (
              <TunnelAuditTable tunnelId={conn.tunnelId} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
