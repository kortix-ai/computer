'use client';

import { useQuery } from '@tanstack/react-query';
import { getClient } from '@/lib/opencode-sdk';
import type { Config } from '@kortix/opencode-sdk/v2/client';

export type { Config };

const configKeys = {
  all: ['opencode', 'config'] as const,
};

function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error) {
    const err = result.error as any;
    throw new Error(err?.data?.message || err?.message || 'Request failed');
  }
  return result.data as T;
}

export function useOpenCodeConfig() {
  return useQuery<Config>({
    queryKey: configKeys.all,
    queryFn: async () => {
      const client = getClient();
      const result = await client.config.get();
      return unwrap(result);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
