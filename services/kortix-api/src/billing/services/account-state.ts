import {
  getCreditAccount,
  getSubscriptionInfo,
} from '../repositories/credit-accounts';
import {
  getTier,
  getDailyCreditConfig,
  isModelAllowed,
  MINIMUM_CREDIT_FOR_RUN,
} from './tiers';
import { getCreditSummary } from './credits';
import type {
  AccountStateResponse,
  ScheduledChange,
  CommitmentInfo,
  ModelInfo,
} from '../../types';

const ALL_MODELS: Omit<ModelInfo, 'allowed'>[] = [
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', context_window: 200000, capabilities: ['vision', 'function_calling'], priority: 10, recommended: true },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'anthropic', context_window: 200000, capabilities: ['vision', 'function_calling'], priority: 8, recommended: false },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', context_window: 128000, capabilities: ['vision', 'function_calling'], priority: 9, recommended: false },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', context_window: 128000, capabilities: ['vision', 'function_calling'], priority: 6, recommended: false },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai', context_window: 200000, capabilities: ['function_calling'], priority: 7, recommended: false },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', context_window: 1048576, capabilities: ['vision', 'function_calling'], priority: 5, recommended: false },
  { id: 'grok-2', name: 'Grok 2', provider: 'xai', context_window: 131072, capabilities: ['vision', 'function_calling'], priority: 4, recommended: false },
  { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', context_window: 65536, capabilities: ['function_calling'], priority: 3, recommended: false },
  { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'deepseek', context_window: 65536, capabilities: ['function_calling'], priority: 2, recommended: false },
];

function getModelsForTier(tierName: string): ModelInfo[] {
  return ALL_MODELS.map((m) => ({
    ...m,
    allowed: isModelAllowed(tierName, m.id),
  }));
}

export async function buildMinimalAccountState(accountId: string): Promise<AccountStateResponse> {
  const credits = await getCreditSummary(accountId);
  const sub = await getSubscriptionInfo(accountId);

  const tierName = sub?.tier ?? 'free';
  const tier = getTier(tierName);
  const dailyConfig = getDailyCreditConfig(tierName);

  let dailyRefresh = null;
  if (dailyConfig) {
    const lastRefresh = sub?.lastDailyRefresh ?? null;
    const nextRefresh = lastRefresh
      ? new Date(new Date(lastRefresh).getTime() + dailyConfig.refreshIntervalHours * 3600000).toISOString()
      : null;
    const secondsUntil = nextRefresh
      ? Math.max(0, Math.floor((new Date(nextRefresh).getTime() - Date.now()) / 1000))
      : null;

    dailyRefresh = {
      enabled: true,
      daily_amount: dailyConfig.dailyAmount,
      refresh_interval_hours: dailyConfig.refreshIntervalHours,
      last_refresh: lastRefresh,
      next_refresh_at: nextRefresh,
      seconds_until_refresh: secondsUntil,
    };
  }

  const isTrial = sub?.trialStatus === 'active';
  const isCancelled = sub?.stripeSubscriptionStatus === 'canceled'
    || (sub?.revenuecatCancelledAt != null);

  const commitment = extractCommitment(sub);
  const scheduledChange = extractScheduledChange(sub, tierName);

  return {
    credits: {
      total: credits.total,
      daily: credits.daily,
      monthly: credits.monthly,
      extra: credits.extra,
      can_run: credits.canRun,
      daily_refresh: dailyRefresh,
    },
    subscription: {
      tier_key: tierName,
      tier_display_name: tier.displayName,
      status: sub?.stripeSubscriptionStatus ?? (tierName === 'free' ? 'active' : 'no_subscription'),
      billing_period: (sub?.planType as any) ?? null,
      provider: (sub?.provider as any) ?? 'stripe',
      subscription_id: sub?.stripeSubscriptionId ?? null,
      current_period_end: null,
      cancel_at_period_end: false,
      is_trial: isTrial,
      trial_status: sub?.trialStatus ?? null,
      trial_ends_at: sub?.trialEndsAt ?? null,
      is_cancelled: isCancelled,
      cancellation_effective_date: null,
      has_scheduled_change: scheduledChange !== null,
      scheduled_change: scheduledChange,
      commitment,
      can_purchase_credits: tier.canPurchaseCredits,
    },
    models: getModelsForTier(tierName),
    limits: buildLimits(tierName, accountId),
    tier: {
      name: tier.name,
      display_name: tier.displayName,
      monthly_credits: tier.monthlyCredits,
      can_purchase_credits: tier.canPurchaseCredits,
    },
  };
}

