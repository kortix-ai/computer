"use client";

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Trash2,
  Loader2,
  Link2,
  Unlink,
  Monitor,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AppLogo } from './app-logo';
import { toast } from 'sonner';
import { listSandboxes, type SandboxInfo } from '@/lib/platform-client';
import {
  useDisconnectIntegration,
  useRenameIntegration,
  useLinkSandboxIntegration,
  useUnlinkSandboxIntegration,
  useIntegrationSandboxes,
  type IntegrationConnection,
} from '@/hooks/integrations';

export const ManageProfileDialog = ({
  open,
  onOpenChange,
  connection,
  imgSrc,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: IntegrationConnection | null;
  imgSrc?: string;
}) => {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [instances, setInstances] = useState<SandboxInfo[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const renameMutation = useRenameIntegration();
  const linkMutation = useLinkSandboxIntegration();
  const unlinkMutation = useUnlinkSandboxIntegration();
  const disconnect = useDisconnectIntegration();

  const { data: sandboxData, refetch: refetchSandboxes } = useIntegrationSandboxes(
    open && connection ? connection.integrationId : null,
  );

  // Load all user sandboxes when dialog opens
  useEffect(() => {
    if (open && connection) {
      setConfirmDelete(false);
      setEditingLabel(false);
      setLabelValue(connection.label || '');
      setLoadingInstances(true);
      setInstanceError(null);
      listSandboxes()
        .then(setInstances)
        .catch(() => setInstanceError('Failed to load sandboxes'))
        .finally(() => setLoadingInstances(false));
    }
  }, [open, connection]);

  useEffect(() => {
    if (editingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabel]);

  const linkedSet = useMemo(
    () => new Set((sandboxData?.sandboxes ?? []).map((s) => s.sandboxId)),
    [sandboxData],
  );

  const otherProfileLinks = useMemo(() => {
    if (!connection || !sandboxData) return new Map<string, { integrationId: string; label: string | null }>();
    const map = new Map<string, { integrationId: string; label: string | null }>();
    for (const link of sandboxData.appSandboxLinks) {
      if (link.integrationId !== connection.integrationId) {
        map.set(link.sandboxId, { integrationId: link.integrationId, label: link.label });
      }
    }
    return map;
  }, [connection, sandboxData]);

  const handleSaveLabel = async () => {
    if (!connection) return;
    const trimmed = labelValue.trim();
    if (!trimmed || trimmed === connection.label) {
      setEditingLabel(false);
      setLabelValue(connection.label || '');
      return;
    }
    try {
      await renameMutation.mutateAsync({
        integrationId: connection.integrationId,
        label: trimmed,
      });
      setEditingLabel(false);
      toast.success('Profile renamed');
    } catch {
      toast.error('Failed to rename');
    }
  };

  const handleLink = async (sandboxId: string) => {
    if (!connection) return;
    try {
      await linkMutation.mutateAsync({
        integrationId: connection.integrationId,
        sandboxId,
      });
      refetchSandboxes();
      toast.success('Sandbox linked');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link sandbox');
    }
  };

  const handleUnlink = async (sandboxId: string) => {
    if (!connection) return;
    try {
      await unlinkMutation.mutateAsync({
        integrationId: connection.integrationId,
        sandboxId,
      });
      refetchSandboxes();
      toast.success('Sandbox unlinked');
    } catch {
      toast.error('Failed to unlink');
    }
  };

  const handleDelete = async () => {
    if (!connection) return;
    try {
      await disconnect.mutateAsync(connection.integrationId);
      toast.success(`${connection.label || connection.appName || connection.app} disconnected`);
      onOpenChange(false);
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  if (!connection) return null;

  const displayName = connection.label || connection.appName || connection.app;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden" aria-describedby="manage-profile-description">
        <div className="px-6 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="relative">
                <AppLogo
                  app={{ imgSrc, name: connection.appName || connection.app }}
                  size="lg"
                />
                {connection.status === 'active' && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-background" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {editingLabel ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={labelInputRef}
                      type="text"
                      value={labelValue}
                      onChange={(e) => setLabelValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveLabel();
                        if (e.key === 'Escape') {
                          setEditingLabel(false);
                          setLabelValue(connection.label || '');
                        }
                      }}
                      className="h-9 px-3 text-sm font-medium border rounded-xl bg-background flex-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      maxLength={255}
                      placeholder="Profile name"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={handleSaveLabel}
                      disabled={renameMutation.isPending}
                    >
                      {renameMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2 text-muted-foreground"
                      onClick={() => {
                        setEditingLabel(false);
                        setLabelValue(connection.label || '');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <DialogTitle className="flex items-center gap-2">
                    <span className="truncate">{displayName}</span>
                    <button
                      onClick={() => {
                        setLabelValue(connection.label || displayName);
                        setEditingLabel(true);
                      }}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Rename profile"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </DialogTitle>
                )}
                <DialogDescription id="manage-profile-description" className="mt-0.5">
                  {connection.label && (
                    <span>{connection.appName || connection.app} &middot; </span>
                  )}
                  Connected {new Date(connection.connectedAt).toLocaleDateString()}
                  {connection.lastUsedAt && (
                    <> &middot; Last used {new Date(connection.lastUsedAt).toLocaleDateString()}</>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6">
          <div className="mt-4">
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
              <Link2 className="h-4 w-4" />
              Linked Sandboxes
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Choose which sandboxes can use this integration profile for authenticated API calls.
            </p>

            {loadingInstances ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border">
                    <Skeleton className="h-7 w-7 rounded-md" />
                    <Skeleton className="h-4 w-40 flex-1" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                ))}
              </div>
            ) : instanceError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{instanceError}</AlertDescription>
              </Alert>
            ) : instances.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-xl">
                <Monitor className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  No sandboxes found. Create one first.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {instances.map((inst) => {
                  const isLinked = linkedSet.has(inst.sandbox_id);
                  const otherProfile = otherProfileLinks.get(inst.sandbox_id);
                  const isBlocked = !!otherProfile;

                  return (
                    <div
                      key={inst.sandbox_id}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-colors ${
                        isLinked
                          ? 'border-muted-foreground/30 bg-muted-foreground/5'
                          : isBlocked
                            ? 'border-border/30 bg-muted/20'
                            : 'border-border/50 hover:bg-muted/30'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-md bg-muted/60 border border-border/50 flex items-center justify-center shrink-0">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{inst.name}</p>
                        {isBlocked && (
                          <p className="text-[10px] text-amber-500 flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Uses &ldquo;{otherProfile.label || 'Another profile'}&rdquo;
                          </p>
                        )}
                      </div>
                      {isLinked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnlink(inst.sandbox_id)}
                          disabled={unlinkMutation.isPending}
                          className="shrink-0 h-7 text-xs text-destructive hover:text-destructive border-destructive/30"
                        >
                          {unlinkMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Unlink className="h-3 w-3" />
                              Unlink
                            </>
                          )}
                        </Button>
                      ) : isBlocked ? (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          In use
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLink(inst.sandbox_id)}
                          disabled={linkMutation.isPending}
                          className="shrink-0 h-7 text-xs"
                        >
                          {linkMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Link2 className="h-3 w-3" />
                              Link
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-5">
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive flex-1">
                    This will disconnect the account and unlink all sandboxes. Are you sure?
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={disconnect.isPending}
                  >
                    {disconnect.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive/60 shrink-0" />
                  <p className="text-xs text-destructive flex-1">
                    Permanently disconnect this integration profile.
                  </p>
                  <Button
                    className="text-white bg-destructive hover:bg-destructive/60"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
