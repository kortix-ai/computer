import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validateSecretKey } from '../repositories/api-keys';
import { isKortixToken } from '../shared/crypto';
import { getSupabase } from '../shared/supabase';
import { config } from '../config';

// ─── Cookie name for preview session auth ────────────────────────────────────
const PREVIEW_SESSION_COOKIE = '__preview_session';

// ═══════════════════════════════════════════════════════════════════════════════
// Auth Middleware (3 middlewares — one per auth strategy)
//
//   1. apiKeyAuth      — Kortix API keys only (header)
//   2. supabaseAuth    — Supabase JWT only (header)
//   3. combinedAuth    — Kortix OR Supabase (header + cookie fallback)
//
// Token is NEVER read from query parameters. SSE clients use fetch() with
// Authorization headers; preview iframes use cookies set via POST /v1/p/auth.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * API key auth for search, LLM, and router routes.
 *
 * In local mode: any bearer token is accepted (no DB validation).
 * In cloud mode: all Kortix tokens (kortix_, kortix_sb_) go through
 * validateSecretKey() against the api_keys table.
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, {
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new HTTPException(401, {
      message: 'Missing token in Authorization header',
    });
  }

  // Local mode: skip token format/DB validation — accept any bearer token
  if (config.isLocal()) {
    await next();
    return;
  }

  if (!isKortixToken(token)) {
    throw new HTTPException(401, {
      message: 'Invalid token format — expected kortix_ prefix',
    });
  }

  const result = await validateSecretKey(token);

  if (!result.isValid) {
    throw new HTTPException(401, {
      message: result.error || 'Invalid API key',
    });
  }

  c.set('accountId', result.accountId);
  c.set('keyId', result.keyId);
  if (result.sandboxId) {
    c.set('sandboxId', result.sandboxId);
  }
  await next();
}

/**
 * Supabase JWT auth (for billing, platform, admin routes).
 * Header-only — sets userId and userEmail in context on success.
 */
export async function supabaseAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new HTTPException(401, { message: 'Missing token' });
  }

  try {
    const supabase = getSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    c.set('userId', user.id);
    c.set('userEmail', user.email || '');
    await next();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('Auth error:', err);
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}

/**
 * Combined auth — accepts Kortix tokens OR Supabase JWTs.
 *
 * Token resolution order:
 *   1. Authorization: Bearer <token> header
 *   2. __preview_session cookie (set via POST /v1/p/auth)
 *
 * Used for:
 *   - Preview proxy routes (/v1/p/{sandboxId}/{port}/*)
 *   - Cron, deployment, secrets, providers, servers, queue, tunnel routes
 *   - SSE stream endpoints (clients use fetch() with Authorization header)
 *
 * Sets userId and userEmail in context regardless of token type.
 * For preview proxy routes, also sets/refreshes the session cookie.
 */
export async function combinedAuth(c: Context, next: Next) {
  // Skip auth for CORS preflight — OPTIONS never carries auth tokens.
  if (c.req.method === 'OPTIONS') {
    await next();
    return;
  }

  // Extract token: header → cookie (never query params)
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    // Check for session cookie (set via POST /v1/p/auth or by prior requests)
    const cookieHeader = c.req.header('Cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${PREVIEW_SESSION_COOKIE}=([^;]+)`));
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    throw new HTTPException(401, { message: 'Missing authentication token' });
  }

  // Local mode: accept any bearer token (matches apiKeyAuth local bypass)
  if (config.isLocal() && !isKortixToken(token)) {
    c.set('userId', '00000000-0000-0000-0000-000000000000');
    c.set('userEmail', '');
    await next();
    return;
  }

  // Determine if this is a preview proxy route (for cookie management)
  const isPreviewRoute = c.req.path.startsWith('/v1/p/') || c.req.path === '/v1/p';

  // 1. Try Kortix token (kortix_ or kortix_sb_) — used by agents inside the sandbox
  if (isKortixToken(token)) {
    const result = await validateSecretKey(token);
    if (!result.isValid) {
      throw new HTTPException(401, { message: result.error || 'Invalid Kortix token' });
    }
    // Map accountId → userId so route handlers work unchanged
    c.set('userId', result.accountId);
    c.set('userEmail', '');
    if (isPreviewRoute) setPreviewSessionCookie(c, token);
    await next();
    return;
  }

  // 2. Try Supabase JWT — used by the frontend
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    c.set('userId', user.id);
    c.set('userEmail', user.email || '');
    if (isPreviewRoute) setPreviewSessionCookie(c, token);
    await next();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('[AUTH] Error:', err);
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}

// ─── Aliases for backward compatibility ──────────────────────────────────────
// These are the same as combinedAuth but exported under their old names so
// existing imports continue to work without changing every route file.

/** @deprecated Use `combinedAuth` directly. Alias kept for import compatibility. */
export const previewProxyAuth = combinedAuth;

/** @deprecated Stub — proxy routes handle auth internally. */
export async function dualAuth(c: Context, next: Next) {
  await next();
}

/** @deprecated Use `combinedAuth` directly. Alias kept for test mock compatibility. */
export const supabaseAuthWithQueryParam = combinedAuth;

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Set (or refresh) the preview session cookie.
 * Scoped to /v1/p/ so it only applies to preview proxy routes.
 * SameSite=Lax allows the cookie on same-site navigations and sub-resource loads.
 * Max-Age=3600 (1 hour) — the frontend refreshes the token periodically.
 */
function setPreviewSessionCookie(c: Context, token: string) {
  const encoded = encodeURIComponent(token);
  c.header(
    'Set-Cookie',
    `${PREVIEW_SESSION_COOKIE}=${encoded}; Path=/v1/p/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    { append: true },
  );
}
