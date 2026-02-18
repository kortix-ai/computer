import { Hono } from 'hono';
import { eq, and, lte, sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import { triggers, sandboxes } from '@kortix/db';
import { config } from '../../config';
import { processTrigger } from '../services/executor';

const app = new Hono();

/**
 * POST /v1/cron/tick
 *
 * Global tick — called every minute by the pg_cron "kortix-scheduler-tick" job
 * via pg_net. Finds all active triggers where nextRunAt <= now() and processes them.
 * This is the safety-net that catches triggers without their own per-trigger pg_cron job.
 *
 * Auth: x-cron-secret header.
 */
app.post('/', async (c) => {
  const secret = c.req.header('x-cron-secret');

  if (!config.CRON_TICK_SECRET) {
    return c.json({ error: 'CRON_TICK_SECRET not configured' }, 503);
  }

  if (secret !== config.CRON_TICK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Find all active triggers that are due (nextRunAt <= now)
    const dueTriggers = await db
      .select()
      .from(triggers)
      .where(
        and(
          eq(triggers.isActive, true),
          lte(triggers.nextRunAt, new Date()),
        ),
      );

    if (dueTriggers.length === 0) {
      return c.json({ processed: 0, timestamp: new Date().toISOString() });
    }

    console.log(`[cron/tick] Processing ${dueTriggers.length} due trigger(s)`);

    // Process all due triggers concurrently
    const results = await Promise.allSettled(
      dueTriggers.map(async (trigger) => {
        try {
          await processTrigger(trigger);
          return { triggerId: trigger.triggerId, status: 'ok' as const };
        } catch (err) {
          console.error(`[cron/tick] Error processing trigger ${trigger.triggerId}:`, err);
          return {
            triggerId: trigger.triggerId,
            status: 'error' as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const processed = results.filter((r) => r.status === 'fulfilled').length;

    return c.json({
      processed: dueTriggers.length,
      succeeded: processed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/tick] Global tick error:', err);
    return c.json(
      {
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

/**
 * POST /v1/cron/trigger/:id/execute
 *
 * Called by pg_cron (via pg_net) to execute a single trigger.
 * Each trigger has its own pg_cron job that hits this endpoint
 * at the trigger's cron schedule. No polling, no table scanning.
 *
 * Auth: x-cron-secret header (pg_net can't produce JWTs).
 */
app.post('/trigger/:id/execute', async (c) => {
  const secret = c.req.header('x-cron-secret');

  if (!config.CRON_TICK_SECRET) {
    return c.json({ error: 'CRON_TICK_SECRET not configured' }, 503);
  }

  if (secret !== config.CRON_TICK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const triggerId = c.req.param('id');

  try {
    // Fetch the trigger
    const [trigger] = await db
      .select()
      .from(triggers)
      .where(eq(triggers.triggerId, triggerId));

    if (!trigger) {
      return c.json({ error: 'Trigger not found', triggerId }, 404);
    }

    if (!trigger.isActive) {
      return c.json({ skipped: true, reason: 'Trigger is paused', triggerId });
    }

    // Execute it
    await processTrigger(trigger);

    return c.json({
      success: true,
      triggerId,
      name: trigger.name,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[cron/tick] Error executing trigger ${triggerId}:`, err);
    return c.json(
      {
        success: false,
        triggerId,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

export { app as tickRouter };
