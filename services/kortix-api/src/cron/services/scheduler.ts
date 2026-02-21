import { sql, eq, and, lte } from 'drizzle-orm';
import { db } from '../../shared/db';
import { hasDatabase } from '../../shared/db';
import { triggers, sandboxes } from '@kortix/db';
import { config } from '../../config';
import { processTrigger } from './executor';

/**
 * Scheduler with two modes:
 *
 * 1. **pg_cron mode** (cloud) — each trigger gets its own pg_cron job that
 *    calls POST /v1/cron/tick/trigger/:id/execute via pg_net.
 *    Requires pg_cron + pg_net extensions in PostgreSQL.
 *
 * 2. **In-process mode** (local / self-hosted) — a setInterval runs every 60s,
 *    queries due triggers, and executes them in-process. No Postgres extensions
 *    needed. This is the automatic fallback when pg_cron is unavailable.
 *
 * pg_cron uses 5-field cron (min hour day month weekday).
 * Our triggers use 6-field (sec min hour day month weekday) —
 * we strip the seconds field since pg_cron doesn't support it.
 */

/** In-process tick interval handle */
let tickInterval: ReturnType<typeof setInterval> | null = null;
let schedulerMode: 'pg_cron' | 'in_process' | 'disabled' = 'disabled';

/** Escape a string for safe use inside a SQL single-quoted literal */
function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Validate that a trigger ID is a valid UUID (prevents injection via ID) */
function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid trigger ID format: ${value}`);
  }
}

/** Validate a 5-field cron expression contains only safe characters */
function assertCronExpr(value: string): void {
  if (!/^[\d\s\*\/,\-\?#LW]+$/.test(value)) {
    throw new Error(`Invalid cron expression: ${value}`);
  }
}

/** Convert 6-field cron to 5-field (drop seconds) for pg_cron */
function toPgCronExpr(sixField: string): string {
  const parts = sixField.trim().split(/\s+/);
  if (parts.length === 6) {
    // Drop the seconds field (first)
    return parts.slice(1).join(' ');
  }
  // Already 5-field or something else — pass through
  return sixField;
}

/** Job name convention: "trigger_{triggerId}" */
function jobName(triggerId: string): string {
  return `trigger_${triggerId}`;
}

// ─── In-process tick (local / self-hosted) ──────────────────────────────────

/**
 * Process all due triggers in-process.
 * This is the same logic as POST /v1/cron/tick but called directly.
 */
async function inProcessTick(): Promise<void> {
  try {
    const dueTriggers = await db
      .select()
      .from(triggers)
      .where(
        and(
          eq(triggers.isActive, true),
          lte(triggers.nextRunAt, new Date()),
        ),
      );

    if (dueTriggers.length === 0) return;

    console.log(`[scheduler] In-process tick: processing ${dueTriggers.length} due trigger(s)`);

    await Promise.allSettled(
      dueTriggers.map(async (trigger) => {
        try {
          await processTrigger(trigger);
        } catch (err) {
          console.error(`[scheduler] Error processing trigger ${trigger.triggerId}:`, err);
        }
      }),
    );
  } catch (err) {
    console.error('[scheduler] In-process tick error:', err);
  }
}

// ─── pg_cron operations (cloud) ─────────────────────────────────────────────

/**
 * Schedule a pg_cron job for a trigger.
 * Creates or replaces the job using cron.schedule().
 * In local/in-process mode, this is a no-op (triggers are picked up by the interval).
 */
export async function schedulePgCronJob(
  triggerId: string,
  cronExpr: string,
): Promise<void> {
  // In-process mode: triggers are picked up by the interval tick, no pg_cron needed.
  if (schedulerMode !== 'pg_cron') return;

  if (!config.CRON_API_URL || !config.CRON_TICK_SECRET) {
    console.warn(`[scheduler] Cannot schedule pg_cron job — CRON_API_URL or CRON_TICK_SECRET not set`);
    return;
  }

  assertUuid(triggerId);

  const pgExpr = toPgCronExpr(cronExpr);
  assertCronExpr(pgExpr);

  const name = jobName(triggerId);
  const url = `${config.CRON_API_URL}/v1/cron/tick/trigger/${triggerId}/execute`;

  // Unschedule first if exists (cron.schedule with same name replaces, but be safe)
  await unschedulePgCronJob(triggerId);

  const command = `
    SELECT net.http_post(
      url := '${escSql(url)}',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "${escSql(config.CRON_TICK_SECRET)}"}'::jsonb,
      body := '{"source": "pg_cron", "trigger_id": "${escSql(triggerId)}"}'::jsonb,
      timeout_milliseconds := 30000
    );
  `.trim();

  const query = `SELECT cron.schedule('${escSql(name)}', '${escSql(pgExpr)}', $BODY$${command}$BODY$);`;
  console.log(`[scheduler] Executing pg_cron schedule SQL for ${name}...`);

  try {
    await db.execute(sql.raw(query));
    console.log(`[scheduler] pg_cron job scheduled: ${name} = "${pgExpr}" -> ${url}`);
  } catch (err) {
    console.error(`[scheduler] FAILED to schedule pg_cron job ${name}:`, err);
    throw err;
  }
}

/**
 * Unschedule (remove) a pg_cron job for a trigger.
 * In local/in-process mode, this is a no-op.
 */
export async function unschedulePgCronJob(triggerId: string): Promise<void> {
  // In-process mode: no pg_cron jobs to unschedule.
  if (schedulerMode !== 'pg_cron') return;

  assertUuid(triggerId);
  const name = jobName(triggerId);

  try {
    await db.execute(
      sql.raw(`SELECT cron.unschedule('${escSql(name)}');`),
    );
    console.log(`[scheduler] pg_cron job unscheduled: ${name}`);
  } catch (err: any) {
    // Job might not exist — that's fine.
    const msg = err?.message ?? '';
    const causeMsg = err?.cause?.message ?? '';
    const routine = err?.cause?.routine ?? '';
    if (
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      causeMsg.includes('does not exist') ||
      causeMsg.includes('could not find') ||
      routine === 'cron_unschedule_named'
    ) {
      console.log(`[scheduler] No existing pg_cron job to unschedule: ${name}`);
      return;
    }
    throw err;
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Start the scheduler.
 *
 * - Local mode → in-process 60s interval (no pg_cron needed).
 * - Cloud mode with CRON_API_URL → pg_cron (configure_scheduler in DB).
 * - No database → disabled.
 */
export async function startScheduler(): Promise<void> {
  if (!config.SCHEDULER_ENABLED) {
    console.log('[scheduler] Scheduler is disabled via SCHEDULER_ENABLED=false');
    schedulerMode = 'disabled';
    return;
  }

  if (!hasDatabase) {
    console.log('[scheduler] Scheduler disabled — no DATABASE_URL configured');
    schedulerMode = 'disabled';
    return;
  }

  // ── Local / self-hosted: in-process interval ──────────────────────────
  if (config.isLocal()) {
    schedulerMode = 'in_process';
    console.log('[scheduler] In-process mode — checking due triggers every 60s');

    // Run first tick after 10s (give schema push time to finish)
    setTimeout(() => {
      inProcessTick();
      tickInterval = setInterval(inProcessTick, 60_000);
    }, 10_000);

    return;
  }

  // ── Cloud: pg_cron mode ───────────────────────────────────────────────
  if (config.CRON_API_URL && config.CRON_TICK_SECRET) {
    schedulerMode = 'pg_cron';
    console.log(`[scheduler] pg_cron mode — jobs managed per-trigger via cron.schedule()`);
    console.log(`[scheduler] API URL: ${config.CRON_API_URL}`);

    // Configure the global scheduler tick in PostgreSQL.
    try {
      await db.execute(
        sql.raw(
          `SELECT kortix.configure_scheduler('${escSql(config.CRON_API_URL)}', '${escSql(config.CRON_TICK_SECRET)}')`
        ),
      );
      console.log(`[scheduler] Configured pg_cron scheduler in database`);
    } catch (err: any) {
      const msg = err?.message ?? err?.cause?.message ?? '';
      console.warn(`[scheduler] Could not configure pg_cron in database: ${msg}`);
    }
  } else {
    schedulerMode = 'disabled';
    console.log('[scheduler] CRON_API_URL or CRON_TICK_SECRET not set — scheduling disabled');
    console.log('[scheduler] Triggers can still be executed manually via POST /v1/cron/trigger/:id/execute');
  }
}

export function stopScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    console.log('[scheduler] In-process tick interval stopped');
  }
  schedulerMode = 'disabled';
  console.log('[scheduler] Scheduler stopped');
}

export function getSchedulerStatus() {
  return {
    running: schedulerMode !== 'disabled',
    mode: schedulerMode,
    enabled: config.SCHEDULER_ENABLED,
    cronApiUrl: config.CRON_API_URL || null,
  };
}
