/**
 * useSandboxUpdate — checks for sandbox updates and lets the user trigger them.
 *
 * How it works:
 *   - `currentVersion` is provided by the caller (from /kortix/health)
 *   - `latestVersion` is fetched from the platform (which checks npm registry)
 *   - Frontend compares them → `updateAvailable`
 *   - `update()` POSTs /kortix/update (fire-and-forget — takes minutes)
 *   - Polls GET /kortix/update/status every 2s → live phase + message for UI
 *   - On complete/failed, stops polling and surfaces result
 */

'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLatestSandboxVersion,
  triggerSandboxUpdate,
  getSandboxUpdateStatus,
  type SandboxUpdateStatus,
  type UpdatePhase,
} from '@/lib/platform-client';
import { setSandboxVersion } from '@/stores/sandbox-connection-store';
import { useSandbox } from './use-sandbox';

export type { UpdatePhase, SandboxUpdateStatus };

// Human-readable label for each phase
export const PHASE_LABELS: Record<UpdatePhase, string> = {
  idle:         'Idle',
  staging:      'Downloading update...',
  verifying:    'Verifying staged artifacts...',
  committing:   'Applying update...',
  restarting:   'Restarting services...',
  validating:   'Running health checks...',
  rolling_back: 'Rolling back...',
  complete:     'Update complete',
  failed:       'Update failed',
};

// Progress percentage for each phase (used for progress bar)
export const PHASE_PROGRESS: Record<UpdatePhase, number> = {
  idle:         0,
  staging:      20,
  verifying:    45,
  committing:   60,
  restarting:   75,
  validating:   90,
  rolling_back: 50,
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
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
    if (!sandbox || !pollActiveRef.current) return;
    try {
      const status = await getSandboxUpdateStatus(sandbox);
      setLiveStatus(status);

      if (TERMINAL_PHASES.includes(status.phase)) {
        stopPolling();
        if (status.phase === 'complete') {
          const newVersion = status.currentVersion;
          setUpdateResult({ success: true, currentVersion: newVersion });
          setSandboxVersion(newVersion);
        } else if (status.phase === 'failed') {
          setUpdateResult({ success: false, currentVersion: status.currentVersion });
        }
        return;
      }
    } catch {
      // sandbox may restart mid-update — just keep polling
    }

    if (pollActiveRef.current) {
      pollRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
    }
  }, [sandbox, stopPolling]);

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
      // Start polling immediately so we get phase feedback even before the
      // POST returns (the POST blocks until the update finishes, ~minutes).
      startPolling();
      return triggerSandboxUpdate(sandbox, latestVersion);
    },
    onSuccess: (data) => {
      stopPolling();
      if (data?.success && data?.currentVersion) {
        setSandboxVersion(data.currentVersion);
        setUpdateResult({ success: true, currentVersion: data.currentVersion });
        setLiveStatus(prev => prev ? {
          ...prev, phase: 'complete', inProgress: false,
          message: `Updated to v${data.currentVersion}`,
          currentVersion: data.currentVersion,
        } : null);
      }
    },
    onError: () => {
      stopPolling();
      setUpdateResult({ success: false, currentVersion: currentVersion ?? '0.0.0' });
      setLiveStatus(prev => prev ? {
        ...prev, phase: 'failed', inProgress: false,
        message: 'Update failed',
      } : null);
    },
  });

  const isUpdating = updateMutation.isPending || isPolling;
  const phase: UpdatePhase = liveStatus?.phase ?? 'idle';
  const phaseLabel = PHASE_LABELS[phase];
  const phaseProgress = PHASE_PROGRESS[phase];
  const phaseMessage = liveStatus?.message ?? '';

  return {
    /** Whether a newer version is available */
    updateAvailable,
    /** Current version running on the sandbox */
    currentVersion,
    /** Latest version available on npm */
    latestVersion,
    /** Changelog for the latest available version */
    changelog: latestQuery.data?.changelog ?? null,
    /** Trigger the update */
    update: updateMutation.mutate,
    /** Whether an update is currently running */
    isUpdating,
    /** Live update phase from sandbox */
    phase,
    /** Human-readable phase label */
    phaseLabel,
    /** Phase progress 0-100 */
    phaseProgress,
    /** Detailed message from the sandbox for the current phase */
    phaseMessage,
    /** Result of the last update attempt */
    updateResult,
    /** Error from the last update attempt */
    updateError: updateMutation.error,
    /** Whether we're still loading version info */
    isLoading: latestQuery.isLoading,
    /** Re-check latest version */
    refetch: () => latestQuery.refetch(),
  };
}
