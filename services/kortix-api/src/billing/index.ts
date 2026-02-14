import { Hono } from 'hono';
import { supabaseAuth } from '../middleware/auth';

import { accountStateRouter } from './routes/account-state';
import { subscriptionsRouter } from './routes/subscriptions';
import { paymentsRouter } from './routes/payments';
import { creditsRouter } from './routes/credits';
import { webhooksRouter } from './routes/webhooks';

const billingApp = new Hono();

// Webhooks — NO auth (handlers verify signatures internally)
billingApp.route('/webhooks', webhooksRouter);

// Auth for billing & setup routes
billingApp.use('/billing/*', supabaseAuth);
billingApp.use('/setup/*', supabaseAuth);

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

// Billing routes
billingApp.route('/billing/account-state', accountStateRouter);
billingApp.route('/billing', subscriptionsRouter);
billingApp.route('/billing', paymentsRouter);
billingApp.route('/billing', creditsRouter);

export { billingApp };
