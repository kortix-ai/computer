/**
 * Shared tier-configurations hook.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/billing/use-tier-configurations.ts)
 *
 * The mobile app does not yet have a dedicated tier-configurations hook,
 * but can benefit from one for displaying tier comparisons and upgrade flows.
 *
 * This is a read-only query — tier data changes infrequently so we use
 * aggressive caching (1 hour stale, 24 hour gc).
 */

import { useQuery } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TierConfiguration {
  tier_key: string;
  name: string;
  display_name: string;
  monthly_credits: number;
  can_purchase_credits: boolean;
  project_limit: number;
  /**
   * Backend Stripe price IDs. Kept for API response compatibility —
   * frontends should use `tier_key` instead.
   */
  price_ids: string[];
}

export interface TierConfigurationsResponse {
  success: boolean;
  tiers: TierConfiguration[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Query key — nested under account-state for convenient bulk invalidation
// ---------------------------------------------------------------------------

export const tierConfigurationKeys = {
  all: ['account-state', 'tier-configurations'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch tier configurations from the backend API.
 * This is the single source of truth for what tiers exist and their limits.
 */
export function useTierConfigurations(config: SharedHookConfig) {
  return useQuery<TierConfigurationsResponse>({
    queryKey: tierConfigurationKeys.all,
    queryFn: () =>
      config.fetchFn<TierConfigurationsResponse>('/billing/tier-configurations'),
    staleTime: 1000 * 60 * 60, // 1 hour — tier configs don't change often
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Look up a single tier configuration by its key.
 */
export function getTierByKey(
  tiers: TierConfiguration[] | undefined,
  tierKey: string,
): TierConfiguration | undefined {
  return tiers?.find((tier) => tier.tier_key === tierKey);
}
