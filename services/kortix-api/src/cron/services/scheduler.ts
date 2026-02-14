import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { db } from '../../shared/db';
import { triggers } from '@kortix/db';
import { config } from '../../config';
import { processTrigger } from './executor';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let tickCount = 0;
let lastTickTime: Date | null = null;

/**
 * The main scheduler tick. Runs every SCHEDULER_TICK_INTERVAL_MS (default: 1 second).
 *
 * 1. Query all active triggers where nextRunAt <= now
 * 2. For each due trigger, process it (create execution, fire agent, update)
 *
 * Uses a simple mutex (isProcessing) to prevent concurrent tick processing.
 * For horizontal scaling, use SELECT ... FOR UPDATE SKIP LOCKED.
 */
async function tick(): Promise<void> {
  if (isProcessing) {
    return;
  }

  isProcessing = true;
  tickCount++;
  lastTickTime = new Date();

  try {
    const now = new Date();

    // Find all active triggers that are due
    const dueTriggers = await db
      .select()
      .from(triggers)
      .where(
        and(
          eq(triggers.isActive, true),
          isNotNull(triggers.nextRunAt),
          lte(triggers.nextRunAt, now),
        ),
      );

    if (dueTriggers.length > 0) {
      console.log(`[scheduler] Found ${dueTriggers.length} due trigger(s) at ${now.toISOString()}`);

      // Process triggers concurrently but with bounded parallelism
      const CONCURRENCY_LIMIT = 5;
      for (let i = 0; i < dueTriggers.length; i += CONCURRENCY_LIMIT) {
        const batch = dueTriggers.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.allSettled(batch.map((trigger) => processTrigger(trigger)));
      }
    }
  } catch (err) {
    console.error('[scheduler] Tick error:', err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the scheduler loop.
 */
export function startScheduler(): void {
  if (!config.SCHEDULER_ENABLED) {
    console.log('[scheduler] Scheduler is disabled via SCHEDULER_ENABLED=false');
    return;
  }

  if (schedulerInterval) {
    console.warn('[scheduler] Scheduler already running');
    return;
  }

  console.log(
    `[scheduler] Starting scheduler with tick interval: ${config.SCHEDULER_TICK_INTERVAL_MS}ms`,
  );

  // Run first tick immediately
  tick();

  // Then tick on interval
  schedulerInterval = setInterval(tick, config.SCHEDULER_TICK_INTERVAL_MS);
}

/**
 * Stop the scheduler loop.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[scheduler] Scheduler stopped');
  }
}

/**
 * Get scheduler status for health checks.
 */
export function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    enabled: config.SCHEDULER_ENABLED,
    tickInterval: config.SCHEDULER_TICK_INTERVAL_MS,
    tickCount,
    lastTick: lastTickTime?.toISOString() ?? null,
    processing: isProcessing,
  };
}
