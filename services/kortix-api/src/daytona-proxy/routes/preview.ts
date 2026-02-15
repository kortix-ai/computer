import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq, and } from 'drizzle-orm';
import { sandboxes, accountUser } from '@kortix/db';
import { getDaytona } from '../../shared/daytona';
import { db } from '../../shared/db';
interface DaytonaProxyContext {
  userId: string;
  userEmail: string;
}

const preview = new Hono<{ Variables: DaytonaProxyContext }>();

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

// === Ownership verification via kortix.sandboxes ===

async function verifyOwnership(sandboxId: string, userId: string): Promise<boolean> {
  // Check cache first
  const cached = getCachedOwnership(sandboxId, userId);
  if (cached !== null) return cached;

  try {
    // Find sandbox by externalId (the Daytona sandbox ID) in kortix.sandboxes
    const [sandbox] = await db
      .select({ accountId: sandboxes.accountId })
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.externalId, sandboxId),
          eq(sandboxes.status, 'active'),
        )
      )
      .limit(1);

    if (!sandbox) {
      console.warn(`[PREVIEW] No active sandbox found for externalId=${sandboxId}`);
      setCachedOwnership(sandboxId, userId, false);
      return false;
    }

    // Check if user belongs to the account that owns this sandbox
    const [membership] = await db
      .select({ accountRole: accountUser.accountRole })
      .from(accountUser)
      .where(
        and(
          eq(accountUser.userId, userId),
          eq(accountUser.accountId, sandbox.accountId),
        )
      )
      .limit(1);

    const allowed = !!membership;
    setCachedOwnership(sandboxId, userId, allowed);
    return allowed;
  } catch (err) {
    console.error(`[PREVIEW] Ownership check failed for ${sandboxId}:`, err);
    return false;
  }
}

// === Preview link resolution (no state checking -- let proxy detect if sandbox is down) ===

async function resolvePreviewLink(
  sandboxId: string,
  port: number
): Promise<{ url: string; token: string | null }> {
  const cached = getCachedPreviewLink(sandboxId, port);
  if (cached) return { url: cached.url, token: cached.token };

  const daytona = getDaytona();
  const sandbox = await daytona.get(sandboxId);

  const link = await (sandbox as any).getPreviewLink(port);
  const url = link.url || String(link);
  const token = link.token || null;

  setCachedPreviewLink(sandboxId, port, url, token);
  return { url, token };
}

// === Wake sandbox (called only when proxy fails with connection error) ===

async function wakeSandbox(sandboxId: string): Promise<void> {
  try {
    const daytona = getDaytona();
    const sandbox = await daytona.get(sandboxId);
    await (sandbox as any).start?.();
    console.log(`[PREVIEW] Wake-up triggered for sandbox ${sandboxId}`);
  } catch (e) {
    console.error(`[PREVIEW] Failed to wake sandbox ${sandboxId}:`, e);
  }
}

// === Route handler: ALL /:sandboxId/:port/* ===
//
// Zero-overhead proxy with auto-wake:
// - Happy path (sandbox alive): single fetch, no extra API calls
// - Sandbox down: connection error -> wake sandbox -> retry up to 2 more times
//

