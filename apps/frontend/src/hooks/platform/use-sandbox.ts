/**
 * useSandbox — monitors the user's sandbox lifecycle.
 *
 * On mount (when user is authenticated):
 *   1. Calls GET /platform/sandbox to check for an existing sandbox
 *   2. If one exists, registers it as a server in the server-store
 *      so the OpenCode SDK automatically connects to it
 *   3. If none exists AND billing is enabled (cloud mode), auto-creates
 *      one via POST /platform/init so the user doesn't have to manually
 *      provision a sandbox
 *   4. If none exists AND billing is disabled (self-hosted), returns null
 *      — the user creates one via the Instance Manager dialog
 */

import { useQuery } from '@tanstack/react-query';
import {
  getSandbox,
  ensureSandbox,
  getProviders,
  extractMappedPorts,
  type SandboxInfo,
  type SandboxProviderName,
} from '@/lib/platform-client';
import { isBillingEnabled } from '@/lib/config';
import { useServerStore } from '@/stores/server-store';
import { useTabStore } from '@/stores/tab-store';
import { useAuth } from '@/components/AuthProvider';
import { useEffect } from 'react';

/**
 * Register the sandbox as a server entry in the server store on boot.
 * Deduplicates by sandboxId — if an entry for this sandbox already exists
 * in the store (e.g. from a previous session), it's reused.
 *
 * Auto-switches to the sandbox if the user hasn't manually picked a server.
 */
function registerSandboxServer(sandbox: SandboxInfo) {
  if (!sandbox.external_id) {
    console.warn('[useSandbox] Sandbox missing external_id, skipping registration');
    return;
  }

  const store = useServerStore.getState();
  const isLocal = sandbox.provider === 'local_docker';

  // Use the centralized registerOrUpdateSandbox which uses stable IDs
  // ('default' for local, 'cloud-sandbox' for cloud) — no random IDs,
  // no duplicates across refreshes.
  const serverId = store.registerOrUpdateSandbox(
    {
      label: sandbox.name || (isLocal ? 'Local Sandbox' : 'Cloud Sandbox'),
      provider: sandbox.provider,
      sandboxId: sandbox.external_id,
      mappedPorts: extractMappedPorts(sandbox),
    },
    { autoSwitch: true, isLocal },
  );

  // Auto-switch if the user hasn't manually selected a server, or if there's
  // no active server (e.g. after rehydration cleared stale managed entries).
  const previousActiveId = store.activeServerId;
  const shouldAutoSwitch = !store.userSelected || !previousActiveId ||
    !store.servers.some((s: any) => s.id === previousActiveId);
  if (shouldAutoSwitch && store.activeServerId !== serverId) {
    store.setActiveServer(serverId, { auto: true });
    useTabStore.getState().swapForServer(serverId, previousActiveId);
  }
}

// Module-level guard: ensures only one auto-create runs across all instances/re-renders.
let _autoCreatePromise: Promise<void> | null = null;

/**
 * Module-level flag: suppresses auto-create after user explicitly deletes a sandbox.
 * Reset on next successful sandbox fetch (i.e. user created a new one manually).
 */
let _userDeletedSandbox = false;

/** Call this when the user explicitly removes their sandbox to prevent auto-recreate. */
export function markSandboxDeleted(): void {
  _userDeletedSandbox = true;
}

export function useSandbox() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['platform', 'sandbox'],
    queryFn: async () => {
      // In cloud mode, auto-create if no sandbox exists (idempotent via backend).
      // Uses module-level promise dedup so concurrent hook instances share one call.
      if (isBillingEnabled()) {
        const existing = await getSandbox();
        if (existing) {
          // User has a sandbox — clear the deletion flag (they created a new one).
          _userDeletedSandbox = false;
          return existing;
        }

        // No sandbox — but if the user just deleted it, DON'T auto-create.
        // They'll create a new one manually via the Instance Manager.
        if (_userDeletedSandbox) {
          return null;
        }

        // No sandbox and no intentional deletion — auto-create via ensureSandbox
        // (POST /platform/init, idempotent). Module-level promise dedup so
        // concurrent hook instances share one call.
        if (!_autoCreatePromise) {
          _autoCreatePromise = ensureSandbox()
            .then(({ sandbox }) => {
              console.log('[useSandbox] Sandbox auto-created:', sandbox.external_id);
            })
            .catch((err) => {
              console.error('[useSandbox] Auto-create failed:', err);
            })
            .finally(() => {
              _autoCreatePromise = null;
            });
        }
        await _autoCreatePromise;
        // Re-fetch after creation
        return await getSandbox();
      }

      return await getSandbox();
    },
    enabled: !!user,
    staleTime: 0,
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
