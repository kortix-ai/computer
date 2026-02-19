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
import { getSandboxBaseUrl } from './daytona-proxy/routes/local-preview';
import { setupApp } from './setup';
import { providersApp } from './providers/routes';
import { secretsApp } from './secrets/routes';
import { timingSafeStringEqual } from './shared/crypto';

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
app.route('/', channelsApp);                 // /v1/channels/*, /webhooks/*
// Setup routes — local-only. Provides .env management and system status.
if (config.isLocal()) {
  app.route('/v1/setup', setupApp);          // /v1/setup/status, /v1/setup/env, /v1/setup/schema, /v1/setup/health, /v1/setup/onboarding-*
  app.route('/v1/providers', providersApp);   // /v1/providers, /v1/providers/schema, /v1/providers/:id/connect, /v1/providers/:id/disconnect, /v1/providers/health
  app.route('/v1/secrets', secretsApp);       // /v1/secrets, /v1/secrets/:key (PUT/DELETE)
}

// Preview Proxy — unified route for both cloud (Daytona) and local mode.
// Cloud:  /v1/preview/{sandboxId}/{port}/* → Daytona SDK → sandbox
// Local:  /v1/preview/local/{port}/*       → direct to sandbox on Docker network
// Auth is skipped for sandboxId=local (see daytona-proxy/index.ts).
// MUST be after all explicit routes (wildcard catch-all).
app.route('/v1/preview', daytonaProxyApp);

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
║    /v1/setup      (local setup & env management)           ║
║    /v1/preview    (sandbox proxy — local + cloud)           ║
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

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  stopScheduler();
  stopChannelService();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── WebSocket proxy for sandbox PTY ─────────────────────────────────────────
// The Bun server needs to handle WebSocket upgrades at the top level.
// We intercept WS upgrade requests for /v1/sandbox/pty/* and proxy them
// to the sandbox's Kortix Master (which further proxies to OpenCode).

const WS_CONNECT_TIMEOUT_MS = 10_000;
const WS_BUFFER_MAX_BYTES = 1024 * 1024; // 1MB
const WS_IDLE_TIMEOUT_MS = 5 * 60_000;   // 5min

