/**
 * Shared admin role hook.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/admin/use-admin-role.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/useAdminRole.ts)
 *
 * Differences:
 * - Frontend passes user?.id in the query key for per-user caching and
 *   accepts `enabled` from the auth provider.  Mobile omits user id.
 *   The shared hook accepts an optional `userId` and `enabled` flag so
 *   both patterns are supported.
 * - Frontend accepts extra UseQueryOptions; mobile does not.
 *   The shared hook keeps it simple — callers can wrap if needed.
 */

import { useQuery } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminRoleResponse {
  isAdmin: boolean;
  role?: 'admin' | 'super_admin' | null;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const ADMIN_ROLE_QUERY_KEY = ['admin-role'] as const;

// ---------------------------------------------------------------------------
// Default fallback
// ---------------------------------------------------------------------------

const DEFAULT_ROLE: AdminRoleResponse = { isAdmin: false, role: null };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminRole(
  config: SharedHookConfig,
  options?: { userId?: string; enabled?: boolean },
) {
  const queryKey = options?.userId
    ? [...ADMIN_ROLE_QUERY_KEY, options.userId]
    : [...ADMIN_ROLE_QUERY_KEY];

  return useQuery<AdminRoleResponse>({
    queryKey,
    queryFn: async () => {
      try {
        return await config.fetchFn<AdminRoleResponse>('/user-roles');
      } catch {
        return DEFAULT_ROLE;
      }
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,        // 5 minutes
    gcTime: 10 * 60 * 1000,          // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
