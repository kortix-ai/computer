/**
 * useSandboxUpdate — checks for sandbox updates and lets the user trigger them.
 *
 * Usage in a component:
 *
 *   const { updateAvailable, currentVersion, latestVersion, update, isUpdating } = useSandboxUpdate();
 *
 *   {updateAvailable && (
 *     <button onClick={update} disabled={isUpdating}>
 *       Update to {latestVersion}
 *     </button>
 *   )}
 *
 * How it works:
 *   1. On mount, fetches latest version from platform + current version from sandbox
 *   2. Compares them → sets `updateAvailable`
 *   3. `update()` calls POST /kortix/update on the sandbox
 *   4. After update, re-checks status
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getLatestSandboxVersion,
  getSandboxUpdateStatus,
  triggerSandboxUpdate,
  type SandboxInfo,
} from '@/lib/platform-client';
import { useSandbox } from './use-sandbox';

export function useSandboxUpdate() {
  const { sandbox } = useSandbox();
  const queryClient = useQueryClient();

  // Check the latest available version (from platform → npm registry)
  const latestQuery = useQuery({
    queryKey: ['sandbox', 'latest-version'],
    queryFn: getLatestSandboxVersion,
    enabled: !!sandbox,
    staleTime: 5 * 60 * 1000,   // 5 min — matches platform's npm cache
    refetchOnWindowFocus: false,
  });

  // Check the sandbox's current version
  const statusQuery = useQuery({
    queryKey: ['sandbox', 'update-status'],
    queryFn: () => getSandboxUpdateStatus(sandbox!),
    enabled: !!sandbox,
    staleTime: 60 * 1000,        // 1 min
    refetchOnWindowFocus: false,
  });

  // Trigger the update
  const updateMutation = useMutation({
    mutationFn: () => triggerSandboxUpdate(sandbox!),
    onSuccess: () => {
      // Invalidate status so it re-fetches after update completes
      queryClient.invalidateQueries({ queryKey: ['sandbox', 'update-status'] });
    },
  });

  const currentVersion = statusQuery.data?.currentVersion ?? null;
  const latestVersion = latestQuery.data?.version ?? null;
  const updateAvailable = !!(currentVersion && latestVersion && currentVersion !== latestVersion);

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
    isUpdating: updateMutation.isPending || (statusQuery.data?.updateInProgress ?? false),
    /** Result of the last update attempt */
    updateResult: updateMutation.data ?? null,
    /** Error from the last update attempt */
    updateError: updateMutation.error,
    /** Whether we're still loading version info */
    isLoading: latestQuery.isLoading || statusQuery.isLoading,
    /** Re-check versions */
    refetch: () => {
      latestQuery.refetch();
      statusQuery.refetch();
    },
  };
}
