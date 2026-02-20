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
import { useServerStore } from '@/stores/server-store';
import { useTabStore } from '@/stores/tab-store';
import { useAuth } from '@/components/AuthProvider';
import { isLocalMode } from '@/lib/config';
import { useEffect } from 'react';

/**
 * Register the sandbox as a server entry in the server store on boot.
 * Deduplicates by sandboxId — if an entry for this sandbox already exists
 * in the store (e.g. from a previous session), it's reused.
 *
 * Auto-switches to the sandbox if the user hasn't manually picked a server.
 */
function registerSandboxServer(sandbox: SandboxInfo) {
  let url: string;
  try {
    url = getSandboxUrl(sandbox);
  } catch (err) {
    console.warn('[useSandbox] Cannot build sandbox URL, skipping registration:', err);
    return;
  }

  const store = useServerStore.getState();
  const previousActiveId = store.activeServerId;

  // In local mode, update the default entry metadata (single sandbox).
  if (isLocalMode()) {
    store.updateServerSilent('default', {
      url,
      label: sandbox.name || 'Local Sandbox',
      provider: sandbox.provider,
      sandboxId: sandbox.external_id,
      mappedPorts: extractMappedPorts(sandbox),
    });
    return;
  }

  // Cloud mode: add (or deduplicate) by sandboxId.
  const entry = store.addSandboxServer({
    label: sandbox.name || 'Cloud Sandbox',
    url,
    provider: sandbox.provider,
    sandboxId: sandbox.external_id,
    mappedPorts: extractMappedPorts(sandbox),
  });

  // Auto-switch if the user hasn't manually selected anything
  if (!store.userSelected && (!previousActiveId || previousActiveId === 'default')) {
    store.setActiveServer(entry.id, { auto: true });
    useTabStore.getState().swapForServer(entry.id, previousActiveId);
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
export const SANDBOX_SERVER_ID = 'cloud-sandbox';
export type { SandboxProviderName };
