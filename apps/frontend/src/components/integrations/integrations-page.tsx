"use client";

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  useIntegrationApps,
  useIntegrationConnections,
  useCreateConnectToken,
  useDisconnectIntegration,
  useSaveConnection,
  useLinkSandboxIntegration,
  useUnlinkSandboxIntegration,
  useRenameIntegration,
  useIntegrationSandboxes,
  type IntegrationConnection,
  type IntegrationApp,
} from '@/hooks/integrations';
import { createFrontendClient } from '@pipedream/sdk/browser';
import { useAuth } from '@/components/AuthProvider';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import {
  AlertCircle,
  Plug,
  Search,
  Trash2,
  Loader2,
  Link2,
  CheckCircle2,
  Unlink,
  Monitor,
  Plus,
  Pencil,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { PageHeader } from '@/components/ui/page-header';
import { listSandboxes, type SandboxInfo } from '@/lib/platform-client';

// ── App Logo ────────────────────────────────────────────────────────────────

const AppLogo = ({
  app,
  size = 'md',
}: {
  app: { imgSrc?: string; name: string };
  size?: 'sm' | 'md' | 'lg';
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-9 h-9 rounded-[10px]',
    lg: 'w-12 h-12 rounded-xl',
  };
  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={`${sizeClasses[size]} bg-muted/50 border border-border/40 flex items-center justify-center shrink-0 overflow-hidden`}>
      {app.imgSrc ? (
        <img
          src={app.imgSrc}
          alt={app.name}
          className={`${iconSizes[size]} object-contain`}
        />
      ) : (
        <Plug className={`${iconSizes[size]} text-muted-foreground`} />
      )}
    </div>
  );
};

// ── App Card (available to connect) ─────────────────────────────────────────

