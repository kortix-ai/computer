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
 * Number of consecutive failures before marking sandbox as unreachable.
 */
const FAIL_THRESHOLD = 3;

/** Interval between health checks (ms) */
const POLL_CONNECTED = 30_000; // 30s when already connected
const POLL_DISCONNECTED = 5_000; // 5s when connecting/unreachable

/** Timeout for each health check request */
const CHECK_TIMEOUT = 8_000;

/**
 * useSandboxConnection — monitors the active server's reachability.
 *
 * Subscribes to:
 *   - activeServerId + serverVersion — for full server switches (user picks
 *     a different server). Resets status to 'connecting'.
 *   - urlVersion — for silent URL/port updates (sandbox port changed). Does
 *     NOT reset status; just re-verifies in the background.
 *
 * This two-tier approach prevents the "connecting flash" that occurred
 * when sandbox port changes triggered a full reconnect cycle.
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

    // Only reset to 'connecting' on actual server switches — NOT on URL updates
    // and NOT if we were already connected.
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

      // Abort any in-flight request from a previous tick
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
        // Atomically increment fail count and transition to 'unreachable'
        // if the threshold is reached — no separate read+write race.
        incrementSandboxFail(FAIL_THRESHOLD);
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

      const { status } = useSandboxConnectionStore.getState();
      const delay = status === 'connected' ? POLL_CONNECTED : POLL_DISCONNECTED;
      timerRef.current = setTimeout(check, delay);
    }

    // Kick off first check immediately
    check();

    return () => {
      alive = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeServerId, serverVersion, urlVersion]);
}