interface WsProxyData {
  targetUrl: string;
  upstream: WebSocket | null;
  buffered: (string | Buffer | ArrayBuffer)[];
  bufferBytes: number;
  connectTimer: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

function clearWsTimers(data: WsProxyData) {
  if (data.connectTimer) { clearTimeout(data.connectTimer); data.connectTimer = null; }
  if (data.idleTimer) { clearTimeout(data.idleTimer); data.idleTimer = null; }
}

function resetIdleTimer(ws: { data: WsProxyData; close: (code?: number, reason?: string) => void }) {
  if (ws.data.idleTimer) clearTimeout(ws.data.idleTimer);
  ws.data.idleTimer = setTimeout(() => {
    console.warn(`[preview-proxy] WS idle timeout`);
    try { ws.close(1000, 'idle timeout'); } catch {}
  }, WS_IDLE_TIMEOUT_MS);
}

let activeWsConnections = 0;

export default {
  port: config.PORT,

  fetch(req: Request, server: any): Response | Promise<Response> | undefined {
    // ── WebSocket upgrade for /v1/preview/local/{port}/* ─────────────
    // Handles PTY terminal and other WS connections to local sandbox.
    // Pattern: /v1/preview/local/{port}/{path} → ws://sandbox:8000/{path}
    //   (port 8000 = direct, other ports = through Kortix Master's /proxy/{port}/)
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const url = new URL(req.url);
      const localPreviewPrefix = '/v1/preview/local/';

      if (url.pathname.startsWith(localPreviewPrefix)) {
        // Validate sandbox auth token if configured (WS can't set headers — use ?token=)
        if (config.hasSandboxAuth()) {
          const wsToken = url.searchParams.get('token');
          if (!wsToken || !timingSafeStringEqual(wsToken, config.SANDBOX_AUTH_TOKEN)) {
            return new Response(JSON.stringify({ error: 'Unauthorized', authType: 'sandbox_token' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        // Parse: /v1/preview/local/{port}/{rest}
        const afterPrefix = url.pathname.slice(localPreviewPrefix.length);
        const slashIdx = afterPrefix.indexOf('/');
        const portStr = slashIdx >= 0 ? afterPrefix.slice(0, slashIdx) : afterPrefix;
        const remainingPath = slashIdx >= 0 ? afterPrefix.slice(slashIdx) : '/';
        const port = parseInt(portStr, 10);

        if (!isNaN(port) && port >= 1 && port <= 65535) {
          const sandboxBaseUrl = getSandboxBaseUrl();
          const wsBase = sandboxBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://');

          // Port 8000 = direct to Kortix Master, others = through port proxy
          const targetPath = port === 8000
            ? remainingPath
            : `/proxy/${port}${remainingPath}`;

          // Build upstream query string: strip user's token, inject service key
          const upstreamParams = new URLSearchParams(url.searchParams);
          upstreamParams.delete('token'); // remove user's sandbox token
          if (config.INTERNAL_SERVICE_KEY) {
            upstreamParams.set('token', config.INTERNAL_SERVICE_KEY);
          }
          const upstreamSearch = upstreamParams.toString() ? `?${upstreamParams.toString()}` : '';
          const targetUrl = `${wsBase}${targetPath}${upstreamSearch}`;

          const success = server.upgrade(req, {
            data: {
              targetUrl,
              upstream: null,
              buffered: [],
              bufferBytes: 0,
              connectTimer: null,
              idleTimer: null,
              closed: false,
            } satisfies WsProxyData,
          });
          if (success) return undefined; // Bun took over
        }
      }
    }

    // ── HTTP / SSE — delegate to Hono ──────────────────────────────────
    return app.fetch(req, server);
  },

  websocket: {
    open(ws: { data: WsProxyData; send: (data: any) => void; close: (code?: number, reason?: string) => void }) {
      activeWsConnections++;
      resetIdleTimer(ws);

      ws.data.connectTimer = setTimeout(() => {
        if (ws.data.upstream?.readyState === WebSocket.CONNECTING) {
          console.warn(`[preview-proxy] WS upstream connect timeout`);
          try { ws.data.upstream.close(); } catch {}
          try { ws.close(1011, 'upstream connect timeout'); } catch {}
        }
      }, WS_CONNECT_TIMEOUT_MS);

      try {
        const upstream = new WebSocket(ws.data.targetUrl);
        ws.data.upstream = upstream;

        upstream.addEventListener('open', () => {
          if (ws.data.connectTimer) { clearTimeout(ws.data.connectTimer); ws.data.connectTimer = null; }
          for (const msg of ws.data.buffered) {
            upstream.send(msg);
          }
          ws.data.buffered = [];
          ws.data.bufferBytes = 0;
        });

        upstream.addEventListener('message', (e: MessageEvent) => {
          resetIdleTimer(ws);
          try { ws.send(e.data); } catch {
            try { upstream.close(); } catch {}
          }
        });

        upstream.addEventListener('close', () => {
          if (!ws.data.closed) {
            try { ws.close(); } catch {}
          }
        });

        upstream.addEventListener('error', () => {
          if (!ws.data.closed) {
            try { ws.close(1011, 'upstream error'); } catch {}
          }
        });
      } catch (err) {
        console.error(`[preview-proxy] WS connect failed:`, err);
        try { ws.close(1011, 'upstream connection failed'); } catch {}
      }
    },

    message(ws: { data: WsProxyData; close: (code?: number, reason?: string) => void }, message: string | Buffer) {
      resetIdleTimer(ws);
      const upstream = ws.data.upstream;
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(message);
      } else if (upstream && upstream.readyState === WebSocket.CONNECTING) {
        const size = typeof message === 'string' ? message.length : (message as Buffer).byteLength;
        if (ws.data.bufferBytes + size > WS_BUFFER_MAX_BYTES) {
          console.warn(`[preview-proxy] WS buffer overflow, closing`);
          try { ws.close(1011, 'buffer overflow'); } catch {}
          return;
        }
        ws.data.buffered.push(message);
        ws.data.bufferBytes += size;
      }
    },

    close(ws: { data: WsProxyData }) {
      activeWsConnections--;
      ws.data.closed = true;
      clearWsTimers(ws.data);
      try { ws.data.upstream?.close(); } catch {}
      ws.data.upstream = null;
      ws.data.buffered = [];
      ws.data.bufferBytes = 0;
    },
  },
};
