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
import { config } from '../../config';
import { listServerTypes } from '../providers/hetzner';
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
  const metadata = row.metadata as Record<string, unknown> | null;
  return {
    sandbox_id: row.sandboxId,
    external_id: row.externalId,
    name: row.name,
    provider: row.provider,
    base_url: row.baseUrl,
    status: row.status,
    version: metadata?.version ?? null,
    metadata: row.metadata,
    is_included: row.isIncluded ?? false,
    stripe_subscription_item_id: row.stripeSubscriptionItemId ?? null,
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
  // Create a new sandbox. Pro users can have multiple instances.
  // The first instance is "included" in the plan; additional ones get a
  // Stripe subscription item with 1.2x Hetzner pricing.

  router.post('/', async (c) => {
    const userId = c.get('userId');
    let stripeSubscriptionItemId: string | null = null;
    let createdSandboxId: string | null = null;
    let createdExternalId: string | null = null;
    let providerUsed: ProviderName | null = null;

    try {
      const body = await c.req.json().catch(() => ({}));
      const requestedProvider = (body?.provider as ProviderName) || undefined;
      const requestedHetznerServerType = (body?.hetznerServerType as string | undefined) || undefined;
      const requestedLocation = (body?.location as string | undefined) || undefined;
      const backgroundProvisioning = Boolean(body?.backgroundProvisioning);
      const providerName = requestedProvider || getDefaultProviderName();
      const customName = body?.name as string | undefined;
      const isIncluded = Boolean(body?.isIncluded); // only set by setup flow
      const requestedOrDefaultLocation = requestedLocation || config.HETZNER_DEFAULT_LOCATION;
      const requestedOrDefaultServerType = requestedHetznerServerType || config.HETZNER_DEFAULT_SERVER_TYPE;

      const accountId = await resolveAccountId(userId);

      // Validate Hetzner server type/location combo early so we return a clear
      // 4xx error instead of failing inside provider create with a generic 500.
      if (providerName === 'hetzner') {
        const { listServerTypes: fetchServerTypes } = await import('../providers/hetzner');
        const availableTypes = await fetchServerTypes(requestedOrDefaultLocation);
        const selected = availableTypes.find((st) => st.name === requestedOrDefaultServerType);
        if (!selected) {
          return c.json(
            {
              success: false,
              error: `Server type '${requestedOrDefaultServerType}' is not available in location '${requestedOrDefaultLocation}'`,
            },
            400,
          );
        }
      }

      // Count existing sandboxes for naming
      const existingCount = await db
        .select()
        .from(sandboxes)
        .where(eq(sandboxes.accountId, accountId))
        .then((rows) => rows.length);

      const sandboxName = customName || `sandbox-${accountId.slice(0, 8)}${existingCount > 0 ? `-${existingCount + 1}` : ''}`;

      // For additional (non-included) Hetzner instances on paid plans,
      // create a Stripe subscription item with dynamic pricing.
      if (!isIncluded && providerName === 'hetzner' && config.KORTIX_BILLING_INTERNAL_ENABLED) {
        const { getCreditAccount } = await import('../../billing/repositories/credit-accounts');
        const { getCustomerByAccountId } = await import('../../billing/repositories/customers');
        const { isPaidTier, getComputeProductId, COMPUTE_PRICE_MARKUP } = await import('../../billing/services/tiers');
        const { listServerTypes: fetchServerTypes } = await import('../providers/hetzner');
        const { getStripe } = await import('../../shared/stripe');

        const account = await getCreditAccount(accountId);
        const tierName = account?.tier ?? 'free';

        if (!isPaidTier(tierName)) {
          return c.json({ success: false, error: 'Additional instances require a paid plan' }, 403);
        }

        if (!account?.stripeSubscriptionId) {
          return c.json({ success: false, error: 'No active subscription found' }, 400);
        }

        // Look up server type price from Hetzner
        const loc = requestedOrDefaultLocation;
        const serverTypes = await fetchServerTypes(loc);
        const selectedType = serverTypes.find((st) => st.name === requestedOrDefaultServerType);

        if (!selectedType) {
          return c.json({ success: false, error: `Server type not found: ${requestedHetznerServerType}` }, 400);
        }

        const monthlyPrice = Math.round(selectedType.priceMonthly * COMPUTE_PRICE_MARKUP * 100); // cents

        const stripe = getStripe();
        const customer = await getCustomerByAccountId(accountId);
        if (!customer) {
          return c.json({ success: false, error: 'No billing customer found' }, 400);
        }

        // Add a subscription item with inline price_data
        const subItem = await stripe.subscriptionItems.create({
          subscription: account.stripeSubscriptionId,
          price_data: {
            currency: 'usd',
            product: getComputeProductId(),
            unit_amount: monthlyPrice,
            recurring: { interval: 'month' },
          },
          quantity: 1,
          proration_behavior: 'always_invoice',
          metadata: {
            type: 'compute_instance',
            server_type: requestedHetznerServerType || config.HETZNER_DEFAULT_SERVER_TYPE,
            location: loc,
            account_id: accountId,
          },
        });

        stripeSubscriptionItemId = subItem.id;
        console.log(`[PLATFORM] Created Stripe sub item ${subItem.id} for additional instance (${requestedHetznerServerType}, $${(monthlyPrice / 100).toFixed(2)}/mo)`);
      }

      const provider = getProvider(providerName);

      // Create sandbox row
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
          isIncluded,
          stripeSubscriptionItemId,
        })
        .returning();
      createdSandboxId = sandbox.sandboxId;

      // Create a sandbox-managed API key (kortix_sb_)
      const sandboxKey = await createApiKey({
        sandboxId: sandbox.sandboxId,
        accountId,
        title: 'Sandbox Token',
        type: 'sandbox',
      });

      const providerCreateInput = {
        accountId,
        userId,
        name: sandboxName,
        hetznerServerType: requestedHetznerServerType,
        hetznerLocation: requestedLocation,
        envVars: {
          KORTIX_TOKEN: sandboxKey.secretKey,
        },
      };

      // Background provisioning mode (used by billing Add Instance flow)
      // returns quickly and continues provisioning asynchronously.
      if (backgroundProvisioning && providerName === 'hetzner') {
        console.log(`[PLATFORM] Starting background provisioning for sandbox ${sandbox.sandboxId} (${providerName})`);

        void (async () => {
          let bgExternalId: string | null = null;
          try {
            const result = await provider.create(providerCreateInput);
            bgExternalId = result.externalId;

            await db
              .update(sandboxes)
              .set({
                externalId: result.externalId,
                status: 'active',
                baseUrl: result.baseUrl,
                metadata: result.metadata,
                config: { serviceKey: sandboxKey.secretKey },
                updatedAt: new Date(),
              })
              .where(eq(sandboxes.sandboxId, sandbox.sandboxId));

            console.log(
              `[PLATFORM] Background-provisioned sandbox ${sandbox.sandboxId} via ${providerName} ` +
              `(external: ${result.externalId}) for account ${accountId}`,
            );
          } catch (bgErr) {
            console.error(`[PLATFORM] Background provisioning failed for sandbox ${sandbox.sandboxId}:`, bgErr);

            if (stripeSubscriptionItemId) {
              try {
                const { getStripe } = await import('../../shared/stripe');
                const stripe = getStripe();
                await stripe.subscriptionItems.del(stripeSubscriptionItemId);
                console.log(`[PLATFORM] Rolled back Stripe sub item ${stripeSubscriptionItemId} after background provisioning failure`);
              } catch (rollbackErr) {
                console.error(`[PLATFORM] Failed to roll back Stripe sub item ${stripeSubscriptionItemId}:`, rollbackErr);
              }
            }

            if (bgExternalId) {
              try {
                await provider.remove(bgExternalId);
                console.log(`[PLATFORM] Rolled back provider resource ${bgExternalId} after background provisioning failure`);
              } catch (cleanupErr) {
                console.error(`[PLATFORM] Failed to clean up provider resource ${bgExternalId}:`, cleanupErr);
              }
            }

            try {
              await db
                .update(sandboxes)
                .set({ status: 'error', updatedAt: new Date() })
                .where(eq(sandboxes.sandboxId, sandbox.sandboxId));
            } catch (markErr) {
              console.error(`[PLATFORM] Failed to mark sandbox ${sandbox.sandboxId} as error:`, markErr);
            }
          }
        })();

        return c.json(
          {
            success: true,
            data: serializeSandbox(sandbox),
            created: true,
            provisioning: true,
          },
          202,
        );
      }

      const result = await provider.create(providerCreateInput);
      createdExternalId = result.externalId;
      providerUsed = providerName;

      // Update sandbox row with provider details.
      const [updated] = await db
        .update(sandboxes)
        .set({
          externalId: result.externalId,
          status: 'active',
          baseUrl: result.baseUrl,
          metadata: result.metadata,
          config: { serviceKey: sandboxKey.secretKey },
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
      // Best-effort rollback for additional-instance Stripe subscription item
      if (stripeSubscriptionItemId) {
        try {
          const { getStripe } = await import('../../shared/stripe');
          const stripe = getStripe();
          await stripe.subscriptionItems.del(stripeSubscriptionItemId);
          console.log(`[PLATFORM] Rolled back Stripe sub item ${stripeSubscriptionItemId} after sandbox create failure`);
        } catch (rollbackErr) {
          console.error(`[PLATFORM] Failed to roll back Stripe sub item ${stripeSubscriptionItemId}:`, rollbackErr);
        }
      }

      // Best-effort cleanup for partially provisioned server
      if (providerUsed && createdExternalId) {
        try {
          const provider = getProvider(providerUsed);
          await provider.remove(createdExternalId);
          console.log(`[PLATFORM] Rolled back provider resource ${createdExternalId} after sandbox create failure`);
        } catch (cleanupErr) {
          console.error(`[PLATFORM] Failed to clean up provider resource ${createdExternalId}:`, cleanupErr);
        }
      }

      // Archive sandbox row if it was created but provisioning failed
      if (createdSandboxId) {
        try {
          await db
            .update(sandboxes)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(eq(sandboxes.sandboxId, createdSandboxId));
        } catch (archiveErr) {
          console.error(`[PLATFORM] Failed to archive failed sandbox ${createdSandboxId}:`, archiveErr);
        }
      }

      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Hetzner API POST /servers returned 422')) {
        console.error('[SANDBOX-CLOUD] create validation error:', err);
        return c.json(
          {
            success: false,
            error: message.includes('image disk is bigger than server type disk')
              ? 'Selected server type is incompatible with the current snapshot size. Choose a larger instance.'
              : 'Hetzner rejected server creation for this configuration.',
          },
          400,
        );
      }

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
  // Remove/archive a sandbox. Accepts ?sandbox_id= or removes the first active one.

  router.delete('/', async (c) => {
    const userId = c.get('userId');

    try {
      const accountId = await resolveAccountId(userId);
      const sandboxId = c.req.query('sandbox_id');

      let sandbox: typeof sandboxes.$inferSelect | undefined;

      if (sandboxId) {
        // Delete specific sandbox by ID
        const [row] = await db
          .select()
          .from(sandboxes)
          .where(
            and(
              eq(sandboxes.accountId, accountId),
              eq(sandboxes.sandboxId, sandboxId),
              sql`${sandboxes.status} IN ('active', 'provisioning', 'stopped')`,
            ),
          )
          .limit(1);
        sandbox = row;
      } else {
        // Legacy: delete the first active sandbox
        const [row] = await db
          .select()
          .from(sandboxes)
          .where(
            and(
              eq(sandboxes.accountId, accountId),
              eq(sandboxes.status, 'active'),
            ),
          )
          .limit(1);
        sandbox = row;
      }

      if (!sandbox) {
        return c.json({ success: false, error: 'No sandbox found to remove' }, 404);
      }

      // Remove the Hetzner server
      if (sandbox.externalId) {
        const provider = getProvider(sandbox.provider);
        try {
          await provider.remove(sandbox.externalId);
        } catch (err) {
          console.warn(`[PLATFORM] Failed to remove external sandbox ${sandbox.externalId}:`, err);
        }
      }

      // Cancel the Stripe subscription item for paid additional instances
      if (sandbox.stripeSubscriptionItemId && config.KORTIX_BILLING_INTERNAL_ENABLED) {
        try {
          const { getStripe } = await import('../../shared/stripe');
          const stripe = getStripe();
          await stripe.subscriptionItems.del(sandbox.stripeSubscriptionItemId, {
            proration_behavior: 'always_invoice',
          });
          console.log(`[PLATFORM] Cancelled Stripe sub item ${sandbox.stripeSubscriptionItemId}`);
        } catch (err) {
          console.warn(`[PLATFORM] Failed to cancel Stripe sub item:`, err);
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

  // ── Hetzner server types (public, no auth needed — frontend uses it for tier selection) ──

  router.get('/hetzner/server-types', async (c) => {
    if (!config.isHetznerEnabled()) {
      return c.json({ error: 'Hetzner provider is not enabled' }, 404);
    }
    try {
      const location = c.req.query('location') || config.HETZNER_DEFAULT_LOCATION;
      const types = await listServerTypes(location);
      return c.json({ serverTypes: types, location });
    } catch (err: any) {
      console.error('[SANDBOX-CLOUD] hetzner server-types error:', err);
      return c.json({ error: 'Failed to fetch server types' }, 500);
    }
  });

  return router;
}

export const cloudSandboxRouter = createCloudSandboxRouter();
