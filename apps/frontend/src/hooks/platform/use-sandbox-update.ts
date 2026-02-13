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
  const updateAvailable = !!(currentVersion && latestVersion && currentVersion !== latestVersion);

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
