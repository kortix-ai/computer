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
type CachedProviderName = 'daytona' | 'local_docker' | 'hetzner';
interface ProviderCacheEntry {
  provider: CachedProviderName;
  baseUrl: string;
  serviceKey: string;
  expiresAt: number;
}
const providerCache = new Map<string, ProviderCacheEntry>();
const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveProvider(externalId: string): Promise<{ provider: CachedProviderName; baseUrl: string; serviceKey: string } | null> {
  const cached = providerCache.get(externalId);
  if (cached && Date.now() < cached.expiresAt) {
    return { provider: cached.provider, baseUrl: cached.baseUrl, serviceKey: cached.serviceKey };
  }
  providerCache.delete(externalId);

  try {
    const [sandbox] = await db
      .select({ provider: sandboxes.provider, baseUrl: sandboxes.baseUrl, config: sandboxes.config })
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.externalId, externalId),
          ne(sandboxes.status, 'pooled'),
        )
      )
      .limit(1);

    if (!sandbox) return null;

    const provider = sandbox.provider as CachedProviderName;
    const baseUrl = sandbox.baseUrl || '';
    const configJson = (sandbox.config || {}) as Record<string, unknown>;
    const serviceKey = typeof configJson.serviceKey === 'string' ? configJson.serviceKey : '';
    providerCache.set(externalId, { provider, baseUrl, serviceKey, expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS });
    return { provider, baseUrl, serviceKey };
  } catch (err) {
    console.error(`[PREVIEW] Provider lookup failed for ${externalId}:`, err);
    return null;
  }
}

// ── Single-provider fast paths ──────────────────────────────────────────────
// When only ONE provider is configured, skip the per-request DB lookup entirely
// and route all requests to the appropriate handler (same behavior as before).

const enabledCount = [config.isDaytonaEnabled(), config.isLocalDockerEnabled(), config.isHetznerEnabled()].filter(Boolean).length;

if (enabledCount === 1 && config.isDaytonaEnabled()) {
  // Cloud-only: all requests go to Daytona preview handler
  daytonaProxyApp.route('/', preview);
} else if (enabledCount === 1 && config.isLocalDockerEnabled()) {
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
} else if (enabledCount === 1 && config.isHetznerEnabled()) {
  // Hetzner-only: all requests go through local-preview proxy with base URL from DB
  // (Hetzner sandboxes have unique IPs, so we still need DB lookup for the base URL)
  const hetznerOnlyProxy = new Hono();

  hetznerOnlyProxy.all('/:sandboxId/:port/*', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = parseInt(c.req.param('port'), 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: `Invalid port: ${c.req.param('port')}` }, 400);
    }

    const resolved = await resolveProvider(sandboxId);
    const baseUrl = resolved?.baseUrl?.replace(/\/$/, '') || '';
    const serviceKey = resolved?.serviceKey || '';
    if (!baseUrl) {
      return c.json({ error: 'Sandbox not found' }, 404);
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

    return proxyToSandbox(sandboxId, port, method, remainingPath, queryString, c.req.raw.headers, body, acceptsSSE, origin, baseUrl, serviceKey);
  });

  hetznerOnlyProxy.all('/:sandboxId/:port', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = c.req.param('port');
    return c.redirect(`/${sandboxId}/${port}/`, 301);
  });

  daytonaProxyApp.route('/', hetznerOnlyProxy);
} else {
  // ── Multi-provider mode ─────────────────────────────────────────────────
  // Multiple providers enabled: look up the sandbox's provider per request
  // and dispatch to the correct handler.

  const multiProxy = new Hono<{ Variables: { userId: string; userEmail: string } }>();

  multiProxy.all('/:sandboxId/:port/*', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const portStr = c.req.param('port');
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: `Invalid port: ${portStr}` }, 400);
    }

    const resolved = await resolveProvider(sandboxId);

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
    const acceptsSSE = (c.req.header('accept') || '').includes('text/event-stream');

    if (resolved?.provider === 'local_docker') {
      return proxyToSandbox(sandboxId, port, method, remainingPath, queryString, c.req.raw.headers, body, acceptsSSE, origin);
    }

    if (resolved?.provider === 'hetzner') {
      // Hetzner: proxy to the VPS's public IP (same logic as local, different base URL)
      const baseUrl = resolved.baseUrl.replace(/\/$/, '');
      return proxyToSandbox(sandboxId, port, method, remainingPath, queryString, c.req.raw.headers, body, acceptsSSE, origin, baseUrl, resolved.serviceKey);
    }

    // Default: route to Daytona preview handler
    const userId = (c.get('userId') as string) || '';
    return proxyToDaytona(sandboxId, port, userId, method, remainingPath, queryString, c.req.raw.headers, body, origin);
  });

  multiProxy.all('/:sandboxId/:port', async (c) => {
    const sandboxId = c.req.param('sandboxId');
    const port = c.req.param('port');
    return c.redirect(`/${sandboxId}/${port}/`, 301);
  });

  daytonaProxyApp.route('/', multiProxy);
}

export { daytonaProxyApp };
