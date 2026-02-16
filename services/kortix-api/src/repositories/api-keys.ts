import { eq, and } from 'drizzle-orm';
import { kortixApiKeys } from '@kortix/db';
import { db } from '../shared/db';
import { hashSecretKey, generateApiKeyPair, isApiKeySecretConfigured } from '../shared/crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApiKeyValidationResult {
  isValid: boolean;
  accountId?: string;
  sandboxId?: string;
  keyId?: string;
  error?: string;
}

export interface CreateApiKeyParams {
  sandboxId: string;
  accountId: string;
  title: string;
  description?: string;
  expiresAt?: Date;
}

export interface CreateApiKeyResult {
  keyId: string;
  publicKey: string;
  secretKey: string; // returned ONCE at creation, never stored
  title: string;
  description: string | null;
  status: string;
  sandboxId: string;
  expiresAt: Date | null;
  createdAt: Date;
}

// ─── Throttle for last_used_at updates ───────────────────────────────────────

const THROTTLE_MS = 15 * 60 * 1000;
const lastUsedCache = new Map<string, number>();

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Create a new API key scoped to a sandbox.
 * Returns the secret key in plaintext ONCE — only the hash is stored.
 */
export async function createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResult> {
  if (!isApiKeySecretConfigured()) {
    throw new Error('API_KEY_SECRET not configured');
  }

  const { publicKey, secretKey } = generateApiKeyPair();
  const secretKeyHash = hashSecretKey(secretKey);

  const [row] = await db
    .insert(kortixApiKeys)
    .values({
      sandboxId: params.sandboxId,
      accountId: params.accountId,
      publicKey,
      secretKeyHash,
      title: params.title,
      description: params.description ?? null,
      expiresAt: params.expiresAt ?? null,
    })
    .returning();

  if (!row) {
    throw new Error('Failed to create API key');
  }

  return {
    keyId: row.keyId,
    publicKey: row.publicKey,
    secretKey, // plaintext — shown once
    title: row.title,
    description: row.description,
    status: row.status,
    sandboxId: row.sandboxId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/**
 * List all API keys for a sandbox. Never returns secret data.
 */
export async function listApiKeys(sandboxId: string) {
  return db
    .select({
      keyId: kortixApiKeys.keyId,
      publicKey: kortixApiKeys.publicKey,
      title: kortixApiKeys.title,
      description: kortixApiKeys.description,
      status: kortixApiKeys.status,
      sandboxId: kortixApiKeys.sandboxId,
      expiresAt: kortixApiKeys.expiresAt,
      lastUsedAt: kortixApiKeys.lastUsedAt,
      createdAt: kortixApiKeys.createdAt,
    })
    .from(kortixApiKeys)
    .where(eq(kortixApiKeys.sandboxId, sandboxId));
}

/**
 * Revoke an API key (soft-delete — sets status to 'revoked').
 */
export async function revokeApiKey(keyId: string, accountId: string): Promise<boolean> {
  const result = await db
    .update(kortixApiKeys)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(kortixApiKeys.keyId, keyId),
        eq(kortixApiKeys.accountId, accountId),
        eq(kortixApiKeys.status, 'active'),
      ),
    )
    .returning({ keyId: kortixApiKeys.keyId });

  return result.length > 0;
}

/**
 * Hard-delete an API key.
 */
export async function deleteApiKey(keyId: string, accountId: string): Promise<boolean> {
  const result = await db
    .delete(kortixApiKeys)
    .where(
      and(
        eq(kortixApiKeys.keyId, keyId),
        eq(kortixApiKeys.accountId, accountId),
      ),
    )
    .returning({ keyId: kortixApiKeys.keyId });

  return result.length > 0;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a secret API key (sk_xxx format).
 * Returns the account_id and sandbox_id if valid.
 */
export async function validateSecretKey(secretKey: string): Promise<ApiKeyValidationResult> {
  if (!isApiKeySecretConfigured()) {
    return { isValid: false, error: 'API_KEY_SECRET not configured' };
  }

  if (!secretKey.startsWith('sk_') || secretKey.length !== 35) {
    return { isValid: false, error: 'Invalid API key format' };
  }

  try {
    const secretKeyHash = hashSecretKey(secretKey);

    const [row] = await db
      .select({
        keyId: kortixApiKeys.keyId,
        accountId: kortixApiKeys.accountId,
        sandboxId: kortixApiKeys.sandboxId,
        status: kortixApiKeys.status,
        expiresAt: kortixApiKeys.expiresAt,
      })
      .from(kortixApiKeys)
      .where(
        and(
          eq(kortixApiKeys.secretKeyHash, secretKeyHash),
          eq(kortixApiKeys.status, 'active'),
        ),
      )
      .limit(1);

    if (!row) {
      return { isValid: false, error: 'API key not found or invalid' };
    }

    if (row.expiresAt && row.expiresAt < new Date()) {
      return { isValid: false, error: 'API key expired' };
    }

    // Fire-and-forget: update last_used_at (throttled)
    updateLastUsedThrottled(row.keyId).catch(() => {});

    return {
      isValid: true,
      accountId: row.accountId,
      sandboxId: row.sandboxId,
      keyId: row.keyId,
    };
  } catch (err) {
    console.error('API key validation error:', err);
    return { isValid: false, error: 'Validation error' };
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function updateLastUsedThrottled(keyId: string): Promise<void> {
  const now = Date.now();
  const lastUpdate = lastUsedCache.get(keyId) || 0;

  if (now - lastUpdate < THROTTLE_MS) {
    return;
  }

  lastUsedCache.set(keyId, now);

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
      .update(kortixApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(kortixApiKeys.keyId, keyId));
  } catch (err) {
    console.warn('Failed to update last_used_at:', err);
  }
}
