import { Hono } from 'hono';
import { eq, and, ne } from 'drizzle-orm';
import { sandboxes } from '@kortix/db';
import { config } from '../config';
import { previewProxyAuth } from '../middleware/auth';
import { preview, proxyToDaytona } from './routes/preview';
import { proxyToSandbox } from './routes/local-preview';
import { getAuthToken } from './routes/auth';
import { db } from '../shared/db';

const daytonaProxyApp = new Hono();

// ── Cookie auth endpoint ────────────────────────────────────────────────────
// POST /v1/p/auth — validates JWT and sets __preview_session cookie.
daytonaProxyApp.route('/auth', getAuthToken);

// ── Path-based proxy ────────────────────────────────────────────────────────
// Auth middleware for both modes (Supabase JWT, kortix_ tokens, cookies).
daytonaProxyApp.use('/:sandboxId/:port/*', previewProxyAuth);
daytonaProxyApp.use('/:sandboxId/:port', previewProxyAuth);

// ── Provider cache ──────────────────────────────────────────────────────────
// Cache sandbox provider lookups to avoid a DB query on every request.
// Key: externalId, Value: { provider, expiresAt }
interface ProviderCacheEntry {
  provider: 'daytona' | 'local_docker';
  expiresAt: number;
}
const providerCache = new Map<string, ProviderCacheEntry>();
const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveProvider(externalId: string): Promise<'daytona' | 'local_docker' | null> {
  const cached = providerCache.get(externalId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.provider;
  }
  providerCache.delete(externalId);

  try {
    const [sandbox] = await db
      .select({ provider: sandboxes.provider })
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.externalId, externalId),
          ne(sandboxes.status, 'pooled'),
        )
      )
      .limit(1);

    if (!sandbox) return null;

    const provider = sandbox.provider as 'daytona' | 'local_docker';
    providerCache.set(externalId, { provider, expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS });
    return provider;
  } catch (err) {
    console.error(`[PREVIEW] Provider lookup failed for ${externalId}:`, err);
    return null;
  }
}

// ── Single-provider fast paths ──────────────────────────────────────────────
// When only ONE provider is configured, skip the per-request DB lookup entirely
// and route all requests to the appropriate handler (same behavior as before).

if (config.isDaytonaEnabled() && !config.isLocalDockerEnabled()) {
  // Cloud-only: all requests go to Daytona preview handler
  daytonaProxyApp.route('/', preview);
} else if (config.isLocalDockerEnabled() && !config.isDaytonaEnabled()) {
  // Local-only: all requests go to local Docker proxy
  const localOnlyProxy = new Hono();

  localOnlyProxy.all('/:sandboxId/:port/*', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = parseInt(c.req.param('port'), 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: `Invalid port: ${c.req.param('port')}` }, 400);
    }

    const fullPath = new URL(c.req.url).pathname;
    const prefix = `/${sandboxId}/${port}`;
    const idx = fullPath.indexOf(prefix);
    const remainingPath = idx !== -1 ? fullPath.slice(idx + prefix.length) || '/' : '/';

    const queryString = new URL(c.req.url).search;

    const method = c.req.method;
    let body: ArrayBuffer | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await c.req.raw.arrayBuffer();
    }

    const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream');
    const origin = c.req.header('Origin') || '';

    return proxyToSandbox(sandboxId, port, method, remainingPath, queryString, c.req.raw.headers, body, acceptsSSE, origin);
  });

  localOnlyProxy.all('/:sandboxId/:port', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = c.req.param('port');
    return c.redirect(`/${sandboxId}/${port}/`, 301);
  });

  daytonaProxyApp.route('/', localOnlyProxy);
} else {
  // ── Dual-provider mode ──────────────────────────────────────────────────
  // Both providers enabled: look up the sandbox's provider per request and
  // dispatch to the correct handler (proxyToSandbox for local_docker,
  // proxyToDaytona for daytona).

  const dualProxy = new Hono<{ Variables: { userId: string; userEmail: string } }>();

  dualProxy.all('/:sandboxId/:port/*', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const portStr = c.req.param('port');
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: `Invalid port: ${portStr}` }, 400);
    }

    const provider = await resolveProvider(sandboxId);

    // Extract common request data
    const fullPath = new URL(c.req.url).pathname;
    const prefix = `/${sandboxId}/${port}`;
    const idx = fullPath.indexOf(prefix);
    const remainingPath = idx !== -1 ? fullPath.slice(idx + prefix.length) || '/' : '/';

    const queryString = new URL(c.req.url).search;

    const method = c.req.method;
    let body: ArrayBuffer | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await c.req.raw.arrayBuffer();
    }

    const origin = c.req.header('Origin') || '';

    if (provider === 'local_docker') {
      // Route to local Docker proxy
      const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream');
      return proxyToSandbox(sandboxId, port, method, remainingPath, queryString, c.req.raw.headers, body, acceptsSSE, origin);
    }

    // Default: route to Daytona preview handler (handles daytona provider
    // and also any sandbox not found in DB — the Daytona handler will
    // do its own ownership check and return 403 if invalid).
    const userId = (c.get('userId') as string) || '';
    return proxyToDaytona(sandboxId, port, userId, method, remainingPath, queryString, c.req.raw.headers, body, origin);
  });

  dualProxy.all('/:sandboxId/:port', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = c.req.param('port');
    return c.redirect(`/${sandboxId}/${port}/`, 301);
  });

  daytonaProxyApp.route('/', dualProxy);
}

export { daytonaProxyApp };
