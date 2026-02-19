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
 *
 * **Deduplication**: Multiple callers (SSE, health check, session fetch, etc.)
 * all call getSupabaseAccessToken() on page load simultaneously. Without
 * deduplication, each triggers its own getSession() → refreshSession() chain,
 * causing 5+ parallel Supabase auth roundtrips that take seconds. The inflight
 * promise ensures only ONE auth call runs at a time; all others piggyback.
 *
 * **Caching**: The resolved token is cached for TOKEN_CACHE_TTL (30s). Within
 * that window, subsequent calls return instantly. After TTL, the next call
 * refreshes from Supabase.
 */

import { createClient } from "@/lib/supabase/client";
import { getSandboxToken, useSandboxAuthStore } from "@/stores/sandbox-auth-store";
import { isLocalMode } from "@/lib/config";

/** Max retries for token acquisition (getSession + refreshSession fallback) */
const TOKEN_MAX_RETRIES = 2;
/** Base delay between retries (ms) — doubles each attempt */
const TOKEN_RETRY_BASE_DELAY = 300;
/** How long to cache a resolved token (ms) */
const TOKEN_CACHE_TTL = 30_000;

// ── Token cache ──
let cachedToken: string | null = null;
let cachedAt = 0;

// ── Inflight deduplication ──
let inflight: Promise<string | null> | null = null;

/**
 * Get the current Supabase access token with caching + deduplication.
 *
 * Fast path: returns cached token if within TTL.
 * Slow path: deduplicates concurrent calls into a single auth roundtrip.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
	// Fast path: return cached token if still fresh
	if (cachedToken && Date.now() - cachedAt < TOKEN_CACHE_TTL) {
		return cachedToken;
	}

	// Deduplicate: if another call is already fetching, piggyback on it
	if (inflight) return inflight;

	inflight = fetchToken();
	try {
		const token = await inflight;
		cachedToken = token;
		cachedAt = Date.now();
		return token;
	} finally {
		inflight = null;
	}
}

/**
 * Invalidate the cached token (e.g. after a 401 response).
 * The next getSupabaseAccessToken() call will fetch fresh.
 */
export function invalidateTokenCache(): void {
	cachedToken = null;
	cachedAt = 0;
}

/** Internal: actually fetch the token from Supabase with retries. */
async function fetchToken(): Promise<string | null> {
	const supabase = createClient();

	for (let attempt = 0; attempt <= TOKEN_MAX_RETRIES; attempt++) {
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (session?.access_token) return session.access_token;

			// Session is null — token may have expired. Try an explicit refresh.
			if (attempt === 0) {
				const {
					data: { session: refreshed },
				} = await supabase.auth.refreshSession();
				if (refreshed?.access_token) return refreshed.access_token;
			}
		} catch {
			// Network error or Supabase internal failure — retry after delay
		}

		// Don't delay after the last attempt
		if (attempt < TOKEN_MAX_RETRIES) {
			await new Promise((r) =>
				setTimeout(r, TOKEN_RETRY_BASE_DELAY * 2 ** attempt),
			);
		}
	}

	return null;
}

/**
 * Unified auth token getter.
 *
 * - Local mode: returns sandbox token immediately (synchronous, no network call).
 *   Supabase is not available in local mode — skipping it avoids multi-second
 *   delays from failed getSession()/refreshSession() calls that block every
 *   health check and SDK request.
 * - Cloud mode: returns Supabase JWT, falling back to sandbox token.
 */
export async function getAuthToken(): Promise<string | null> {
  // Local mode: sandbox token only — Supabase is not available.
  // This is synchronous and instant (reads from zustand store).
  if (isLocalMode()) {
    return getSandboxToken();
  }

  // Cloud mode: Supabase JWT
  const supabaseToken = await getSupabaseAccessToken();
  if (supabaseToken) return supabaseToken;

  // Fallback: sandbox token (for cloud users with VPS sandboxes)
  return getSandboxToken();
}

// ── Shared auth-injecting fetch ──

/**
 * Build a Headers object from request input + init, injecting the auth token.
 */
function buildAuthHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
  token?: string | null,
): Headers {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * Shared authenticated fetch — injects auth tokens and handles 401 responses.
 *
 * Centralizes the pattern duplicated across opencode-sdk, use-sandbox-connection,
 * and server-selector. All three auth injection points now go through this.
 *
 * Behavior:
 *   1. Gets the current auth token (Supabase JWT or sandbox token)
 *   2. Injects it as Bearer token on the request
 *   3. On 401 with `authType: 'sandbox_token'`: sets `needsAuth` on sandbox-auth-store
 *   4. On other 401: invalidates the token cache, gets fresh, retries once
 *
 * Options:
 *   - `handleSandboxAuth`: if false, skips sandbox_token detection (default: true)
 *   - `retryOnAuthError`: if false, skips stale-token retry (default: true)
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    handleSandboxAuth?: boolean;
    retryOnAuthError?: boolean;
  },
): Promise<Response> {
  const { handleSandboxAuth = true, retryOnAuthError = true } = options ?? {};

  const token = await getAuthToken();
  const headers = buildAuthHeaders(input, init, token);
  const mergedInit = { ...init, headers };

  const response = await fetch(input, mergedInit);

  if (response.status === 401) {
    // Check for sandbox auth requirement
    if (handleSandboxAuth) {
      try {
        const body = await response.clone().json();
        if (body?.authType === 'sandbox_token') {
          useSandboxAuthStore.getState().setNeedsAuth(true);
          return response;
        }
      } catch {
        // Response may not be JSON — fall through to retry logic
      }
    }

    // Non-sandbox 401: the cached token is stale. Retry once with fresh token.
    if (retryOnAuthError && token) {
      invalidateTokenCache();
      const newToken = await getAuthToken();
      if (newToken && newToken !== token) {
        const retryHeaders = buildAuthHeaders(input, init, newToken);
        return fetch(input, { ...init, headers: retryHeaders });
      }
    }
  }

  return response;
}
