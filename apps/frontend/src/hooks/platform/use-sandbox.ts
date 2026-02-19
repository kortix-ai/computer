/**
 * useSandbox — monitors the user's sandbox lifecycle.
 *
 * On mount (when user is authenticated):
 *   1. Calls GET /platform/sandbox to check for an existing sandbox
 *   2. If one exists, registers it as a server in the server-store
 *      so the OpenCode SDK automatically connects to it
 *   3. If none exists, returns null — the user must explicitly create
 *      one via the Instance Manager dialog
 *
 * NOTE: This hook does NOT auto-create sandboxes. Creation only happens
 * when the user clicks "Cloud" or "Local Docker" in the Instance Manager,
 * which calls ensureSandbox() directly.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getSandbox,
  getProviders,
  getSandboxUrl,
  extractMappedPorts,
  type SandboxInfo,
  type SandboxProviderName,
} from '@/lib/platform-client';
import { useServerStore, CLOUD_SANDBOX_SERVER_ID } from '@/stores/server-store';
import { useTabStore } from '@/stores/tab-store';
import { useAuth } from '@/components/AuthProvider';
import { isLocalMode } from '@/lib/config';
import { useEffect } from 'react';

/**
 * Register (or update) the sandbox as a server entry in the server store
 * and set it as the active server if no other server is active.
 *
 * Delegates to the centralized `registerOrUpdateSandbox()` action on
 * server-store — no duplicated logic here. Tab-swapping is handled
 * here since it's a UI concern (not a store concern).
 */
function registerSandboxServer(sandbox: SandboxInfo) {
  let url: string;
  try {
    url = getSandboxUrl(sandbox);
  } catch (err) {
    console.warn('[useSandbox] Cannot build sandbox URL, skipping registration:', err);
    return;
  }

  const previousActiveId = useServerStore.getState().activeServerId;

  const serverId = useServerStore.getState().registerOrUpdateSandbox(
    {
      url,
      label: sandbox.name || (sandbox.provider === 'local_docker' ? 'Local Sandbox' : 'Cloud Sandbox'),
      provider: sandbox.provider,
      sandboxId: sandbox.external_id,
      mappedPorts: extractMappedPorts(sandbox),
    },
    { isLocal: isLocalMode(), autoSwitch: true },
  );

  // If the active server changed (autoSwitch kicked in), swap tabs
  const newActiveId = useServerStore.getState().activeServerId;
  if (newActiveId !== previousActiveId) {
    useTabStore.getState().swapForServer(serverId, previousActiveId);
  }
}

export function useSandbox() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['platform', 'sandbox'],
    queryFn: async () => {
      // Read-only check — returns null if no sandbox exists.
      // Does NOT create one. Creation is explicit via the Instance Manager.
      return await getSandbox();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes — sandbox doesn't change often
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Register/update sandbox in server store whenever data changes
  useEffect(() => {
    if (query.data) {
      registerSandboxServer(query.data);
    }
  }, [query.data]);

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
 */
export function useProviders() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['platform', 'providers'],
    queryFn: getProviders,
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** @deprecated Use CLOUD_SANDBOX_SERVER_ID from '@/stores/server-store' directly */
export const SANDBOX_SERVER_ID = CLOUD_SANDBOX_SERVER_ID;
export type { SandboxProviderName };
