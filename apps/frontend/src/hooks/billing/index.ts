/**
 * Billing Hooks Index
 * 
 * UNIFIED APPROACH: All billing state comes from useAccountState
 * This provides a single source of truth and optimizes API calls.
 */

// =============================================================================
// PRIMARY HOOK - Use this for all billing data
// =============================================================================

export {
  // Main hook
  useAccountState,
  // Query keys for manual invalidation if needed
  accountStateKeys,
  invalidateAccountState,
  // Mutation hooks
  
  useCreatePortalSession,
  useCancelSubscription,
  useReactivateSubscription,
  useScheduleDowngrade,
  useCancelScheduledChange,
  // Usage/transactions (separate queries)
  
  // Trial
  useTrialStatus,
  useStartTrial,
  // Selectors for extracting data
  accountStateSelectors
} from './use-account-state';

// =============================================================================
// SPECIALIZED HOOKS - Use the unified data internally
// =============================================================================

// Thread billing was removed with the legacy thread system

// Billing modal state

// Download restriction for free tier
export { useDownloadRestriction } from './use-download-restriction';

// Credit & Thread Usage analytics

// =============================================================================
// TIER CONFIGURATIONS - Static data, separate endpoint
// =============================================================================

// =============================================================================
// ADMIN HOOKS - For admin dashboard
// =============================================================================

export {
  useUserBillingSummary,
  useAdminUserTransactions,
  useAdjustCredits,
  useProcessRefund,
} from './use-admin-billing';

// =============================================================================
// TYPE EXPORTS
// =============================================================================

