import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';

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
billingApp.use('/account-state/*', supabaseAuth);
billingApp.use('/account/*', supabaseAuth);
billingApp.use('/create-*', supabaseAuth);
billingApp.use('/confirm-*', supabaseAuth);
billingApp.use('/cancel-*', supabaseAuth);
billingApp.use('/reactivate-*', supabaseAuth);
billingApp.use('/schedule-*', supabaseAuth);
billingApp.use('/sync-*', supabaseAuth);
billingApp.use('/proration-*', supabaseAuth);
billingApp.use('/checkout-*', supabaseAuth);
billingApp.use('/purchase-*', supabaseAuth);
billingApp.use('/transactions*', supabaseAuth);
billingApp.use('/credit-*', supabaseAuth);
billingApp.use('/deduct', supabaseAuth);
billingApp.use('/tier-*', supabaseAuth);
billingApp.use('/usage-*', supabaseAuth);
billingApp.use('/trial/*', supabaseAuth);
billingApp.use('/setup/*', supabaseAuth);
billingApp.use('/cron/*', supabaseAuth);

// Setup initialize endpoint
billingApp.post('/setup/initialize', async (c: any) => {
  const accountId = c.get('userId') as string;
  const email = c.get('userEmail') as string;
  const { upsertCreditAccount, getCreditAccount } = await import('./repositories/credit-accounts');
  const { getDailyCreditConfig, resolvePriceId } = await import('./services/tiers');
  const { getOrCreateStripeCustomer } = await import('./services/subscriptions');

  const existing = await getCreditAccount(accountId);
  if (existing?.stripeSubscriptionId) {
    return c.json({ status: 'already_initialized', tier: existing.tier });
  }

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
  await upsertCreditAccount(accountId, {
    tier: 'free',
    provider: 'stripe',
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: 'active',
    planType: 'monthly',
    dailyCreditsBalance: String(dailyConfig?.dailyAmount ?? 3),
    lastDailyRefresh: new Date().toISOString(),
  });

  return c.json({ status: 'initialized', tier: 'free' });
});

// Billing routes (mounted at /v1/billing, so these become /v1/billing/account-state, etc.)
billingApp.route('/account-state', accountStateRouter);
billingApp.route('/', subscriptionsRouter);
billingApp.route('/', paymentsRouter);
billingApp.route('/', creditsRouter);

// Account deletion (mounted at /v1/billing/account/*)
billingApp.route('/account', accountDeletionRouter);

// Yearly credit rotation cron endpoint
billingApp.post('/cron/yearly-rotation', async (c: any) => {
  const { processYearlyCreditRotation } = await import('./services/yearly-rotation');
  const result = await processYearlyCreditRotation();
  return c.json(result);
});

const YEARLY_ROTATION_INTERVAL_MS = 60 * 60 * 1000;
setInterval(async () => {
  try {
    const { processYearlyCreditRotation } = await import('./services/yearly-rotation');
    await processYearlyCreditRotation();
  } catch (err) {
    console.error('[BillingApp] Yearly rotation interval error:', err);
  }
}, YEARLY_ROTATION_INTERVAL_MS);

export { billingApp };
