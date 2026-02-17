import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Context, Next } from 'hono';
import { supabaseAuth } from '../middleware/auth';
import { validateSandboxToken } from '../repositories/sandboxes';
import { config } from '../config';
import { sandboxesRouter } from './routes/sandboxes';
import { triggersRouter } from './routes/triggers';
import { executionsRouter } from './routes/executions';
import { tickRouter } from './routes/tick';

export {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  schedulePgCronJob,
  unschedulePgCronJob,
} from './services/scheduler';

/**
 * Combined auth: accepts Supabase JWTs (from frontend) OR sbt_ sandbox tokens (from agents).
 * Both set `userId` in context so downstream route handlers work identically.
 */
async function cronAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new HTTPException(401, { message: 'Missing token' });
  }

  // Sandbox token (sbt_) — used by agents inside the sandbox
  if (token.startsWith('sbt_') && config.DATABASE_URL) {
    const result = await validateSandboxToken(token);
    if (!result.isValid) {
      throw new HTTPException(401, { message: result.error || 'Invalid sandbox token' });
    }
    // Map accountId → userId so cron route handlers work unchanged
    c.set('userId', result.accountId);
    c.set('userEmail', '');
    await next();
    return;
  }

  // Otherwise, fall through to Supabase JWT auth
  await supabaseAuth(c, next);
}

const cronApp = new Hono();

// Tick/execute endpoints use x-cron-secret auth (pg_cron can't produce JWTs)
cronApp.route('/tick', tickRouter);

// All other cron routes accept both Supabase JWTs and sbt_ tokens
cronApp.use('/sandboxes/*', cronAuth);
cronApp.use('/triggers/*', cronAuth);
cronApp.use('/executions/*', cronAuth);

cronApp.route('/sandboxes', sandboxesRouter);
cronApp.route('/triggers', triggersRouter);
cronApp.route('/executions', executionsRouter);

export { cronApp };
