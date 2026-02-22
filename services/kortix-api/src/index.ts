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
import { getSandboxBaseUrl, proxyToSandbox } from './daytona-proxy/routes/local-preview';
import { validateSandboxToken } from './repositories/sandboxes';
import { getSupabase } from './shared/supabase';
import { setupApp } from './setup';
import { providersApp } from './providers/routes';
import { secretsApp } from './secrets/routes';
import { integrationsApp } from './integrations';
import { queueApp, startDrainer, stopDrainer } from './queue';
import { serversApp } from './servers';
import { supabaseAuth, combinedAuth } from './middleware/auth';
import { ensureSchema } from './ensure-schema';

// ─── App Setup ──────────────────────────────────────────────────────────────

const app = new Hono();

// === Global Middleware ===

// CORS origins: production domains + localhost for local dev + any extras from env.
const cloudOrigins = [
  'https://www.kortix.com',
  'https://kortix.com',
  'https://dev.kortix.com',
  'https://new-dev.kortix.com',
  'https://staging.kortix.com',
  'https://kortix.cloud',
  'https://www.kortix.cloud',
  'https://new.kortix.com',
];
const localOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const extraOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const corsOrigins = [
  ...new Set([
    ...cloudOrigins,
    ...localOrigins,  // Always include — needed for local dev and self-hosted
    ...extraOrigins,
  ]),
];

