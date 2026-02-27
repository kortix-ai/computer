"use client";

import { useEffect, useRef } from "react";
import { authenticatedFetch } from "@/lib/auth-token";
import {
	incrementSandboxFail,
	markInitialCheckDone,
	resetSandboxFail,
	setOpenCodeHealth,
	setSandboxStatus,
	setSandboxVersion,
	useSandboxConnectionStore,
} from "@/stores/sandbox-connection-store";
import { useServerStore } from "@/stores/server-store";

/**
 * Number of consecutive failures before marking as unreachable
 * when this is the FIRST connection (never been connected).
 */
const FAIL_THRESHOLD_FIRST = 3;

/**
 * For reconnection (was connected, then failed) — show the banner
 * after just 1 failure since the user already had a working connection.
 */
const FAIL_THRESHOLD_RECONNECT = 1;

/** Interval between health checks (ms) */
const POLL_CONNECTED = 30_000; // 30s when healthy
const POLL_FAILING = 3_000; // 3s when any failure detected (fast retry)
const POLL_UNREACHABLE = 5_000; // 5s when confirmed unreachable

/** Timeout for each health check request */
const CHECK_TIMEOUT = 5_000;

/**
 * useSandboxConnection — monitors the active server's reachability.
 *
 * Key behaviour:
 *   - On first failure, immediately switches to fast polling (3s).
 *   - If the user was previously connected, marks unreachable after 1 failure
 *     so the reconnect banner appears within ~8s (one 30s poll + 5s timeout).
 *   - If it's the first connection, requires 3 failures (same as before).
 */
export function useSandboxConnection() {
	const activeServerId = useServerStore((s) => s.activeServerId);
	const serverVersion = useServerStore((s) => s.serverVersion);

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const prevServerVersionRef = useRef(serverVersion);
	const portsFetchedRef = useRef(false);
	const versionFetchedRef = useRef(false);

	useEffect(() => {
		const isServerSwitch = serverVersion !== prevServerVersionRef.current;
		prevServerVersionRef.current = serverVersion;

		if (isServerSwitch) {
			const { status } = useSandboxConnectionStore.getState();
			if (status !== "connected") {
				setSandboxStatus("connecting");
			}
			portsFetchedRef.current = false;
			versionFetchedRef.current = false;
			setSandboxVersion(null);
		}
		resetSandboxFail();

		let alive = true;

		async function check() {
			if (!alive) return;

			const url = useServerStore.getState().getActiveServerUrl();
			if (!url) {
				scheduleNext();
				return;
			}

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			try {
				const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);

			const res = await authenticatedFetch(`${url}/global/health`, {
				method: "GET",
				signal: controller.signal,
			});
				clearTimeout(timer);

				if (!alive) return;

				if (res.status === 401) {
					setSandboxStatus('unreachable');
					scheduleNext();
					return;
				}

				if (res.status === 403) {
					throw new Error(`Auth error: ${res.status}`);
				}

				resetSandboxFail();
				setSandboxStatus("connected");

				// Parse health response — extract healthy/version for consumers
				// that previously relied on the duplicate useServerHealth hook.
				try {
					const healthData = await res.json();
					setOpenCodeHealth(
						healthData?.healthy === true,
						healthData?.version,
					);
				} catch {
					// Body already consumed or not JSON — treat as healthy since status was ok
					setOpenCodeHealth(true);
				}

				// Fetch port mappings once on first successful connection.
				if (!portsFetchedRef.current) {
					portsFetchedRef.current = true;
					try {
						const portsRes = await authenticatedFetch(`${url}/kortix/ports`, {
							signal: AbortSignal.timeout(3000),
						}, { retryOnAuthError: false });
						if (portsRes.ok) {
							const data = await portsRes.json();
							if (data.ports && Object.keys(data.ports).length > 0) {
								const activeId = useServerStore.getState().activeServerId;
								useServerStore.getState().updateServerSilent(activeId, {
									mappedPorts: data.ports,
									provider: "local_docker",
								});
							}
						}
					} catch {
						/* non-critical — proxy fallback still works */
					}
				}

				// Fetch sandbox version from /kortix/health once on connect
				if (!versionFetchedRef.current) {
					versionFetchedRef.current = true;
					try {
						const hRes = await authenticatedFetch(`${url}/kortix/health`, {
							signal: AbortSignal.timeout(3000),
						}, { retryOnAuthError: false });
						if (hRes.ok) {
							const hData = await hRes.json();
							if (hData.version) {
								setSandboxVersion(hData.version);
							}
						}
					} catch {
						/* non-critical */
					}
				}
			} catch {
				if (!alive) return;
				incrementSandboxFail();

				const { failCount, wasConnected } =
					useSandboxConnectionStore.getState();
				const threshold = wasConnected
					? FAIL_THRESHOLD_RECONNECT
					: FAIL_THRESHOLD_FIRST;

				if (failCount >= threshold) {
					setSandboxStatus("unreachable");
				}
			} finally {
				if (alive) {
					markInitialCheckDone();
				}
			}

			scheduleNext();
		}

		function scheduleNext() {
			if (!alive) return;
			if (timerRef.current) clearTimeout(timerRef.current);

			const { status, failCount } = useSandboxConnectionStore.getState();
			let delay: number;
			if (status === "connected") {
				delay = POLL_CONNECTED;
			} else if (status === "unreachable") {
				delay = POLL_UNREACHABLE;
			} else {
				delay = failCount > 0 ? POLL_FAILING : POLL_UNREACHABLE;
			}
			timerRef.current = setTimeout(check, delay);
		}

		check();

		return () => {
			alive = false;
			abortRef.current?.abort();
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [activeServerId, serverVersion]);
}
