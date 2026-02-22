import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validateSecretKey } from '../repositories/api-keys';
import { validateSandboxToken } from '../repositories/sandboxes';
import { getSupabase } from '../shared/supabase';

/**
 * API key auth (sk_/sbt_ for search, LLM routes).
 *
 * Auth Flow:
 * - Token "sk_xxx"  = validate against api_keys table via Drizzle, get account_id
 * - Token "sbt_xxx" = validate against kortix.sandboxes table, get account_id
 * - No valid prefix = 401
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

  // API key validation (sk_xxx format)
  if (token.startsWith('sk_')) {
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
    return;
  }

  // Sandbox token validation (sbt_xxx format)
  if (token.startsWith('sbt_')) {
    const result = await validateSandboxToken(token);

    if (!result.isValid) {
      throw new HTTPException(401, {
        message: result.error || 'Invalid sandbox token',
      });
    }

    c.set('accountId', result.accountId);
    c.set('sandboxId', result.sandboxId);
    await next();
    return;
  }

  // No valid token format matched — reject
  throw new HTTPException(401, {
    message: 'Invalid token format. Use sk_ (API key) or sbt_ (sandbox token)',
  });
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
 * On successful auth, sets a session cookie scoped to /v1/preview/ so that
 * all sub-resource requests (CSS, JS, images, fonts loaded by proxied HTML)
 * are automatically authenticated without requiring ?token= on every URL.
 *
 * All requests go through kortix-api which authenticates via Supabase JWT
 * or sbt_ token. No additional sak_ sandbox lock needed.
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

  // 1. Try sandbox token (sbt_xxx) — used by agents inside the sandbox
  if (token.startsWith('sbt_')) {
    const result = await validateSandboxToken(token);
    if (result.isValid) {
      c.set('userId', result.accountId);
      c.set('userEmail', '');
      setPreviewSessionCookie(c, token);
      await next();
      return;
    }
    throw new HTTPException(401, { message: result.error || 'Invalid sandbox token' });
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
 *   2. Sandbox token (sbt_xxx from agents) — sets userId from accountId lookup
 */
export async function combinedAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new HTTPException(401, { message: 'Missing token' });
  }

  // Sandbox token (sbt_) — used by agents inside the sandbox
  if (token.startsWith('sbt_')) {
    const result = await validateSandboxToken(token);
    if (!result.isValid) {
      throw new HTTPException(401, { message: result.error || 'Invalid sandbox token' });
    }
    // Map accountId → userId so route handlers work unchanged
    c.set('userId', result.accountId);
    c.set('userEmail', '');
    await next();
    return;
  }

  // Otherwise, fall through to Supabase JWT auth
  await supabaseAuth(c, next);
}
