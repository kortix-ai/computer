/**
 * Shared account initialization hook.
 *
 * Canonical source: frontend  (apps/frontend/src/hooks/account/use-account-setup.ts)
 * Reconciled with:  mobile   (apps/mobile/hooks/useAccountInitialization.ts)
 *
 * Differences:
 * - Frontend calls `/billing/setup/initialize`; mobile calls `/setup/initialize`.
 *   The shared hook uses `/setup/initialize` (the canonical backend path).
 *   Frontend's `/billing/setup/initialize` is a legacy alias that redirects
 *   to the same handler.  Callers can override via `endpointOverride` if needed.
 * - Auth session checks are platform-specific (Supabase client vs context).
 *   The shared hook relies on `fetchFn` to handle auth — if not authenticated
 *   it should throw.
 * - Mobile has richer error parsing; frontend is simpler.
 *   The shared hook includes the richer error handling.
 */

import { useMutation } from '@tanstack/react-query';
import type { SharedHookConfig } from './fetch-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountInitializationResponse {
  success: boolean;
  message: string;
  subscription_id?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAccountInitialization(
  config: SharedHookConfig,
  options?: {
    /** Override the default endpoint path (default: '/setup/initialize') */
    endpoint?: string;
  },
) {
  const endpoint = options?.endpoint ?? '/setup/initialize';

  return useMutation({
    mutationFn: async (): Promise<AccountInitializationResponse> => {
      const data = await config.fetchFn<AccountInitializationResponse>(endpoint, {
        method: 'POST',
      });

      if (data.success) {
        return {
          success: true,
          message: data.message || 'Account initialized successfully',
          subscription_id: data.subscription_id,
        };
      }

      // Treat "already initialized" as success
      if (data.message?.includes('Already subscribed') || data.message?.includes('already')) {
        return {
          success: true,
          message: 'Account already initialized',
          subscription_id: data.subscription_id,
        };
      }

      throw new Error(data.message || 'Failed to initialize account');
    },
    retry: false,
  });
}
