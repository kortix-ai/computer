/**
 * Shared system status hooks.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/edge-flags/index.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/useSystemStatus.ts)
 *
 * Differences:
 * - Frontend prefixes interfaces with `I` (`IMaintenanceNotice`); we drop the prefix.
 * - Frontend retries 2×; mobile retries 3×. Shared defaults to 2 but callers
 *   can override via react-query options.
 * - Toast / side-effects are NOT included — callers should handle
 *   onSuccess / onError as needed.
 */

import { useQuery } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceNotice {
  enabled: boolean;
  startTime?: string;
  endTime?: string;
}

export interface TechnicalIssue {
  enabled: boolean;
  message?: string;
  statusUrl?: string;
  affectedServices?: string[];
  description?: string;
  estimatedResolution?: string;
  severity?: 'degraded' | 'outage' | 'maintenance';
}

export interface SystemStatusResponse {
  maintenanceNotice: MaintenanceNotice;
  technicalIssue: TechnicalIssue;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const systemStatusKeys = {
  all: ['system-status'] as const,
} as const;

// ---------------------------------------------------------------------------
// Default fallback
// ---------------------------------------------------------------------------

const DEFAULT_STATUS: SystemStatusResponse = {
  maintenanceNotice: { enabled: false },
  technicalIssue: { enabled: false },
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface UseSystemStatusOptions {
  enabled?: boolean;
  /** Stale time in ms (default 30 s) */
  staleTime?: number;
  /** Refetch interval in ms (default 60 s) */
  refetchInterval?: number;
}

/**
 * Fetch the system-wide maintenance / technical-issue status.
 *
 * On error the hook returns a safe default (`{ enabled: false }` for both
 * notices) instead of throwing, matching the behaviour of both apps.
 */
export function useSystemStatus(
  config: SharedHookConfig,
  options?: UseSystemStatusOptions,
) {
  return useQuery<SystemStatusResponse>({
    queryKey: systemStatusKeys.all,
    queryFn: async () => {
      try {
        return await config.fetchFn<SystemStatusResponse>('/system/status');
      } catch {
        return DEFAULT_STATUS;
      }
    },
    staleTime: options?.staleTime ?? 30_000,
    refetchInterval: options?.refetchInterval ?? 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    retry: 2,
    placeholderData: DEFAULT_STATUS,
    enabled: options?.enabled,
  });
}

/**
 * Convenience wrapper — returns only the maintenance notice.
 */
export function useMaintenanceNotice(
  config: SharedHookConfig,
  options?: UseSystemStatusOptions,
) {
  const { data, ...rest } = useSystemStatus(config, options);
  return {
    ...rest,
    data: data?.maintenanceNotice ?? { enabled: false } as MaintenanceNotice,
  };
}

/**
 * Convenience wrapper — returns only the technical issue.
 */
export function useTechnicalIssue(
  config: SharedHookConfig,
  options?: UseSystemStatusOptions,
) {
  const { data, ...rest } = useSystemStatus(config, options);
  return {
    ...rest,
    data: data?.technicalIssue ?? { enabled: false } as TechnicalIssue,
  };
}
