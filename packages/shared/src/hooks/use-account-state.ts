/**
 * Shared account state (read-side) hooks.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/billing/use-account-state.ts)
 * Reconciled with:  mobile   (apps/mobile/lib/billing/hooks.ts)
 *
 * This file contains ONLY the read / query side:
 * - useAccountState          (main query)
 * - useAccountStateWithStreaming (polling variant during agent runs)
 * - accountStateKeys         (query keys)
 * - accountStateSelectors    (pure selector helpers)
 * - invalidateAccountState   (cache invalidation helper)
 *
 * Mutation hooks (checkout, cancel, purchase, etc.) remain platform-specific
 * because they depend on `window.location`, `toast`, RevenueCat, etc.
 *
 * Differences reconciled:
 * - Frontend staleTime = 2 min, mobile = 10 min. Default here is 2 min;
 *   mobile can pass `staleTime: 10 * 60 * 1000` via options.
 * - Frontend has `skipCache` param; mobile does not. We include it as optional.
 * - Frontend uses `structuralSharing`; mobile does not. Included here.
 * - The AccountState type is imported from the shared billing types which
 *   use the rich `AccountStateLimits` format. Mobile can use `flattenLimits()`
 *   from `@kortix/shared/types/billing` for backward-compat.
 * - Frontend-only `accountStateSelectors` that depend on `siteConfig` (e.g.
 *   `planName`) are NOT included — those stay in the frontend.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountState } from '../types/billing';
import type { SharedHookConfig } from './fetch-types';

// Re-export AccountState so consumers can `import { AccountState } from '@kortix/shared/hooks'`
export type { AccountState };

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const accountStateKeys = {
  all: ['account-state'] as const,
  state: () => [...accountStateKeys.all, 'state'] as const,
  usageHistory: (days?: number) =>
    [...accountStateKeys.all, 'usage-history', { days }] as const,
  transactions: (limit?: number, offset?: number) =>
    [...accountStateKeys.all, 'transactions', { limit, offset }] as const,
  trial: () => [...accountStateKeys.all, 'trial'] as const,
};

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

/**
 * Invalidate the account-state query cache.
 *
 * This is a simplified, platform-agnostic version. The frontend's advanced
 * debounced / `skipCache` variant lives in the frontend codebase because it
 * calls `billingApi.getAccountState(true)` directly.
 */
