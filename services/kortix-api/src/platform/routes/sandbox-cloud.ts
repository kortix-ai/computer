/**
 * Sandbox router (DB-backed).
 *
 * DB-backed sandbox lifecycle. Mounted at /v1/platform/sandbox.
 *
 * Routes:
 *   GET    /          → Get the user's active sandbox (or 404)
 *   POST   /          → Ensure sandbox exists (idempotent create-or-return)
 *   GET    /list      → List all sandboxes for the account
 *   POST   /stop      → Stop the active sandbox
 *   POST   /restart   → Stop then start the active sandbox
 *   DELETE /          → Archive/remove the active sandbox
 */

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { sandboxes, type Database } from '@kortix/db';
import { db as defaultDb } from '../../shared/db';
import { createApiKey } from '../../repositories/api-keys';
import { supabaseAuth as authMiddleware } from '../../middleware/auth';
import {
  getProvider as defaultGetProvider,
  getDefaultProviderName as defaultGetDefaultProviderName,
  type ProviderName,
  type SandboxProvider,
} from '../providers';
import type { AuthVariables } from '../../types';
import { resolveAccountId as defaultResolveAccountId } from '../../shared/resolve-account';

// ─── Dependency Injection ────────────────────────────────────────────────────

export interface SandboxCloudRouterDeps {
  db: Database;
  getProvider: (name: ProviderName) => SandboxProvider;
  getDefaultProviderName: () => ProviderName;
  resolveAccountId: (userId: string) => Promise<string>;
  useAuth: boolean;
}

