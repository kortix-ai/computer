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
import { eq, and } from 'drizzle-orm';
import { sandboxes, accountUser, type Database } from '@kortix/db';
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

// ─── Dependency Injection ────────────────────────────────────────────────────

export interface AccountRouterDeps {
  db: Database;
  getProvider: (name: ProviderName) => SandboxProvider;
  getDefaultProviderName: () => ProviderName;
  getAvailableProviders: () => ProviderName[];
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

      // Check if user already has an active sandbox
      const [existing] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.accountId, accountId),
            eq(sandboxes.status, 'active'),
          ),
        )
        .limit(1);

      if (existing) {
        return c.json({
          success: true,
          data: serializeSandbox(existing),
          created: false,
        });
      }

      // No sandbox — provision one
      const provider = getProvider(providerName);
      const authToken = generateSandboxToken();

      const result = await provider.create({
        accountId,
        userId,
        name: `sandbox-${accountId.slice(0, 8)}`,
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
      return c.json({ success: false, error: 'Failed to initialize account' }, 500);
    }
  });

  return router;
}

// ─── Default instance ────────────────────────────────────────────────────────
export const accountRouter = createAccountRouter();
