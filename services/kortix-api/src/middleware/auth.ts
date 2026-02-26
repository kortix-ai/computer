import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validateSecretKey } from '../repositories/api-keys';
import { isKortixToken } from '../shared/crypto';
import { getSupabase } from '../shared/supabase';

/**
 * API key auth for search, LLM, and router routes.
 *
 * Single validation path — all Kortix tokens (kortix_, kortix_sb_) go through
 * the same validateSecretKey() against the api_keys table.
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
 * Supabase JWT auth (for billing, platform, cron routes).
 * Sets userId and userEmail in context on success.
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
 * Dual mode auth (for proxy routes — try API key, else passthrough).
 * This is handled inline in the proxy route handler, not as middleware.
 * Exported for reference but the proxy route has its own tryAuthenticate.
 */
export async function dualAuth(c: Context, next: Next) {
  // Proxy routes handle auth internally (tryAuthenticate pattern)
  await next();
}

/**
 * Supabase JWT from header OR query param (for daytona-proxy SSE).
 * EventSource/SSE can't set headers, so we also check ?token=<token>.
 */
export async function supabaseAuthWithQueryParam(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    token = c.req.query('token') || undefined;
  }

  if (!token) {
    throw new HTTPException(401, {
      message: 'Missing authentication token',
    });
  }

  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new HTTPException(401, {
        message: 'Invalid or expired token',
      });
    }

    c.set('userId', user.id);
    c.set('userEmail', user.email);

    await next();
  } catch (err) {
    if (err instanceof HTTPException) {
      throw err;
    }
    console.error('[AUTH] Error:', err);
    throw new HTTPException(401, {
      message: 'Authentication failed',
    });
  }
}

/**
 * Cookie name for preview session auth.
 * Set on first authenticated request so all sub-resource loads (CSS, JS,
 * images, fonts) automatically carry auth without needing ?token= on every URL.
 */
const PREVIEW_SESSION_COOKIE = '__preview_session';

/**
 * Combined auth for preview proxy routes.
 *
 * Token resolution order:
 *   1. Authorization: Bearer <token> header
 *   2. ?token=<token> query parameter
 *   3. __preview_session cookie (set by this middleware on prior requests)
 *
 * Accepts Kortix tokens (kortix_, kortix_sb_) or Supabase JWTs.
 */
export async function previewProxyAuth(c: Context, next: Next) {
  // Skip auth for CORS preflight — OPTIONS never carries auth tokens.
  if (c.req.method === 'OPTIONS') {
    await next();
    return;
  }

  // Extract token: header → query param → cookie
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    token = c.req.query('token') || undefined;
  }

  if (!token) {
    // Check for session cookie (set by a prior authenticated request)
    const cookieHeader = c.req.header('Cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${PREVIEW_SESSION_COOKIE}=([^;]+)`));
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    throw new HTTPException(401, { message: 'Missing authentication token' });
  }

  // 1. Try Kortix token (kortix_ or kortix_sb_) — used by agents inside the sandbox
  if (isKortixToken(token)) {
    const result = await validateSecretKey(token);
    if (result.isValid) {
      c.set('userId', result.accountId);
      c.set('userEmail', '');
      setPreviewSessionCookie(c, token);
      await next();
      return;
    }
    throw new HTTPException(401, { message: result.error || 'Invalid Kortix token' });
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
    setPreviewSessionCookie(c, token);
    await next();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('[PREVIEW-AUTH] Error:', err);
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}

/**
 * Set (or refresh) the preview session cookie.
 * Scoped to /v1/preview/ so it only applies to preview proxy routes.
 * SameSite=Lax allows the cookie on same-site navigations and sub-resource loads.
 * Max-Age=3600 (1 hour) — the frontend refreshes the JWT token periodically,
 * so the cookie gets updated on each authenticated request.
 */
function setPreviewSessionCookie(c: Context, token: string) {
  const encoded = encodeURIComponent(token);
  c.header(
    'Set-Cookie',
    `${PREVIEW_SESSION_COOKIE}=${encoded}; Path=/v1/preview/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    { append: true },
  );
}

/**
 * Combined auth for cron/deployment routes.
 *
 * Accepts EITHER:
 *   1. Supabase JWT (from frontend) — sets userId, userEmail
 *   2. Kortix token (kortix_/kortix_sb_ from agents) — sets userId from accountId lookup
 */
export async function combinedAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  // EventSource/SSE can't set headers — accept token via query param as fallback
  // (same pattern as the WebSocket endpoint which takes token via query params)
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : new URL(c.req.url).searchParams.get('token') ?? undefined;

  if (!token) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  // Kortix token — used by agents inside the sandbox
  if (isKortixToken(token)) {
    const result = await validateSecretKey(token);
    if (!result.isValid) {
      throw new HTTPException(401, { message: result.error || 'Invalid Kortix token' });
    }
    // Map accountId → userId so route handlers work unchanged
    c.set('userId', result.accountId);
    c.set('userEmail', '');
    await next();
    return;
  }

  // Supabase JWT — validate directly with the extracted token
  // (can't delegate to supabaseAuth because it re-reads the Authorization header,
  // which is absent when the token came from a query param)
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }
    c.set('userId', user.id);
    c.set('userEmail', user.email || '');
    await next();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(401, { message: 'Authentication failed' });
  }
}
