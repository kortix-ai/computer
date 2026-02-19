/**
 * OpenCode SDK client singleton.
 *
 * Provides a `getClient()` function that returns an `OpencodeClient` instance
 * pointed at the currently active server URL. Automatically recreates the
 * client when the server URL changes.
 *
 * For remote instances (cloud sandboxes via the preview proxy), the Supabase JWT
 * is injected into every request via a custom fetch wrapper so the proxy can authenticate.
 */

import {
	createOpencodeClient,
	type OpencodeClient,
} from "@kortix/opencode-sdk/v2/client";
import { getSupabaseAccessToken, invalidateTokenCache } from "@/lib/auth-token";
import { getActiveOpenCodeUrl } from "@/stores/server-store";

let cachedClient: OpencodeClient | null = null;
let cachedUrl: string | null = null;

/**
 * Build a Headers object with the given token injected as Authorization.
 */
function buildHeaders(
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
	if (token && !headers.has("Authorization")) {
		headers.set("Authorization", `Bearer ${token}`);
	}
	return headers;
}

/**
 * Create a fetch wrapper that injects the Supabase JWT into every request.
 * Remote instances (cloud sandboxes) require this for the preview proxy auth.
 * Local instances will simply ignore the extra header.
 *
 * On a 401 response, forces a token refresh and retries the request once.
 * This handles the case where the connection was lost and the token expired
 * while the sandbox was still processing.
 */
function createAuthFetch(): typeof fetch {
	return async (input: RequestInfo | URL, init?: RequestInit) => {
		const token = await getSupabaseAccessToken();
		const headers = buildHeaders(input, init, token);
		const mergedInit = { ...init, headers };

		// Disable Bun timeout on Request objects
		if (input instanceof Request) {
			(input as any).timeout = false;
		}

		const response = await fetch(input, mergedInit);

		// On 401, the cached token is stale. Invalidate and retry once.
		if (response.status === 401 && token) {
			invalidateTokenCache();
			const newToken = await getSupabaseAccessToken();
			if (newToken && newToken !== token) {
				const retryHeaders = buildHeaders(input, init, newToken);
				return fetch(input, { ...init, headers: retryHeaders });
			}
		}

		return response;
	};
}

/**
 * Get (or create) the SDK client for the current active server.
 * Safe to call from non-React contexts (API modules, etc.).
 */
export function getClient(): OpencodeClient {
	const url = getActiveOpenCodeUrl();
	if (cachedClient && cachedUrl === url) return cachedClient;

	cachedClient = createOpencodeClient({
		baseUrl: url,
		fetch: createAuthFetch(),
	});
	cachedUrl = url;
	return cachedClient;
}

/**
 * Force-recreate the client (e.g. after a server switch).
 */
export function resetClient(): void {
	cachedClient = null;
	cachedUrl = null;
}
