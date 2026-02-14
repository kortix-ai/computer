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
}

export const useSandboxConnectionStore = create<SandboxConnectionStore>(() => ({
  status: 'connecting',
  failCount: 0,
  lastConnectedAt: null,
  initialCheckDone: false,
}));

// ── Static actions (stable references, no re-render loops) ──

/** Only updates status if it actually changed. */
export function setSandboxStatus(next: SandboxConnectionStatus) {
  const { status } = useSandboxConnectionStore.getState();
  if (status === next) return; // no-op — avoids unnecessary re-renders
  useSandboxConnectionStore.setState({
    status: next,
    ...(next === 'connected' ? { lastConnectedAt: Date.now(), failCount: 0 } : {}),
  });
}

export function markInitialCheckDone() {
  useSandboxConnectionStore.setState({ initialCheckDone: true });
}

export function incrementSandboxFail() {
  useSandboxConnectionStore.setState((s) => ({ failCount: s.failCount + 1 }));
}

export function resetSandboxFail() {
  useSandboxConnectionStore.setState({ failCount: 0 });
}
