import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSandboxAuthStore } from '@/stores/sandbox-auth-store';

/**
 * SDK client reset callback — set by opencode-sdk.ts to break the circular
 * dependency (server-store → opencode-sdk → server-store). Called when the
 * active server or token changes to force client recreation.
 */
let _resetClient: (() => void) | null = null;

/** Called by opencode-sdk.ts at module load to register the reset function. */
export function registerClientResetter(fn: () => void): void {
  _resetClient = fn;
}

function resetSDKClient(): void {
  _resetClient?.();
}

export type SandboxProvider = 'daytona' | 'local_docker';

export interface ServerEntry {
  id: string;
  label: string;
  url: string;
  isDefault?: boolean;
  /** Sandbox provider type, if this server was provisioned via platform API */
  provider?: SandboxProvider;
  /** Platform sandbox ID, if this server is a managed sandbox */
  sandboxId?: string;
  /**
   * Container-port → host-port map from Docker (local_docker provider).
   * e.g. { "6080": "32001", "8000": "32005", "9223": "32007" }
   * For Daytona, ports are accessed via subdomain routing, so this is unused.
   */
  mappedPorts?: Record<string, string>;
  /**
   * Optional per-instance sandbox auth token (SANDBOX_AUTH_TOKEN).
   * Set by the user in the Add/Edit Instance form or auto-saved when
   * the SandboxTokenDialog is submitted. Loaded into sandbox-auth-store
   * on instance switch.
   */
  authToken?: string;
}

interface ServerStore {
  servers: ServerEntry[];
  activeServerId: string;
  /** True when the user has manually picked a server via the selector UI. */
  userSelected: boolean;
  /**
   * Bumps ONLY on actual server switches (user picks a different server).
   * The SSE event stream subscribes to this — bumping it nukes all cached
   * queries and reconnects, so it must be used sparingly.
   */
  serverVersion: number;
  /**
   * Bumps on any URL/port update to the active server. The connection
   * health monitor subscribes to this for silent re-verification without
   * nuking cached data.
   */
  urlVersion: number;
  addServer: (label: string, url: string, authToken?: string) => ServerEntry;
  updateServer: (id: string, updates: Partial<Pick<ServerEntry, 'label' | 'url' | 'authToken'>>) => void;
  /**
   * Silently update a server's URL, ports, provider, and/or sandboxId
   * without triggering a full reconnect (no serverVersion bump). Only
   * bumps urlVersion so the connection monitor re-verifies.
   */
  updateServerSilent: (id: string, updates: Partial<Pick<ServerEntry, 'url' | 'provider' | 'sandboxId' | 'authToken'>> & { mappedPorts?: Record<string, string>; label?: string }) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string, options?: { auto?: boolean }) => void;
  getActiveServerUrl: () => string;
  clearStatuses: () => void;

  // ── Centralized actions (refactored from scattered callers) ──

  /**
   * Bump serverVersion to trigger a full reconnect (SSE + cached queries).
   * Use instead of direct `setState({ serverVersion: ... })` calls —
   * this is the single point of control for reconnect triggers.
   */
  bumpServerVersion: () => void;

  /**
   * Register or update a managed sandbox entry in the store.
   *
   * In local mode: updates the existing 'default' entry's metadata.
   * In cloud mode: creates or updates the 'cloud-sandbox' entry.
   *
   * Returns the server ID of the registered entry.
   */
  registerOrUpdateSandbox: (sandbox: {
    url: string;
    label: string;
    provider: SandboxProvider;
    sandboxId: string;
    mappedPorts?: Record<string, string>;
  }, options?: {
    /** If true, auto-switch to this sandbox when user hasn't manually selected */
    autoSwitch?: boolean;
    /** If true, this is local mode — update default entry instead of cloud-sandbox */
    isLocal?: boolean;
  }) => string;

  /**
   * Persist an auth token to BOTH the server entry AND the global
   * sandbox-auth-store, then reset the SDK client and bump serverVersion
   * so all connections pick up the new token.
   *
   * Replaces the scattered pattern of:
   *   sandboxAuthStore.setSandboxToken(token)
   *   updateServer(id, { authToken: token })
   *   resetSDKClient()
   *   bumpServerVersion()
   */
  persistToken: (serverId: string, token: string) => void;
}

/**
 * The default sandbox URL routes through the backend's unified preview proxy.
 * Uses the container name ('kortix-sandbox') as the sandbox ID — the backend
 * resolves this via Docker DNS on the shared network.
 * Same URL pattern for all providers: /v1/preview/{sandboxId}/{port}/*
 */
