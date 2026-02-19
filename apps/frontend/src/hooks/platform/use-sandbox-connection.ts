"use client";

import { useEffect, useRef } from "react";
import { getSupabaseAccessToken, invalidateTokenCache } from "@/lib/auth-token";
import {
	incrementSandboxFail,
	markInitialCheckDone,
	resetSandboxFail,
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
	// NOTE: urlVersion intentionally NOT subscribed. URL/port updates (via
	// updateServerSilent) should NOT restart the health check loop — the
	// loop already reads the URL fresh from the store on each check() call.
	// Including urlVersion here was causing the loop to restart on every
	// sandbox init (port mapping update), flashing the ConnectingScreen.

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
			portsFetchedRef.current = false; // re-fetch ports for new server
			versionFetchedRef.current = false; // re-fetch version for new server
			setSandboxVersion(null);
		}
		resetSandboxFail();

		let alive = true;

		async function check() {
			if (!alive) return;

			// Read URL fresh each check — it may change via updateServerSilent
			// (port mapping updates) without restarting this effect.
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

				const headers: Record<string, string> = {};
				const token = await getSupabaseAccessToken();
				if (token) headers["Authorization"] = `Bearer ${token}`;

				const res = await fetch(`${url}/session`, {
					method: "GET",
					signal: controller.signal,
					headers,
				});
				clearTimeout(timer);

				// On 401/403, the token likely expired during a connection drop.
				// Invalidate the cached token and fetch fresh so the next health check
				// (and all SDK requests) immediately use a valid token.
				if (res.status === 401 || res.status === 403) {
					try {
						invalidateTokenCache();
						await getSupabaseAccessToken();
					} catch {
						/* refresh failed — will retry on next poll */
					}
					// Treat auth failure as a connection failure so the retry loop
					// kicks in with fast polling.
					throw new Error(`Auth error: ${res.status}`);
				}

				if (!alive) return;
				resetSandboxFail();
				setSandboxStatus("connected");

				// Fetch port mappings once on first successful connection.
				// This populates mappedPorts so all service URLs use direct host ports
				// instead of going through the proxy.
				if (!portsFetchedRef.current) {
					portsFetchedRef.current = true;
					try {
						const portsRes = await fetch(`${url}/kortix/ports`, {
							signal: AbortSignal.timeout(3000),
							headers,
						});
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
						const hRes = await fetch(`${url}/kortix/health`, {
							signal: AbortSignal.timeout(3000),
							headers,
						});
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
				// Any failure → fast poll to detect recovery quickly
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
		// urlVersion intentionally excluded — see comment at top of hook.
	}, [activeServerId, serverVersion]);
}
