import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../shared/db';
import { channelPlatformCredentials } from '@kortix/db';
import { config } from '../../config';
import { decryptCredentials } from './credentials';

export interface SlackPlatformCreds {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
}

interface CacheEntry {
  creds: SlackPlatformCreds | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function clearPlatformCredentialsCache(): void {
  cache.clear();
}

export async function getSlackPlatformCredentials(
  accountId?: string,
  sandboxId?: string | null,
): Promise<SlackPlatformCreds | null> {
  // Cloud mode: always use env vars
  if (config.isCloud()) {
    return envCreds();
  }

  // Local mode: if env vars are fully set, use them (backward compat)
  const fromEnv = envCreds();
  if (fromEnv) {
    return fromEnv;
  }

  // Local mode, env vars missing: resolve from DB
  if (!accountId) return null;

  const cacheKey = `${accountId}:${sandboxId || 'default'}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.creds;
  }

  try {
    // 1. Try sandbox-scoped credentials first
    if (sandboxId) {
      const result = await loadCredsFromDb(accountId, sandboxId);
      if (result) {
        cache.set(cacheKey, { creds: result, expiresAt: now + CACHE_TTL_MS });
        return result;
      }
    }

    // 2. Fall back to account-level default (sandboxId = NULL)
    const fallbackKey = `${accountId}:default`;
    const fallbackCached = cache.get(fallbackKey);
    if (fallbackCached && fallbackCached.expiresAt > now) {
      if (sandboxId) {
        cache.set(cacheKey, fallbackCached);
      }
      return fallbackCached.creds;
    }

    const result = await loadCredsFromDb(accountId, null);
    cache.set(fallbackKey, { creds: result, expiresAt: now + CACHE_TTL_MS });
    if (sandboxId) {
      cache.set(cacheKey, { creds: result, expiresAt: now + CACHE_TTL_MS });
    }
    return result;
  } catch (err) {
    console.error('[PLATFORM-CREDS] Failed to load Slack platform credentials from DB:', err);
    return null;
  }
}

async function loadCredsFromDb(
  accountId: string,
  sandboxId: string | null,
): Promise<SlackPlatformCreds | null> {
  const conditions = [
    eq(channelPlatformCredentials.accountId, accountId),
    eq(channelPlatformCredentials.channelType, 'slack'),
  ];

  if (sandboxId) {
    conditions.push(eq(channelPlatformCredentials.sandboxId, sandboxId));
  } else {
    conditions.push(isNull(channelPlatformCredentials.sandboxId));
  }

  const [row] = await db
    .select()
    .from(channelPlatformCredentials)
    .where(and(...conditions));

  if (!row || !row.credentials) {
    return null;
  }

  const decrypted = await decryptCredentials(
    row.credentials as Record<string, unknown>,
  );

  const creds: SlackPlatformCreds = {
    clientId: (decrypted.clientId as string) || '',
    clientSecret: (decrypted.clientSecret as string) || '',
    signingSecret: (decrypted.signingSecret as string) || '',
  };

  if (!creds.clientId || !creds.clientSecret || !creds.signingSecret) {
    return null;
  }

  return creds;
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
