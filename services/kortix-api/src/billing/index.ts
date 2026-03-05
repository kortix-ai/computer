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

  // ── Step 2: Ensure sandbox exists (best-effort) ──────────────────────
  // Sandbox creation can be slow (especially Hetzner cold starts). This route
  // is called from the browser behind CDN/proxy timeouts, so we must avoid
  // blocking too long. We timebox provisioning and let frontend continue
  // polling readiness when needed.
  let sandboxStatus: 'created' | 'exists' | 'skipped' | 'failed' = 'skipped';
  let sandboxError: string | undefined;

  try {
    const { ensureSandbox } = await import('../platform/services/ensure-sandbox');

    const ensurePromise = ensureSandbox({ accountId, userId })
      .then(({ row, created }) => ({ kind: 'done' as const, row, created }))
      .catch((err) => ({ kind: 'error' as const, err }));

    const timedResult = await Promise.race([
      ensurePromise,
      // Keep this short to avoid CDN/proxy/browser request ceilings during setup.
      // Frontend continues with explicit sandbox readiness polling.
      new Promise<{ kind: 'timeout' }>((resolve) => setTimeout(() => resolve({ kind: 'timeout' }), 20_000)),
    ]);

    if (timedResult.kind === 'done') {
      sandboxStatus = timedResult.created ? 'created' : 'exists';
      console.log(`[setup/initialize] Sandbox ${timedResult.row.sandboxId} ${sandboxStatus} for account ${accountId}`);
    } else if (timedResult.kind === 'timeout') {
      sandboxStatus = 'skipped';
      sandboxError = 'Sandbox provisioning is still running in the background';
      console.warn(`[setup/initialize] Sandbox provisioning timed out for account ${accountId}; continuing setup response`);

      void ensurePromise.then((eventual) => {
        if (eventual.kind === 'done') {
          console.log(`[setup/initialize] Sandbox ${eventual.row.sandboxId} became ready after timeout for account ${accountId}`);
        } else {
          const msg = eventual.err instanceof Error ? eventual.err.message : String(eventual.err);
          console.error(`[setup/initialize] Background sandbox provisioning failed for account ${accountId}:`, msg);
        }
      });
    } else {
      sandboxStatus = 'failed';
      sandboxError = timedResult.err instanceof Error ? timedResult.err.message : String(timedResult.err);
      console.error(`[setup/initialize] Sandbox creation failed for account ${accountId}:`, sandboxError);
    }
  } catch (err) {
    sandboxStatus = 'failed';
    sandboxError = err instanceof Error ? err.message : String(err);
    console.error(`[setup/initialize] Sandbox creation failed for account ${accountId}:`, sandboxError);
    // Don't fail the whole request — subscription was created successfully.
    // Frontend useSandbox() will retry on dashboard load.
  }

  return c.json({
    status: subscriptionStatus,
    tier: 'free',
    sandbox: sandboxStatus,
    ...(sandboxError ? { sandbox_error: sandboxError } : {}),
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
