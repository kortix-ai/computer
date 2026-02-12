/**
 * Shared helper to get the current Supabase access token (JWT).
 *
 * Used by:
 *  - opencode-sdk.ts   (SDK fetch wrapper for instance API calls)
 *  - use-file-events.ts (SSE connections to instance /event endpoint)
 *  - server-selector.tsx (health checks for remote instances)
 *
 * Returns `null` when no session is available (user not logged in).
 */

import { createClient } from '@/lib/supabase/client';

/**
 * Get the current Supabase access token.
 * This is async because it may need to refresh an expired token.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}