app.use(
  '*',
  cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use('*', logger());

// Pretty JSON in dev mode for easier debugging
if (config.INTERNAL_KORTIX_ENV === 'dev') {
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
// Requires Supabase JWT auth. Queries basejump.account_user if available.
app.get('/v1/accounts', supabaseAuth, async (c: any) => {
  const userId = c.get('userId') as string;
  const userEmail = c.get('userEmail') as string;

  try {
    const { eq } = await import('drizzle-orm');
    const { accountUser } = await import('@kortix/db');
    const { db } = await import('./shared/db');

    // Query basejump.account_user for this user's memberships
    const memberships = await db
      .select({
        accountId: accountUser.accountId,
        accountRole: accountUser.accountRole,
      })
      .from(accountUser)
      .where(eq(accountUser.userId, userId));

    if (memberships.length > 0) {
      return c.json(memberships.map(m => ({
        account_id: m.accountId,
        name: userEmail || 'User',
        slug: m.accountId.slice(0, 8),
        personal_account: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        account_role: m.accountRole || 'owner',
        is_primary_owner: m.accountRole === 'owner',
      })));
    }
  } catch {
    // basejump schema doesn't exist — fall through to default
  }

  // Fallback: return the userId as a personal account
  return c.json([
    {
      account_id: userId,
      name: userEmail || 'User',
      slug: userId.slice(0, 8),
      personal_account: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      account_role: 'owner',
      is_primary_owner: true,
    },
  ]);
});

// GET /v1/user-roles — returns admin role status.
// TODO: implement proper role checking against DB
app.get('/v1/user-roles', supabaseAuth, async (c: any) => {
  // For now, all authenticated users are non-admin.
  // Self-hosted single-owner mode will set this to admin.
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

// Setup — install-status is public (needed before any user exists), rest requires auth.
app.route('/v1/setup', setupApp);          // /v1/setup/install-status (public), rest (auth inside router)

// All remaining routes require authentication (JWT or sbt_ token).
app.use('/v1/providers/*', combinedAuth);
app.route('/v1/providers', providersApp);   // /v1/providers, /v1/providers/schema, /v1/providers/:id/connect, /v1/providers/:id/disconnect, /v1/providers/health

app.use('/v1/secrets/*', combinedAuth);
app.route('/v1/secrets', secretsApp);       // /v1/secrets, /v1/secrets/:key (PUT/DELETE)

app.use('/v1/servers/*', combinedAuth);
app.route('/v1/servers', serversApp);        // /v1/servers, /v1/servers/:id, /v1/servers/sync

app.use('/v1/queue/*', combinedAuth);
app.route('/v1/queue', queueApp);            // /v1/queue/sessions/:id, /v1/queue/messages/:id, /v1/queue/all, /v1/queue/status

// Preview Proxy — unified route for both cloud (Daytona) and local mode.
// Pattern: /v1/preview/{sandboxId}/{port}/* for ALL modes.
// Cloud:  sandboxId = Daytona external ID → proxied via Daytona SDK
// Local:  sandboxId = container name (e.g. 'kortix-sandbox') → Docker DNS resolution
// Auth: unified previewProxyAuth (accepts Supabase JWT and sbt_ tokens).
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

// ─── Auto-register local Docker sandbox in DB ──────────────────────────────
// When local_docker is an allowed provider, ensure there's a sandbox record
// in the DB so cron triggers can discover it via GET /v1/cron/sandboxes.

async function ensureLocalSandboxRegistered() {
  const { db } = await import('./shared/db');
  const { sandboxes } = await import('@kortix/db');
  const { eq, and } = await import('drizzle-orm');

  // Use a well-known account ID for the self-hosted single-owner case.
  // When Supabase auth is active, the real user ID will be used via POST /init.
  // This bootstrap is for the case where we need a sandbox before any user logs in.
  const CONTAINER_NAME = 'kortix-sandbox';
  const portBase = config.SANDBOX_PORT_BASE;
  const baseUrl = `http://localhost:${portBase}`;

  // Check if already registered
  const [existing] = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.externalId, CONTAINER_NAME));

  if (existing) {
    // Ensure it's active with current baseUrl
    if (existing.status !== 'active' || existing.baseUrl !== baseUrl) {
      await db
        .update(sandboxes)
        .set({ status: 'active', baseUrl, updatedAt: new Date() })
        .where(eq(sandboxes.sandboxId, existing.sandboxId));
      console.log(`[startup] Updated local sandbox registration (${existing.sandboxId})`);
    } else {
      console.log(`[startup] Local sandbox already registered (${existing.sandboxId})`);
    }
    return;
  }

  // No existing sandbox for this container name — skip auto-registration.
  // The sandbox will be created via POST /v1/platform/init when the user first logs in.
  console.log('[startup] No local sandbox registered yet — will be created on first login via POST /init');
}

// === Start Server & Scheduler ===

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  Kortix API Starting                      ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${config.PORT.toString().padEnd(49)}║
║  Mode: ${config.ENV_MODE.padEnd(49)}║
║  Env:  ${config.INTERNAL_KORTIX_ENV.padEnd(49)}║
╠═══════════════════════════════════════════════════════════╣
║  Services:                                                ║
║    /v1/router     (search, LLM, proxy)                    ║
║    /v1/billing    (subscriptions, credits, webhooks)       ║
║    /v1/platform   (sandbox lifecycle)                      ║
║    /v1/cron       (scheduled triggers)                     ║
║    /v1/deployments (deploy lifecycle)                      ║
║    /v1/integrations (OAuth integrations)                    ║
║    /v1/setup      (setup & env management)                 ║
║    /v1/queue      (persistent message queue)               ║
║    /v1/preview    (sandbox proxy — local + cloud)           ║
╠═══════════════════════════════════════════════════════════╣
║  Database:   ${config.DATABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Supabase:   ${config.SUPABASE_URL ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Stripe:     ${config.STRIPE_SECRET_KEY ? '✓ Configured'.padEnd(42) : '✗ NOT SET'.padEnd(42)}║
║  Billing:    ${(config.KORTIX_BILLING_INTERNAL_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
║  Channels:   ${(config.CHANNELS_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
║  Scheduler:  ${(config.SCHEDULER_ENABLED ? 'ENABLED' : 'DISABLED').padEnd(42)}║
║  Providers:  ${config.ALLOWED_SANDBOX_PROVIDERS.join(', ').padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

// Ensure DB schema exists before starting services that depend on it.
// This is idempotent — safe to run on every startup.
ensureSchema()
  .then(async () => {
    startScheduler().catch((err) => console.error('[startup] Scheduler failed to start:', err));
    startChannelService();
    startDrainer();
  })
  .catch(async (err) => {
    console.error('[startup] ensureSchema failed, starting services anyway:', err);
    startScheduler().catch((e) => console.error('[startup] Scheduler failed to start:', e));
    startChannelService();
    startDrainer();
  });

// If local_docker is enabled and we have a DB, ensure the sandbox is registered
if (config.isLocalDockerEnabled() && config.DATABASE_URL) {
  ensureLocalSandboxRegistered().catch((err) =>
    console.error('[startup] Failed to register local sandbox:', err),
  );
}

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

// ─── WebSocket proxy for sandbox PTY ─────────────────────────────────────────
// The Bun server needs to handle WebSocket upgrades at the top level.
// We intercept WS upgrade requests for /v1/preview/{sandboxId}/* and proxy them
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

// ── Subdomain preview routing ───────────────────────────────────────────────
// Pattern: p{port}-{sandboxId}.localhost:{serverPort}
// Parsed from the Host header before Hono routing kicks in.

const SUBDOMAIN_REGEX = /^p(\d+)-([^.]+)\.localhost/;
const PREVIEW_SESSION_COOKIE = '__preview_session';

function parsePreviewSubdomain(host: string): { port: number; sandboxId: string } | null {
  const match = host.match(SUBDOMAIN_REGEX);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  if (isNaN(port) || port < 1 || port > 65535) return null;
  return { port, sandboxId: match[2] };
}

function extractCookieToken(req: Request): string | null {
  const cookieHeader = req.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${PREVIEW_SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function validatePreviewToken(token: string): Promise<boolean> {
  if (token.startsWith('sbt_')) {
    const result = await validateSandboxToken(token);
    return result.isValid;
  }
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    return !error && !!user;
  } catch {
    return false;
  }
}

// ── Local-mode session tracking ─────────────────────────────────────────────
// Once a subdomain is authenticated via ?token= on the first request, all
// subsequent requests to that subdomain pass through without auth.
// This avoids third-party cookie issues in iframes (Chrome blocks them).
// Like ngrok free tier — auth on first load, then open access.
// Map key: "p{port}-{sandboxId}" → timestamp when authenticated.
const authenticatedSubdomains = new Map<string, number>();
const AUTH_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function getSubdomainKey(sandboxId: string, port: number): string {
  return `p${port}-${sandboxId}`;
}

function isSubdomainAuthenticated(sandboxId: string, port: number): boolean {
  const key = getSubdomainKey(sandboxId, port);
  const ts = authenticatedSubdomains.get(key);
  if (!ts) return false;
  if (Date.now() - ts > AUTH_SESSION_TTL_MS) {
    authenticatedSubdomains.delete(key);
    return false;
  }
  return true;
}

function markSubdomainAuthenticated(sandboxId: string, port: number): void {
  authenticatedSubdomains.set(getSubdomainKey(sandboxId, port), Date.now());
}

// Periodic cleanup of expired sessions (every 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of authenticatedSubdomains) {
    if (now - ts > AUTH_SESSION_TTL_MS) authenticatedSubdomains.delete(key);
  }
}, 30 * 60 * 1000);

/** Build WS target URL for a given sandbox/port/path. */
function buildWsTargetUrl(sandboxId: string, port: number, remainingPath: string, searchParams: URLSearchParams): string {
  const sandboxBaseUrl = getSandboxBaseUrl(sandboxId);
  const wsBase = sandboxBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  const targetPath = port === 8000 ? remainingPath : `/proxy/${port}${remainingPath}`;

  const upstreamParams = new URLSearchParams(searchParams);
  upstreamParams.delete('token');
  if (config.INTERNAL_SERVICE_KEY) {
    upstreamParams.set('token', config.INTERNAL_SERVICE_KEY);
  }
  const search = upstreamParams.toString() ? `?${upstreamParams.toString()}` : '';
  return `${wsBase}${targetPath}${search}`;
}

export default {
  port: config.PORT,

  async fetch(req: Request, server: any): Promise<Response | undefined> {
    const host = req.headers.get('host') || '';
    const url = new URL(req.url);
    const isWsUpgrade = req.headers.get('upgrade')?.toLowerCase() === 'websocket';

    // ── Subdomain preview routing (primary) ────────────────────────────
    // Matches: p{port}-{sandboxId}.localhost:{serverPort}
    // Only for local_docker mode (Daytona has its own preview URLs).
    const subdomain = !config.isDaytonaEnabled() ? parsePreviewSubdomain(host) : null;

    if (subdomain) {
      const { port, sandboxId } = subdomain;

      // ── Auth: first request validates, then the subdomain is "open" ──
      // Like ngrok free tier — ?token= on first load proves you're legit,
      // then all subsequent requests (sub-resources, WS, etc.) pass through.
      // This avoids third-party cookie issues in iframes.
      if (!isSubdomainAuthenticated(sandboxId, port)) {
        const queryToken = url.searchParams.get('token');
        const authHeader = req.headers.get('Authorization');
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const cookieToken = extractCookieToken(req);
        const token = queryToken || bearerToken || cookieToken;

        if (!token || !(await validatePreviewToken(token))) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
              'Access-Control-Allow-Credentials': 'true',
            },
          });
        }
        // Auth succeeded — mark this subdomain as authenticated
        markSubdomainAuthenticated(sandboxId, port);
      }

      // ── WebSocket upgrade via subdomain ──────────────────────────────
      if (isWsUpgrade) {
        const targetUrl = buildWsTargetUrl(sandboxId, port, url.pathname, url.searchParams);
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
        if (success) return undefined;
      }

      // ── HTTP/SSE via subdomain — direct proxy, no Hono ───────────────
      const acceptsSSE = (req.headers.get('accept') || '').includes('text/event-stream');
      const origin = req.headers.get('Origin') || '';
      let body: ArrayBuffer | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        body = await req.arrayBuffer();
      }

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      try {
        // Strip ?token= from query string before forwarding to sandbox
        const forwardParams = new URLSearchParams(url.searchParams);
        forwardParams.delete('token');
        const forwardSearch = forwardParams.toString() ? `?${forwardParams.toString()}` : '';

        return await proxyToSandbox(
          sandboxId, port, req.method, url.pathname, forwardSearch,
          req.headers, body, acceptsSSE, origin,
        );
      } catch (error) {
        console.error(`[subdomain-proxy] Error for ${sandboxId}:${port}${url.pathname}: ${error instanceof Error ? error.message : String(error)}`);
        return new Response(JSON.stringify({ error: 'Failed to proxy to sandbox', details: String(error) }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Path-based WebSocket proxy (local mode) ──────────────────────────
    // Matches: ws://localhost:8008/v1/preview/{sandboxId}/{port}/*
    // Used for OpenCode PTY terminals, SSE-over-WS, etc.
    // Must be handled HERE (at Bun server level) because Hono can't do WS upgrades.
    if (isWsUpgrade && !config.isDaytonaEnabled()) {
      const wsPathMatch = url.pathname.match(/^\/v1\/preview\/([^/]+)\/(\d+)(\/.*)?$/);
      if (wsPathMatch) {
        const wsSandboxId = wsPathMatch[1];
        const wsPort = parseInt(wsPathMatch[2], 10);
        const wsRemainingPath = wsPathMatch[3] || '/';

        // Auth: header → query param → cookie (same as subdomain handler)
        const wsAuthHeader = req.headers.get('Authorization');
        const wsBearerToken = wsAuthHeader?.startsWith('Bearer ') ? wsAuthHeader.slice(7) : null;
        const wsQueryToken = url.searchParams.get('token');
        const wsCookieToken = extractCookieToken(req);
        const wsToken = wsBearerToken || wsQueryToken || wsCookieToken;

        if (wsToken && (await validatePreviewToken(wsToken))) {
          const targetUrl = buildWsTargetUrl(wsSandboxId, wsPort, wsRemainingPath, url.searchParams);
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
          if (success) return undefined;
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
