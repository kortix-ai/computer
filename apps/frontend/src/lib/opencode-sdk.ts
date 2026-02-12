/**
 * OpenCode SDK client singleton.
 *
 * Provides a `getClient()` function that returns an `OpencodeClient` instance
 * pointed at the currently active server URL. Automatically recreates the
 * client when the server URL changes.
 *
 * For remote instances (e.g. kortix.cloud), the Supabase JWT is injected into
 * every request via a custom fetch wrapper so the preview proxy can authenticate.
 */

import { createOpencodeClient, type OpencodeClient } from '@kortix/opencode-sdk/v2/client';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { getSupabaseAccessToken } from '@/lib/auth-token';

let cachedClient: OpencodeClient | null = null;
let cachedUrl: string | null = null;

/**
 * Create a fetch wrapper that injects the Supabase JWT into every request.
 * Remote instances (kortix.cloud) require this for the preview proxy auth.
 * Local instances will simply ignore the extra header.
 */
function createAuthFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getSupabaseAccessToken();
    if (token) {
      // Start from the Request's own headers (preserves Content-Type etc.),
      // then layer on any headers from init, then add Authorization.
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => {
          headers.set(key, value);
        });
      }
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }
    // Disable Bun timeout on Request objects
    if (input instanceof Request) {
      (input as any).timeout = false;
    }
    return fetch(input, init);
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
