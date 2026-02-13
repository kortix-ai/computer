import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getSupabase } from '../lib/supabase';

/**
 * Validates Supabase JWT from either:
 *  1. Authorization: Bearer <token> header (standard)
 *  2. ?token=<token> query parameter (for EventSource/SSE which can't set headers)
 *
 * Sets userId in context on success.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Try Authorization header first, fall back to ?token= query param
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
