"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  useIntegrationApps,
  useIntegrationConnections,
  useCreateConnectToken,
  useSaveConnection,
  type IntegrationConnection,
  type IntegrationApp,
} from '@/hooks/integrations';
import { createFrontendClient } from '@pipedream/sdk/browser';
import { useAuth } from '@/components/AuthProvider';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function useIntegrationsPage(): any {
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

  const apps = useMemo(
    () => appsData?.pages.flatMap((p) => p.apps) ?? [],
    [appsData],
  );
  const defaultApps = useMemo(
    () => defaultAppsData?.pages.flatMap((p) => p.apps) ?? [],
    [defaultAppsData],
  );

  const filteredApps = useMemo(() => {
    if (authFilter === 'all') return apps;
    return apps.filter((a) => a.authType === authFilter);
  }, [apps, authFilter]);

  const connectionsByApp = useMemo(() => {
    const map = new Map<string, IntegrationConnection[]>();
    for (const c of connections) {
      const existing = map.get(c.app) || [];
      existing.push(c);
      map.set(c.app, existing);
    }
    return map;
  }, [connections]);

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

  // Stable ref for connectionsByApp to avoid re-creating handleConnect on every refetch
  const connectionsByAppRef = useRef(connectionsByApp);
  connectionsByAppRef.current = connectionsByApp;

  const handleConnect = useCallback(
    async (app: IntegrationApp) => {
      const sandboxIdForConnect = autoConnectSandboxId.current || undefined;
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
              const existing = connectionsByAppRef.current.get(app.slug) || [];
              let label: string | undefined;
              if (existing.length > 0) {
                label = `${app.name} Account ${existing.length + 1}`;
              }

              const saveResult = await saveConnection.mutateAsync({
                app: app.slug,
                app_name: app.name,
                provider_account_id: providerAccountId,
                label,
                sandbox_id: sandboxIdForConnect,
              });

              if (saveResult.link?.attempted && !saveResult.link.linked) {
                const reason = saveResult.link.reason;
                if (reason === 'sandbox_not_owned') {
                  toast.error(
                    `${app.name} connected, but it could not be linked to this sandbox. ` +
                    'Make sure you are in the same account/workspace that owns this sandbox.',
                  );
                } else if (reason === 'sandbox_conflict') {
                  toast.error(
                    `${app.name} connected, but this sandbox already has another active ${app.name} profile linked. ` +
                    'Unlink the existing profile first, then reconnect.',
                  );
                } else {
                  toast.error(
                    `${app.name} connected, but sandbox linking failed. Check Integrations settings to relink manually.`,
                  );
                }
              } else {
                toast.success(`${app.name} connected successfully!`);
              }
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
    // connectionsByApp removed — we use a ref instead to avoid dependency churn
    [createToken, saveConnection, user],
  );

  // Auto-connect from URL params (e.g. ?connect=gmail&sandbox_id=xxx)
  // Reads params once, clears URL immediately, fires connect.
  useEffect(() => {
    const connectApp = searchParams.get('connect');
    if (!connectApp || autoConnectTriggered.current || !user || appsLoading) return;
    autoConnectTriggered.current = true;

    autoConnectSandboxId.current = searchParams.get('sandbox_id');

    // Clear query params from URL immediately to stop Next.js prefetch spam.
    // Use window.history directly to avoid React re-render cycles from router.replace.
    window.history.replaceState(window.history.state, '', '/integrations');

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, appsLoading]);

  const handleManage = useCallback(
    (connection: IntegrationConnection) => {
      setManageConnection(connection);
    },
    [],
  );

  return {
    // State
    searchQuery,
    setSearchQuery,
    authFilter,
    setAuthFilter,
    connectingApp,
    manageConnection,
    setManageConnection,

    // Data
    connections,
    filteredApps,
    connectionsByApp,
    appImgMap,
    apps,

    // Loading / error
    appsLoading,
    connectionsLoading,
    appsError,
    error,

    // Pagination
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,

    // Actions
    handleConnect,
    handleManage,
  };
}
