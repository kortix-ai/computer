import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getSupabase } from '../lib/supabase';

export interface AuthContext {
  userId: string;
  userEmail: string;
}

/**
 * Validates Supabase JWT from Authorization header.
 * Sets userId and userEmail on Hono context.
 */
export async function authMiddleware(c: Context, next: Next) {
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

  try {
    const supabase = getSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new HTTPException(401, {
        message: 'Invalid or expired token',
      });
    }

    c.set('userId', user.id);
    c.set('userEmail', user.email || '');

    await next();
  } catch (err) {
    if (err instanceof HTTPException) {
      throw err;
    }
    console.error('Auth error:', err);
    throw new HTTPException(401, {
      message: 'Authentication failed',
    });
  }
}
