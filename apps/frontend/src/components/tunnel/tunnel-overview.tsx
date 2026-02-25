'use client';

/**
 * TunnelOverview — main tunnel page matching the app's PageHeader + SpotlightCard pattern.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cable, Plus, Wifi, WifiOff, Monitor, Trash2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Ripple } from '@/components/ui/ripple';
import { PageHeader } from '@/components/ui/page-header';
import { useTunnelConnections, useDeleteTunnelConnection, type TunnelConnection } from '@/hooks/tunnel/use-tunnel';
import { TunnelSetupWizard } from './tunnel-setup-wizard';
import { TunnelSettingsDialog } from './tunnel-settings-dialog';
import { TunnelPermissionRequestDialog } from './tunnel-permission-request-dialog';
import { toast } from 'sonner';

// ─── Connection List Item ────────────────────────────────────────────────────

function ConnectionItem({
  connection,
  onClick,
  onDelete,
  index,
}: {
  connection: TunnelConnection;
  onClick: () => void;
  onDelete: () => void;
  index: number;
}) {
  const isOnline = connection.isLive;
  const machineInfo = connection.machineInfo as Record<string, string> | undefined;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.6) }}
    >
      <SpotlightCard className="bg-card border border-border/50">
        <div onClick={onClick} className="p-4 sm:p-5 flex flex-col h-full cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              'flex items-center justify-center w-9 h-9 rounded-[10px] border border-border/50 shrink-0',
              isOnline ? 'bg-emerald-500/10' : 'bg-muted',
            )}>
              <Monitor className={cn('h-4.5 w-4.5', isOnline ? 'text-emerald-500' : 'text-foreground')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{connection.name}</h3>
                <Badge
                  variant={isOnline ? 'highlight' : 'secondary'}
                  className="text-xs shrink-0"
                >
                  {isOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            {isOnline ? (
              <Wifi className="h-3 w-3 text-emerald-500" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            <span>
              {machineInfo?.hostname || 'Not connected'}
              {machineInfo?.platform && ` · ${machineInfo.platform} ${machineInfo.arch || ''}`}
            </span>
          </div>

          {connection.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {connection.capabilities.map((cap) => (
                <Badge key={cap} variant="secondary" className="text-xs">{cap}</Badge>
              ))}
            </div>
          )}

          <div className="mt-auto flex justify-between items-center">
            <span className="text-xs text-muted-foreground/70">
              {connection.lastHeartbeatAt
                ? `Last seen ${formatRelative(connection.lastHeartbeatAt)}`
                : 'Never connected'}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
                Manage
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="relative bg-muted/20 rounded-3xl border border-dashed border-border/50 flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
      <Ripple mainCircleSize={160} mainCircleOpacity={0.12} numCircles={6} />
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 bg-muted border rounded-2xl flex items-center justify-center mb-4">
          <Cable className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Connect your machine</h3>
        <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md mb-6">
          Create a tunnel connection to give your AI agent access to local files, shell commands, and more.
        </p>
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4" />
          New Connection
        </Button>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-2xl border dark:bg-card p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-9 w-9 rounded-[10px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-3 w-32 mb-2" />
          <Skeleton className="h-3 w-20 mb-3" />
          <div className="flex justify-end">
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function TunnelOverview() {
  const { data: connections = [], isLoading } = useTunnelConnections();
  const deleteMutation = useDeleteTunnelConnection();

  const [showSetup, setShowSetup] = useState(false);
  const [selectedTunnel, setSelectedTunnel] = useState<TunnelConnection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const hasConnections = connections.length > 0;

  const filtered = searchQuery
    ? connections.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.machineInfo as Record<string, string>)?.hostname?.toLowerCase()?.includes(searchQuery.toLowerCase()),
      )
    : connections;

  const handleDelete = async (tunnelId: string) => {
    if (!confirm('Delete this tunnel connection? This removes all permissions and audit logs.')) return;
    try {
      await deleteMutation.mutateAsync(tunnelId);
      toast.success('Tunnel deleted');
      if (selectedTunnel?.tunnelId === tunnelId) {
        setSelectedTunnel(null);
        setSettingsOpen(false);
      }
    } catch {
      toast.error('Failed to delete tunnel');
    }
  };

  const handleSelect = (conn: TunnelConnection) => {
    setSelectedTunnel(conn);
    setSettingsOpen(true);
  };

  return (
    <div className="min-h-[100dvh]">
      {/* Page Header */}
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
        <PageHeader icon={Cable}>
          <div className="space-y-2 sm:space-y-4">
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
              <span className="text-primary">Tunnel</span>
            </div>
          </div>
        </PageHeader>
      </div>

      <div className="container mx-auto max-w-7xl px-3 sm:px-4">
        {/* Setup Wizard Dialog */}
        {showSetup && (
          <div className="mb-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
            <TunnelSetupWizard onDone={() => setShowSetup(false)} />
          </div>
        )}

        {/* Search + Actions */}
        {hasConnections && !showSetup && (
          <div className="flex items-center gap-3 mb-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-50 fill-mode-both">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search connections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border bg-background pl-10 pr-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button onClick={() => setShowSetup(true)}>
              <Plus className="h-4 w-4" />
              New Connection
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
          {isLoading ? (
            <LoadingSkeleton />
          ) : !hasConnections && !showSetup ? (
            <EmptyState onCreateClick={() => setShowSetup(true)} />
          ) : hasConnections && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence>
                {filtered.map((conn, i) => (
                  <ConnectionItem
                    key={conn.tunnelId}
                    connection={conn}
                    onClick={() => handleSelect(conn)}
                    onDelete={() => handleDelete(conn.tunnelId)}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      <TunnelSettingsDialog
        tunnel={selectedTunnel}
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSelectedTunnel(null);
        }}
      />

      {/* Permission Request Dialog */}
      <TunnelPermissionRequestDialog />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
