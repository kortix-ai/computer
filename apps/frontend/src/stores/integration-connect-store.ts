import { create } from 'zustand';

/**
 * Global store for triggering the Pipedream OAuth connect flow from anywhere in the app.
 * The actual connect handler is registered by the IntegrationConnectProvider (mounted at root layout).
 * This avoids navigating to /integrations in a new tab — the OAuth popup opens inline.
 */

type ConnectHandler = (appSlug: string, sandboxId?: string) => Promise<void>;

interface IntegrationConnectState {
  /** App slug currently being connected, or null if idle */
  connectingApp: string | null;
  setConnectingApp: (app: string | null) => void;
  /** The registered connect handler (set by IntegrationConnectProvider) */
  handler: ConnectHandler | null;
  /** Register the connect handler */
  registerHandler: (handler: ConnectHandler) => void;
  /** Unregister the connect handler */
  unregisterHandler: () => void;
  /** Trigger the OAuth connect flow */
  triggerConnect: (appSlug: string, sandboxId?: string) => Promise<void>;
}

export const useIntegrationConnectStore = create<IntegrationConnectState>((set, get) => ({
  connectingApp: null,
  setConnectingApp: (app) => set({ connectingApp: app }),
  handler: null,
  registerHandler: (handler) => set({ handler }),
  unregisterHandler: () => set({ handler: null }),
  triggerConnect: async (appSlug, sandboxId) => {
    const { handler } = get();
    if (handler) {
      await handler(appSlug, sandboxId);
    } else {
      console.warn('[IntegrationConnect] No handler registered yet. The provider may still be loading.');
    }
  },
}));
