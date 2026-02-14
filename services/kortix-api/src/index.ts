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
import { daytonaProxyApp } from './daytona-proxy';
import { deploymentsApp } from './deployments';

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
      'https://new.kortix.com',
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

// === Top-Level Health Check (no auth) ===

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'kortix-api',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
    scheduler: getSchedulerStatus(),
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

// ─── Mount Sub-Services ─────────────────────────────────────────────────────
// All services follow the pattern: /v1/{serviceName}/...

app.route('/v1/router', router);        // /v1/router/chat/completions, /v1/router/models, /v1/router/web-search, /v1/router/tavily/*, etc.
app.route('/v1/billing', billingApp);   // /v1/billing/account-state, /v1/billing/webhooks/*, /v1/billing/setup/*
app.route('/v1/platform', platformApp); // /v1/platform/providers, /v1/platform/sandbox/*, /v1/platform/sandbox/version
app.route('/v1/cron', cronApp);         // /v1/cron/sandboxes/*, /v1/cron/triggers/*, /v1/cron/executions/*
app.route('/v1/deployments', deploymentsApp); // /v1/deployments/*
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
║    /v1/preview    (sandbox preview proxy)                  ║
╠═══════════════════════════════════════════════════════════╣
║  Database:   ${config.DATABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Supabase:   ${config.SUPABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Stripe:     ${config.STRIPE_SECRET_KEY ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Scheduler:  ${(config.SCHEDULER_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

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
