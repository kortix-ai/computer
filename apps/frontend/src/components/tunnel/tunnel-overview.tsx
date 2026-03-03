'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cable, Plus, Monitor, Trash2, Search, X, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Ripple } from '@/components/ui/ripple';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTunnelConnections, useDeleteTunnelConnection, type TunnelConnection } from '@/hooks/tunnel/use-tunnel';
import { useTunnelRealtimeSync } from '@/hooks/tunnel/use-tunnel-realtime';
import { TunnelCreateDialog } from './tunnel-create-dialog';
import { TunnelSettingsDialog } from './tunnel-settings-dialog';
import { TunnelPermissionRequestDialog } from './tunnel-permission-request-dialog';
import { toast } from 'sonner';

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
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.4) }}
      >
        <SpotlightCard className="bg-card border border-border/50">
          <div onClick={onClick} className="p-4 flex flex-col h-full cursor-pointer group">
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                'flex items-center justify-center w-9 h-9 rounded-[10px] border shrink-0',
                isOnline
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-muted border-border/50',
              )}>
                <Monitor className={cn(
                  'h-4 w-4',
                  isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{connection.name}</h3>
                {machineInfo?.hostname && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {machineInfo.hostname}
                    {machineInfo.platform && ` · ${machineInfo.platform} ${machineInfo.arch || ''}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="relative flex h-2.5 w-2.5">
                  {isOnline && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className={cn(
                    'relative inline-flex rounded-full h-2.5 w-2.5',
                    isOnline ? 'bg-emerald-500' : 'bg-amber-400',
                  )} />
                </span>
              </div>
            </div>
            <div className="mt-auto flex justify-between items-center pt-1">
              <span className="text-[11px] text-muted-foreground">
                {connection.lastHeartbeatAt
                  ? formatRelative(connection.lastHeartbeatAt)
                  : 'Never connected'}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </SpotlightCard>
      </motion.div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium text-foreground">{connection.name}</span> and
              remove all its permissions and audit logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={onDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
          Create a tunnel connection to give Kortix access to local files, shell commands, and more.
        </p>
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4" />
          New Connection
        </Button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-2xl border dark:bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-9 w-9 rounded-[10px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
          </div>
          <Skeleton className="h-3 w-16 mt-3" />
        </div>
      ))}
    </div>
  );
}

export function TunnelOverview() {
  const { data: connections = [], isLoading } = useTunnelConnections();
  const deleteMutation = useDeleteTunnelConnection();
  useTunnelRealtimeSync();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 pt-6 sm:pt-8 pb-2 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl border bg-primary/10 border-primary/20">
            <Cable className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Tunnel</h1>
          <Button variant="ghost" className="bg-muted rounded-full hover:bg-muted/80" size="icon" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-3 sm:px-4">
        {/* {hasConnections && (
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
          </div>
        )} */}

        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
          {isLoading ? (
            <LoadingSkeleton />
          ) : !hasConnections ? (
            <EmptyState onCreateClick={() => setCreateDialogOpen(true)} />
          ) : (
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

      <TunnelCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <TunnelSettingsDialog
        tunnel={selectedTunnel}
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSelectedTunnel(null);
        }}
      />

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
