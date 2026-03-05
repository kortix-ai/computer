/**
 * ensure-sandbox — shared service for idempotent sandbox provisioning.
 *
 * Used by:
 *   - POST /v1/platform/init  (direct sandbox creation)
 *   - POST /v1/billing/setup/initialize  (one-shot account + sandbox setup)
 *
 * Logic:
 *   1. Active sandbox exists → return it
 *   2. Provisioning sandbox exists → return it (another request is creating)
 *   3. Stopped/archived sandbox → restart it
 *   4. No sandbox → provision a new one via the configured provider
 */

import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { sandboxes } from '@kortix/db';
import { db } from '../../shared/db';
import { createApiKey } from '../../repositories/api-keys';
import {
  getProvider,
  getDefaultProviderName,
  type ProviderName,
} from '../providers';
import { config } from '../../config';
import { checkCredits } from '../../router/services/billing';

export interface EnsureSandboxResult {
  /** The raw sandbox DB row (callers serialize as needed). */
  row: typeof sandboxes.$inferSelect;
  /** True if a brand-new sandbox was provisioned in this call. */
  created: boolean;
}

/**
 * Ensure a sandbox exists for the given account. Idempotent:
 *   - Running  → return it
 *   - Stopped  → restart it
 *   - Missing  → create one
 *
 * Uses pg_advisory_xact_lock to prevent concurrent creation.
 */
export async function ensureSandbox(opts: {
  accountId: string;
  userId: string;
  provider?: ProviderName;
  hetznerServerType?: 'cpx22' | 'cpx32';
}): Promise<EnsureSandboxResult> {
  const { accountId, userId } = opts;
  const providerName = opts.provider || getDefaultProviderName();

  // Acquire an advisory lock for this account to prevent concurrent sandbox creation.
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${accountId}))`);

  // 1. Check for an existing active sandbox
  const [active] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.accountId, accountId), eq(sandboxes.status, 'active')))
    .limit(1);

  if (active) {
    return { row: active, created: false };
  }

  // 2. Check for provisioning sandboxes (another request is already creating one)
  const [provisioning] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.accountId, accountId), eq(sandboxes.status, 'provisioning')))
    .limit(1);

  if (provisioning) {
    console.log(`[ensureSandbox] Sandbox ${provisioning.sandboxId} already provisioning for account ${accountId}`);
    return { row: provisioning, created: false };
  }

  // 3. Check for a stopped/archived sandbox — restart it
  const [stale] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.accountId, accountId), inArray(sandboxes.status, ['stopped', 'archived'])))
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
        `[ensureSandbox] Reactivated sandbox ${stale.sandboxId} via ${stale.provider} ` +
        `(external: ${stale.externalId}) for account ${accountId}`,
      );

      return { row: reactivated, created: false };
    } catch (err) {
      console.warn(`[ensureSandbox] Failed to reactivate sandbox ${stale.sandboxId}, will create new:`, err);
    }
  }

  // 4. No sandbox — provision a new one

  // Credit check for paid providers (Hetzner VPS costs money immediately)
  if (providerName === 'hetzner' && config.KORTIX_BILLING_INTERNAL_ENABLED) {
    const creditCheck = await checkCredits(accountId, 0.10); // ~$0.10 min (covers ~1hr cheapest VPS)
    if (!creditCheck.hasCredits) {
      throw new Error(`Insufficient credits to provision Hetzner VPS: ${creditCheck.message}`);
    }
  }

  const provider = getProvider(providerName);

  const [sandbox] = await db
    .insert(sandboxes)
    .values({
      accountId,
      name: `sandbox-${accountId.slice(0, 8)}`,
      provider: providerName,
      externalId: '',
      status: 'provisioning',
      baseUrl: '',
      config: {},
      metadata: {},
    })
    .returning();

  const sandboxKey = await createApiKey({
    sandboxId: sandbox.sandboxId,
    accountId,
    title: 'Sandbox Token',
    type: 'sandbox',
  });

  const result = await provider.create({
    accountId,
    userId,
    name: `sandbox-${accountId.slice(0, 8)}`,
    hetznerServerType: opts.hetznerServerType,
    envVars: {
      KORTIX_TOKEN: sandboxKey.secretKey,
    },
  });

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
    `[ensureSandbox] Provisioned sandbox ${sandbox.sandboxId} via ${providerName} ` +
    `(external: ${result.externalId}) for account ${accountId}`,
  );

  return { row: updated, created: true };
}
