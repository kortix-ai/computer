/**
 * API key management routes (sandbox-scoped).
 *
 * Mounted at /v1/platform/api-keys
 *
 * Routes:
 *   POST   /                → Create a new API key for a sandbox
 *   GET    /                → List all API keys for a sandbox (no secrets)
 *   PATCH  /:keyId/revoke   → Revoke an API key
 *   DELETE /:keyId          → Hard-delete an API key
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { sandboxes, accountUser, kortixApiKeys, type Database } from '@kortix/db';
import { db as defaultDb } from '../../shared/db';
import { supabaseAuth } from '../../middleware/auth';
import { hashSecretKey, generateApiKeyPair, isApiKeySecretConfigured } from '../../shared/crypto';
import type { AuthVariables } from '../../types';

// ─── Dependency Injection ────────────────────────────────────────────────────

export interface ApiKeysRouterDeps {
  db: Database;
  resolveAccountId: (userId: string) => Promise<string>;
  useAuth: boolean;
}

async function defaultResolveAccountId(userId: string): Promise<string> {
  const [membership] = await defaultDb
    .select({ accountId: accountUser.accountId })
    .from(accountUser)
    .where(eq(accountUser.userId, userId))
    .limit(1);

  return membership?.accountId ?? userId;
}

const defaultDeps: ApiKeysRouterDeps = {
  db: defaultDb,
  resolveAccountId: defaultResolveAccountId,
  useAuth: true,
};

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createApiKeysRouter(
  overrides: Partial<ApiKeysRouterDeps> = {},
): Hono<{ Variables: AuthVariables }> {
  const deps = { ...defaultDeps, ...overrides };
  const { db, resolveAccountId } = deps;

  const router = new Hono<{ Variables: AuthVariables }>();

  if (deps.useAuth) {
    router.use('/*', supabaseAuth);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function verifySandboxOwnership(sandboxId: string, accountId: string): Promise<boolean> {
    const [row] = await db
      .select({ sandboxId: sandboxes.sandboxId })
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.sandboxId, sandboxId),
          eq(sandboxes.accountId, accountId),
        ),
      )
      .limit(1);

    return !!row;
  }

  // ─── POST / ─────────────────────────────────────────────────────────────

  router.post('/', async (c) => {
    const userId = c.get('userId');
    const accountId = await resolveAccountId(userId);

    const body = await c.req.json().catch(() => ({}));
    const { sandbox_id, title, description, expires_in_days } = body as {
      sandbox_id?: string;
      title?: string;
      description?: string;
      expires_in_days?: number;
    };

    if (!sandbox_id) {
      return c.json({ error: 'sandbox_id is required' }, 400);
    }

    if (!title || title.trim().length === 0) {
      return c.json({ error: 'title is required' }, 400);
    }

    const owns = await verifySandboxOwnership(sandbox_id, accountId);
    if (!owns) {
      return c.json({ error: 'Sandbox not found' }, 404);
    }

    let expiresAt: Date | undefined;
    if (expires_in_days && expires_in_days > 0) {
      expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000);
    }

    try {
      if (!isApiKeySecretConfigured()) {
        return c.json({ error: 'API_KEY_SECRET not configured' }, 500);
      }

      const { publicKey, secretKey } = generateApiKeyPair();
      const secretKeyHash = hashSecretKey(secretKey);

      const [row] = await db
        .insert(kortixApiKeys)
        .values({
          sandboxId: sandbox_id,
          accountId,
          publicKey,
          secretKeyHash,
          title: title.trim(),
          description: description?.trim() ?? null,
          expiresAt: expiresAt ?? null,
        })
        .returning();

      if (!row) {
        return c.json({ error: 'Failed to create API key' }, 500);
      }

      return c.json({
        success: true,
        data: {
          key_id: row.keyId,
          public_key: row.publicKey,
          secret_key: secretKey, // shown ONCE
          sandbox_id: row.sandboxId,
          title: row.title,
          description: row.description,
          status: row.status,
          expires_at: row.expiresAt?.toISOString() ?? null,
          created_at: row.createdAt.toISOString(),
        },
      }, 201);
    } catch (err) {
      console.error('[API-KEYS] Create error:', err);
      return c.json({ error: 'Failed to create API key' }, 500);
    }
  });

  // ─── GET / ──────────────────────────────────────────────────────────────

  router.get('/', async (c) => {
    const userId = c.get('userId');
    const accountId = await resolveAccountId(userId);

    const sandboxId = c.req.query('sandbox_id');
    if (!sandboxId) {
      return c.json({ error: 'sandbox_id query param is required' }, 400);
    }

    const owns = await verifySandboxOwnership(sandboxId, accountId);
    if (!owns) {
      return c.json({ error: 'Sandbox not found' }, 404);
    }

    try {
      const keys = await db
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

      return c.json({
        success: true,
        data: keys.map((k) => ({
          key_id: k.keyId,
          public_key: k.publicKey,
          sandbox_id: k.sandboxId,
          title: k.title,
          description: k.description,
          status: k.status,
          expires_at: k.expiresAt?.toISOString() ?? null,
          last_used_at: k.lastUsedAt?.toISOString() ?? null,
          created_at: k.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error('[API-KEYS] List error:', err);
      return c.json({ error: 'Failed to list API keys' }, 500);
    }
  });

  // ─── PATCH /:keyId/revoke ───────────────────────────────────────────────

  router.patch('/:keyId/revoke', async (c) => {
    const userId = c.get('userId');
    const accountId = await resolveAccountId(userId);
    const keyId = c.req.param('keyId');

    try {
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

      if (result.length === 0) {
        return c.json({ error: 'API key not found or already revoked' }, 404);
      }

      return c.json({ success: true, message: 'API key revoked' });
    } catch (err) {
      console.error('[API-KEYS] Revoke error:', err);
      return c.json({ error: 'Failed to revoke API key' }, 500);
    }
  });

  // ─── DELETE /:keyId ─────────────────────────────────────────────────────

  router.delete('/:keyId', async (c) => {
    const userId = c.get('userId');
    const accountId = await resolveAccountId(userId);
    const keyId = c.req.param('keyId');

    try {
      const result = await db
        .delete(kortixApiKeys)
        .where(
          and(
            eq(kortixApiKeys.keyId, keyId),
            eq(kortixApiKeys.accountId, accountId),
          ),
        )
        .returning({ keyId: kortixApiKeys.keyId });

      if (result.length === 0) {
        return c.json({ error: 'API key not found' }, 404);
      }

      return c.json({ success: true, message: 'API key deleted' });
    } catch (err) {
      console.error('[API-KEYS] Delete error:', err);
      return c.json({ error: 'Failed to delete API key' }, 500);
    }
  });

  return router;
}

// ─── Default instance ────────────────────────────────────────────────────────
export const apiKeysRouter = createApiKeysRouter();
