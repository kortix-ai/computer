import { create } from "zustand";
import { logger } from "@/lib/logger";

export type SandboxConnectionStatus =
	| "connecting"
	| "connected"
	| "unreachable";

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
	/** Current sandbox version from /kortix/health (e.g. "0.5.1") */
	sandboxVersion: string | null;
	/** OpenCode server version from /global/health (e.g. "1.2.10") */
	openCodeVersion: string | null;
	/** Whether the OpenCode server reports healthy */
	healthy: boolean | null;
}

// ── Persist wasConnected across hard refreshes via sessionStorage ──
// On hard refresh, wasConnected resets to false which triggers a full-screen
// blocking overlay. By persisting it, users who were previously connected
// see the lightweight reconnect pill instead, making reconnection feel instant.
const STORAGE_KEY = "kortix-sandbox-was-connected";

function loadWasConnected(): boolean {
	try {
		return sessionStorage.getItem(STORAGE_KEY) === "1";
	} catch {
		return false;
	}
}

function saveWasConnected(value: boolean) {
	try {
		if (value) {
			sessionStorage.setItem(STORAGE_KEY, "1");
		} else {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	} catch {
		/* SSR or storage unavailable */
	}
}

export const useSandboxConnectionStore = create<SandboxConnectionStore>(() => ({
	status: "connecting",
	failCount: 0,
	lastConnectedAt: null,
	initialCheckDone: false,
	wasConnected: loadWasConnected(),
	reconnectAttempts: 0,
	disconnectedAt: null,
	sandboxVersion: null,
	openCodeVersion: null,
	healthy: null,
}));

// ── Static actions (stable references, no re-render loops) ──

/** Only updates status if it actually changed. */
export function setSandboxStatus(next: SandboxConnectionStatus) {
	const state = useSandboxConnectionStore.getState();
	if (state.status === next) return;

	const updates: Partial<SandboxConnectionStore> = { status: next };

	if (next === "connected") {
		updates.lastConnectedAt = Date.now();
		updates.failCount = 0;
		updates.wasConnected = true;
		updates.reconnectAttempts = 0;
		updates.disconnectedAt = null;
		saveWasConnected(true);

		if (state.status === "unreachable") {
			logger.info("Sandbox connection restored", {
				previousStatus: state.status,
				reconnectAttempts: state.reconnectAttempts,
			});
		}
	} else if (next === "unreachable") {
		if (!state.disconnectedAt) {
			updates.disconnectedAt = Date.now();
		}
		logger.error("Sandbox became unreachable", {
			failCount: state.failCount,
			reconnectAttempts: state.reconnectAttempts,
			wasConnected: state.wasConnected,
		});
	} else if (next === "connecting") {
		// Track when we first went down (don't overwrite if already set)
		if (!state.disconnectedAt) {
			updates.disconnectedAt = Date.now();
		}
	}

	useSandboxConnectionStore.setState(updates);
}

export function markInitialCheckDone() {
	if (useSandboxConnectionStore.getState().initialCheckDone) return; // no-op
	useSandboxConnectionStore.setState({ initialCheckDone: true });
}

export function incrementSandboxFail() {
	const state = useSandboxConnectionStore.getState();
	logger.warn("Sandbox health-check failed", {
		failCount: state.failCount + 1,
		reconnectAttempts: state.reconnectAttempts + 1,
	});
	useSandboxConnectionStore.setState((s) => ({
		failCount: s.failCount + 1,
		reconnectAttempts: s.reconnectAttempts + 1,
	}));
}

export function resetSandboxFail() {
	const { failCount } = useSandboxConnectionStore.getState();
	if (failCount === 0) return; // no-op — avoids unnecessary re-renders
	useSandboxConnectionStore.setState({ failCount: 0 });
}

export function setSandboxVersion(version: string | null) {
	const current = useSandboxConnectionStore.getState().sandboxVersion;
	if (current === version) return;
	useSandboxConnectionStore.setState({ sandboxVersion: version });
}

export function setOpenCodeHealth(healthy: boolean, version?: string) {
	const state = useSandboxConnectionStore.getState();
	const updates: Partial<SandboxConnectionStore> = {};
	if (state.healthy !== healthy) updates.healthy = healthy;
	if (version !== undefined && state.openCodeVersion !== version) updates.openCodeVersion = version;
	if (Object.keys(updates).length > 0) {
		useSandboxConnectionStore.setState(updates);
	}
}
