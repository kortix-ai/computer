/**
 * OpenCode SDK client singleton.
 *
 * Provides a `getClient()` function that returns an `OpencodeClient` instance
 * pointed at the currently active server URL. Automatically recreates the
 * client when the server URL changes.
 *
 * Auth tokens are injected via the shared `authenticatedFetch` from auth-token.ts.
 * All 401 handling (sandbox auth detection + stale token retry) is centralized there.
 */

import {
	createOpencodeClient,
	type OpencodeClient,
} from "@opencode-ai/sdk/v2/client";
import { authenticatedFetch } from "@/lib/auth-token";
import { getActiveOpenCodeUrl, registerClientResetter } from "@/stores/server-store";

let cachedClient: OpencodeClient | null = null;
let cachedUrl: string | null = null;

// Register the reset function so server-store can call it without a circular import
registerClientResetter(resetClient);

/**
 * Get (or create) the SDK client for the current active server.
 * Safe to call from non-React contexts (API modules, etc.).
 */
export function getClient(): OpencodeClient {
	const url = getActiveOpenCodeUrl();
	if (cachedClient && cachedUrl === url) return cachedClient;

	cachedClient = createOpencodeClient({
		baseUrl: url,
		fetch: authenticatedFetch as typeof fetch,
	});
	cachedUrl = url;
	return cachedClient;
}

/**
 * Force-recreate the client (e.g. after a server switch or token change).
 */
export function resetClient(): void {
	cachedClient = null;
	cachedUrl = null;
}
