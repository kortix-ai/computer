"use client";

import React, { useMemo, useState, useCallback } from 'react';
import {
  useIntegrationApps,
  useIntegrationConnections,
  useCreateConnectToken,
  useDisconnectIntegration,
  useSaveConnection,
  useLinkSandboxIntegration,
  useUnlinkSandboxIntegration,
  type IntegrationConnection,
  type IntegrationApp,
} from '@/hooks/integrations';
import { createFrontendClient } from '@pipedream/sdk/browser';
import { useAuth } from '@/components/AuthProvider';
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
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };
  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  if (app.imgSrc) {
    return (
      <img
        src={app.imgSrc}
        alt={app.name}
        className={`${sizeClasses[size]} rounded-xl object-contain`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center`}
    >
      <Plug className={`${iconSizes[size]} text-muted-foreground`} />
    </div>
  );
};

// ── App Card (available to connect) ─────────────────────────────────────────

const AppCard = ({
  app,
  connection,
  onConnect,
  onManage,
  isConnecting,
}: {
  app: IntegrationApp;
  connection?: IntegrationConnection;
  onConnect: () => void;
  onManage: () => void;
  isConnecting: boolean;
}) => {
  const isConnected = !!connection;

  return (
    <SpotlightCard className="bg-card border border-border/50">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-start gap-3 mb-3">
          <AppLogo app={{ imgSrc: app.imgSrc, name: app.name }} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {app.name}
              </h3>
              {isConnected && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {app.categories.slice(0, 2).map((cat) => (
                <Badge
                  key={cat}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 font-normal"
                >
                  {cat}
                </Badge>
              ))}
              {app.authType && (
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                  {app.authType}
                </span>
              )}
            </div>
          </div>
        </div>

        {app.description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-2 flex-1">
            {app.description}
          </p>
        )}
        {!app.description && <div className="flex-1" />}

        <div className="flex justify-end">
          {isConnected ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 px-2.5 text-xs"
              onClick={onManage}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Manage
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Plug className="h-3 w-3 mr-1" />
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
  onDisconnect,
  onLinkSandbox,
  isDisconnecting,
}: {
  connection: IntegrationConnection;
  imgSrc?: string;
  onDisconnect: () => void;
  onLinkSandbox: () => void;
  isDisconnecting: boolean;
}) => {
  return (
    <SpotlightCard className="bg-card border border-border/50">
      <div className="p-4 flex items-center gap-3">
        <AppLogo
          app={{
            imgSrc,
            name: connection.appName || connection.app,
          }}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-medium text-sm text-foreground truncate">
              {connection.appName || connection.app}
            </h3>
            <Badge
              variant={connection.status === 'active' ? 'highlight' : 'secondary'}
              className="text-[10px]"
            >
              {connection.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Connected {new Date(connection.connectedAt).toLocaleDateString()}
            {connection.lastUsedAt && (
              <> &middot; Last used {new Date(connection.lastUsedAt).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onLinkSandbox}
            title="Link to sandbox"
          >
            <Link2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onDisconnect}
            disabled={isDisconnecting}
            title="Disconnect"
          >
            {isDisconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </SpotlightCard>
  );
};

// ── Link to Sandbox Dialog ──────────────────────────────────────────────────

const LinkSandboxDialog = ({
  open,
  onOpenChange,
  connection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: IntegrationConnection | null;
}) => {
  const [instances, setInstances] = useState<SandboxInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkMutation = useLinkSandboxIntegration();
  const unlinkMutation = useUnlinkSandboxIntegration();

  React.useEffect(() => {
    if (open && connection) {
      setLoading(true);
      setError(null);
      listSandboxes()
        .then(setInstances)
        .catch(() => setError('Failed to load instances'))
        .finally(() => setLoading(false));
    }
  }, [open, connection]);

  const handleLink = async (sandboxId: string) => {
    if (!connection) return;
    try {
      await linkMutation.mutateAsync({
        integrationId: connection.integrationId,
        sandboxId,
      });
      toast.success(`${connection.appName || connection.app} linked to sandbox`);
    } catch {
      toast.error('Failed to link to sandbox');
    }
  };

  const handleUnlink = async (sandboxId: string) => {
    if (!connection) return;
    try {
      await unlinkMutation.mutateAsync({
        integrationId: connection.integrationId,
        sandboxId,
      });
      toast.success('Unlinked from sandbox');
    } catch {
      toast.error('Failed to unlink');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="link-sandbox-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link to Sandbox
          </DialogTitle>
          <DialogDescription id="link-sandbox-description">
            Choose which sandboxes can use the{' '}
            <strong>{connection?.appName || connection?.app}</strong> integration.
            Linked sandboxes will be able to make authenticated API calls.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 w-40 flex-1" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No sandboxes found. Create one first.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {instances.map((inst) => (
                <div
                  key={inst.sandbox_id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/60 border border-border/50 flex items-center justify-center shrink-0">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inst.name}</p>
                    <p className="text-xs text-muted-foreground">{inst.status}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLink(inst.sandbox_id)}
                    disabled={linkMutation.isPending}
                    className="shrink-0"
                  >
                    {linkMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Link'
                    )}
                  </Button>
                </div>
              ))}
            </div>
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
      <div key={i} className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3 mb-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-3/4 mb-4" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    ))}
  </div>
);

// ── Main Page ───────────────────────────────────────────────────────────────

export function IntegrationsPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [linkDialogConnection, setLinkDialogConnection] =
    useState<IntegrationConnection | null>(null);

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
  const disconnect = useDisconnectIntegration();

  // Flatten paginated apps
  const apps = useMemo(
    () => appsData?.pages.flatMap((p) => p.apps) ?? [],
    [appsData],
  );
  const defaultApps = useMemo(
    () => defaultAppsData?.pages.flatMap((p) => p.apps) ?? [],
    [defaultAppsData],
  );

  const connectionsByApp = useMemo(() => {
    const map = new Map<string, IntegrationConnection>();
    for (const c of connections) map.set(c.app, c);
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
              await saveConnection.mutateAsync({
                app: app.slug,
                app_name: app.name,
                provider_account_id: providerAccountId,
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
      }
    },
    [createToken, saveConnection, user],
  );

  const handleDisconnect = useCallback(
    async (connection: IntegrationConnection) => {
      setDisconnectingId(connection.integrationId);
      try {
        await disconnect.mutateAsync(connection.integrationId);
        toast.success(
          `${connection.appName || connection.app} disconnected`,
        );
      } catch {
        toast.error(
          `Failed to disconnect ${connection.appName || connection.app}`,
        );
      } finally {
        setDisconnectingId(null);
      }
    },
    [disconnect],
  );

  const handleManage = useCallback(
    (app: IntegrationApp) => {
      const connection = connectionsByApp.get(app.slug);
      if (connection) setLinkDialogConnection(connection);
    },
    [connectionsByApp],
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection.integrationId}
                  connection={connection}
                  imgSrc={appImgMap.get(connection.app)}
                  onDisconnect={() => handleDisconnect(connection)}
                  onLinkSandbox={() => setLinkDialogConnection(connection)}
                  isDisconnecting={
                    disconnectingId === connection.integrationId
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Search */}
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
          ) : apps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No apps found{searchQuery ? ` for "${searchQuery}"` : ''}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {apps.map((app) => (
                  <AppCard
                    key={app.slug}
                    app={app}
                    connection={connectionsByApp.get(app.slug)}
                    onConnect={() => handleConnect(app)}
                    onManage={() => handleManage(app)}
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

      {/* Link Sandbox Dialog */}
      <LinkSandboxDialog
        open={!!linkDialogConnection}
        onOpenChange={(open) => {
          if (!open) setLinkDialogConnection(null);
        }}
        connection={linkDialogConnection}
      />
    </div>
  );
}
