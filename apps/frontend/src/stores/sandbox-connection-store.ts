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
  if (useSandboxConnectionStore.getState().initialCheckDone) return; // no-op
  useSandboxConnectionStore.setState({ initialCheckDone: true });
}

/**
 * Atomically increment fail count and transition to 'unreachable' if the
 * threshold is reached. This prevents the race condition where cleanup
 * runs between incrementing failCount and checking the threshold.
 */
export function incrementSandboxFail(failThreshold: number) {
  useSandboxConnectionStore.setState((s) => {
    const nextFailCount = s.failCount + 1;
    return {
      failCount: nextFailCount,
      ...(nextFailCount >= failThreshold && s.status !== 'unreachable'
        ? { status: 'unreachable' as const }
        : {}),
    };
  });
}

export function resetSandboxFail() {
  const { failCount } = useSandboxConnectionStore.getState();
  if (failCount === 0) return; // no-op — avoids unnecessary re-renders
  useSandboxConnectionStore.setState({ failCount: 0 });
}
