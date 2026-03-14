/**
 * Platform credential resolution — sandbox-first architecture.
 *
 * All channel credentials (Slack client_id/secret/signing_secret, Telegram bot token, etc.)
 * live inside the SANDBOX SecretStore. kortix-api reads them from the sandbox when needed
 * (OAuth install, OAuth callback, webhook signature verification).
 *
 * Resolution order:
 *   1. kortix-api env vars (SLACK_CLIENT_ID, etc.) — backward compat for cloud mode
 *   2. Sandbox env vars via GET {sandboxUrl}/env/{KEY} — the primary source in local mode
 *
 * The `channel_platform_credentials` DB table is NO LONGER USED.
 */

import { config } from '../../config';
import { resolveDirectEndpoint, resolveSandboxTarget } from '../core/opencode-connector';

export interface SlackPlatformCreds {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
}

// In-memory cache with short TTL (credentials rarely change mid-session)
interface CacheEntry {
  creds: SlackPlatformCreds | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 120_000; // 2 minutes
const cache = new Map<string, CacheEntry>();

export function clearPlatformCredentialsCache(): void {
  cache.clear();
}

/**
 * Get Slack platform credentials.
 *
 * Resolution:
 *   1. env vars on kortix-api (SLACK_CLIENT_ID, etc.) — always checked first
 *   2. sandbox env vars via GET {sandboxUrl}/env/{KEY} — if sandboxId provided
 */
export async function getSlackPlatformCredentials(
  _accountId?: string,
  sandboxId?: string | null,
): Promise<SlackPlatformCreds | null> {
  // 1. Check kortix-api env vars (backward compat, cloud mode)
  const fromEnv = envCreds();
  if (fromEnv) return fromEnv;

  // 2. Read from sandbox
  if (!sandboxId) return null;

  const cacheKey = `sandbox:${sandboxId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.creds;

  try {
    const creds = await readSlackCredsFromSandbox(sandboxId);
    cache.set(cacheKey, { creds, expiresAt: now + CACHE_TTL_MS });
    return creds;
  } catch (err) {
    console.error('[PLATFORM-CREDS] Failed to read Slack creds from sandbox:', err);
    return null;
  }
}

/**
 * Read Slack app credentials directly from the sandbox's env vars.
 * Uses GET {sandboxUrl}/env/{KEY} to read individual keys.
 */
async function readSlackCredsFromSandbox(sandboxId: string): Promise<SlackPlatformCreds | null> {
  const target = await resolveSandboxTarget(sandboxId);
  if (!target) {
    console.warn('[PLATFORM-CREDS] Sandbox not found:', sandboxId);
    return null;
  }

  const { url, headers } = await resolveDirectEndpoint(target);

  // Read all three keys in parallel
  const keys = ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_SIGNING_SECRET'] as const;
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await fetch(`${url}/env/${key}`, {
          headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return null;
        const data = await res.json() as { value?: string };
        return data.value || null;
      } catch {
        return null;
      }
    }),
  );

  const [clientId, clientSecret, signingSecret] = results;
  if (!clientId || !clientSecret || !signingSecret) return null;

  return { clientId, clientSecret, signingSecret };
}

function envCreds(): SlackPlatformCreds | null {
  const clientId = config.SLACK_CLIENT_ID;
  const clientSecret = config.SLACK_CLIENT_SECRET;
  const signingSecret = config.SLACK_SIGNING_SECRET;

  if (clientId && clientSecret && signingSecret) {
    return { clientId, clientSecret, signingSecret };
  }
  return null;
}
