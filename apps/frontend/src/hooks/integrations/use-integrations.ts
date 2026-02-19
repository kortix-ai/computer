import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IntegrationConnection {
  integrationId: string;
  accountId: string;
  app: string;
  appName: string | null;
  label: string | null;
  providerName: string;
  providerAccountId: string;
  status: 'active' | 'revoked' | 'expired' | 'error';
  scopes: string[];
  metadata: Record<string, unknown>;
  connectedAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationApp {
  slug: string;
  name: string;
  description?: string;
  imgSrc?: string;
  authType?: string;
  categories: string[];
}

export interface ConnectTokenResult {
  token: string;
  expiresAt: string;
  connectUrl?: string;
}

export interface LinkedSandbox {
  sandboxId: string;
  name: string;
  status: string;
  grantedAt: string;
}

export interface AppSandboxLink {
  sandboxId: string;
  sandboxName: string;
  integrationId: string;
  label: string | null;
}

export interface IntegrationSandboxesResult {
  sandboxes: LinkedSandbox[];
  appSandboxLinks: AppSandboxLink[];
}

interface AppPageInfo {
  totalCount: number;
  count: number;
  endCursor?: string;
  hasMore: boolean;
}

interface AppsPage {
  apps: IntegrationApp[];
  pageInfo: AppPageInfo;
}

// ─── API Functions ──────────────────────────────────────────────────────────

const fetchAppsPage = async (query?: string, cursor?: string): Promise<AppsPage> => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  const response = await backendApi.get<AppsPage>(
    `/integrations/apps${qs ? `?${qs}` : ''}`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch integration apps');
  }
  return response.data!;
};

const fetchConnections = async (): Promise<IntegrationConnection[]> => {
  const response = await backendApi.get<{ connections: IntegrationConnection[] }>(
    '/integrations/connections',
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch connections');
  }
  return response.data!.connections;
};

const createConnectToken = async (app?: string): Promise<ConnectTokenResult> => {
  const response = await backendApi.post<ConnectTokenResult>(
    '/integrations/connect-token',
    app ? { app } : {},
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to create connect token');
  }
  return response.data!;
};

const deleteConnection = async (integrationId: string): Promise<void> => {
  const response = await backendApi.delete(`/integrations/connections/${integrationId}`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to disconnect integration');
  }
};

const linkSandbox = async ({
  integrationId,
  sandboxId,
}: {
  integrationId: string;
  sandboxId: string;
}): Promise<void> => {
  const response = await backendApi.post(
    `/integrations/connections/${integrationId}/link`,
    { sandbox_id: sandboxId },
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to link sandbox');
  }
};

const unlinkSandbox = async ({
  integrationId,
  sandboxId,
}: {
  integrationId: string;
  sandboxId: string;
}): Promise<void> => {
  const response = await backendApi.delete(
    `/integrations/connections/${integrationId}/link/${sandboxId}`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to unlink sandbox');
  }
};

const saveConnection = async (data: {
  app: string;
  app_name?: string;
  provider_account_id: string;
  label?: string;
  sandbox_id?: string;
}): Promise<void> => {
  const response = await backendApi.post('/integrations/connections/save', data);
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to save connection');
  }
};

const renameIntegration = async ({
  integrationId,
  label,
}: {
  integrationId: string;
  label: string;
}): Promise<void> => {
  const response = await backendApi.patch(
    `/integrations/connections/${integrationId}/label`,
    { label },
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to rename integration');
  }
};

const fetchIntegrationSandboxes = async (integrationId: string): Promise<IntegrationSandboxesResult> => {
  const response = await backendApi.get<IntegrationSandboxesResult>(
    `/integrations/connections/${integrationId}/sandboxes`,
  );
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch linked sandboxes');
  }
  return response.data!;
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export const useIntegrationApps = (query?: string) => {
  return useInfiniteQuery({
    queryKey: ['integration-apps', query],
    queryFn: ({ pageParam }) => fetchAppsPage(query, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo?.hasMore ? lastPage.pageInfo.endCursor : undefined,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};

export const useIntegrationConnections = () => {
  return useQuery({
    queryKey: ['integration-connections'],
    queryFn: fetchConnections,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
  });
};

export const useCreateConnectToken = () => {
  return useMutation({
    mutationFn: createConnectToken,
  });
};

export const useSaveConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    },
  });
};

export const useDisconnectIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    },
  });
};

export const useLinkSandboxIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: linkSandbox,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
      queryClient.invalidateQueries({ queryKey: ['integration-sandboxes'] });
    },
  });
};

export const useUnlinkSandboxIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkSandbox,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
      queryClient.invalidateQueries({ queryKey: ['integration-sandboxes'] });
    },
  });
};

export const useRenameIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: renameIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    },
  });
};

export const useIntegrationSandboxes = (integrationId: string | null) => {
  return useQuery({
    queryKey: ['integration-sandboxes', integrationId],
    queryFn: () => fetchIntegrationSandboxes(integrationId!),
    enabled: !!integrationId,
    staleTime: 30 * 1000,
  });
};
