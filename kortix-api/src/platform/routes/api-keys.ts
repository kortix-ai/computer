/**
 * API key management routes (sandbox-scoped).
 *
 * Mounted at /v1/platform/api-keys
 *
 * Routes:
 *   POST   /                   → Create a new user API key for a sandbox
 *   GET    /                   → List all API keys for a sandbox (no secrets)
 *   PATCH  /:keyId/revoke      → Revoke an API key
 *   DELETE /:keyId             → Hard-delete an API key
 *   POST   /:keyId/regenerate  → Regenerate a sandbox-managed key (revoke old + create new)
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { sandboxes, kortixApiKeys, type Database } from '@kortix/db';
import { db as defaultDb } from '../../shared/db';
import { hashSecretKey, generateApiKeyPair, generateSandboxKeyPair, isApiKeySecretConfigured } from '../../shared/crypto';
import type { AuthVariables } from '../../types';
import { resolveAccountId as defaultResolveAccountId } from '../../shared/resolve-account';
import { supabaseAuth } from '../../middleware/auth';
import { getProvider, type ProviderName } from '../providers';

// ─── Dependency Injection ────────────────────────────────────────────────────

export interface ApiKeysRouterDeps {
  db: Database;
  resolveAccountId: (userId: string) => Promise<string>;
  useAuth: boolean;
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
  // Create a new user API key for a sandbox.

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

    // Resolve: try as UUID first, then as external_id
    let resolvedSandboxId = sandbox_id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sandbox_id);
    if (!isUuid) {
      const [row] = await db
        .select({ sandboxId: sandboxes.sandboxId })
        .from(sandboxes)
        .where(and(eq(sandboxes.externalId, sandbox_id), eq(sandboxes.accountId, accountId)))
        .limit(1);
      if (!row) {
        return c.json({ error: 'Sandbox not found' }, 404);
      }
      resolvedSandboxId = row.sandboxId;
    }

    const owns = await verifySandboxOwnership(resolvedSandboxId, accountId);
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
          sandboxId: resolvedSandboxId,
          accountId,
          publicKey,
          secretKeyHash,
          title: title.trim(),
          description: description?.trim() ?? null,
          type: 'user',
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
          type: row.type,
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
  // List all API keys for a sandbox (no secrets).
  // Accepts sandbox_id as either the UUID or external_id (e.g. 'kortix-sandbox').

  router.get('/', async (c) => {
    const userId = c.get('userId');
    const accountId = await resolveAccountId(userId);

    const sandboxIdParam = c.req.query('sandbox_id');
    if (!sandboxIdParam) {
      return c.json({ error: 'sandbox_id query param is required' }, 400);
    }

    // Resolve: try as UUID first, then as external_id
    let sandboxId = sandboxIdParam;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sandboxIdParam);
    if (!isUuid) {
      const [row] = await db
        .select({ sandboxId: sandboxes.sandboxId })
        .from(sandboxes)
        .where(and(eq(sandboxes.externalId, sandboxIdParam), eq(sandboxes.accountId, accountId)))
        .limit(1);
      if (!row) {
        return c.json({ error: 'Sandbox not found' }, 404);
      }
      sandboxId = row.sandboxId;
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
          type: kortixApiKeys.type,
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
          type: k.type,
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

  // ─── POST /:keyId/regenerate ───────────────────────────────────────────
  // Regenerate a sandbox-managed key: revoke old + create new + push to sandbox.
  // Only works on type='sandbox' keys. Returns the new secret key ONCE.
  //
  // Flow:
  //   1. Revoke old key in DB
  //   2. Create new kortix_sb_ key in DB
  //   3. Resolve sandbox endpoint via provider
  //   4. Read all secrets from sandbox (decrypted with old KORTIX_TOKEN)
  //   5. Update KORTIX_TOKEN in sandbox (changes encryption key derivation)
  //   6. Re-write all secrets (re-encrypted with new key)
  //   7. Restart sandbox services

  router.post('/:keyId/regenerate', async (c) => {
    const userId = c.get('userId');
    const accountId = await resolveAccountId(userId);
    const keyId = c.req.param('keyId');

    try {
      // Find the existing key and verify it's a sandbox key owned by this account
      const [existing] = await db
        .select({
          keyId: kortixApiKeys.keyId,
          sandboxId: kortixApiKeys.sandboxId,
          type: kortixApiKeys.type,
          status: kortixApiKeys.status,
        })
        .from(kortixApiKeys)
        .where(
          and(
            eq(kortixApiKeys.keyId, keyId),
            eq(kortixApiKeys.accountId, accountId),
          ),
        )
        .limit(1);

      if (!existing) {
        return c.json({ error: 'API key not found' }, 404);
      }

      if (existing.type !== 'sandbox') {
        return c.json({ error: 'Only sandbox-managed keys can be regenerated' }, 400);
      }

      if (!isApiKeySecretConfigured()) {
        return c.json({ error: 'API_KEY_SECRET not configured' }, 500);
      }

      // Look up sandbox to get provider + externalId for pushing the new token
      const [sandbox] = await db
        .select({
          provider: sandboxes.provider,
          externalId: sandboxes.externalId,
        })
        .from(sandboxes)
        .where(eq(sandboxes.sandboxId, existing.sandboxId))
        .limit(1);

      // Revoke the old key
      if (existing.status === 'active') {
        await db
          .update(kortixApiKeys)
          .set({ status: 'revoked' })
          .where(eq(kortixApiKeys.keyId, keyId));
      }

      // Create a new sandbox key for the same sandbox
      const { publicKey, secretKey } = generateSandboxKeyPair();
      const secretKeyHash = hashSecretKey(secretKey);

      const [newRow] = await db
        .insert(kortixApiKeys)
        .values({
          sandboxId: existing.sandboxId,
          accountId,
          publicKey,
          secretKeyHash,
          title: 'Sandbox Token',
          type: 'sandbox',
        })
        .returning();

      if (!newRow) {
        return c.json({ error: 'Failed to regenerate API key' }, 500);
      }

      // Push new token to the running sandbox (best-effort, don't fail the API call)
      let sandboxUpdated = false;
      if (sandbox?.externalId && sandbox?.provider) {
        try {
          const provider = getProvider(sandbox.provider as ProviderName);
          const endpoint = await provider.resolveEndpoint(sandbox.externalId);

          // Single atomic call: decrypt all secrets with old key → switch token → re-encrypt → restart
          const rotateRes = await fetch(`${endpoint.url}/env/rotate-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...endpoint.headers },
            body: JSON.stringify({ token: secretKey }),
          });

          if (!rotateRes.ok) {
            const detail = await rotateRes.text().catch(() => '');
            throw new Error(`rotate-token returned ${rotateRes.status}: ${detail}`);
          }

          sandboxUpdated = true;
          console.log(`[API-KEYS] Pushed new KORTIX_TOKEN to sandbox ${sandbox.externalId}`);
        } catch (err) {
          // Sandbox may be stopped or unreachable — that's OK.
          // The new key is in the DB; sandbox will need a restart.
          console.warn(`[API-KEYS] Failed to push token to sandbox: ${err}`);
        }
      }

      return c.json({
        success: true,
        data: {
          key_id: newRow.keyId,
          public_key: newRow.publicKey,
          secret_key: secretKey, // shown ONCE
          sandbox_id: newRow.sandboxId,
          title: newRow.title,
          type: newRow.type,
          status: newRow.status,
          created_at: newRow.createdAt.toISOString(),
        },
        sandbox_updated: sandboxUpdated,
      });
    } catch (err) {
      console.error('[API-KEYS] Regenerate error:', err);
      return c.json({ error: 'Failed to regenerate API key' }, 500);
    }
  });

  return router;
}

// ─── Default instance ────────────────────────────────────────────────────────
export const apiKeysRouter = createApiKeysRouter();
