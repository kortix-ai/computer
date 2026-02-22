'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/lib/opencode-sdk';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import type { Pty } from '@kortix/opencode-sdk/v2/client';

export type { Pty };

// ============================================================================
// Query Keys
// ============================================================================

// Keys intentionally NOT under 'opencode' so they survive server-switch cache nukes.
// Scoped by serverUrl so each instance keeps its own cached list.
export const ptyKeys = {
  all: ['pty'] as const,
  list: (serverUrl: string) => ['pty', serverUrl, 'list'] as const,
  listPrefix: () => ['pty'] as const,
  detail: (id: string) => ['pty', id] as const,
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

export function useOpenCodePtyList(options?: { enabled?: boolean; serverUrl?: string }) {
  const activeUrl = getActiveOpenCodeUrl();
  const serverUrl = options?.serverUrl ?? activeUrl;
  return useQuery<Pty[]>({
    queryKey: ptyKeys.list(serverUrl),
    queryFn: async () => {
      const client = getClient();
      const result = await client.pty.list();
      return unwrap(result);
    },
    staleTime: Infinity, // SSE pty.* events trigger refetch
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
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
      // SSE pty.created will also fire; this is instant feedback
      queryClient.refetchQueries({ queryKey: ptyKeys.listPrefix(), type: 'active' });
    },
  });
}

export function useRemovePty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const client = getClient();
      const result = await client.pty.remove({ ptyID: id } as any);
      unwrap(result);
    },
    onSuccess: () => {
      // SSE pty.deleted will also fire
      queryClient.refetchQueries({ queryKey: ptyKeys.listPrefix(), type: 'active' });
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
      const result = await client.pty.update({ ptyID: id, title, size } as any);
      return unwrap(result);
    },
  });
}

// ============================================================================
// WebSocket URL helper
// ============================================================================

export function getPtyWebSocketUrl(ptyId: string, serverUrl?: string): string {
  const baseUrl = serverUrl || getActiveOpenCodeUrl();
  const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  return `${wsUrl}/pty/${ptyId}/connect`;
}
