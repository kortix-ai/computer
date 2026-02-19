import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import { config } from './config';
import { BillingError } from './errors';

// ─── Sub-Service Imports ────────────────────────────────────────────────────

import { router } from './router';
import { billingApp } from './billing';
import { platformApp } from './platform';
import { cronApp, startScheduler, stopScheduler, getSchedulerStatus } from './cron';
import { channelsApp, startChannelService, stopChannelService, getChannelServiceStatus } from './channels';
import { daytonaProxyApp } from './daytona-proxy';
import { deploymentsApp } from './deployments';
import { setupApp } from './setup';
import { providersApp } from './providers/routes';
import { secretsApp } from './secrets/routes';
import { integrationsApp } from './integrations';
import { queueApp, startDrainer, stopDrainer } from './queue';
import { integrationsApp } from './integrations';

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
      'https://new-dev.kortix.com',
      'https://staging.kortix.com',
      'https://kortix.cloud',
      'https://www.kortix.cloud',
      'https://new.kortix.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use('*', logger());

if (config.isLocal()) {
  app.use('*', prettyJSON());
}

// === Top-Level Health Check (no auth) ===

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-api',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
    scheduler: getSchedulerStatus(),
    channels: getChannelServiceStatus(),
  });
});

// Health check under /v1 prefix (frontend uses NEXT_PUBLIC_BACKEND_URL which includes /v1)
app.get('/v1/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-api',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
    scheduler: getSchedulerStatus(),
    channels: getChannelServiceStatus(),
  });
});

// Also expose system status at root for backward compat with frontend
app.get('/v1/system/status', (c) => {
  return c.json({
    maintenanceNotice: { enabled: false },
    technicalIssue: { enabled: false },
    updatedAt: new Date().toISOString(),
  });
});

// ─── Stub Endpoints ─────────────────────────────────────────────────────────
// These endpoints are called by the frontend but were never implemented.
// Adding proper stubs stops 404 noise and provides correct responses.

// POST /v1/prewarm — no-op pre-warm. Frontend fires this on login.
app.post('/v1/prewarm', (c) => {
  return c.json({ success: true });
});

// GET /v1/accounts — returns user's accounts (Basejump-compatible shape).
// In local mode: mock personal account. In cloud: would query Supabase.
app.get('/v1/accounts', async (c) => {
  if (config.isLocal()) {
    return c.json([
      {
        account_id: '00000000-0000-0000-0000-000000000000',
        name: 'Local User',
        slug: 'local',
        personal_account: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        account_role: 'owner',
        is_primary_owner: true,
      },
    ]);
  }
  // Cloud mode: requires auth
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  // Return empty array — proper account management can be added later
  return c.json([]);
});

// GET /v1/user-roles — returns admin role status.
// In local mode: always non-admin. In cloud: could check DB.
app.get('/v1/user-roles', (c) => {
  if (config.isLocal()) {
    return c.json({ isAdmin: true, role: 'admin' });
  }
  return c.json({ isAdmin: false, role: null });
});

// ─── Mount Sub-Services ─────────────────────────────────────────────────────
// All services follow the pattern: /v1/{serviceName}/...

app.route('/v1/router', router);        // /v1/router/chat/completions, /v1/router/models, /v1/router/web-search, /v1/router/tavily/*, etc.
app.route('/v1/billing', billingApp);   // /v1/billing/account-state, /v1/billing/webhooks/*, /v1/billing/setup/*
app.route('/v1/platform', platformApp); // /v1/platform/providers, /v1/platform/sandbox/*, /v1/platform/sandbox/version
app.route('/v1/cron', cronApp);         // /v1/cron/sandboxes/*, /v1/cron/triggers/*, /v1/cron/executions/*
app.route('/v1/deployments', deploymentsApp); // /v1/deployments/*
app.route('/v1/integrations', integrationsApp); // /v1/integrations/*
app.route('/', channelsApp);                 // /v1/channels/*, /webhooks/*
// Setup routes — local-only. Provides .env management and system status.
if (config.isLocal()) {
  app.route('/v1/setup', setupApp);          // /v1/setup/status, /v1/setup/env, /v1/setup/schema, /v1/setup/health, /v1/setup/onboarding-*
  app.route('/v1/providers', providersApp);   // /v1/providers, /v1/providers/schema, /v1/providers/:id/connect, /v1/providers/:id/disconnect, /v1/providers/health
  app.route('/v1/secrets', secretsApp);       // /v1/secrets, /v1/secrets/:key (PUT/DELETE)
}
// Message queue — persists queued messages to filesystem and drains them server-side.
app.route('/v1/queue', queueApp);            // /v1/queue/sessions/:id, /v1/queue/messages/:id, /v1/queue/all, /v1/queue/status

// Daytona Proxy is cloud-only (requires Daytona API). In local mode the catch-all
// /:sandboxId/:port/* pattern would intercept every unmatched request and throw
// "Invalid port" errors for unmatched paths.
if (!config.isLocal()) {
  app.route('/v1/preview', daytonaProxyApp); // /v1/preview/:sandboxId/:port/* (MUST BE LAST — wildcard catch-all)
}

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
║    /v1/router     (search, LLM, proxy)                    ║
║    /v1/billing    (subscriptions, credits, webhooks)       ║
║    /v1/platform   (sandbox lifecycle)                      ║
║    /v1/cron       (scheduled triggers)                     ║
║    /v1/deployments (deploy lifecycle)                      ║
║    /v1/integrations (OAuth integrations)                    ║
║    /v1/setup      (local setup & env management)           ║
║    /v1/queue      (persistent message queue)               ║
║    /v1/preview    (sandbox preview proxy)                  ║
╠═══════════════════════════════════════════════════════════╣
║  Database:   ${config.DATABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Supabase:   ${config.SUPABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Stripe:     ${config.STRIPE_SECRET_KEY ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Channels:   ${(config.CHANNELS_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
║  Scheduler:  ${(config.SCHEDULER_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

startScheduler().catch((err) => console.error('[startup] Scheduler failed to start:', err));
startChannelService();
startDrainer();

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  stopScheduler();
  stopChannelService();
  stopDrainer();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default {
  port: config.PORT,
  fetch: app.fetch,
};
