import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  addServer: (label: string, url: string) => ServerEntry;
  updateServer: (id: string, updates: Partial<Pick<ServerEntry, 'label' | 'url'>>) => void;
  /**
   * Silently update a server's URL, ports, provider, and/or sandboxId
   * without triggering a full reconnect (no serverVersion bump). Only
   * bumps urlVersion so the connection monitor re-verifies.
   */
  updateServerSilent: (id: string, updates: Partial<Pick<ServerEntry, 'url' | 'provider' | 'sandboxId'>> & { mappedPorts?: Record<string, string>; label?: string }) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string, options?: { auto?: boolean }) => void;
  getActiveServerUrl: () => string;
  clearStatuses: () => void;
}

const DEFAULT_OPENCODE_URL =
  process.env.NEXT_PUBLIC_OPENCODE_URL ||
  (process.env.NEXT_PUBLIC_ENV_MODE === 'local'
    ? 'http://localhost:14000'
    : 'http://localhost:4096');

function generateId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_SERVER_ID = 'default';

const createDefaultServer = (): ServerEntry => ({
  id: DEFAULT_SERVER_ID,
  label: DEFAULT_OPENCODE_URL.replace(/^https?:\/\//, ''),
  url: DEFAULT_OPENCODE_URL,
  isDefault: true,
});

export const useServerStore = create<ServerStore>()(
  persist(
    (set, get) => ({
      servers: [createDefaultServer()],
      activeServerId: DEFAULT_SERVER_ID,
      userSelected: false,
      serverVersion: 0,
      urlVersion: 0,

      addServer: (label: string, url: string) => {
        const normalizedUrl = url.replace(/\/+$/, '');
        const newServer: ServerEntry = {
          id: generateId(),
          label: label || normalizedUrl.replace(/^https?:\/\//, ''),
          url: normalizedUrl,
        };
        set((state) => ({
          servers: [...state.servers, newServer],
        }));
        return newServer;
      },

      updateServer: (id: string, updates: Partial<Pick<ServerEntry, 'label' | 'url'>>) => {
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
      },

      setActiveServer: (id: string, options?: { auto?: boolean }) => {
        const state = get();
        if (state.activeServerId === id) return; // no-op
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
        return active?.url || DEFAULT_OPENCODE_URL;
      },

      clearStatuses: () => {
        // placeholder -- the session status store subscribes to version changes
      },
    }),
    {
      name: 'opencode-servers-v1',
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
          state.servers = state.servers.map((s) =>
            s.id === DEFAULT_SERVER_ID
              ? { ...s, url: DEFAULT_OPENCODE_URL, label: DEFAULT_OPENCODE_URL.replace(/^https?:\/\//, '') }
              : s,
          );
        }
      },
    },
  ),
);

/**
 * Get the current active OpenCode server URL.
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
