/**
 * Shared account deletion hooks.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/account/use-account-deletion.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/useAccountDeletion.ts)
 *
 * Differences:
 * - Frontend uses `backendApi.get/post/delete`; mobile uses raw `fetch`.
 *   Both are abstracted behind `SharedFetchFn`.
 * - Frontend has `useDeleteAccountImmediately`; mobile does not.
 *   Included here for completeness — mobile can simply not use it.
 * - Toast / redirect side-effects are NOT included — callers should handle
 *   onSuccess / onError via the returned mutation options.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountDeletionStatus {
  has_pending_deletion: boolean;
  deletion_scheduled_for: string | null;
  requested_at: string | null;
  can_cancel: boolean;
}

export interface RequestDeletionResponse {
  success: boolean;
  message: string;
  deletion_scheduled_for: string;
  can_cancel: boolean;
}

export interface CancelDeletionResponse {
  success: boolean;
  message: string;
}

export interface DeleteImmediatelyResponse {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Query key (exported so consumers can invalidate manually)
// ---------------------------------------------------------------------------

export const ACCOUNT_DELETION_QUERY_KEY = ['account', 'deletion-status'] as const;

// ---------------------------------------------------------------------------
// Default fallback when the endpoint fails or returns no data
// ---------------------------------------------------------------------------

const DEFAULT_STATUS: AccountDeletionStatus = {
  has_pending_deletion: false,
  deletion_scheduled_for: null,
  requested_at: null,
  can_cancel: false,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAccountDeletionStatus(
  config: SharedHookConfig,
  options?: { enabled?: boolean },
) {
  return useQuery<AccountDeletionStatus>({
    queryKey: [...ACCOUNT_DELETION_QUERY_KEY],
    queryFn: async () => {
      try {
        return await config.fetchFn<AccountDeletionStatus>('/account/deletion-status');
      } catch {
        return DEFAULT_STATUS;
      }
    },
    staleTime: 30_000,
    ...options,
  });
}

export function useRequestAccountDeletion(config: SharedHookConfig) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason?: string) => {
      return config.fetchFn<RequestDeletionResponse>('/account/request-deletion', {
        method: 'POST',
        body: { reason: reason || 'User requested deletion' },
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AccountDeletionStatus>([...ACCOUNT_DELETION_QUERY_KEY], {
        has_pending_deletion: true,
        deletion_scheduled_for: data.deletion_scheduled_for,
        requested_at: new Date().toISOString(),
        can_cancel: data.can_cancel,
      });
    },
  });
}

export function useCancelAccountDeletion(config: SharedHookConfig) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return config.fetchFn<CancelDeletionResponse>('/account/cancel-deletion', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.setQueryData<AccountDeletionStatus>([...ACCOUNT_DELETION_QUERY_KEY], DEFAULT_STATUS);
    },
  });
}

/**
 * Immediate account deletion.
 * NOTE: Only frontend currently uses this — mobile does not expose the button.
 */
export function useDeleteAccountImmediately(config: SharedHookConfig) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return config.fetchFn<DeleteImmediatelyResponse>('/account/delete-immediately', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.setQueryData<AccountDeletionStatus>([...ACCOUNT_DELETION_QUERY_KEY], DEFAULT_STATUS);
    },
  });
}