const defaultDeps: SandboxCloudRouterDeps = {
  db: defaultDb,
  getProvider: defaultGetProvider,
  getDefaultProviderName: defaultGetDefaultProviderName,
  resolveAccountId: defaultResolveAccountId,
  useAuth: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeSandbox(row: typeof sandboxes.$inferSelect) {
  return {
    sandbox_id: row.sandboxId,
    external_id: row.externalId,
    name: row.name,
    provider: row.provider,
    base_url: row.baseUrl,
    status: row.status,
    metadata: row.metadata,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createCloudSandboxRouter(
  overrides: Partial<SandboxCloudRouterDeps> = {},
): Hono<{ Variables: AuthVariables }> {
  const deps = { ...defaultDeps, ...overrides };
  const { db, getProvider, getDefaultProviderName, resolveAccountId } = deps;

  const router = new Hono<{ Variables: AuthVariables }>();

  if (deps.useAuth) {
    router.use('/*', authMiddleware);
  }

  // ─── GET / ─────────────────────────────────────────────────────────────
  // Get the user's active sandbox. Returns 404 if none.

  router.get('/', async (c) => {
    const userId = c.get('userId');

    try {
      const accountId = await resolveAccountId(userId);

      const [sandbox] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            eq(sandboxes.status, 'active'),
          ),
        )
        .limit(1);

      if (!sandbox) {
        return c.json(
          { success: false, error: 'No sandbox found. Call POST /v1/platform/sandbox to create one.' },
          404,
        );
      }

      return c.json({ success: true, data: serializeSandbox(sandbox) });
    } catch (err) {
      console.error('[SANDBOX-CLOUD] get error:', err);
      return c.json({ success: false, error: 'Failed to get sandbox' }, 500);
    }
  });

  // ─── POST / ────────────────────────────────────────────────────────────
  // Create a new sandbox. Limited to 1 active sandbox per account.

  router.post('/', async (c) => {
    const userId = c.get('userId');

    try {
      const body = await c.req.json().catch(() => ({}));
      const requestedProvider = (body?.provider as ProviderName) || undefined;
      const providerName = requestedProvider || getDefaultProviderName();
      const customName = body?.name as string | undefined;

      const accountId = await resolveAccountId(userId);

      // Enforce 1 active/provisioning sandbox per account
      const [existing] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            sql`${sandboxes.status} IN ('active', 'provisioning')`,
          ),
        )
        .limit(1);

      if (existing) {
        return c.json({
          success: false,
          error: 'Account already has an active sandbox. Use POST /platform/init to get it.',
        }, 409);
      }

      // Count existing sandboxes for naming
      const existingCount = await db
        .select()
        .from(sandboxes)
        .where(eq(sandboxes.accountId, accountId))
        .then((rows) => rows.length);

      const sandboxName = customName || `sandbox-${accountId.slice(0, 8)}${existingCount > 0 ? `-${existingCount + 1}` : ''}`;

      const provider = getProvider(providerName);

      // Create sandbox row first (we need the sandboxId for the API key)
      const [sandbox] = await db
        .insert(sandboxes)
        .values({
          accountId,
          name: sandboxName,
          provider: providerName,
          externalId: '',
          status: 'provisioning',
          baseUrl: '',
          config: {},
          metadata: {},
        })
        .returning();

      // Create a sandbox-managed API key (kortix_sb_)
      const sandboxKey = await createApiKey({
        sandboxId: sandbox.sandboxId,
        accountId,
        title: 'Sandbox Token',
        type: 'sandbox',
      });

      const result = await provider.create({
        accountId,
        userId,
        name: sandboxName,
        envVars: {
          KORTIX_TOKEN: sandboxKey.secretKey,
        },
      });

      // Update sandbox row with provider details
      const [updated] = await db
        .update(sandboxes)
        .set({
          externalId: result.externalId,
          status: 'active',
          baseUrl: result.baseUrl,
          metadata: result.metadata,
          updatedAt: new Date(),
        })
        .where(eq(sandboxes.sandboxId, sandbox.sandboxId))
        .returning();

      console.log(
        `[PLATFORM] Provisioned sandbox ${updated.sandboxId} via ${providerName} ` +
        `(external: ${result.externalId}) for account ${accountId}`,
      );

      return c.json(
        { success: true, data: serializeSandbox(updated), created: true },
        201,
      );
    } catch (err) {
      console.error('[SANDBOX-CLOUD] create error:', err);
      return c.json({ success: false, error: 'Failed to create sandbox' }, 500);
    }
  });

  // ─── GET /list ─────────────────────────────────────────────────────────
  // List all sandboxes for the account (all statuses).

  router.get('/list', async (c) => {
    const userId = c.get('userId');

    try {
      const accountId = await resolveAccountId(userId);

      const rows = await db
        .select()
        .from(sandboxes)
        .where(eq(sandboxes.accountId, accountId))
        .orderBy(desc(sandboxes.createdAt));

      return c.json({ success: true, data: rows.map(serializeSandbox) });
    } catch (err) {
      console.error('[SANDBOX-CLOUD] list error:', err);
      return c.json({ success: false, error: 'Failed to list sandboxes' }, 500);
    }
  });

  // ─── POST /stop ────────────────────────────────────────────────────────
  // Stop the user's active sandbox.

  router.post('/stop', async (c) => {
    const userId = c.get('userId');

    try {
      const accountId = await resolveAccountId(userId);

      const [sandbox] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            eq(sandboxes.status, 'active'),
          ),
        )
        .limit(1);

      if (!sandbox) {
        return c.json({ success: false, error: 'No active sandbox to stop' }, 404);
      }

      if (!sandbox.externalId) {
        return c.json({ success: false, error: 'Sandbox has no external ID' }, 400);
      }

      const provider = getProvider(sandbox.provider);
      await provider.stop(sandbox.externalId);

      await db
        .update(sandboxes)
        .set({ status: 'stopped', updatedAt: new Date() })
        .where(eq(sandboxes.sandboxId, sandbox.sandboxId));

      console.log(`[PLATFORM] Stopped sandbox ${sandbox.sandboxId} via ${sandbox.provider}`);

      return c.json({ success: true });
    } catch (err) {
      console.error('[SANDBOX-CLOUD] stop error:', err);
      return c.json({ success: false, error: 'Failed to stop sandbox' }, 500);
    }
  });

  // ─── POST /restart ─────────────────────────────────────────────────────
  // Restart the user's active sandbox (stop then start).

  router.post('/restart', async (c) => {
    const userId = c.get('userId');

    try {
      const accountId = await resolveAccountId(userId);

      const [sandbox] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            // Could be active or stopped
          ),
        )
        .orderBy(desc(sandboxes.createdAt))
        .limit(1);

      if (!sandbox || !sandbox.externalId) {
        return c.json({ success: false, error: 'No sandbox to restart' }, 404);
      }

      const provider = getProvider(sandbox.provider);

      // Stop if running
      if (sandbox.status === 'active') {
        try {
          await provider.stop(sandbox.externalId);
        } catch {
          // May already be stopped
        }
      }

      // Start
      await provider.start(sandbox.externalId);

      await db
        .update(sandboxes)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(sandboxes.sandboxId, sandbox.sandboxId));

      const [refreshed] = await db
        .select()
        .from(sandboxes)
        .where(eq(sandboxes.sandboxId, sandbox.sandboxId))
        .limit(1);

      console.log(`[PLATFORM] Restarted sandbox ${sandbox.sandboxId} via ${sandbox.provider}`);

      return c.json({ success: true, data: refreshed ? serializeSandbox(refreshed) : undefined });
    } catch (err) {
      console.error('[SANDBOX-CLOUD] restart error:', err);
      return c.json({ success: false, error: 'Failed to restart sandbox' }, 500);
    }
  });

  // ─── DELETE / ──────────────────────────────────────────────────────────
  // Remove/archive the user's active sandbox.

  router.delete('/', async (c) => {
    const userId = c.get('userId');

    try {
      const accountId = await resolveAccountId(userId);

      const [sandbox] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            eq(sandboxes.status, 'active'),
          ),
        )
        .limit(1);

      if (!sandbox) {
        return c.json({ success: false, error: 'No active sandbox to remove' }, 404);
      }

      if (sandbox.externalId) {
        const provider = getProvider(sandbox.provider);
        try {
          await provider.remove(sandbox.externalId);
        } catch (err) {
          console.warn(`[PLATFORM] Failed to remove external sandbox ${sandbox.externalId}:`, err);
        }
      }

      await db
        .update(sandboxes)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(sandboxes.sandboxId, sandbox.sandboxId));

      console.log(`[PLATFORM] Removed sandbox ${sandbox.sandboxId} via ${sandbox.provider}`);

      return c.json({ success: true });
    } catch (err) {
      console.error('[SANDBOX-CLOUD] remove error:', err);
      return c.json({ success: false, error: 'Failed to remove sandbox' }, 500);
    }
  });

  return router;
}

export const cloudSandboxRouter = createCloudSandboxRouter();
