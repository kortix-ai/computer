/**
 * Shared auth token helpers.
 *
 * Provides two token sources:
 * 1. Supabase JWT — for cloud mode (authenticated via Supabase login)
 * 2. Sandbox token — for local/VPS mode (user enters SANDBOX_AUTH_TOKEN)
 *
 * `getAuthToken()` is the unified getter: tries Supabase first, then sandbox.
 * Use it anywhere you need to authenticate against the sandbox proxy.
 *
 * `getSupabaseAccessToken()` is kept for callers that specifically need the
 * Supabase JWT (e.g. platform API calls that go through Supabase auth, not sandbox auth).
 */

import { createClient } from '@/lib/supabase/client';
import { getSandboxToken } from '@/stores/sandbox-auth-store';

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

/**
 * Unified auth token getter — tries Supabase JWT first, falls back to sandbox token.
 *
 * Use this for any request going through the /v1/preview proxy. The proxy
 * accepts either Supabase JWT (cloud) or sandbox token (local/VPS).
 */
export async function getAuthToken(): Promise<string | null> {
  // Cloud mode: Supabase JWT
  const supabaseToken = await getSupabaseAccessToken();
  if (supabaseToken) return supabaseToken;

  // Local/VPS mode: sandbox token (synchronous — stored in zustand)
  return getSandboxToken();
}
