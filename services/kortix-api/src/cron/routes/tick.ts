import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db';
import { triggers, sandboxes } from '@kortix/db';
import { config } from '../../config';
import { processTrigger } from '../services/executor';

const app = new Hono();

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
