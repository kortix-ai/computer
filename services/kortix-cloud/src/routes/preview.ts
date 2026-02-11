import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDaytona } from '../lib/daytona';
import { getSupabase } from '../lib/supabase';
import type { AppContext } from '../types';

const preview = new Hono<{ Variables: AppContext }>();

// === In-memory caches with TTL ===

interface OwnershipEntry {
  allowed: boolean;
  expiresAt: number;
}

interface PreviewLinkEntry {
  url: string;
  token: string | null;
  expiresAt: number;
}

const ownershipCache = new Map<string, OwnershipEntry>();
const previewLinkCache = new Map<string, PreviewLinkEntry>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedOwnership(sandboxId: string, userId: string): boolean | null {
  const key = `${sandboxId}:${userId}`;
  const entry = ownershipCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    ownershipCache.delete(key);
    return null;
  }
  return entry.allowed;
}

function setCachedOwnership(sandboxId: string, userId: string, allowed: boolean) {
  const key = `${sandboxId}:${userId}`;
  ownershipCache.set(key, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCachedPreviewLink(sandboxId: string, port: number): PreviewLinkEntry | null {
  const key = `${sandboxId}:${port}`;
  const entry = previewLinkCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    previewLinkCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedPreviewLink(sandboxId: string, port: number, url: string, token: string | null) {
  const key = `${sandboxId}:${port}`;
  previewLinkCache.set(key, { url, token, expiresAt: Date.now() + CACHE_TTL_MS });
}

// === Ownership verification ===

async function verifyOwnership(sandboxId: string, userId: string): Promise<boolean> {
  // Check cache first
  const cached = getCachedOwnership(sandboxId, userId);
  if (cached !== null) return cached;

  try {
    const supabase = getSupabase();

    // Find the resource by sandbox external_id
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('id, account_id')
      .eq('external_id', sandboxId)
      .eq('status', 'active')
      .single();

    if (resourceError || !resource) {
      setCachedOwnership(sandboxId, userId, false);
      return false;
    }

    // Check if user belongs to the account that owns this resource
    const { data: accountUser, error: accountError } = await supabase
      .schema('basejump')
      .from('account_user')
      .select('account_role')
      .eq('user_id', userId)
      .eq('account_id', resource.account_id)
      .single();

    const allowed = !accountError && !!accountUser;
    setCachedOwnership(sandboxId, userId, allowed);
    return allowed;
  } catch (err) {
    console.error(`[PREVIEW] Ownership check failed for ${sandboxId}:`, err);
    return false;
  }
}

// === Preview link resolution ===

async function getPreviewLink(
  sandboxId: string,
  port: number
): Promise<{ url: string; token: string | null }> {
  // Check cache
  const cached = getCachedPreviewLink(sandboxId, port);
  if (cached) return { url: cached.url, token: cached.token };

  const daytona = getDaytona();
  const sandbox = await daytona.get(sandboxId);

  // Check sandbox state
  const state = (sandbox as any).state;
  const stateStr = typeof state === 'string' ? state : state?.value || String(state);
  const stateLower = stateStr.toLowerCase();

  if (stateLower === 'stopped' || stateLower === 'archived' || stateLower === 'archiving') {
    // Fire-and-forget: start the sandbox
    (sandbox as any).start?.().catch((e: any) =>
      console.error(`[PREVIEW] Failed to start sandbox ${sandboxId}:`, e)
    );
    throw new HTTPException(503, {
      message: `Sandbox is ${stateLower}. Starting it up — retry in a few seconds.`,
    });
  }

  if (stateLower !== 'started') {
    throw new HTTPException(503, {
      message: `Sandbox is ${stateLower}. Please wait.`,
    });
  }

  // Get preview link from Daytona
  const link = await (sandbox as any).getPreviewLink(port);
  const url = link.url || String(link);
  const token = link.token || null;

  setCachedPreviewLink(sandboxId, port, url, token);
  return { url, token };
}

// === Route handler: ALL /:sandboxId/:port/* ===

preview.all('/:sandboxId/:port/*', async (c) => {
  const sandboxId = c.req.param('sandboxId');
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new HTTPException(400, { message: `Invalid port: ${portStr}` });
  }

  const userId = c.get('userId') as string;

  // 1. Verify ownership
  const allowed = await verifyOwnership(sandboxId, userId);
  if (!allowed) {
    throw new HTTPException(403, { message: 'Not authorized to access this sandbox' });
  }

  // 2. Get preview link (may throw 503 if sandbox is waking up)
  const { url: previewUrl, token: previewToken } = await getPreviewLink(sandboxId, port);

  // 3. Build target URL
  const fullPath = new URL(c.req.url).pathname;
  // Strip /:sandboxId/:port prefix to get remaining path
  const prefixPattern = `/${sandboxId}/${portStr}`;
  const remainingPath = fullPath.startsWith(prefixPattern)
    ? fullPath.slice(prefixPattern.length) || '/'
    : '/';
  const queryString = new URL(c.req.url).search;

  // preview URL from Daytona is the full base (e.g. https://8080-abc123.proxy.daytona.work)
  // Append remaining path
  const targetUrl = previewUrl.replace(/\/$/, '') + remainingPath + queryString;

  // 4. Build forwarding headers
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }

  // Inject Daytona headers
  headers.set('X-Daytona-Skip-Preview-Warning', 'true');
  headers.set('X-Daytona-Disable-CORS', 'true');
  if (previewToken) {
    headers.set('X-Daytona-Preview-Token', previewToken);
  }

  // 5. Get request body
  const method = c.req.method;
  let body: ArrayBuffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await c.req.raw.clone().arrayBuffer();
  }

  console.log(`[PREVIEW] ${method} ${sandboxId}:${port}${remainingPath} → ${targetUrl}`);

  // 6. Proxy to Daytona
  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    // @ts-ignore - Bun supports duplex
    duplex: 'half',
  });

  // 7. Return response with 503 retry header if sandbox is waking
  const responseHeaders = new Headers(upstream.headers);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
});

// Also handle requests without trailing path (e.g. /:sandboxId/:port)
preview.all('/:sandboxId/:port', async (c) => {
  // Redirect to /:sandboxId/:port/ for consistency
  const sandboxId = c.req.param('sandboxId');
  const port = c.req.param('port');
  const url = new URL(c.req.url);
  return c.redirect(`/${sandboxId}/${port}/${url.search}`, 301);
});

export { preview };
