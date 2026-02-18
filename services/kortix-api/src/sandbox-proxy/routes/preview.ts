import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { config } from '../../config';

// ─── Cloud-only imports (lazy-loaded to avoid crashes in local mode) ────────
let _db: typeof import('../../shared/db').db | null = null;
let _getDaytona: typeof import('../../shared/daytona').getDaytona | null = null;
let _sandboxes: typeof import('@kortix/db').sandboxes | null = null;
let _accountUser: typeof import('@kortix/db').accountUser | null = null;
let _eq: typeof import('drizzle-orm').eq | null = null;
let _and: typeof import('drizzle-orm').and | null = null;
let _ne: typeof import('drizzle-orm').ne | null = null;

async function loadCloudDeps() {
  if (!_db) {
    const dbMod = await import('../../shared/db');
    _db = dbMod.db;
  }
  if (!_getDaytona) {
    const daytMod = await import('../../shared/daytona');
    _getDaytona = daytMod.getDaytona;
  }
  if (!_sandboxes) {
    const dbSchema = await import('@kortix/db');
    _sandboxes = dbSchema.sandboxes;
    _accountUser = dbSchema.accountUser;
  }
  if (!_eq) {
    const drizzle = await import('drizzle-orm');
    _eq = drizzle.eq;
    _and = drizzle.and;
    _ne = drizzle.ne;
  }
}

// ─── Context type ───────────────────────────────────────────────────────────

interface SandboxProxyContext {
  userId: string;
  userEmail: string;
}

const preview = new Hono<{ Variables: SandboxProxyContext }>();

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL MODE: Resolve sandbox endpoint via port map (no Daytona, no DB)
// ═══════════════════════════════════════════════════════════════════════════════

const SANDBOX_CONTAINER_NAME = 'kortix-sandbox';

/**
 * Fixed port mappings: containerPort → hostPort.
 * Matches local-docker.ts provider — default base is 14000.
 */
function getLocalPortMap(): Record<string, number> {
  const base = config.SANDBOX_PORT_BASE;
  return {
    '8000': base + 0,  // Kortix Master
    '3111': base + 1,  // OpenCode Web UI
    '6080': base + 2,  // Desktop (noVNC)
    '6081': base + 3,  // Desktop (HTTPS)
    '3210': base + 4,  // Presentation Viewer
    '9223': base + 5,  // Agent Browser Stream
    '9224': base + 6,  // Agent Browser Viewer
  };
}

/**
 * Resolve a sandbox endpoint URL for local mode.
 *
 * - If DOCKER_HOST is set (API runs inside Docker alongside sandbox):
 *   use Docker DNS → http://kortix-sandbox:{containerPort}
 * - Otherwise (API on host, `pnpm dev`):
 *   use localhost with mapped host port → http://localhost:{hostPort}
 */
export function resolveLocalEndpoint(containerPort: string): string {
  if (config.DOCKER_HOST) {
    return `http://${SANDBOX_CONTAINER_NAME}:${containerPort}`;
  }
  const portMap = getLocalPortMap();
  const hostPort = portMap[containerPort] ?? parseInt(containerPort, 10);
  return `http://localhost:${hostPort}`;
}

/**
 * Resolve a WebSocket endpoint URL for local mode.
 * Same logic as HTTP but with ws:// protocol.
 */
