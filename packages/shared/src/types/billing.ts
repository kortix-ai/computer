/**
 * Shared billing types for AgentPress
 * Canonical definitions consumed by both frontend and mobile.
 *
 * Source of truth: frontend (apps/frontend/src/lib/api/billing.ts)
 * Reconciled with: mobile  (apps/mobile/lib/billing/api.ts)
 */

// =============================================================================
// Account State — the single unified billing snapshot
// =============================================================================

export interface AccountStateCredits {
  total: number;
  daily: number;
  monthly: number;
  extra: number;
  can_run: boolean;
  daily_refresh: DailyRefreshInfo | null;
}

export interface DailyRefreshInfo {
  enabled: boolean;
  daily_amount: number;
  refresh_interval_hours: number;
  last_refresh?: string;
  next_refresh_at?: string;
  seconds_until_refresh?: number;
}

export interface ScheduledTierChange {
  type: 'downgrade';
  current_tier: {
    name: string;
    display_name: string;
    monthly_credits?: number;
  };
  target_tier: {
    name: string;
    display_name: string;
    monthly_credits?: number;
  };
  effective_date: string;
}

export interface SubscriptionCommitment {
  has_commitment: boolean;
  can_cancel: boolean;
  commitment_type?: string | null;
  months_remaining?: number | null;
  commitment_end_date?: string | null;
}

export interface AccountStateSubscription {
  tier_key: string;
  tier_display_name: string;
  status: string;
  billing_period: 'monthly' | 'yearly' | 'yearly_commitment' | null;
  provider: 'stripe' | 'revenuecat' | 'local';
  subscription_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  is_trial: boolean;
  trial_status: string | null;
  trial_ends_at: string | null;
  is_cancelled: boolean;
  cancellation_effective_date: string | null;
  has_scheduled_change: boolean;
  scheduled_change: ScheduledTierChange | null;
  commitment: SubscriptionCommitment;
  can_purchase_credits: boolean;
}

export interface AccountStateModel {
  id: string;
  name: string;
  provider: string;
  allowed: boolean;
  context_window: number;
  capabilities: string[];
  priority: number;
  recommended: boolean;
}

/**
 * Rich limits shape (canonical — frontend format).
 * Each resource section carries `can_create`/`can_start` and `tier_name`
 * so the UI can show contextual upgrade prompts.
 */
export interface AccountStateLimits {
  projects: {
    current: number;
    max: number;
    can_create: boolean;
    tier_name: string;
  };
  threads: {
    current: number;
    max: number;
    can_create: boolean;
    tier_name: string;
  };
  concurrent_runs: {
    running_count: number;
    limit: number;
    can_start: boolean;
    tier_name: string;
  };
  ai_worker_count: {
    current_count: number;
    limit: number;
    can_create: boolean;
    tier_name: string;
  };
  custom_mcp_count: {
    current_count: number;
    limit: number;
    can_create: boolean;
    tier_name: string;
  };
}

export interface AccountStateTier {
  name: string;
  display_name: string;
  monthly_credits: number;
  can_purchase_credits: boolean;
}

export interface AccountStateCache {
  cached: boolean;
  ttl_seconds?: number;
  local_mode?: boolean;
}

export interface AccountState {
  credits: AccountStateCredits;
  subscription: AccountStateSubscription;
  models: AccountStateModel[];
  /** Rich limits — use `flattenLimits()` when the mobile flat format is needed */
  limits: AccountStateLimits;
  tier: AccountStateTier;
  _cache?: AccountStateCache;
}

// ---------------------------------------------------------------------------
// flattenLimits — convert rich limits to the simplified flat shape mobile uses
// ---------------------------------------------------------------------------

/**
 * Simplified flat limits shape that mobile currently consumes.
 */
export interface FlatLimits {
  projects: { current: number; max: number };
  threads: { current: number; max: number };
  concurrent_runs: number;
  custom_workers: number;
}

/**
 * Convert the canonical (rich) `AccountStateLimits` to the flat number format
 * that the mobile app currently expects.
 */
export function flattenLimits(state: AccountState): FlatLimits {
  const { limits } = state;
  return {
    projects: {
      current: limits.projects.current,
      max: limits.projects.max,
    },
    threads: {
      current: limits.threads.current,
      max: limits.threads.max,
    },
    concurrent_runs: limits.concurrent_runs.limit,
    custom_workers: limits.ai_worker_count.limit,
  };
}

// =============================================================================
// Transaction & Usage
// =============================================================================

export interface Transaction {
  id: string;
  user_id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  reference_id?: string;
  reference_type?: string;
  created_at: string;
}

export interface UsageHistoryEntry {
  credits: number;
  debits: number;
  count: number;
}

export interface UsageHistory {
  daily_usage: Record<string, UsageHistoryEntry>;
  total_period_usage: number;
  total_period_credits: number;
}

// =============================================================================
// Trial
// =============================================================================

export interface TrialStatus {
  has_trial: boolean;
  trial_status?: 'none' | 'active' | 'expired' | 'converted' | 'cancelled' | 'used';
  trial_started_at?: string;
  trial_ends_at?: string;
  trial_mode?: string;
  remaining_days?: number;
  credits_remaining?: number;
  tier?: string;
  can_start_trial?: boolean;
  message?: string;
  trial_history?: {
    started_at?: string;
    ended_at?: string;
    converted_to_paid?: boolean;
  };
}

// =============================================================================
// Checkout / Subscription mutation requests & responses
// =============================================================================

/**
 * Request to create a Stripe checkout session.
 * Merged from frontend (`referral_id`, `locale`) and mobile (`fe_checkout_url` on response).
 */
export interface CreateCheckoutSessionRequest {
  tier_key: string;
  success_url: string;
  cancel_url: string;
  referral_id?: string;
  commitment_type?: 'monthly' | 'yearly' | 'yearly_commitment';
  /** Locale for Stripe adaptive pricing (e.g. 'en', 'de', 'fr') */
  locale?: string;
  /** Mobile-specific: URL the frontend checkout page should redirect to */
  fe_checkout_url?: string;
}

/**
 * Response from checkout session creation.
 * Merged from both apps — includes `fe_checkout_url` (mobile) and
 * `scheduled_date`, `redirect_to_dashboard` (frontend).
 */
export interface CreateCheckoutSessionResponse {
  status:
    | 'upgraded'
    | 'downgrade_scheduled'
    | 'checkout_created'
    | 'no_change'
    | 'new'
    | 'updated'
    | 'scheduled'
    | 'commitment_created'
    | 'commitment_blocks_downgrade';
  subscription_id?: string;
  schedule_id?: string;
  session_id?: string;
  url?: string;
  checkout_url?: string;
  /** Mobile deep-link URL for post-checkout redirect */
  fe_checkout_url?: string;
  effective_date?: string;
  scheduled_date?: string;
  current_tier?: string;
  target_tier?: string;
  message?: string;
  redirect_to_dashboard?: boolean;
  details?: {
    is_upgrade?: boolean;
    effective_date?: string;
    current_price?: number;
    new_price?: number;
    commitment_end_date?: string;
    months_remaining?: number;
    invoice?: {
      id: string;
      amount: number;
      currency: string;
    };
  };
}

// =============================================================================
// Purchase Credits
// =============================================================================

export interface PurchaseCreditsRequest {
  amount: number;
  success_url: string;
  cancel_url: string;
  /** Mobile-specific: pre-defined credit package identifier */
  package_id?: string;
}

export interface PurchaseCreditsResponse {
  checkout_url: string;
}

// =============================================================================
// Token Usage
// =============================================================================

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
  thread_id?: string;
  message_id?: string;
}
