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

  useEffect(() => {
    const connectApp = searchParams.get('connect');
    if (!connectApp || autoConnectTriggered.current || !user || appsLoading) return;
    autoConnectTriggered.current = true;

    autoConnectSandboxId.current = searchParams.get('sandbox_id');
    router.replace('/integrations', { scroll: false });

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
