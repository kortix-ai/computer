'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { isLocalMode } from '@/lib/config';
import { toast } from '@/lib/toast';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProviderCategory = 'llm' | 'tool';

export interface ProviderDef {
  id: string;
  name: string;
  category: ProviderCategory;
  envKeys: string[];
  envUrlKey?: string;
  defaultUrl?: string;
  helpUrl?: string;
  description?: string;
  recommended?: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  category: ProviderCategory;
  description?: string;
  helpUrl?: string;
  recommended?: boolean;
  connected: boolean;
  source: 'secretstore' | 'env' | 'none';
  maskedKeys: Record<string, string>;
}

export interface HealthData {
  api: { ok: boolean; error?: string };
  docker: { ok: boolean; error?: string };
  sandbox: { ok: boolean; error?: string };
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/** Fetch all providers with connection status */
export function useProviders() {
  return useQuery<ProviderStatus[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await backendApi.get('/providers');
      return res.data.providers;
    },
    enabled: isLocalMode(),
  });
}

/** Fetch provider schema (registry definitions) */
export function useProviderSchema() {
  return useQuery<ProviderDef[]>({
    queryKey: ['providers-schema'],
    queryFn: async () => {
      const res = await backendApi.get('/providers/schema');
      return res.data;
    },
    enabled: isLocalMode(),
  });
}

/** Fetch system health status */
export function useProviderHealth() {
  return useQuery<HealthData>({
    queryKey: ['providers-health'],
    queryFn: async () => {
      const res = await backendApi.get('/providers/health');
      return res.data;
    },
    enabled: isLocalMode(),
    refetchInterval: 30000,
  });
}

/** Connect a provider (store API key) */
export function useConnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, keys }: { id: string; keys: Record<string, string> }) => {
      const res = await backendApi.put(`/providers/${id}/connect`, { keys });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Provider connected');
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers-health'] });
      // Also invalidate legacy queries in case old components are still mounted
      queryClient.invalidateQueries({ queryKey: ['setup-env'] });
    },
    onError: () => {
      toast.error('Failed to connect provider');
    },
  });
}

/** Disconnect a provider (remove stored API key) */
export function useDisconnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await backendApi.delete(`/providers/${id}/disconnect`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Provider disconnected');
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers-health'] });
      queryClient.invalidateQueries({ queryKey: ['setup-env'] });
    },
    onError: () => {
      toast.error('Failed to disconnect provider');
    },
  });
}
