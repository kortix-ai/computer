import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

import { config } from './config';
import { apiKeyAuth, supabaseAuth, supabaseAuthWithQueryParam } from './middleware/auth';
import { BillingError } from './errors';
import { getSchedulerStatus } from './services/scheduler/index';

// ─── Route Imports ──────────────────────────────────────────────────────────

// Search & LLM routes (apiKeyAuth)
import { webSearch } from './routes/search-web';
import { imageSearch } from './routes/search-image';
import { llm } from './routes/llm';

// Proxy routes (handles own auth internally)
import { proxy } from './routes/proxy';

// Billing routes (supabaseAuth)
import { accountStateRouter } from './routes/billing/account-state';
import { subscriptionsRouter } from './routes/billing/subscriptions';
import { paymentsRouter } from './routes/billing/payments';
import { creditsRouter } from './routes/billing/credits';
import { webhooksRouter } from './routes/billing/webhooks';

// Platform route (supabaseAuth handled internally by createAccountRouter)
import { accountRouter } from './routes/platform';
import { versionRouter } from './routes/version';

// Cron routes (supabaseAuth)
import { sandboxesRouter } from './routes/cron-sandboxes';
import { triggersRouter } from './routes/cron-triggers';
import { executionsRouter } from './routes/cron-executions';

// Daytona preview proxy (supabaseAuthWithQueryParam)
import { preview } from './routes/daytona-proxy';

// ─── App Setup ──────────────────────────────────────────────────────────────

const app = new Hono();

// === Global Middleware ===

app.use(
  '*',
  cors({
    origin: [
      'https://www.kortix.com',
      'https://kortix.com',
      'https://dev.kortix.com',
      'https://staging.kortix.com',
      'https://kortix.cloud',
      'https://www.kortix.cloud',
      ...(config.isDevelopment()
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : []),
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use('*', logger());

if (config.isDevelopment()) {
  app.use('*', prettyJSON());
}

// === Health Check (no auth) ===

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-api',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
    scheduler: getSchedulerStatus(),
  });
});

app.get('/v1/health', (c) => {
  return c.json({ status: 'ok', service: 'kortix', timestamp: new Date().toISOString() });
});

// Sandbox version (no auth — checks npm registry for latest @kortix/sandbox version)
app.route('/v1/sandbox/version', versionRouter);

// System status (no auth — polled by frontend for maintenance banners)
app.get('/v1/system/status', (c) => {
  return c.json({
    maintenanceNotice: { enabled: false },
    technicalIssue: { enabled: false },
    updatedAt: new Date().toISOString(),
  });
});

// === Webhooks (no auth — handlers verify signatures internally) ===

app.route('/webhooks', webhooksRouter);

// === Billing Routes (supabaseAuth) ===

app.use('/billing/*', supabaseAuth);
app.use('/setup/*', supabaseAuth);

// Setup initialize endpoint (inline from billing index.ts)
app.post('/setup/initialize', async (c: any) => {
  const accountId = c.get('userId') as string;
  const email = c.get('userEmail') as string;
  const { upsertCreditAccount, getCreditAccount } = await import('./repositories/credit-accounts');
  const { getDailyCreditConfig, resolvePriceId } = await import('./services/billing/tiers');
  const { getOrCreateStripeCustomer } = await import('./services/billing/subscriptions');

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

// === Platform Routes (supabaseAuth — handled internally by accountRouter) ===

app.route('/v1/account', accountRouter);

// === Cron Routes (supabaseAuth) ===

app.use('/v1/sandboxes/*', supabaseAuth);
app.use('/v1/triggers/*', supabaseAuth);
app.use('/v1/executions/*', supabaseAuth);

app.route('/v1/sandboxes', sandboxesRouter);
app.route('/v1/triggers', triggersRouter);
app.route('/v1/executions', executionsRouter);

// === Search Routes (apiKeyAuth) ===

app.use('/web-search/*', apiKeyAuth);
app.use('/image-search/*', apiKeyAuth);

app.route('/web-search', webSearch);
app.route('/image-search', imageSearch);

// === LLM Routes (apiKeyAuth) ===

app.use('/v1/chat/*', apiKeyAuth);
app.use('/v1/models', apiKeyAuth);
app.use('/v1/models/*', apiKeyAuth);

app.route('/v1', llm);

// === Proxy Routes (auth handled internally — dual mode) ===

app.route('/', proxy);

// === Daytona Preview Proxy (LAST — wildcard catch-all) ===

app.use('/:sandboxId/:port/*', supabaseAuthWithQueryParam);
app.use('/:sandboxId/:port', supabaseAuthWithQueryParam);
app.route('/', preview);

// === Error Handling ===

app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err instanceof BillingError) {
    return c.json({ error: err.message }, err.statusCode as any);
  }

  if (err instanceof HTTPException) {
    const response: Record<string, unknown> = {
      error: true,
      message: err.message,
      status: err.status,
    };

    // Add Retry-After header for 503s (sandbox waking up)
    if (err.status === 503) {
      c.header('Retry-After', '10');
    }

    return c.json(response, err.status);
  }

  return c.json(
    {
      error: true,
      message: 'Internal server error',
      status: 500,
    },
    500
  );
});

// === 404 Handler ===

app.notFound((c) => {
  return c.json(
    {
      error: true,
      message: 'Not found',
      status: 404,
    },
    404
  );
});

// === Start Server & Scheduler ===

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  Kortix API Starting                      ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${config.PORT.toString().padEnd(49)}║
║  Mode: ${config.ENV_MODE.padEnd(49)}║
╠═══════════════════════════════════════════════════════════╣
║  Services:                                                ║
║    Router (search, LLM, proxy)                            ║
║    Billing (subscriptions, credits, webhooks)              ║
║    Platform (sandbox lifecycle)                            ║
║    Cron (scheduled triggers)                               ║
║    Daytona Proxy (preview proxy)                           ║
╠═══════════════════════════════════════════════════════════╣
║  Database:   ${config.DATABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Supabase:   ${config.SUPABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Stripe:     ${config.STRIPE_SECRET_KEY ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Scheduler:  ${(config.SCHEDULER_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

// Start the scheduler
import { startScheduler, stopScheduler } from './services/scheduler/index';
startScheduler();

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  stopScheduler();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default {
  port: config.PORT,
  fetch: app.fetch,
};
