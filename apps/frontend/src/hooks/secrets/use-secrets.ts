'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const getBackendUrl = () =>
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';

export const secretsKeys = {
  all: ['secrets'] as const,
};

/**
 * Fetch all secrets (key → masked value).
 */
export function useSecrets() {
  return useQuery({
    queryKey: secretsKeys.all,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await fetch(`${getBackendUrl()}/secrets`);
      if (!res.ok) throw new Error('Failed to fetch secrets');
      const data = await res.json();
      return data.secrets ?? {};
    },
  });
}

/**
 * Set a single secret.
 */
export function useSetSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(`${getBackendUrl()}/secrets/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save secret');
      }
      return res.json();
    },
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: secretsKeys.all });
      const prev = qc.getQueryData<Record<string, string>>(secretsKeys.all);
      if (prev) {
        const masked = value.length >= 8
          ? value.slice(0, 4) + '...' + value.slice(-4)
          : '****';
        qc.setQueryData(secretsKeys.all, { ...prev, [key]: masked });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(secretsKeys.all, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: secretsKeys.all });
    },
  });
}

/**
 * Delete a single secret.
 */
export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`${getBackendUrl()}/secrets/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete secret');
      }
      return res.json();
    },
    onMutate: async (key) => {
      await qc.cancelQueries({ queryKey: secretsKeys.all });
      const prev = qc.getQueryData<Record<string, string>>(secretsKeys.all);
      if (prev) {
        const next = { ...prev };
        // Set to empty (template keys will reappear as "not set", custom keys removed on refetch)
        if (key in next) next[key] = '';
        qc.setQueryData(secretsKeys.all, next);
      }
      return { prev };
    },
    onError: (_err, _key, ctx) => {
      if (ctx?.prev) qc.setQueryData(secretsKeys.all, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: secretsKeys.all });
    },
  });
}