export function resolveLocalWsEndpoint(containerPort: string): string {
  if (config.DOCKER_HOST) {
    return `ws://${SANDBOX_CONTAINER_NAME}:${containerPort}`;
  }
  const portMap = getLocalPortMap();
  const hostPort = portMap[containerPort] ?? parseInt(containerPort, 10);
  return `ws://localhost:${hostPort}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOUD MODE: Caches, ownership verification, Daytona resolution (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

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

async function verifyOwnership(sandboxId: string, userId: string): Promise<boolean> {
  const cached = getCachedOwnership(sandboxId, userId);
  if (cached !== null) return cached;

  try {
    await loadCloudDeps();
    const [sandbox] = await _db!
      .select({ accountId: _sandboxes!.accountId })
      .from(_sandboxes!)
      .where(
        _and!(
          _eq!(_sandboxes!.externalId, sandboxId),
          _ne!(_sandboxes!.status, 'pooled'),
        )
      )
      .limit(1);

    if (!sandbox) {
      console.warn(`[PREVIEW] No sandbox found for externalId=${sandboxId}`);
      setCachedOwnership(sandboxId, userId, false);
      return false;
    }

    const [membership] = await _db!
      .select({ accountRole: _accountUser!.accountRole })
      .from(_accountUser!)
      .where(
        _and!(
          _eq!(_accountUser!.userId, userId),
          _eq!(_accountUser!.accountId, sandbox.accountId),
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

async function resolvePreviewLink(
  sandboxId: string,
  port: number
): Promise<{ url: string; token: string | null }> {
  const cached = getCachedPreviewLink(sandboxId, port);
  if (cached) return { url: cached.url, token: cached.token };

  await loadCloudDeps();
  const daytona = _getDaytona!();
  const sandbox = await daytona.get(sandboxId);

  const link = await (sandbox as any).getPreviewLink(port);
  const url = link.url || String(link);
  const token = link.token || null;

  setCachedPreviewLink(sandboxId, port, url, token);
  return { url, token };
}

async function wakeSandbox(sandboxId: string): Promise<void> {
  try {
    await loadCloudDeps();
    const daytona = _getDaytona!();
    const sandbox = await daytona.get(sandboxId);
    await (sandbox as any).start?.();
    console.log(`[PREVIEW] Wake-up triggered for sandbox ${sandboxId}`);
  } catch (e) {
    console.error(`[PREVIEW] Failed to wake sandbox ${sandboxId}:`, e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED: Extract remaining path and query from the incoming URL
// ═══════════════════════════════════════════════════════════════════════════════

function extractRemainingPath(c: any, sandboxId: string, portStr: string): { remainingPath: string; queryString: string } {
  const fullPath = new URL(c.req.url).pathname;
  const prefixPattern = `/${sandboxId}/${portStr}`;
  const prefixIndex = fullPath.indexOf(prefixPattern);
  const remainingPath = prefixIndex !== -1
    ? fullPath.slice(prefixIndex + prefixPattern.length) || '/'
    : '/';
  const upstreamUrl = new URL(c.req.url);
  upstreamUrl.searchParams.delete('token');
  const queryString = upstreamUrl.search;
  return { remainingPath, queryString };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER: ALL /:sandboxId/:port/*
//
// Unified sandbox proxy — works for both local and cloud modes:
// - Local: direct proxy to sandbox via port map, no auth, no retries
// - Cloud: Daytona proxy with ownership verification and auto-wake retries
// ═══════════════════════════════════════════════════════════════════════════════

preview.all('/:sandboxId/:port/*', async (c) => {
  const sandboxId = c.req.param('sandboxId');
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new HTTPException(400, { message: `Invalid port: ${portStr}` });
  }

  const method = c.req.method;
  const { remainingPath, queryString } = extractRemainingPath(c, sandboxId, portStr);

  // ── LOCAL MODE: Direct proxy, no auth, no retries ──────────────────────
  if (config.isLocal()) {
    const targetBase = resolveLocalEndpoint(portStr);
    const targetUrl = targetBase.replace(/\/$/, '') + remainingPath + queryString;

    // Build forwarding headers — pass everything through including Authorization
    // (Kortix Master may need it for INTERNAL_SERVICE_KEY on /env routes)
    const headers = new Headers();
    for (const [key, value] of c.req.raw.headers.entries()) {
      if (key.toLowerCase() === 'host') continue;
      headers.set(key, value);
    }

    // Read body up front (stream may already be partially consumed by middleware)
    let body: ArrayBuffer | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await c.req.raw.arrayBuffer();
    }

    console.log(`[PREVIEW:LOCAL] ${method} :${portStr}${remainingPath} -> ${targetUrl}`);

    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
      });

      // Stream response through directly (SSE-safe: no buffering)
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    } catch (err) {
      console.error(`[PREVIEW:LOCAL] Proxy failed for :${portStr}${remainingPath}:`, (err as Error).message);
      throw new HTTPException(502, {
        message: `Sandbox unreachable at ${targetBase}: ${(err as Error).message}`,
      });
    }
  }

  // ── CLOUD MODE: Daytona proxy with ownership check + auto-wake ─────────

  const userId = c.get('userId') as string;

  // 1. Verify ownership (cached after first check)
  const allowed = await verifyOwnership(sandboxId, userId);
  if (!allowed) {
    throw new HTTPException(403, {
      message: `Not authorized to access this sandbox, userId: ${userId}, sandboxId: ${sandboxId}`,
    });
  }

  // 2. Read body once up front (needed across retries)
  let body: ArrayBuffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await c.req.raw.clone().arrayBuffer();
  }

  // 3. Proxy with auto-wake retry
  const MAX_RETRIES = 3;
  const RETRY_DELAYS_MS = [2000, 5000, 8000];
  let wakeTriggered = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
        `[PREVIEW:CLOUD] ${method} ${sandboxId}:${port}${remainingPath} -> ${targetUrl}${attempt > 0 ? ` (retry ${attempt})` : ''}`
      );

      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        // @ts-ignore — Bun supports duplex
        duplex: 'half',
      });

      // Detect Daytona stopped/archived sandbox
      if (upstream.status === 400 && attempt < MAX_RETRIES) {
        const bodyText = await upstream.text();
        const isSandboxDown =
          bodyText.includes('no IP address found') ||
          bodyText.includes('failed to get runner info');
        if (isSandboxDown) {
          if (!wakeTriggered) {
            console.warn(
              `[PREVIEW:CLOUD] Sandbox ${sandboxId} is stopped/archived (Daytona: ${bodyText.slice(0, 120)}), triggering wake`
            );
            await wakeSandbox(sandboxId);
            wakeTriggered = true;
          } else {
            console.warn(
              `[PREVIEW:CLOUD] Sandbox ${sandboxId} still booting (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
            );
          }
          previewLinkCache.delete(`${sandboxId}:${port}`);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        // Not a Daytona stopped error — pass through
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

      // Success — stream response through
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
      if (err instanceof HTTPException) throw err;

      console.warn(
        `[PREVIEW:CLOUD] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${sandboxId}:${port}: ${(err as Error).message || err}`
      );

      if (!wakeTriggered) {
        await wakeSandbox(sandboxId);
        wakeTriggered = true;
      }

      if (attempt < MAX_RETRIES) {
        previewLinkCache.delete(`${sandboxId}:${port}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  throw new HTTPException(503, {
    message: 'Sandbox is waking up. Please retry in a few seconds.',
  });
});

// Also handle requests without trailing path (e.g. /:sandboxId/:port)
preview.all('/:sandboxId/:port', async (c) => {
  const sandboxId = c.req.param('sandboxId');
  const port = c.req.param('port');
  const url = new URL(c.req.url);
  return c.redirect(`/${sandboxId}/${port}/${url.search}`, 301);
});

export { preview };
