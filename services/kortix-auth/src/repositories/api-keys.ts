import { eq, and, desc } from 'drizzle-orm';
import { apiKeys } from '@kortix/db';
import { db } from '../db';
import { generateKeyPair, hashSecretKey } from '../lib/crypto';

export interface ApiKey {
  keyId: string;
  publicKey: string;
  accountId: string;
  title: string;
  description?: string | null;
  status: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string | null;
}

export interface CreateApiKeyResult {
  keyId: string;
  publicKey: string;
  secretKey: string; // Only returned on creation
  title: string;
  createdAt: string | null;
}

/**
 * Create a new API key for an account.
 */
export async function createApiKey(
  accountId: string,
  title: string,
  description?: string,
  expiresInDays?: number
): Promise<CreateApiKeyResult> {
  const { publicKey, secretKey } = generateKeyPair();
  const secretKeyHash = hashSecretKey(secretKey);

  let expiresAt: string | null = null;
  if (expiresInDays && expiresInDays > 0) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + expiresInDays);
    expiresAt = expDate.toISOString();
  }

  const [row] = await db
    .insert(apiKeys)
    .values({
      publicKey,
      secretKeyHash,
      accountId,
      title,
      description: description ?? null,
      status: 'active',
      expiresAt,
    })
    .returning({
      keyId: apiKeys.keyId,
      publicKey: apiKeys.publicKey,
      title: apiKeys.title,
      createdAt: apiKeys.createdAt,
    });

  return {
    keyId: row.keyId,
    publicKey: row.publicKey,
    secretKey, // Only returned once!
    title: row.title,
    createdAt: row.createdAt,
  };
}

/**
 * List all API keys for an account.
 */
export async function listApiKeys(accountId: string): Promise<ApiKey[]> {
  const rows = await db
    .select({
      keyId: apiKeys.keyId,
      publicKey: apiKeys.publicKey,
      accountId: apiKeys.accountId,
      title: apiKeys.title,
      description: apiKeys.description,
      status: apiKeys.status,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.accountId, accountId))
    .orderBy(desc(apiKeys.createdAt));

  return rows;
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(accountId: string, keyId: string): Promise<boolean> {
  const result = await db
    .update(apiKeys)
    .set({ status: 'revoked' })
    .where(and(eq(apiKeys.keyId, keyId), eq(apiKeys.accountId, accountId)))
    .returning({ keyId: apiKeys.keyId });

  return result.length > 0;
}

/**
 * Delete an API key permanently.
 */
export async function deleteApiKey(accountId: string, keyId: string): Promise<boolean> {
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.keyId, keyId), eq(apiKeys.accountId, accountId)))
    .returning({ keyId: apiKeys.keyId });

  return result.length > 0;
}
