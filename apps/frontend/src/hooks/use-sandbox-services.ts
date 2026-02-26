'use client';

import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/auth-token';
import { useServerStore } from '@/stores/server-store';

// ============================================================================
// Types — matches ServiceEntry from kortix-master/src/routes/services.ts
// ============================================================================

export interface SandboxService {
  /** Unique service identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Port the service is listening on */
  port: number;
  /** Process ID */
  pid: number;
  /** Detected framework (nextjs, vite, python, static, node, go, etc.) */
  framework: string;
  /** Source directory path */
  sourcePath: string;
  /** ISO timestamp when the service started */
  startedAt: string;
  /** Current status */
  status: 'running' | 'stopped';
  /** Whether this service is managed by the deployer (vs manually started) */
  managed: boolean;
}

// ============================================================================
// Query Keys
// ============================================================================

export const serviceKeys = {
  all: ['sandbox-services'] as const,
  list: (serverUrl: string) => ['sandbox-services', serverUrl, 'list'] as const,
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch running services from Kortix Master inside the sandbox.
 * Calls GET /kortix/services on the active server URL.
 */
export function useSandboxServices(options?: { enabled?: boolean }) {
  const serverUrl = useServerStore((s) => {
    const active = s.servers.find((srv) => srv.id === s.activeServerId);
    return active?.url || '';
  });

  return useQuery<SandboxService[]>({
    queryKey: serviceKeys.list(serverUrl),
    queryFn: async () => {
      if (!serverUrl) return [];
      const url = `${serverUrl}/kortix/services`;
      try {
        const res = await authenticatedFetch(
          url,
          { signal: AbortSignal.timeout(5000) },
          { retryOnAuthError: false },
        );
        if (!res.ok) {
          console.warn(`[Services] GET ${url} → ${res.status}`);
          return [];
        }
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          return (data.services ?? []) as SandboxService[];
        } catch {
          // Response was not JSON — likely OpenCode HTML fallback
          console.warn(`[Services] GET ${url} → not JSON (route not registered in Kortix Master). First 100 chars:`, text.slice(0, 100));
          return [];
        }
      } catch {
        return [];
      }
    },
    enabled: (options?.enabled ?? true) && !!serverUrl,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}