preview.all('/:sandboxId/:port/*', async (c) => {
  const sandboxId = c.req.param('sandboxId');
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new HTTPException(400, { message: `Invalid port: ${portStr}` });
  }

  const userId = c.get('userId') as string;

  // 1. Verify ownership (cached after first check)
  const allowed = await verifyOwnership(sandboxId, userId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Not authorized to access this sandbox, userId: " + userId + ", sandboxId: " + sandboxId });
  }

  // 2. Read body once up front (needed across retries)
  const method = c.req.method;
  let body: ArrayBuffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await c.req.raw.clone().arrayBuffer();
  }

  // 3. Build path & query (invariant across retries)
  // c.req.url includes the full mount prefix (e.g. /v1/preview/{sandboxId}/{port}/agent)
  // so we use indexOf instead of startsWith to find /{sandboxId}/{port} anywhere in the path
  const fullPath = new URL(c.req.url).pathname;
  const prefixPattern = `/${sandboxId}/${portStr}`;
  const prefixIndex = fullPath.indexOf(prefixPattern);
  const remainingPath = prefixIndex !== -1
    ? fullPath.slice(prefixIndex + prefixPattern.length) || '/'
    : '/';
  const upstreamUrl = new URL(c.req.url);
  upstreamUrl.searchParams.delete('token');
  const queryString = upstreamUrl.search;

  // 4. Proxy with auto-wake retry
  const MAX_RETRIES = 3;
  const RETRY_DELAYS_MS = [2000, 5000, 8000]; // progressive delays to let sandbox boot
  let wakeTriggered = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Resolve preview link (cached on happy path = zero overhead)
      const { url: previewUrl, token: previewToken } = await resolvePreviewLink(sandboxId, port);
      const targetUrl = previewUrl.replace(/\/$/, '') + remainingPath + queryString;

      // Build forwarding headers
      const headers = new Headers();
      for (const [key, value] of c.req.raw.headers.entries()) {
        const lower = key.toLowerCase();
        if (lower === 'host' || lower === 'authorization') continue;
        headers.set(key, value);
      }
      headers.set('X-Daytona-Skip-Preview-Warning', 'true');
      headers.set('X-Daytona-Disable-CORS', 'true');
      if (previewToken) {
        headers.set('X-Daytona-Preview-Token', previewToken);
      }

      console.log(
        `[PREVIEW] ${method} ${sandboxId}:${port}${remainingPath} -> ${targetUrl}${attempt > 0 ? ` (retry ${attempt})` : ''}`
      );

      // Proxy request
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        // @ts-ignore - Bun supports duplex
        duplex: 'half',
      });

      // Daytona returns 400 "no IP address found" when sandbox is stopped,
      // and 400 "failed to get runner info" when sandbox is archived (no runner assigned).
      // Detect both and treat them like connection failures so auto-wake kicks in.
      // We keep retrying even after wake is triggered (sandbox may still be booting).
      if (upstream.status === 400 && attempt < MAX_RETRIES) {
        const bodyText = await upstream.text();
        const isSandboxDown =
          bodyText.includes('no IP address found') ||
          bodyText.includes('failed to get runner info');
        if (isSandboxDown) {
          if (!wakeTriggered) {
            console.warn(
              `[PREVIEW] Sandbox ${sandboxId} is stopped/archived (Daytona: ${bodyText.slice(0, 120)}), triggering wake`
            );
            await wakeSandbox(sandboxId);
            wakeTriggered = true;
          } else {
            console.warn(
              `[PREVIEW] Sandbox ${sandboxId} still booting (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
            );
          }
          previewLinkCache.delete(`${sandboxId}:${port}`);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        // Not a Daytona stopped error -- pass through
        const errHeaders = new Headers(upstream.headers);
        const errOrigin = c.req.header('Origin') || '';
        if (errOrigin) {
          errHeaders.set('Access-Control-Allow-Origin', errOrigin);
          errHeaders.set('Access-Control-Allow-Credentials', 'true');
        }
        return new Response(bodyText, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: errHeaders,
        });
      }

      // Got an HTTP response -> sandbox is alive, pass it through
      // Inject CORS headers since the raw upstream response won't have them
      const respHeaders = new Headers(upstream.headers);
      const origin = c.req.header('Origin') || '';
      if (origin) {
        respHeaders.set('Access-Control-Allow-Origin', origin);
        respHeaders.set('Access-Control-Allow-Credentials', 'true');
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      // Re-throw our own HTTP exceptions (400, 403, etc.) -- don't retry those
      if (err instanceof HTTPException) throw err;

      // Connection-level failure -> sandbox is likely down
      console.warn(
        `[PREVIEW] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${sandboxId}:${port}: ${(err as Error).message || err}`
      );

      // Trigger wake once on first connection failure
      if (!wakeTriggered) {
        await wakeSandbox(sandboxId);
        wakeTriggered = true;
      }

      if (attempt < MAX_RETRIES) {
        // Clear cached preview link in case it went stale
        previewLinkCache.delete(`${sandboxId}:${port}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  // All retries exhausted
  throw new HTTPException(503, {
    message: 'Sandbox is waking up. Please retry in a few seconds.',
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
