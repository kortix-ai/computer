'use client';

import { useEffect, useRef } from 'react';
import { useServerStore } from '@/stores/server-store';
import {
  useSandboxConnectionStore,
  setSandboxStatus,
  incrementSandboxFail,
  resetSandboxFail,
} from '@/stores/sandbox-connection-store';
import { getSupabaseAccessToken } from '@/lib/auth-token';

/**
 * Number of consecutive failures before marking sandbox as unreachable.
 */
const FAIL_THRESHOLD = 2;

/** Interval between health checks (ms) */
const POLL_CONNECTED = 30_000; // 30s when already connected — no need to hammer
const POLL_DISCONNECTED = 4_000; // 4s when connecting/unreachable

/** Timeout for each health check request */
const CHECK_TIMEOUT = 5_000;

/**
 * useSandboxConnection — monitors the active server's reachability.
 *
 * Uses a single `setInterval`-style loop. All store mutations go through
 * static action functions (not Zustand selectors) so the effect never
 * re-runs due to its own state changes.
 *
 * Renders nothing — designed to be used as a headless provider.
 */
export function useSandboxConnection() {
  // These two selectors are the ONLY reactive deps — they change when
  // the user switches server, which is exactly when we want to restart.
  const activeServerId = useServerStore((s) => s.activeServerId);
  const serverVersion = useServerStore((s) => s.serverVersion);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // ── Reset on every server change ──
    setSandboxStatus('connecting');
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
        setSandboxStatus('connected'); // no-op if already connected
      } catch {
        if (!alive) return;
        incrementSandboxFail();

        const { failCount } = useSandboxConnectionStore.getState();
        if (failCount >= FAIL_THRESHOLD) {
          setSandboxStatus('unreachable');
        }
        // If under threshold and currently 'connecting', it stays 'connecting'
        // (setSandboxStatus is a no-op when status hasn't changed)
      }

      // Schedule next tick based on current status
      scheduleNext();
    }

    function scheduleNext() {
      if (!alive) return;
      // Clear previous timer to avoid stacking
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
  }, [activeServerId, serverVersion]);
}
