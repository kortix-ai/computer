'use client';

import { useEffect, useRef } from 'react';
import { useServerStore } from '@/stores/server-store';
import {
  useSandboxConnectionStore,
  setSandboxStatus,
  incrementSandboxFail,
  resetSandboxFail,
  markInitialCheckDone,
} from '@/stores/sandbox-connection-store';
import { getSupabaseAccessToken } from '@/lib/auth-token';

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
  const urlVersion = useServerStore((s) => s.urlVersion);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevServerVersionRef = useRef(serverVersion);

  useEffect(() => {
    const isServerSwitch = serverVersion !== prevServerVersionRef.current;
    prevServerVersionRef.current = serverVersion;

    if (isServerSwitch) {
      const { status } = useSandboxConnectionStore.getState();
      if (status !== 'connected') {
        setSandboxStatus('connecting');
      }
    }
    resetSandboxFail();

    const url = useServerStore.getState().getActiveServerUrl();
    if (!url) return;

    let alive = true;

    async function check() {
      if (!alive) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);

        const headers: Record<string, string> = {};
        const token = await getSupabaseAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${url}/session`, {
          method: 'GET',
          signal: controller.signal,
          headers,
        });
        clearTimeout(timer);

        if (!alive) return;
        resetSandboxFail();
        setSandboxStatus('connected');
      } catch {
        if (!alive) return;
        incrementSandboxFail();

        const { failCount, wasConnected } =
          useSandboxConnectionStore.getState();
        const threshold = wasConnected
          ? FAIL_THRESHOLD_RECONNECT
          : FAIL_THRESHOLD_FIRST;

        if (failCount >= threshold) {
          setSandboxStatus('unreachable');
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
      if (status === 'connected') {
        delay = POLL_CONNECTED;
      } else if (status === 'unreachable') {
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
  }, [activeServerId, serverVersion, urlVersion]);
}
