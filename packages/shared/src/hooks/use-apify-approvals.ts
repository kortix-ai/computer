/**
 * Shared Apify approval hooks.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/apify/use-apify-approvals.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/apify/use-apify-approvals.ts)
 *
 * Both apps have identical query keys, polling logic, and cache update
 * strategy.  The only difference is the HTTP layer — abstracted here
 * behind `SharedFetchFn`.
 *
 * NOTE: Toast side-effects are NOT included — callers handle onSuccess/onError.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApifyApprovalRequest {
  actor_id: string;
  run_input: Record<string, any>;
  max_cost_usd?: number;
  thread_id?: string;
}

export interface ApifyApproval {
  approval_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';
  actor_id: string;
  estimated_cost_usd?: number;
  estimated_cost_credits?: number;
  max_cost_usd?: number;
  actual_cost_usd?: number;
  actual_cost_credits?: number;
  run_id?: string;
  created_at?: string;
  approved_at?: string;
  expires_at?: string;
  message?: string;
}

export interface ApifyApprovalResponse {
  success: boolean;
  data: ApifyApproval;
}

// ---------------------------------------------------------------------------
// Query key helpers
// ---------------------------------------------------------------------------

export const apifyApprovalKeys = {
  detail: (approvalId: string | null) => ['apify-approval', approvalId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useApproveApifyRequest(config: SharedHookConfig, threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (approvalId: string) => {
      const response = await config.fetchFn<ApifyApprovalResponse>(
        `/apify/approvals/${approvalId}/approve`,
        {
          method: 'POST',
          body: { thread_id: threadId },
        },
      );

      if (!response.success || !response.data) {
        throw new Error(response.data?.message || 'Failed to approve request');
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(apifyApprovalKeys.detail(data.approval_id), data);
      queryClient.invalidateQueries({ queryKey: apifyApprovalKeys.detail(data.approval_id) });
    },
  });
}

export function useGetApifyApprovalStatus(
  config: SharedHookConfig,
  approvalId: string | null,
  threadId: string,
) {
  return useQuery({
    queryKey: apifyApprovalKeys.detail(approvalId),
    queryFn: async (): Promise<ApifyApproval | null> => {
      if (!approvalId) return null;

      const response = await config.fetchFn<ApifyApprovalResponse>(
        `/apify/approvals/${approvalId}?thread_id=${threadId}`,
      );

      if (!response.success || !response.data) {
        throw new Error(response.data?.message || 'Failed to get approval status');
      }

      return response.data;
    },
    enabled: !!approvalId,
    staleTime: 3000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'pending' ? 5000 : false;
    },
  });
}
