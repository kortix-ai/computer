import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { backendApi } from '@/lib/api-client';

/**
 * Account Initialization Hook
 *
 * Calls POST /billing/setup/initialize which creates:
 *   1. Free Stripe subscription + credit_accounts row
 *   2. Cloud sandbox via Daytona (best-effort)
 *
 * Primary usage: /setting-up page calls this for new users.
 * There is no webhook-based auto-init — this is the only path.
 */
export function useInitializeAccount() {
  return useMutation({
    mutationFn: async (): Promise<{ success: boolean; message: string; subscription_id?: string }> => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to initialize account');
      }
      const response = await backendApi.post(`/billing/setup/initialize`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to initialize account');
      }
      return response.data;
    },
    retry: false, // Don't retry on failure - initialization should only happen once
  });
}