const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1').replace(/\/+$/, '');
const DEFAULT_SANDBOX_URL = `${BACKEND_URL}/preview/kortix-sandbox/8000`;
const SERVERS_API = `${BACKEND_URL}/servers`;

function generateId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── API sync helpers (fire-and-forget) ──────────────────────────────────────

/** Strip authToken before sending to API — tokens stay in localStorage only. */
function toApiPayload(s: ServerEntry) {
  return {
    id: s.id,
    label: s.label,
    url: s.url,
    isDefault: s.isDefault,
    provider: s.provider,
    sandboxId: s.sandboxId,
    mappedPorts: s.mappedPorts,
  };
}

function syncServerToApi(server: ServerEntry) {
  fetch(`${SERVERS_API}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiPayload(server)),
  }).catch(() => {}); // fire-and-forget
}

function deleteServerFromApi(id: string) {
  fetch(`${SERVERS_API}/${id}`, { method: 'DELETE' }).catch(() => {});
}

/** Bulk sync all servers to API (used on initial hydration). */
function syncAllToApi(servers: ServerEntry[]) {
  fetch(`${SERVERS_API}/sync`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ servers: servers.map(toApiPayload) }),
  }).catch(() => {});
}

/** Load servers from API, merging authTokens from localStorage entries. */
async function loadFromApi(localServers: ServerEntry[]): Promise<ServerEntry[] | null> {
  try {
    const res = await fetch(SERVERS_API);
    if (!res.ok) return null;
    const rows: Array<{
      id: string;
      label: string;
      url: string;
      isDefault: boolean;
      provider: 'daytona' | 'local_docker' | null;
      sandboxId: string | null;
      mappedPorts: Record<string, string> | null;
    }> = await res.json();
    if (!rows.length) return null;

    // Build a lookup for local authTokens
    const tokenMap = new Map<string, string>();
    for (const s of localServers) {
      if (s.authToken) tokenMap.set(s.id, s.authToken);
    }

    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      url: r.url,
      isDefault: r.isDefault,
      provider: r.provider ?? undefined,
      sandboxId: r.sandboxId ?? undefined,
      mappedPorts: r.mappedPorts ?? undefined,
      authToken: tokenMap.get(r.id),
    }));
  } catch {
    return null;
  }
}

const DEFAULT_SERVER_ID = 'default';
const CLOUD_SANDBOX_SERVER_ID = 'cloud-sandbox';

const createDefaultServer = (): ServerEntry => ({
  id: DEFAULT_SERVER_ID,
  label: 'Local Sandbox',
  url: DEFAULT_SANDBOX_URL,
  isDefault: true,
  provider: 'local_docker',
});

export const useServerStore = create<ServerStore>()(
  persist(
    (set, get) => ({
      servers: [createDefaultServer()],
      activeServerId: DEFAULT_SERVER_ID,
      userSelected: false,
      serverVersion: 0,
      urlVersion: 0,

      addServer: (label: string, url: string, authToken?: string) => {
        const normalizedUrl = url.replace(/\/+$/, '');
        const newServer: ServerEntry = {
          id: generateId(),
          label: label || normalizedUrl.replace(/^https?:\/\//, ''),
          url: normalizedUrl,
          ...(authToken ? { authToken } : {}),
        };
        set((state) => ({
          servers: [...state.servers, newServer],
        }));
        syncServerToApi(newServer);
        return newServer;
      },

      updateServer: (id: string, updates: Partial<Pick<ServerEntry, 'label' | 'url' | 'authToken'>>) => {
        const state = get();
        const isActive = state.activeServerId === id;
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...updates,
                  url: updates.url ? updates.url.replace(/\/+$/, '') : s.url,
                }
              : s,
          ),
          // Manual updateServer bumps serverVersion (full reconnect) —
          // use updateServerSilent for sandbox URL/port changes.
          ...(isActive && updates.url ? { serverVersion: state.serverVersion + 1 } : {}),
        }));
        // Sync non-token updates to API
        if (updates.label || updates.url) {
          const updated = get().servers.find((s) => s.id === id);
          if (updated) syncServerToApi(updated);
        }
      },

      updateServerSilent: (id, updates) => {
        const state = get();
        const isActive = state.activeServerId === id;
        const existing = state.servers.find((s) => s.id === id);
        if (!existing) return;

        const urlChanged = updates.url != null && updates.url !== existing.url;
        const portsChanged =
          updates.mappedPorts != null &&
          JSON.stringify(existing.mappedPorts) !== JSON.stringify(updates.mappedPorts);
        const providerChanged = updates.provider != null && updates.provider !== existing.provider;
        const sandboxIdChanged = updates.sandboxId != null && updates.sandboxId !== existing.sandboxId;

        if (!urlChanged && !portsChanged && !updates.label && !providerChanged && !sandboxIdChanged) return;

        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...(updates.url ? { url: updates.url.replace(/\/+$/, '') } : {}),
                  ...(updates.label ? { label: updates.label } : {}),
                  ...(updates.mappedPorts ? { mappedPorts: updates.mappedPorts } : {}),
                  ...(updates.provider != null ? { provider: updates.provider } : {}),
                  ...(updates.sandboxId != null ? { sandboxId: updates.sandboxId } : {}),
                }
              : s,
          ),
          // When the sandbox itself changed, force a full reconnect (SSE + queries).
          // For URL/port-only changes, only bump urlVersion (silent re-verify).
          ...(isActive && sandboxIdChanged
            ? { serverVersion: state.serverVersion + 1 }
            : isActive && (urlChanged || portsChanged)
              ? { urlVersion: state.urlVersion + 1 }
              : {}),
        }));
        // Sync to API
        const updated = get().servers.find((s) => s.id === id);
        if (updated) syncServerToApi(updated);
      },

      removeServer: (id: string) => {
        const state = get();
        const server = state.servers.find((s) => s.id === id);
        if (server?.isDefault) return;

        const wasActive = state.activeServerId === id;
        const newServers = state.servers.filter((s) => s.id !== id);
        set({
          servers: newServers,
          activeServerId: wasActive ? DEFAULT_SERVER_ID : state.activeServerId,
          // If we removed the active server, bump version
          ...(wasActive ? { serverVersion: state.serverVersion + 1 } : {}),
        });
        deleteServerFromApi(id);
      },

      setActiveServer: (id: string, options?: { auto?: boolean }) => {
        const state = get();
        if (state.activeServerId === id) return; // no-op

        // Sync per-instance auth token → global sandbox-auth-store.
        // This ensures getAuthToken() returns the correct token for the
        // target instance immediately, before any health check fires.
        const target = state.servers.find((s) => s.id === id);
        if (target?.authToken) {
          useSandboxAuthStore.getState().setSandboxToken(target.authToken);
        } else {
          // Target has no token — clear the global store so we don't
          // accidentally send the previous instance's token.
          useSandboxAuthStore.getState().clearSandboxToken();
        }

        // Force SDK client to recreate for the new server URL + token
        resetSDKClient();

        set({
          activeServerId: id,
          serverVersion: state.serverVersion + 1,
          // Mark userSelected unless this is an auto-switch (e.g. from useSandbox)
          ...(options?.auto ? {} : { userSelected: true }),
        });
      },

      getActiveServerUrl: () => {
        const state = get();
        const active = state.servers.find((s) => s.id === state.activeServerId);
        return active?.url || DEFAULT_SANDBOX_URL;
      },

      clearStatuses: () => {
        // placeholder -- the session status store subscribes to version changes
      },

      // ── Centralized actions ──

      bumpServerVersion: () => {
        set((state) => ({ serverVersion: state.serverVersion + 1 }));
      },

      registerOrUpdateSandbox: (sandbox, options) => {
        const state = get();
        const isLocal = options?.isLocal ?? false;
        const autoSwitch = options?.autoSwitch ?? false;

        // In local mode, update the existing default entry — don't create a duplicate.
        if (isLocal) {
          const defaultEntry = state.servers.find((s) => s.id === DEFAULT_SERVER_ID);
          if (defaultEntry) {
            get().updateServerSilent(DEFAULT_SERVER_ID, {
              url: sandbox.url,
              mappedPorts: sandbox.mappedPorts,
              provider: sandbox.provider,
              sandboxId: sandbox.sandboxId,
              ...(sandbox.label ? { label: sandbox.label } : {}),
            });
            return DEFAULT_SERVER_ID;
          }
        }

        // Cloud mode: use the dedicated cloud-sandbox ID
        const targetId = CLOUD_SANDBOX_SERVER_ID;
        const existing = state.servers.find((s) => s.id === targetId);

        if (existing) {
          get().updateServerSilent(targetId, {
            url: sandbox.url,
            label: sandbox.label || existing.label,
            mappedPorts: sandbox.mappedPorts,
            provider: sandbox.provider,
            sandboxId: sandbox.sandboxId,
          });
        } else {
          const newEntry: ServerEntry = {
            id: targetId,
            label: sandbox.label,
            url: sandbox.url.replace(/\/+$/, ''),
            provider: sandbox.provider,
            sandboxId: sandbox.sandboxId,
            mappedPorts: sandbox.mappedPorts,
          };
          set((state) => ({
            servers: [...state.servers, newEntry],
          }));
          syncServerToApi(newEntry);
        }

        // Auto-switch to the sandbox if the user hasn't manually picked a server
        if (autoSwitch && !state.userSelected && state.activeServerId === DEFAULT_SERVER_ID) {
          get().setActiveServer(targetId, { auto: true });
        }

        return targetId;
      },

      persistToken: (serverId, token) => {
        // 1. Store in the global sandbox-auth-store (used by getAuthToken())
        useSandboxAuthStore.getState().setSandboxToken(token);

        // 2. Persist to the server entry (survives page reloads + instance switches)
        get().updateServer(serverId, { authToken: token });

        // 3. Force SDK client to recreate with the new token
        resetSDKClient();

        // 4. Bump serverVersion so health check + SSE restart with the new token
        set((state) => ({ serverVersion: state.serverVersion + 1 }));
      },
    }),
    {
      name: 'opencode-servers-v4', // v4: dynamic sandbox ID (e.g. /preview/kortix-sandbox/{port}) replaces hardcoded /preview/local/
      partialize: (state) => ({
        servers: state.servers,
        activeServerId: state.activeServerId,
        userSelected: state.userSelected,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const hasDefault = state.servers.some((s) => s.id === DEFAULT_SERVER_ID);
        if (!hasDefault) {
          state.servers = [createDefaultServer(), ...state.servers];
        } else {
          // Always reset the default server's URL and provider to current values.
          // This handles migration from old direct-connect URLs (localhost:14000)
          // and ensures provider is set (needed for key generation button).
          // Note: authToken is preserved if set — it was explicitly generated by the user.
          state.servers = state.servers.map((s) =>
            s.id === DEFAULT_SERVER_ID
              ? { ...s, url: DEFAULT_SANDBOX_URL, label: 'Local Sandbox', provider: 'local_docker' }
              : s,
          );
        }
        // Clean up stale 'cloud-sandbox' duplicates that point to the same URL
        // as the default entry. Previously useSandbox created these in local mode.
        state.servers = state.servers.filter((s) => {
          if (s.id === 'cloud-sandbox') {
            const def = state.servers.find((d) => d.id === DEFAULT_SERVER_ID);
            if (def && s.url === def.url) return false; // duplicate — remove
          }
          return true;
        });
        // If active server was the removed duplicate, switch to default
        if (!state.servers.some((s) => s.id === state.activeServerId)) {
          state.activeServerId = DEFAULT_SERVER_ID;
        }

        // Async: load from API and merge, preserving local authTokens.
        // On first ever boot, push localStorage entries to API.
        const localServers = [...state.servers];
        loadFromApi(localServers).then((apiServers) => {
          if (apiServers && apiServers.length > 0) {
            // API has data — use it as source of truth (with local tokens merged in)
            const hasDefault = apiServers.some((s) => s.id === DEFAULT_SERVER_ID);
            if (!hasDefault) {
              apiServers.unshift(createDefaultServer());
            }
            useServerStore.setState({ servers: apiServers });
          } else {
            // API is empty — seed it with current localStorage entries
            syncAllToApi(localServers);
          }
        });
      },
    },
  ),
);

/**
 * Get the current active sandbox URL (routed through the backend).
 * Use this in non-React contexts (API modules, etc.).
 */
export function getActiveOpenCodeUrl(): string {
  return useServerStore.getState().getActiveServerUrl();
}

/**
 * Get the full active ServerEntry (including mappedPorts, provider, etc.).
 * Returns null if the active server can't be found (shouldn't happen).
 */
export function getActiveServer(): ServerEntry | null {
  const state = useServerStore.getState();
  return state.servers.find((s) => s.id === state.activeServerId) ?? null;
}

/**
 * Get the host port for a given container port on the active server.
 * Returns null if no mapping exists (e.g. Daytona, default server, or unknown port).
 */
export function getActiveServerMappedPort(containerPort: string): string | null {
  const server = getActiveServer();
  return server?.mappedPorts?.[containerPort] ?? null;
}

/**
 * Get the auth token for the active server (if set).
 * Returns null if no per-instance token is configured.
 */
export function getActiveServerAuthToken(): string | null {
  const server = getActiveServer();
  return server?.authToken ?? null;
}

/** Stable server IDs for managed sandbox entries */
export { DEFAULT_SERVER_ID, CLOUD_SANDBOX_SERVER_ID };
