import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { BillingError } from './errors';
import { accountStateRouter } from './routes/account-state';
import { subscriptionsRouter } from './routes/subscriptions';
import { paymentsRouter } from './routes/payments';
import { creditsRouter } from './routes/credits';
import { webhooksRouter } from './routes/webhooks';
import type { AppEnv } from './types/hono';

const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', cors());

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-billing',
    timestamp: new Date().toISOString(),
  });
});

app.route('/webhooks', webhooksRouter);

app.use('/billing/*', authMiddleware);
app.use('/setup/*', authMiddleware);

app.post('/setup/initialize', async (c) => {
  const accountId = c.get('userId');
  const email = c.get('userEmail');
  const { upsertCreditAccount, getCreditAccount } = await import('./repositories/credit-accounts');
  const { getDailyCreditConfig, resolvePriceId } = await import('./services/tiers');
  const { getOrCreateStripeCustomer } = await import('./services/subscriptions');

  const existing = await getCreditAccount(accountId);
  if (existing?.stripeSubscriptionId) {
    return c.json({ status: 'already_initialized', tier: existing.tier });
  }

  const customerId = await getOrCreateStripeCustomer(accountId, email);
  const { getStripe } = await import('./lib/stripe');
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

app.route('/billing/account-state', accountStateRouter);
app.route('/billing', subscriptionsRouter);
app.route('/billing', paymentsRouter);
app.route('/billing', creditsRouter);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  if (err instanceof BillingError) {
    return c.json({ error: err.message }, err.statusCode as any);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = config.PORT;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                       KORTIX BILLING                             ║
╠══════════════════════════════════════════════════════════════════╣
║  Subscriptions, credits, and payment management                  ║
╠══════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                      ║
║    GET    /health                        Health check             ║
║    POST   /setup/initialize              Init free tier account   ║
║    GET    /billing/account-state         Full account state       ║
║    GET    /billing/account-state/minimal Minimal account state    ║
║    POST   /billing/deduct               Deduct credits            ║
║    GET    /billing/tier-configurations   List tiers                ║
║    POST   /billing/create-checkout-session  Stripe checkout       ║
║    POST   /billing/create-inline-checkout   Inline checkout       ║
║    POST   /billing/confirm-inline-checkout  Confirm payment       ║
║    POST   /billing/create-portal-session    Billing portal        ║
║    POST   /billing/cancel-subscription      Cancel sub            ║
║    POST   /billing/reactivate-subscription  Reactivate sub        ║
║    POST   /billing/schedule-downgrade       Schedule downgrade    ║
║    POST   /billing/cancel-scheduled-change  Cancel downgrade      ║
║    POST   /billing/sync-subscription        Sync from Stripe      ║
║    POST   /billing/purchase-credits         Buy extra credits     ║
║    GET    /billing/transactions              Transaction history  ║
║    GET    /billing/credit-usage              Usage records        ║
║    GET    /billing/credit-usage-by-thread    Usage by thread      ║
║    POST   /webhooks/stripe                   Stripe webhooks      ║
║    POST   /webhooks/revenuecat               RevenueCat webhooks  ║
╠══════════════════════════════════════════════════════════════════╣
║  Environment: ${config.ENV_MODE.padEnd(49)}║
║  Port: ${port.toString().padEnd(57)}║
║  Database: ${(config.DATABASE_URL ? 'CONFIGURED' : 'NOT SET').padEnd(53)}║
║  Supabase: ${(config.SUPABASE_URL ? 'CONFIGURED' : 'NOT SET').padEnd(53)}║
║  Stripe: ${(config.STRIPE_SECRET_KEY ? 'CONFIGURED' : 'NOT SET').padEnd(55)}║
║  RevenueCat: ${(config.REVENUECAT_API_KEY ? 'CONFIGURED' : 'NOT SET').padEnd(51)}║
╚══════════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
