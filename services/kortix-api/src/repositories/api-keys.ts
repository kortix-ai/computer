import { eq, and } from 'drizzle-orm';
import { apiKeys } from '@kortix/db';
import { db } from '../db';
import { hashSecretKey, isApiKeySecretConfigured } from '../lib/crypto';

export interface ApiKeyValidationResult {
  isValid: boolean;
  accountId?: string;
  keyId?: string;
  error?: string;
}

// Throttle cache for last_used_at updates (15 min)
const THROTTLE_MS = 15 * 60 * 1000;
const lastUsedCache = new Map<string, number>();

/**
 * Validate a secret API key (sk_xxx format).
 * Returns the account_id if valid.
 */
export async function validateSecretKey(secretKey: string): Promise<ApiKeyValidationResult> {
  if (!isApiKeySecretConfigured()) {
    return { isValid: false, error: 'API_KEY_SECRET not configured' };
  }

  // Validate format: sk_ + 32 chars = 35 total
  if (!secretKey.startsWith('sk_') || secretKey.length !== 35) {
    return { isValid: false, error: 'Invalid API key format' };
  }

  try {
    const secretKeyHash = hashSecretKey(secretKey);

    const [row] = await db
      .select({
        keyId: apiKeys.keyId,
        accountId: apiKeys.accountId,
        status: apiKeys.status,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.secretKeyHash, secretKeyHash),
          eq(apiKeys.status, 'active'),
        )
      )
      .limit(1);

    if (!row) {
      return { isValid: false, error: 'API key not found or invalid' };
    }

    // Check expiration
    if (row.expiresAt) {
      const expiresAt = new Date(row.expiresAt);
      if (expiresAt < new Date()) {
        return { isValid: false, error: 'API key expired' };
      }
    }

    // Fire-and-forget: update last_used_at (throttled)
    updateLastUsedThrottled(row.keyId).catch(() => {});

    return {
      isValid: true,
      accountId: row.accountId,
      keyId: row.keyId,
    };
  } catch (err) {
    console.error('API key validation error:', err);
    return { isValid: false, error: 'Validation error' };
  }
}

/**
 * Update last_used_at with throttling (max once per 15 min per key).
 */
async function updateLastUsedThrottled(keyId: string): Promise<void> {
  const now = Date.now();
  const lastUpdate = lastUsedCache.get(keyId) || 0;

  if (now - lastUpdate < THROTTLE_MS) {
    return;
  }

  lastUsedCache.set(keyId, now);

  // Clean up old entries (keep cache bounded)
  if (lastUsedCache.size > 1000) {
    const cutoff = now - THROTTLE_MS * 2;
    for (const [k, v] of lastUsedCache.entries()) {
      if (v < cutoff) {
        lastUsedCache.delete(k);
      }
    }
  }

  try {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.keyId, keyId));
  } catch (err) {
    console.warn('Failed to update last_used_at:', err);
  }
}
