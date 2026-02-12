'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/lib/opencode-sdk';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import type { Pty } from '@kortix/opencode-sdk/v2/client';

export type { Pty };

// ============================================================================
// Query Keys
// ============================================================================

export const ptyKeys = {
  all: ['opencode', 'pty'] as const,
  list: () => ['opencode', 'pty', 'list'] as const,
  detail: (id: string) => ['opencode', 'pty', id] as const,
};

// ============================================================================
// Helper: unwrap SDK response
// ============================================================================

function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error) {
    const err = result.error as any;
    throw new Error(err?.data?.message || err?.message || 'SDK request failed');
  }
  return result.data as T;
}

// ============================================================================
// Hooks
// ============================================================================

export function useOpenCodePtyList() {
  return useQuery<Pty[]>({
    queryKey: ptyKeys.list(),
    queryFn: async () => {
      const client = getClient();
      const result = await client.pty.list();
      return unwrap(result);
    },
    staleTime: 5 * 1000,
    gcTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: {
      command?: string;
      args?: string[];
      cwd?: string;
      title?: string;
      env?: Record<string, string>;
    }) => {
      const client = getClient();
      const result = await client.pty.create(options as any);
      return unwrap(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ptyKeys.list() });
    },
  });
}

export function useRemovePty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const client = getClient();
      const result = await client.pty.remove({ id } as any);
      unwrap(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ptyKeys.list() });
    },
  });
}

export function useUpdatePty() {
  return useMutation({
    mutationFn: async ({
      id,
      title,
      size,
    }: {
      id: string;
      title?: string;
      size?: { rows: number; cols: number };
    }) => {
      const client = getClient();
      const result = await client.pty.update({ id, title, size } as any);
      return unwrap(result);
    },
  });
}

// ============================================================================
// WebSocket URL helper
// ============================================================================

export function getPtyWebSocketUrl(ptyId: string): string {
  const baseUrl = getActiveOpenCodeUrl();
  const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  return `${wsUrl}/pty/${ptyId}/connect`;
}
