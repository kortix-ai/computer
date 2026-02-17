/**
 * useSandboxUpdate — checks for sandbox updates and lets the user trigger them.
 *
 * How it works:
 *   - `currentVersion` is provided by the caller (from /kortix/health)
 *   - `latestVersion` is fetched from the platform (which checks npm registry)
 *   - Frontend compares them → `updateAvailable`
 *   - `update()` sends POST /kortix/update with the target version
 *   - Sandbox doesn't need to know how to reach the platform
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getLatestSandboxVersion,
  triggerSandboxUpdate,
} from '@/lib/platform-client';
import { useSandbox } from './use-sandbox';

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

export function useSandboxUpdate(currentVersion: string | null) {
  const { sandbox } = useSandbox();

  // Check the latest available version (from platform → npm registry)
  const latestQuery = useQuery({
    queryKey: ['sandbox', 'latest-version'],
    queryFn: getLatestSandboxVersion,
    enabled: !!sandbox,
    staleTime: 5 * 60 * 1000,   // 5 min — matches platform's npm cache
    refetchOnWindowFocus: false,
  });

  const latestVersion = latestQuery.data?.version ?? null;
  // Only show update when the latest version is strictly newer (not a downgrade)
  const updateAvailable = !!(currentVersion && latestVersion && isNewerVersion(currentVersion, latestVersion));

  // Trigger the update — passes target version to sandbox
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!sandbox || !latestVersion) throw new Error('No sandbox or version');
      return triggerSandboxUpdate(sandbox, latestVersion);
    },
  });

  return {
    /** Whether a newer version is available */
    updateAvailable,
    /** Current version running on the sandbox */
    currentVersion,
    /** Latest version available on npm */
    latestVersion,
    /** Changelog for the latest available version */
    changelog: latestQuery.data?.changelog ?? null,
    /** Trigger the update — user must explicitly call this */
    update: updateMutation.mutate,
    /** Whether an update is currently running */
    isUpdating: updateMutation.isPending,
    /** Result of the last update attempt */
    updateResult: updateMutation.data ?? null,
    /** Error from the last update attempt */
    updateError: updateMutation.error,
    /** Whether we're still loading version info */
    isLoading: latestQuery.isLoading,
    /** Re-check latest version */
    refetch: () => latestQuery.refetch(),
  };
}
