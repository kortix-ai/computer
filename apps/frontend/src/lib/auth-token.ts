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

/** Max retries for token acquisition (getSession + refreshSession fallback) */
const TOKEN_MAX_RETRIES = 3;
/** Base delay between retries (ms) — doubles each attempt */
const TOKEN_RETRY_BASE_DELAY = 500;

/**
 * Get the current Supabase access token with automatic retry.
 *
 * On failure, retries up to TOKEN_MAX_RETRIES times with exponential backoff.
 * If getSession() returns a null session (possibly expired), attempts an
 * explicit refreshSession() to recover before giving up.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  const supabase = createClient();

  for (let attempt = 0; attempt <= TOKEN_MAX_RETRIES; attempt++) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) return session.access_token;

      // Session is null — token may have expired. Try an explicit refresh.
      if (attempt === 0) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (refreshed?.access_token) return refreshed.access_token;
      }
    } catch {
      // Network error or Supabase internal failure — retry after delay
    }

    // Don't delay after the last attempt
    if (attempt < TOKEN_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, TOKEN_RETRY_BASE_DELAY * Math.pow(2, attempt)));
    }
  }

  return null;
}
