import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import type { ChannelType } from './use-channels';

export interface PlatformCredentialStatus {
  configured: boolean;
  source: 'env' | 'db' | 'none';
  fields: Record<string, boolean>;
}

export interface PlatformCredentialEntry {
  id: string;
  channelType: ChannelType;
  sandboxId: string | null;
  sandboxName: string | null;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export function usePlatformCredentialStatus(channelType: ChannelType | null, sandboxId?: string | null) {
  return useQuery({
    queryKey: ['platform-credentials', channelType, sandboxId ?? null],
    queryFn: async () => {
      if (!channelType) return null;
      const params = sandboxId ? `?sandbox_id=${sandboxId}` : '';
      const res = await backendApi.get<PlatformCredentialStatus>(
        `/channels/platform-credentials/${channelType}${params}`,
        { showErrors: false },
      );
      if (!res.success || !res.data) {
        throw new Error('Failed to fetch platform credential status');
      }
      return res.data;
    },
    enabled: !!channelType,
  });
}

export function usePlatformCredentialsList() {
  return useQuery({
    queryKey: ['platform-credentials-list'],
    queryFn: async () => {
      const res = await backendApi.get<{ success: boolean; data: PlatformCredentialEntry[] }>(
        '/channels/platform-credentials',
        { showErrors: false },
      );
      if (!res.success || !res.data) {
        throw new Error('Failed to fetch platform credentials list');
      }
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useSavePlatformCredentials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelType,
      credentials,
      sandboxId,
    }: {
      channelType: ChannelType;
      credentials: Record<string, string>;
      sandboxId?: string | null;
    }) => {
      const body: Record<string, unknown> = { ...credentials };
      if (sandboxId) {
        body.sandbox_id = sandboxId;
      }
      const res = await backendApi.put(
        `/channels/platform-credentials/${channelType}`,
        body,
      );
      if (!res.success) {
        throw new Error(
          (res.error as any)?.message || 'Failed to save platform credentials',
        );
      }
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['platform-credentials', variables.channelType],
      });
      queryClient.invalidateQueries({
        queryKey: ['platform-credentials-list'],
      });
    },
  });
}

export function useDeletePlatformCredentials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelType,
      sandboxId,
    }: {
      channelType: ChannelType;
      sandboxId?: string | null;
    }) => {
      const params = sandboxId ? `?sandbox_id=${sandboxId}` : '';
      const res = await backendApi.delete(
        `/channels/platform-credentials/${channelType}${params}`,
      );
      if (!res.success) {
        throw new Error(
          (res.error as any)?.message || 'Failed to delete platform credentials',
        );
      }
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['platform-credentials', variables.channelType],
      });
      queryClient.invalidateQueries({
        queryKey: ['platform-credentials-list'],
      });
    },
  });
}
