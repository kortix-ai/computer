/**
 * Shared helper to get the current Supabase access token (JWT).
 *
 * Used by:
 *  - opencode-sdk.ts   (SDK fetch wrapper for instance API calls)
 *  - use-file-events.ts (SSE connections to instance /event endpoint)
 *  - server-selector.tsx (health checks for remote instances)
 *
 * Returns `null` when no session is available (user not logged in).
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
