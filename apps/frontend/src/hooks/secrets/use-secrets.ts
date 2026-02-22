'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { authenticatedFetch } from '@/lib/auth-token';

const getInstanceUrl = () => getActiveOpenCodeUrl();

export const secretsKeys = {
  all: ['secrets'] as const,
};

/**
 * Fetch all secrets (key → full value) via GET /env.
 * The frontend handles masking in the UI.
 */
export function useSecrets() {
  return useQuery({
    queryKey: secretsKeys.all,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await authenticatedFetch(`${getInstanceUrl()}/env`);
      if (!res.ok) throw new Error('Failed to fetch secrets');
      const data = await res.json();
      return data.secrets ?? {};
    },
  });
}

/**
 * Set a single secret via PUT /env/:key.
 */
export function useSetSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await authenticatedFetch(`${getInstanceUrl()}/env/${encodeURIComponent(key)}`, {
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
        qc.setQueryData(secretsKeys.all, { ...prev, [key]: value });
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
 * Delete a single secret via DELETE /env/:key.
 */
export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const res = await authenticatedFetch(`${getInstanceUrl()}/env/${encodeURIComponent(key)}`, {
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
