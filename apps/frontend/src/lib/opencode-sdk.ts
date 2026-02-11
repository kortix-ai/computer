/**
 * OpenCode SDK client singleton.
 *
 * Provides a `getClient()` function that returns an `OpencodeClient` instance
 * pointed at the currently active server URL. Automatically recreates the
 * client when the server URL changes.
 */

import { createOpencodeClient, type OpencodeClient } from '@kortix/opencode-sdk/v2/client';
import { getActiveOpenCodeUrl } from '@/stores/server-store';

let cachedClient: OpencodeClient | null = null;
let cachedUrl: string | null = null;

/**
 * Get (or create) the SDK client for the current active server.
 * Safe to call from non-React contexts (API modules, etc.).
 */
export function getClient(): OpencodeClient {
  const url = getActiveOpenCodeUrl();
  if (cachedClient && cachedUrl === url) return cachedClient;

  cachedClient = createOpencodeClient({ baseUrl: url });
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