export function invalidateAccountState(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: accountStateKeys.state() });
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseAccountStateOptions {
  enabled?: boolean;
  /** Time in ms before data is considered stale. Default 2 min (frontend) */
  staleTime?: number;
  /** Default `'always'` (frontend); mobile overrides to `false` */
  refetchOnMount?: boolean | 'always';
  refetchOnWindowFocus?: boolean;
  /**
   * Append `?skip_cache=true` to the request.
   * Frontend uses this after checkout / subscription changes.
   */
  skipCache?: boolean;
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

/**
 * Unified query for all account billing state.
 *
 * Replaces per-app `useAccountState` hooks with a single shared version.
 * Mutation hooks (checkout, cancel, etc.) stay platform-specific.
 *
 * @param config  Platform-specific fetch function + optional base URL
 * @param options React-query tuning knobs
 */
export function useAccountState(
  config: SharedHookConfig,
  options?: UseAccountStateOptions,
) {
  const enabled = options?.enabled ?? true;
  const skipCache = options?.skipCache ?? false;

  return useQuery<AccountState>({
    queryKey: accountStateKeys.state(),
    queryFn: () => {
      const params = skipCache ? '?skip_cache=true' : '';
      return config.fetchFn<AccountState>(`/billing/account-state${params}`);
    },
    enabled,
    staleTime: options?.staleTime ?? 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: options?.refetchOnMount ?? 'always',
    refetchOnReconnect: true,
    structuralSharing: true,
    retry: enabled
      ? (failureCount, error) => {
          const message = (error as Error).message || '';
          if (message.includes('401') || message.includes('403')) {
            return false;
          }
          return failureCount < 2;
        }
      : false,
  });
}

// ---------------------------------------------------------------------------
// Streaming variant
// ---------------------------------------------------------------------------

/**
 * Account state with periodic refresh during active agent streaming.
 * Use this in components that display credits during agent runs.
 */
export function useAccountStateWithStreaming(
  config: SharedHookConfig,
  isStreaming = false,
) {
  return useQuery<AccountState>({
    queryKey: accountStateKeys.state(),
    queryFn: () => config.fetchFn<AccountState>('/billing/account-state'),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: isStreaming ? 2 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });
}

// ---------------------------------------------------------------------------
// Usage history & transactions (read-only queries)
// ---------------------------------------------------------------------------

export function useUsageHistory(
  config: SharedHookConfig,
  days = 30,
) {
  return useQuery({
    queryKey: accountStateKeys.usageHistory(days),
    queryFn: () => config.fetchFn(`/billing/usage-history?days=${days}`),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useTransactions(
  config: SharedHookConfig,
  limit = 50,
  offset = 0,
) {
  return useQuery({
    queryKey: accountStateKeys.transactions(limit, offset),
    queryFn: () =>
      config.fetchFn(`/billing/transactions?limit=${limit}&offset=${offset}`),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ---------------------------------------------------------------------------
// Trial status (read-only query)
// ---------------------------------------------------------------------------

export function useTrialStatus(
  config: SharedHookConfig,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: accountStateKeys.trial(),
    queryFn: () => config.fetchFn('/billing/trial/status'),
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 60 * 5,
  });
}

// ---------------------------------------------------------------------------
// Selectors — pure functions, no platform deps
// ---------------------------------------------------------------------------

/**
 * Platform-agnostic selectors for extracting data from `AccountState`.
 *
 * Selectors that depend on frontend-only config (e.g. `siteConfig` for
 * `planName`) are NOT included here — those live in the frontend.
 *
 * NOTE: Frontend selectors convert dollars→credits via `dollarsToCredits()`.
 * Mobile selectors return raw values. The shared selectors return raw values;
 * wrap with `dollarsToCredits()` if your app needs the conversion.
 */
export const accountStateSelectors = {
  /** Check if user can run agents (has credits) */
  canRun: (state: AccountState | undefined) =>
    state?.credits?.can_run ?? false,

  /** Total credits (raw dollar value from backend) */
  totalCredits: (state: AccountState | undefined) =>
    state?.credits?.total ?? 0,

  /** Daily credits (raw dollar value) */
  dailyCredits: (state: AccountState | undefined) =>
    state?.credits?.daily ?? 0,

  /** Monthly credits (raw dollar value) */
  monthlyCredits: (state: AccountState | undefined) =>
    state?.credits?.monthly ?? 0,

  /** Extra / non-expiring credits (raw dollar value) */
  extraCredits: (state: AccountState | undefined) =>
    state?.credits?.extra ?? 0,

  /** Tier monthly credits limit (raw dollar value) */
  tierMonthlyCredits: (state: AccountState | undefined) =>
    state?.tier?.monthly_credits ?? 0,

  /** Tier key (e.g. 'free', 'plus', 'pro', 'ultra') */
  tierKey: (state: AccountState | undefined) =>
    state?.subscription?.tier_key ?? 'none',

  /** Tier display name */
  tierDisplayName: (state: AccountState | undefined) =>
    state?.subscription?.tier_display_name ?? 'No Plan',

  /** Is user on a trial? */
  isTrial: (state: AccountState | undefined) =>
    state?.subscription?.is_trial ?? false,

  /** Is subscription cancelled? */
  isCancelled: (state: AccountState | undefined) =>
    state?.subscription?.is_cancelled ?? false,

  /** All models the user is allowed to use */
  allowedModels: (state: AccountState | undefined) =>
    state?.models?.filter((m) => m.allowed) ?? [],

  /** Check if a specific model is allowed */
  isModelAllowed: (state: AccountState | undefined, modelId: string) =>
    state?.models?.find((m) => m.id === modelId)?.allowed ?? false,

  /** Scheduled tier change info (or null) */
  scheduledChange: (state: AccountState | undefined) =>
    state?.subscription?.scheduled_change,

  /** Has a pending scheduled tier change? */
  hasScheduledChange: (state: AccountState | undefined) =>
    state?.subscription?.has_scheduled_change ?? false,

  /** Commitment info */
  commitment: (state: AccountState | undefined) =>
    state?.subscription?.commitment,

  /** Can the user purchase extra credits? */
  canPurchaseCredits: (state: AccountState | undefined) =>
    state?.subscription?.can_purchase_credits ?? false,

  /** Daily refresh info (or null) */
  dailyCreditsInfo: (state: AccountState | undefined) =>
    state?.credits?.daily_refresh ?? null,
};
