import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Context, Next } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { validateSandboxToken } from '../repositories/sandboxes';
import { config } from '../config';
import { deploymentsRouter } from './routes/deployments';

/**
 * Combined auth: accepts Supabase JWTs (from frontend) OR sandbox tokens (from agents).
 * Both set `userId` in context so downstream route handlers work identically.
 *
 * Same pattern as cronAuth in cron/index.ts.
 */
async function deploymentAuth(c: Context, next: Next) {
  // Local mode: skip auth, inject mock user
  if (config.isLocal()) {
    c.set('userId', '00000000-0000-0000-0000-000000000000');
    c.set('userEmail', 'local@localhost');
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new HTTPException(401, { message: 'Missing token' });
  }

  // Sandbox token — used by agents inside the sandbox
  if (token.startsWith('sbt_') && config.DATABASE_URL) {
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

  // Otherwise, fall through to Supabase JWT auth (dashboard users)
  await supabaseAuth(c, next);
}

const deploymentsApp = new Hono();

// Full path: /v1/deployments/*
deploymentsApp.use('/*', deploymentAuth);
deploymentsApp.route('/', deploymentsRouter);

export { deploymentsApp };
