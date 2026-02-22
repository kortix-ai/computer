/**
 * Cloud-mode account router.
 *
 * Handles user account initialization and provider listing.
 * Sandbox lifecycle has been moved to sandbox-cloud.ts.
 *
 * Routes (mounted at /v1/platform):
 *   GET  /providers  — List available sandbox providers
 *   POST /init       — Ensure user has an account, provision sandbox if needed
 */

import { Hono } from 'hono';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { sandboxes, type Database } from '@kortix/db';
import { db as defaultDb } from '../../shared/db';
import { generateSandboxToken } from '../services/token';
import { supabaseAuth as authMiddleware } from '../../middleware/auth';
import {
  getProvider as defaultGetProvider,
  getDefaultProviderName as defaultGetDefaultProviderName,
  getAvailableProviders as defaultGetAvailableProviders,
  type ProviderName,
  type SandboxProvider,
} from '../providers';
import type { AuthVariables } from '../../types';
import { resolveAccountId as defaultResolveAccountId } from '../../shared/resolve-account';

// ─── Dependency Injection ────────────────────────────────────────────────────

export interface AccountRouterDeps {
  db: Database;
  getProvider: (name: ProviderName) => SandboxProvider;
  getDefaultProviderName: () => ProviderName;
  getAvailableProviders: () => ProviderName[];
  resolveAccountId: (userId: string) => Promise<string>;
  useAuth: boolean;
}

const defaultDeps: AccountRouterDeps = {
  db: defaultDb,
  getProvider: defaultGetProvider,
  getDefaultProviderName: defaultGetDefaultProviderName,
  getAvailableProviders: defaultGetAvailableProviders,
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

export function createAccountRouter(
  overrides: Partial<AccountRouterDeps> = {},
): Hono<{ Variables: AuthVariables }> {
  const deps = { ...defaultDeps, ...overrides };
  const { db, getProvider, getDefaultProviderName, getAvailableProviders, resolveAccountId } = deps;

  const router = new Hono<{ Variables: AuthVariables }>();

  if (deps.useAuth) {
    router.use('/*', authMiddleware);
  }

  // ─── GET /providers ────────────────────────────────────────────────────

  router.get('/providers', async (c) => {
    return c.json({
      success: true,
      data: {
        providers: getAvailableProviders(),
        default: getDefaultProviderName(),
      },
    });
  });

  // ─── POST /init ────────────────────────────────────────────────────────
  // Ensure user has an account + sandbox.

  router.post('/init', async (c) => {
    const userId = c.get('userId');

    try {
      const body = await c.req.json().catch(() => ({}));
      const requestedProvider = (body?.provider as ProviderName) || undefined;
      const providerName = requestedProvider || getDefaultProviderName();

      const accountId = await resolveAccountId(userId);

      // 1. Check for an existing active sandbox — return it immediately
      const [active] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            eq(sandboxes.status, 'active'),
          ),
        )
        .limit(1);

      if (active) {
        return c.json({
          success: true,
          data: serializeSandbox(active),
          created: false,
        });
      }

      // 2. Check for a stopped/archived sandbox — restart it instead of creating new
      const [stale] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            inArray(sandboxes.status, ['stopped', 'archived']),
          ),
        )
        .orderBy(desc(sandboxes.updatedAt))
        .limit(1);

      if (stale && stale.externalId) {
        try {
          const staleProvider = getProvider(stale.provider);
          await staleProvider.start(stale.externalId);

          const [reactivated] = await db
            .update(sandboxes)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(sandboxes.sandboxId, stale.sandboxId))
            .returning();

          console.log(
            `[PLATFORM] Reactivated sandbox ${stale.sandboxId} via ${stale.provider} ` +
            `(external: ${stale.externalId}) for account ${accountId}`,
          );

          return c.json({
            success: true,
            data: serializeSandbox(reactivated),
            created: false,
          });
        } catch (err) {
          // Failed to restart — fall through to create a new one
          console.warn(
            `[PLATFORM] Failed to reactivate sandbox ${stale.sandboxId}, will create new:`,
            err,
          );
        }
      }

      // 3. No sandbox at all — provision a new one
      const provider = getProvider(providerName);
      const authToken = generateSandboxToken();

      const result = await provider.create({
        accountId,
        userId,
        name: `sandbox-${accountId.slice(0, 8)}`,
        envVars: {
          KORTIX_TOKEN: authToken,
        },
      });

      const [sandbox] = await db
        .insert(sandboxes)
        .values({
          accountId,
          name: `sandbox-${accountId.slice(0, 8)}`,
          provider: providerName,
          externalId: result.externalId,
          status: 'active',
          baseUrl: result.baseUrl,
          authToken,
          config: {},
          metadata: result.metadata,
        })
        .returning();

      console.log(
        `[PLATFORM] Provisioned sandbox ${sandbox.sandboxId} via ${providerName} ` +
        `(external: ${result.externalId}) for account ${accountId}`,
      );

      return c.json(
        { success: true, data: serializeSandbox(sandbox), created: true },
        201,
      );
    } catch (err) {
      console.error('[PLATFORM] initAccount error:', err);
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: `Failed to initialize account: ${message}` }, 500);
    }
  });

  return router;
}

// ─── Default instance ────────────────────────────────────────────────────────
export const accountRouter = createAccountRouter();
