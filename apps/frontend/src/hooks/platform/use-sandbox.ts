/**
 * useSandbox — manages the user's sandbox lifecycle.
 *
 * On mount (when user is authenticated):
 *   1. Calls POST /v1/account/init on the platform service
 *   2. Gets back the sandbox info (base_url, external_id, etc.)
 *   3. Registers the sandbox as a server in the server-store
 *      so the OpenCode SDK automatically connects to it
 *
 * The hook is idempotent — calling init multiple times returns the
 * same sandbox if one already exists.
 */

import { useQuery } from '@tanstack/react-query';
import { initAccount, getSandboxUrl, type SandboxInfo } from '@/lib/platform-client';
import { useServerStore } from '@/stores/server-store';
import { useAuth } from '@/components/AuthProvider';
import { useEffect, useRef } from 'react';

const SANDBOX_SERVER_ID = 'cloud-sandbox';

/**
 * Register (or update) the sandbox as a server entry in the server store
 * and set it as the active server if no other server is active.
 */
function registerSandboxServer(sandbox: SandboxInfo) {
  const store = useServerStore.getState();
  const url = getSandboxUrl(sandbox);
  const existing = store.servers.find((s) => s.id === SANDBOX_SERVER_ID);

  if (existing) {
    // Update URL if it changed (e.g. sandbox was reprovisioned)
    if (existing.url !== url) {
      store.updateServer(SANDBOX_SERVER_ID, {
        url,
        label: sandbox.name || 'Cloud Sandbox',
      });
    }
  } else {
    // Add new server entry for the sandbox
    // We manually set the state to inject our known ID
    useServerStore.setState((state) => ({
      servers: [
        ...state.servers,
        {
          id: SANDBOX_SERVER_ID,
          label: sandbox.name || 'Cloud Sandbox',
          url,
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
    enabled: !!user,
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

export { SANDBOX_SERVER_ID };
