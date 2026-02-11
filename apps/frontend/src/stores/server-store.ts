import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ServerEntry {
  id: string;
  label: string;
  url: string;
  isDefault?: boolean;
}

interface ServerStore {
  servers: ServerEntry[];
  activeServerId: string;
  /** Monotonic counter that bumps on every server switch. Subscribe to this to react. */
  serverVersion: number;
  addServer: (label: string, url: string) => ServerEntry;
  updateServer: (id: string, updates: Partial<Pick<ServerEntry, 'label' | 'url'>>) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string) => void;
  getActiveServerUrl: () => string;
  clearStatuses: () => void;
}

const DEFAULT_OPENCODE_URL = process.env.NEXT_PUBLIC_OPENCODE_URL || 'http://localhost:4096';

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
      serverVersion: 0,

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
          // If we updated the active server's URL, bump version to force reconnect
          ...(isActive && updates.url ? { serverVersion: state.serverVersion + 1 } : {}),
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

      setActiveServer: (id: string) => {
        const state = get();
        if (state.activeServerId === id) return; // no-op
        set({ activeServerId: id, serverVersion: state.serverVersion + 1 });
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
