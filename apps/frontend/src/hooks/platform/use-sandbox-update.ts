/**
 * useSandboxUpdate — checks for sandbox updates and lets the user trigger them.
 *
 * Docker image-based update flow:
 *   - `currentVersion` is provided by the caller (from /kortix/health)
 *   - `latestVersion` is fetched from the platform API
 *   - Frontend compares them → `updateAvailable`
 *   - `update()` POSTs to kortix-api which pulls new image + recreates container
 *   - Polls GET /platform/sandbox/update/status every 2s → live phase + progress
 *   - On complete/failed, stops polling and surfaces result
 */

'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLatestSandboxVersion,
  triggerSandboxUpdate,
  getSandboxUpdateStatus,
  resetSandboxUpdateStatus,
  type SandboxUpdateStatus,
  type UpdatePhase,
} from '@/lib/platform-client';
import { setSandboxVersion } from '@/stores/sandbox-connection-store';
import { useSandbox } from './use-sandbox';

export type { UpdatePhase, SandboxUpdateStatus };

// Human-readable label for each phase (Docker-based flow)
export const PHASE_LABELS: Record<UpdatePhase, string> = {
  idle:         'Idle',
  pulling:      'Downloading update...',
  stopping:     'Stopping sandbox...',
  removing:     'Preparing update...',
  recreating:   'Installing update...',
  starting:     'Starting sandbox...',
  health_check: 'Running health checks...',
  complete:     'Update complete',
  failed:       'Update failed',
};

// Progress percentage for each phase (used for progress bar)
export const PHASE_PROGRESS: Record<UpdatePhase, number> = {
  idle:         0,
  pulling:      25,
  stopping:     50,
  removing:     55,
  recreating:   65,
  starting:     75,
  health_check: 90,
  complete:     100,
  failed:       100,
};

/**
 * Compare two semver-like version strings (e.g. "0.4.11" vs "0.4.12").
 * Returns true when `latest` is strictly greater than `current`.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] ?? 0;
    const lv = l[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

const POLL_INTERVAL_MS = 2_000;
const TERMINAL_PHASES: UpdatePhase[] = ['complete', 'failed', 'idle'];

export function useSandboxUpdate(currentVersion: string | null) {
  const { sandbox } = useSandbox();

  // ── Latest version from platform ────────────────────────────────────────
  const latestQuery = useQuery({
    queryKey: ['sandbox', 'latest-version'],
    queryFn: getLatestSandboxVersion,
    enabled: !!sandbox,
    staleTime: 5 * 60 * 1000,        // re-fetch from GitHub at most every 5 min
    refetchInterval: 10 * 60 * 1000, // background poll every 10 min
    refetchOnWindowFocus: true,       // re-check when user returns to the tab
  });

  const latestVersion = latestQuery.data?.version ?? null;
  const updateAvailable = !!(
    currentVersion && latestVersion && isNewerVersion(currentVersion, latestVersion)
  );

  // ── Live update status (polled while in-progress) ────────────────────────
  const [liveStatus, setLiveStatus] = useState<SandboxUpdateStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; currentVersion: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollActiveRef = useRef(false);

  const stopPolling = useCallback(() => {
    pollActiveRef.current = false;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const pollStatus = useCallback(async () => {
    if (!pollActiveRef.current) return;
    try {
      // Poll kortix-api for update status (not the sandbox directly)
      const status = await getSandboxUpdateStatus();
      setLiveStatus(status);

      if (TERMINAL_PHASES.includes(status.phase)) {
        stopPolling();
        if (status.phase === 'complete') {
          const newVersion = status.currentVersion || latestVersion || '0.0.0';
          setUpdateResult({ success: true, currentVersion: newVersion });
          setSandboxVersion(newVersion);
        } else if (status.phase === 'failed') {
          setUpdateResult({ success: false, currentVersion: status.currentVersion || currentVersion || '0.0.0' });
        }
        return;
      }
    } catch {
      // API may be momentarily unreachable during container recreate — keep polling
    }

    if (pollActiveRef.current) {
      pollRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
    }
  }, [stopPolling, latestVersion, currentVersion]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollActiveRef.current = true;
    setIsPolling(true);
    setUpdateResult(null);
    pollRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
  }, [pollStatus, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollActiveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // ── Trigger mutation ─────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!sandbox || !latestVersion) throw new Error('No sandbox or version');
      // Start polling immediately — the POST returns immediately (fire-and-forget)
      startPolling();
      return triggerSandboxUpdate(sandbox, latestVersion);
    },
    onSuccess: (data) => {
      // The POST returns { started: true } immediately — actual progress comes from polling.
      // If data.started is true, keep polling. If it returned an error, stop.
      if (!data?.started && data?.success === false) {
        stopPolling();
        setUpdateResult({ success: false, currentVersion: currentVersion ?? '0.0.0' });
      }
    },
    onError: () => {
      stopPolling();
      setUpdateResult({ success: false, currentVersion: currentVersion ?? '0.0.0' });
      setLiveStatus(prev => prev ? {
        ...prev, phase: 'failed',
        message: 'Update failed',
        error: 'Failed to start update',
      } : null);
    },
  });

  const isUpdating = updateMutation.isPending || isPolling;
  const phase: UpdatePhase = liveStatus?.phase ?? 'idle';
  const phaseLabel = PHASE_LABELS[phase];
  // Use the real progress from the API if available, otherwise use phase-based progress
  const phaseProgress = liveStatus?.progress ?? PHASE_PROGRESS[phase];
  const phaseMessage = liveStatus?.message ?? '';

  return {
    /** Whether a newer version is available */
    updateAvailable,
    /** Current version running on the sandbox */
    currentVersion,
    /** Latest version available */
    latestVersion,
    /** Changelog for the latest available version */
    changelog: latestQuery.data?.changelog ?? null,
    /** Trigger the update */
    update: updateMutation.mutate,
    /** Whether an update is currently running */
    isUpdating,
    /** Live update phase from API */
    phase,
    /** Human-readable phase label */
    phaseLabel,
    /** Phase progress 0-100 */
    phaseProgress,
    /** Detailed message from the API for the current phase */
    phaseMessage,
    /** Result of the last update attempt */
    updateResult,
    /** Error from the last update attempt */
    updateError: updateMutation.error,
    /** Whether we're still loading version info */
    isLoading: latestQuery.isLoading,
    /** Re-check latest version */
    refetch: () => latestQuery.refetch(),
    /** Reset update status (e.g. after a failed update to allow retry) */
    resetStatus: resetSandboxUpdateStatus,
  };
}