const AppCard = ({
  app,
  connections,
  onConnect,
  onManage,
  isConnecting,
}: {
  app: IntegrationApp;
  connections: IntegrationConnection[];
  onConnect: () => void;
  onManage: (connection: IntegrationConnection) => void;
  isConnecting: boolean;
}) => {
  const isConnected = connections.length > 0;
  const connectionCount = connections.length;

  return (
    <SpotlightCard className="bg-card border border-border/50">
      <div className="p-3.5 flex flex-col h-full">
        <div className="flex items-center gap-2.5 mb-2.5">
          <AppLogo app={{ imgSrc: app.imgSrc, name: app.name }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-medium text-[13px] text-foreground truncate">
                {app.name}
              </h3>
              {isConnected && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              {connectionCount > 1 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {connectionCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {app.categories.slice(0, 1).map((cat) => (
                <span key={cat} className="text-[10px] text-muted-foreground">
                  {cat}
                </span>
              ))}
              {app.authType && (
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                  {app.authType}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="h-[30px] mb-3">
          <p className="text-[11px] text-muted-foreground/80 leading-[15px] line-clamp-2">
            {app.description || '\u00A0'}
          </p>
        </div>

        <div className="flex justify-end gap-1">
          {isConnected && (
            <>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-7 px-2.5 text-xs"
                onClick={() => onManage(connections[0])}
              >
                <Settings className="h-3 w-3" />
                Manage
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                onClick={onConnect}
                disabled={isConnecting}
                title="Add another account"
              >
                {isConnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </Button>
            </>
          )}
          {!isConnected && (
            <Button
              variant="default"
              className="h-7 px-3 text-xs"
              onClick={onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Plug className="h-3 w-3" />
              )}
              Connect
            </Button>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
};

// ── Connected Integration Card ──────────────────────────────────────────────

const ConnectionCard = ({
  connection,
  imgSrc,
  onManage,
}: {
  connection: IntegrationConnection;
  imgSrc?: string;
  onManage: () => void;
}) => {
  const { data: sandboxData } = useIntegrationSandboxes(connection.integrationId);
  const linkedCount = sandboxData?.sandboxes.length ?? 0;

  return (
    <SpotlightCard className="bg-card border border-border/50">
      <div className="p-3.5 flex flex-col h-full">
        <div className="flex items-center gap-2.5 mb-2.5">
          <AppLogo
            app={{
              imgSrc,
              name: connection.appName || connection.app,
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-medium text-[13px] text-foreground truncate">
                {connection.label || connection.appName || connection.app}
              </h3>
              <Badge
                variant={connection.status === 'active' ? 'highlight' : 'secondary'}
                className="text-[10px] px-1.5 py-0"
              >
                {connection.status}
              </Badge>
            </div>
            {connection.label && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {connection.appName || connection.app}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1 mb-2">
          <p className="text-[10px] text-muted-foreground">
            Connected {new Date(connection.connectedAt).toLocaleDateString()}
            {connection.lastUsedAt && (
              <> &middot; Used {new Date(connection.lastUsedAt).toLocaleDateString()}</>
            )}
          </p>
          {linkedCount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              <Monitor className="h-2.5 w-2.5 inline mr-0.5" />
              {linkedCount} sandbox{linkedCount !== 1 ? 'es' : ''} linked
            </p>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-7 px-2.5 text-xs"
            onClick={onManage}
          >
            <Settings className="h-3 w-3 mr-1" />
            Manage
          </Button>
        </div>
      </div>
    </SpotlightCard>
  );
};

// ── Manage Profile Dialog ───────────────────────────────────────────────────

const ManageProfileDialog = ({
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

  // Map: sandboxId -> { integrationId, label } for OTHER profiles of the same app
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
      <DialogContent className="sm:max-w-lg" aria-describedby="manage-profile-description">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AppLogo
              app={{ imgSrc, name: connection.appName || connection.app }}
              size="lg"
            />
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
                    className="h-8 px-2 text-sm font-medium border rounded-md bg-background flex-1"
                    maxLength={255}
                    placeholder="Profile name"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
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
                    className="h-8 px-2 text-muted-foreground"
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
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
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

        {/* Sandbox Linking Section */}
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
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border">
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
            <div className="text-center py-6 border border-dashed rounded-lg">
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
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${
                      isLinked
                        ? 'border-emerald-500/30 bg-emerald-500/5'
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
                          Uses "{otherProfile.label || 'Another profile'}"
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
                            <Unlink className="h-3 w-3 mr-1" />
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
                            <Link2 className="h-3 w-3 mr-1" />
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

        {/* Delete Section */}
        <div className="mt-5 pt-4 border-t">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive flex-1">
                This will disconnect the account and unlink all sandboxes. Are you sure?
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDelete}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-1" />
                )}
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-7 text-xs"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3 w-3" />
              Disconnect this profile
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Empty State ─────────────────────────────────────────────────────────────

const EmptyState = () => (
  <div className="bg-muted/20 rounded-3xl border flex flex-col items-center justify-center py-16 px-4">
    <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
      <Plug className="h-7 w-7 text-muted-foreground" />
    </div>
    <h3 className="text-base font-semibold text-foreground mb-2">
      No integrations yet
    </h3>
    <p className="text-sm text-muted-foreground text-center max-w-sm">
      Connect third-party apps like Google Sheets, Slack, or GitHub so your
      agents can interact with them using your credentials.
    </p>
  </div>
);

// ── Loading Grid Skeleton ───────────────────────────────────────────────────

const LoadingGrid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="rounded-2xl border bg-card p-3.5">
        <div className="flex items-center gap-2.5 mb-2.5">
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <Skeleton className="h-2.5 w-full mb-1" />
        <Skeleton className="h-2.5 w-3/4 mb-3" />
        <div className="flex justify-end">
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      </div>
    ))}
  </div>
);

// ── Main Page ───────────────────────────────────────────────────────────────

export function IntegrationsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [authFilter, setAuthFilter] = useState<'all' | 'oauth' | 'keys'>('oauth');
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [manageConnection, setManageConnection] =
    useState<IntegrationConnection | null>(null);
  const autoConnectTriggered = useRef(false);
  const autoConnectSandboxId = useRef<string | null>(null);

  // Default apps (no search) — for connected app icons
  const { data: defaultAppsData } = useIntegrationApps(undefined);
  const {
    data: appsData,
    isLoading: appsLoading,
    error: appsError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useIntegrationApps(searchQuery || undefined);
  const {
    data: connections = [],
    isLoading: connectionsLoading,
    error,
  } = useIntegrationConnections();
  const createToken = useCreateConnectToken();
  const saveConnection = useSaveConnection();

  // Flatten paginated apps
  const apps = useMemo(
    () => appsData?.pages.flatMap((p) => p.apps) ?? [],
    [appsData],
  );
  const defaultApps = useMemo(
    () => defaultAppsData?.pages.flatMap((p) => p.apps) ?? [],
    [defaultAppsData],
  );

  // Filter apps by auth type
  const filteredApps = useMemo(() => {
    if (authFilter === 'all') return apps;
    return apps.filter((a) => a.authType === authFilter);
  }, [apps, authFilter]);

  // Group connections by app slug → IntegrationConnection[]
  const connectionsByApp = useMemo(() => {
    const map = new Map<string, IntegrationConnection[]>();
    for (const c of connections) {
      const existing = map.get(c.app) || [];
      existing.push(c);
      map.set(c.app, existing);
    }
    return map;
  }, [connections]);

  // Map app slug → imgSrc, merging default + search results for full coverage
  const appImgMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of defaultApps) {
      if (app.imgSrc) map.set(app.slug, app.imgSrc);
    }
    for (const app of apps) {
      if (app.imgSrc) map.set(app.slug, app.imgSrc);
    }
    return map;
  }, [defaultApps, apps]);

  const handleConnect = useCallback(
    async (app: IntegrationApp) => {
      setConnectingApp(app.slug);
      try {
        const result = await createToken.mutateAsync(app.slug);

        const pd = createFrontendClient({
          environment: 'https://api.pipedream.com' as any,
          externalUserId: user?.id || '',
        } as any);

        await pd.connectAccount({
          app: app.slug,
          token: result.token,
          onSuccess: async ({
            id: providerAccountId,
          }: {
            id: string;
          }) => {
            try {
              // Auto-generate label for 2nd+ connections
              const existing = connectionsByApp.get(app.slug) || [];
              let label: string | undefined;
              if (existing.length > 0) {
                label = `${app.name} Account ${existing.length + 1}`;
              }

              await saveConnection.mutateAsync({
                app: app.slug,
                app_name: app.name,
                provider_account_id: providerAccountId,
                label,
                sandbox_id: autoConnectSandboxId.current || undefined,
              });
              toast.success(`${app.name} connected successfully!`);
            } catch {
              toast.error('Connected but failed to save. Please refresh.');
            }
          },
        });
      } catch {
        toast.error(`Failed to connect ${app.name}`);
      } finally {
        setConnectingApp(null);
        autoConnectSandboxId.current = null;
      }
    },
    [createToken, saveConnection, user, connectionsByApp],
  );

  // Auto-connect when ?connect=<app_slug> is present (used by agent tools)
  useEffect(() => {
    const connectApp = searchParams.get('connect');
    if (!connectApp || autoConnectTriggered.current || !user || appsLoading) return;
    autoConnectTriggered.current = true;

    // Capture sandbox_id before cleaning URL (agent-initiated flow)
    autoConnectSandboxId.current = searchParams.get('sandbox_id');

    // Clean the URL
    router.replace('/integrations', { scroll: false });

    // Find the app in the loaded list, or create a minimal app object
    const app = apps.find((a) => a.slug === connectApp);
    if (app) {
      handleConnect(app);
    } else {
      handleConnect({
        slug: connectApp,
        name: connectApp,
        categories: [],
      } as IntegrationApp);
    }
  }, [searchParams, user, apps, appsLoading, handleConnect, router]);

  const handleManage = useCallback(
    (connection: IntegrationConnection) => {
      setManageConnection(connection);
    },
    [],
  );

  if (error) {
    return (
      <div className="h-screen flex flex-col">
        <div className="max-w-4xl mx-auto w-full py-8 px-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load integrations. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8">
        <PageHeader icon={Plug}>
          <div className="space-y-2 sm:space-y-4">
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
              <span className="text-primary">Integrations</span>
            </div>
          </div>
        </PageHeader>
      </div>

      <div className="container mx-auto max-w-7xl px-3 sm:px-4">
        {/* Connected Integrations */}
        {connections.length > 0 && (
          <div className="pb-6 sm:pb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Connected ({connections.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection.integrationId}
                  connection={connection}
                  imgSrc={appImgMap.get(connection.app)}
                  onManage={() => handleManage(connection)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex items-center gap-2 sm:gap-4 pb-4 pt-2">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Search apps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 sm:h-10 w-full rounded-xl border border-input bg-background px-8 sm:px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <div className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
            {(['oauth', 'keys', 'all'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setAuthFilter(filter)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  authFilter === filter
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {filter === 'oauth' ? 'OAuth' : filter === 'keys' ? 'API Key' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Available Apps Grid */}
        <div className="pb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Available Apps
          </h2>
          {appsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load available apps. Check that Pipedream credentials
                are configured.
              </AlertDescription>
            </Alert>
          ) : appsLoading || connectionsLoading ? (
            <LoadingGrid />
          ) : apps.length === 0 && connections.length === 0 ? (
            <EmptyState />
          ) : filteredApps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No apps found{searchQuery ? ` for "${searchQuery}"` : ''}{authFilter !== 'all' ? ` with ${authFilter === 'oauth' ? 'OAuth' : 'API key'} auth` : ''}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredApps.map((app) => (
                  <AppCard
                    key={app.slug}
                    app={app}
                    connections={connectionsByApp.get(app.slug) || []}
                    onConnect={() => handleConnect(app)}
                    onManage={handleManage}
                    isConnecting={connectingApp === app.slug}
                  />
                ))}
              </div>
              {hasNextPage && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="h-9 px-6"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </>
                    ) : (
                      'Load more apps'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Manage Profile Dialog */}
      <ManageProfileDialog
        open={!!manageConnection}
        onOpenChange={(open) => {
          if (!open) setManageConnection(null);
        }}
        connection={manageConnection}
        imgSrc={manageConnection ? appImgMap.get(manageConnection.app) : undefined}
      />
    </div>
  );
}