export async function buildAccountState(accountId: string): Promise<AccountStateResponse> {
  return buildMinimalAccountState(accountId);
}

/**
 * Returns a mock account state for local mode (no database).
 * Presents the user as an "ultra" tier with unlimited credits so
 * no billing UI or limits block the local experience.
 */
export function buildLocalAccountState(): AccountStateResponse {
  return {
    credits: {
      total: 999999,
      daily: 999999,
      monthly: 999999,
      extra: 0,
      can_run: true,
      daily_refresh: null,
    },
    subscription: {
      tier_key: 'ultra',
      tier_display_name: 'Local (Unlimited)',
      status: 'active',
      billing_period: null,
      provider: 'stripe',
      subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      is_trial: false,
      trial_status: null,
      trial_ends_at: null,
      is_cancelled: false,
      cancellation_effective_date: null,
      has_scheduled_change: false,
      scheduled_change: null,
      commitment: { has_commitment: false, can_cancel: true, commitment_type: null, months_remaining: null, commitment_end_date: null },
      can_purchase_credits: false,
    },
    models: getModelsForTier('ultra'),
    limits: {
      concurrent_runs: { running_count: 0, limit: 999, can_start: true, tier_name: 'ultra' },
      ai_worker_count: { current_count: 0, limit: 999, can_create: true, tier_name: 'ultra' },
      custom_mcp_count: { current_count: 0, limit: 999, can_create: true, tier_name: 'ultra' },
      trigger_count: {
        scheduled: { current_count: 0, limit: 999, can_create: true },
        app: { current_count: 0, limit: 999, can_create: true },
        tier_name: 'ultra',
      },
    },
    tier: {
      name: 'ultra',
      display_name: 'Local (Unlimited)',
      monthly_credits: 999999,
      can_purchase_credits: false,
    },
  };
}

function extractCommitment(sub: Awaited<ReturnType<typeof getSubscriptionInfo>>): CommitmentInfo {
  if (!sub?.commitmentType || !sub.commitmentEndDate) {
    return { has_commitment: false, can_cancel: true, commitment_type: null, months_remaining: null, commitment_end_date: null };
  }

  const endDate = new Date(sub.commitmentEndDate);
  const now = new Date();
  const monthsRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (30 * 86400000)));
  const canCancel = endDate <= now;

  return {
    has_commitment: true,
    can_cancel: canCancel,
    commitment_type: sub.commitmentType,
    months_remaining: monthsRemaining,
    commitment_end_date: sub.commitmentEndDate,
  };
}

function extractScheduledChange(
  sub: Awaited<ReturnType<typeof getSubscriptionInfo>>,
  currentTierName: string,
): ScheduledChange | null {
  if (sub?.scheduledTierChange && sub.scheduledTierChangeDate) {
    const current = getTier(currentTierName);
    const target = getTier(sub.scheduledTierChange);
    return {
      type: 'downgrade',
      current_tier: { name: current.name, display_name: current.displayName, monthly_credits: current.monthlyCredits },
      target_tier: { name: target.name, display_name: target.displayName, monthly_credits: target.monthlyCredits },
      effective_date: sub.scheduledTierChangeDate,
    };
  }

  if (sub?.revenuecatPendingChangeProduct && sub.revenuecatPendingChangeDate) {
    const current = getTier(currentTierName);
    return {
      type: 'downgrade',
      current_tier: { name: current.name, display_name: current.displayName },
      target_tier: { name: sub.revenuecatPendingChangeProduct, display_name: sub.revenuecatPendingChangeProduct },
      effective_date: sub.revenuecatPendingChangeDate,
    };
  }

  return null;
}

function buildLimits(tierName: string, _accountId: string) {
  const tier = getTier(tierName);
  const l = tier.limits;

  return {
    concurrent_runs: { running_count: 0, limit: l.concurrentRuns, can_start: true, tier_name: tierName },
    ai_worker_count: { current_count: 0, limit: l.customWorkers, can_create: true, tier_name: tierName },
    custom_mcp_count: { current_count: 0, limit: 10, can_create: true, tier_name: tierName },
    trigger_count: {
      scheduled: { current_count: 0, limit: l.scheduledTriggers, can_create: l.scheduledTriggers > 0 },
      app: { current_count: 0, limit: l.appTriggers, can_create: l.appTriggers > 0 },
      tier_name: tierName,
    },
  };
}
