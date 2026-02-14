import { create } from 'zustand';

export type SandboxConnectionStatus = 'connecting' | 'connected' | 'unreachable';

interface SandboxConnectionStore {
  status: SandboxConnectionStatus;
  /** How many consecutive health-check failures */
  failCount: number;
  /** When the connection was last confirmed */
  lastConnectedAt: number | null;
  /** True once at least one health check has completed (success or fail) */
  initialCheckDone: boolean;
  /** True if we were connected at some point and then lost connection */
  wasConnected: boolean;
  /** Total reconnect attempts since last successful connection */
  reconnectAttempts: number;
  /** Timestamp when status changed to unreachable/connecting (for "down since") */
  disconnectedAt: number | null;
}

export const useSandboxConnectionStore = create<SandboxConnectionStore>(() => ({
  status: 'connecting',
  failCount: 0,
  lastConnectedAt: null,
  initialCheckDone: false,
  wasConnected: false,
  reconnectAttempts: 0,
  disconnectedAt: null,
}));

// ── Static actions (stable references, no re-render loops) ──

/** Only updates status if it actually changed. */
export function setSandboxStatus(next: SandboxConnectionStatus) {
  const state = useSandboxConnectionStore.getState();
  if (state.status === next) return;

  const updates: Partial<SandboxConnectionStore> = { status: next };

  if (next === 'connected') {
    updates.lastConnectedAt = Date.now();
    updates.failCount = 0;
    updates.wasConnected = true;
    updates.reconnectAttempts = 0;
    updates.disconnectedAt = null;
  } else if (next === 'unreachable' || next === 'connecting') {
    // Track when we first went down (don't overwrite if already set)
    if (!state.disconnectedAt) {
      updates.disconnectedAt = Date.now();
    }
  }

  useSandboxConnectionStore.setState(updates);
}

export function markInitialCheckDone() {
  useSandboxConnectionStore.setState({ initialCheckDone: true });
}

export function incrementSandboxFail() {
  useSandboxConnectionStore.setState((s) => ({
    failCount: s.failCount + 1,
    reconnectAttempts: s.reconnectAttempts + 1,
  }));
}

export function resetSandboxFail() {
  useSandboxConnectionStore.setState({ failCount: 0 });
}
