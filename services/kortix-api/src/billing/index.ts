import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { config } from '../config';

import { accountStateRouter } from './routes/account-state';
import { subscriptionsRouter } from './routes/subscriptions';
import { paymentsRouter } from './routes/payments';
import { creditsRouter } from './routes/credits';
import { webhooksRouter } from './routes/webhooks';
import { accountDeletionRouter } from './routes/account-deletion';

const billingApp = new Hono();

// Webhooks — NO auth (handlers verify signatures internally)
billingApp.route('/webhooks', webhooksRouter);

// Auth for all billing routes except webhooks
// Note: Hono wildcards only work after '/' (e.g. '/path/*'), NOT as globs (e.g. '/path-*').
// Using a single catch-all that skips webhook routes (they verify signatures internally).
billingApp.use('*', async (c, next) => {
  if (c.req.path.includes('/webhooks')) {
    return next();
  }
  return supabaseAuth(c, next);
});

// Account state — always available (returns unlimited mock when billing disabled)
billingApp.route('/account-state', accountStateRouter);

// ── Billing gate ────────────────────────────────────────────────────────────
// Everything below requires billing to be enabled. Self-hosted / local users
// never hit Stripe, never get blocked by credits, never see subscription UI.
// Account-state (above) already returns the "Local (Unlimited)" mock.
billingApp.use('*', async (c, next) => {
  if (c.req.path.includes('/account-state') || c.req.path.includes('/webhooks')) {
    return next();
  }
  if (!config.KORTIX_BILLING_INTERNAL_ENABLED) {
    return c.json({ error: 'Billing is not enabled', billing_disabled: true }, 404);
  }
  return next();
});

// Setup initialize endpoint (requires billing — creates Stripe subscription + sandbox)
// DESIGN: Returns fast (<2s). Kicks off sandbox provisioning in the background.
// Frontend polls GET /setup/status for sandbox readiness.
billingApp.post('/setup/initialize', async (c: any) => {
  const userId = c.get('userId') as string;
  const email = c.get('userEmail') as string;
  const { upsertCreditAccount, getCreditAccount } = await import('./repositories/credit-accounts');
  const { getDailyCreditConfig, resolvePriceId } = await import('./services/tiers');
  const { getOrCreateStripeCustomer } = await import('./services/subscriptions');
  const { resolveAccountId } = await import('../shared/resolve-account');

  const accountId = await resolveAccountId(userId);

  // ── Step 1: Create free Stripe subscription ──────────────────────────
  const existing = await getCreditAccount(accountId);
  let subscriptionStatus: 'already_initialized' | 'initialized' = 'initialized';

  if (existing?.stripeSubscriptionId) {
    subscriptionStatus = 'already_initialized';
  } else {
    const customerId = await getOrCreateStripeCustomer(accountId, email);
    const { getStripe } = await import('../shared/stripe');
    const stripe = getStripe();

    const freePriceId = resolvePriceId('free', 'monthly');
    if (!freePriceId) {
      return c.json({ error: 'Free tier price not configured' }, 500);
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: freePriceId }],
      payment_behavior: 'allow_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: { account_id: accountId, tier_key: 'free' },
    });

    const dailyConfig = getDailyCreditConfig('free');
    const initialBalance = String(dailyConfig?.dailyAmount ?? 3);
    await upsertCreditAccount(accountId, {
      tier: 'free',
      provider: 'stripe',
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: 'active',
      planType: 'monthly',
      dailyCreditsBalance: initialBalance,
      balance: initialBalance,
      lastDailyRefresh: new Date().toISOString(),
    });
  }

  // ── Step 2: Fire-and-forget sandbox provisioning ──────────────────────
  // Sandbox creation can take minutes (Hetzner cold starts). Never block
  // the HTTP response — just kick it off. Frontend polls GET /setup/status.
  let sandboxStatus: 'created' | 'exists' | 'provisioning' | 'failed' = 'provisioning';

  try {
    const { ensureSandbox } = await import('../platform/services/ensure-sandbox');

    // Quick check: does an active sandbox already exist?
    const { db } = await import('../shared/db');
    const { sandboxes } = await import('@kortix/db');
    const { eq, and } = await import('drizzle-orm');

    const [active] = await db
      .select()
      .from(sandboxes)
      .where(and(eq(sandboxes.accountId, accountId), eq(sandboxes.status, 'active')))
      .limit(1);

    if (active?.externalId) {
      sandboxStatus = 'exists';
      console.log(`[setup/initialize] Sandbox ${active.sandboxId} already active for account ${accountId}`);
    } else {
      // Kick off provisioning in background — don't await
      void ensureSandbox({ accountId, userId })
        .then(({ row, created }) => {
          console.log(`[setup/initialize] Background: sandbox ${row.sandboxId} ${created ? 'created' : 'exists'} for account ${accountId}`);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[setup/initialize] Background: sandbox provisioning failed for account ${accountId}:`, msg);
        });
      console.log(`[setup/initialize] Kicked off sandbox provisioning for account ${accountId}`);
    }
  } catch (err) {
    sandboxStatus = 'failed';
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[setup/initialize] Failed to start sandbox provisioning for account ${accountId}:`, msg);
  }

  return c.json({
    status: subscriptionStatus,
    tier: 'free',
    sandbox: sandboxStatus,
  });
});

// Setup status endpoint — frontend polls this to check sandbox readiness.
// Returns instantly with the current sandbox state from the DB.
billingApp.get('/setup/status', async (c: any) => {
  const userId = c.get('userId') as string;
  const { resolveAccountId } = await import('../shared/resolve-account');
  const { getCreditAccount } = await import('./repositories/credit-accounts');
  const accountId = await resolveAccountId(userId);

  // Subscription status
  const account = await getCreditAccount(accountId);
  const subscriptionReady = !!account?.stripeSubscriptionId;

  // Sandbox status
  const { db } = await import('../shared/db');
  const { sandboxes } = await import('@kortix/db');
  const { eq, and, inArray } = await import('drizzle-orm');

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.accountId, accountId), inArray(sandboxes.status, ['active', 'provisioning'])))
    .limit(1);

  let sandboxState: 'none' | 'provisioning' | 'ready' = 'none';
  if (sandbox) {
    sandboxState = sandbox.status === 'active' && sandbox.externalId ? 'ready' : 'provisioning';
  }

  return c.json({
    subscription: subscriptionReady ? 'ready' : 'pending',
    sandbox: sandboxState,
  });
});

// Billing routes — subscriptions, payments, credits (all require billing enabled)
billingApp.route('/', subscriptionsRouter);
billingApp.route('/', paymentsRouter);
billingApp.route('/', creditsRouter);

// Account deletion (mounted at /v1/billing/account/*)
billingApp.route('/account', accountDeletionRouter);

// Yearly credit rotation cron endpoint
billingApp.post('/cron/yearly-rotation', async (c: any) => {
  if (!config.KORTIX_BILLING_INTERNAL_ENABLED) {
    return c.json({ skipped: true, reason: 'billing disabled' });
  }
  const { processYearlyCreditRotation } = await import('./services/yearly-rotation');
  const result = await processYearlyCreditRotation();
  return c.json(result);
});

if (config.KORTIX_BILLING_INTERNAL_ENABLED) {
  const YEARLY_ROTATION_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const { processYearlyCreditRotation } = await import('./services/yearly-rotation');
      await processYearlyCreditRotation();
    } catch (err) {
      console.error('[BillingApp] Yearly rotation interval error:', err);
    }
  }, YEARLY_ROTATION_INTERVAL_MS);
}

export { billingApp };
