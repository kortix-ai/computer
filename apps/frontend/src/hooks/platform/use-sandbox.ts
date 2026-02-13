/**
 * useSandbox — manages the user's sandbox lifecycle.
 *
 * On mount (when user is authenticated):
 *   1. Calls POST /v1/account/init on the platform service
 *   2. Gets back the sandbox info (base_url, external_id, provider, etc.)
 *   3. Registers the sandbox as a server in the server-store
 *      so the OpenCode SDK automatically connects to it
 *
 * The hook is idempotent — calling init multiple times returns the
 * same sandbox if one already exists.
 *
 * In LOCAL mode, the platform API is skipped entirely — the user's
 * default server (NEXT_PUBLIC_OPENCODE_URL) is used directly.
 * Instances can be added manually via the Instance Manager dialog.
 */

import { useQuery } from '@tanstack/react-query';
import {
  initAccount,
  getProviders,
  getSandboxUrl,
  extractMappedPorts,
  type SandboxInfo,
  type SandboxProviderName,
} from '@/lib/platform-client';
import { useServerStore } from '@/stores/server-store';
import { useAuth } from '@/components/AuthProvider';
import { useEffect, useRef } from 'react';

const IS_LOCAL = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local';

const SANDBOX_SERVER_ID = 'cloud-sandbox';

/**
 * Register (or update) the sandbox as a server entry in the server store
 * and set it as the active server if no other server is active.
 */
function registerSandboxServer(sandbox: SandboxInfo) {
  const store = useServerStore.getState();
  const url = getSandboxUrl(sandbox);
  const mappedPorts = extractMappedPorts(sandbox);
  const existing = store.servers.find((s) => s.id === SANDBOX_SERVER_ID);

  if (existing) {
    // Update URL / mappedPorts if they changed (e.g. sandbox was reprovisioned)
    const urlChanged = existing.url !== url;
    const portsChanged =
      JSON.stringify(existing.mappedPorts) !== JSON.stringify(mappedPorts);

    if (urlChanged || portsChanged) {
      useServerStore.setState((state) => ({
        servers: state.servers.map((s) =>
          s.id === SANDBOX_SERVER_ID
            ? {
                ...s,
                url: urlChanged ? url : s.url,
                label: sandbox.name || s.label,
                mappedPorts,
              }
            : s,
        ),
        // Bump version if the URL changed so subscribers reconnect
        ...(urlChanged ? { serverVersion: state.serverVersion + 1 } : {}),
      }));
    }
  } else {
    // Add new server entry for the sandbox
    // We manually set the state to inject our known ID
    useServerStore.setState((state) => ({
      servers: [
        ...state.servers,
        {
          id: SANDBOX_SERVER_ID,
          label: sandbox.name || (sandbox.provider === 'local_docker' ? 'Local Sandbox' : 'Cloud Sandbox'),
          url,
          provider: sandbox.provider,
          sandboxId: sandbox.sandbox_id,
          mappedPorts,
        },
      ],
    }));
  }

  // Auto-switch to sandbox if user is still on the default localhost server
  // (means they haven't manually selected something else)
  if (store.activeServerId === 'default') {
    store.setActiveServer(SANDBOX_SERVER_ID);
  }
}

export function useSandbox() {
  const { user } = useAuth();
  const registeredRef = useRef(false);

  const query = useQuery({
    queryKey: ['platform', 'sandbox'],
    queryFn: async () => {
      const result = await initAccount();
      return result.sandbox;
    },
    // In local mode, skip the platform API entirely.
    // The user's default server (from NEXT_PUBLIC_OPENCODE_URL) is used directly;
    // additional instances can be added manually via the Instance Manager.
    enabled: !!user && !IS_LOCAL,
    staleTime: 5 * 60 * 1000, // 5 minutes — sandbox doesn't change often
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Register sandbox in server store when data arrives
  useEffect(() => {
    if (query.data && !registeredRef.current) {
      registerSandboxServer(query.data);
      registeredRef.current = true;
    }
  }, [query.data]);

  // Reset registration flag when user changes
  useEffect(() => {
    registeredRef.current = false;
  }, [user?.id]);

  return {
    sandbox: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * useProviders — fetch available sandbox providers from the platform.
 * Disabled in local mode (no kortix-api to query).
 */
export function useProviders() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['platform', 'providers'],
    queryFn: getProviders,
    enabled: !!user && !IS_LOCAL,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export { SANDBOX_SERVER_ID };
export type { SandboxProviderName };
