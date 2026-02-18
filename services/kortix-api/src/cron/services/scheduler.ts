import { sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import { hasDatabase } from '../../shared/db';
import { config } from '../../config';

/**
 * pg_cron scheduler — each trigger gets its own pg_cron job.
 *
 * When a trigger is created/updated: cron.schedule() a job that calls
 *   POST /v1/cron/trigger/:id/execute via pg_net.
 *
 * When a trigger is deleted/paused: cron.unschedule() the job.
 *
 * pg_cron handles all timing. No polling. No in-memory state.
 * pg_cron uses 5-field cron (min hour day month weekday).
 * Our triggers use 6-field (sec min hour day month weekday) —
 * we strip the seconds field since pg_cron doesn't support it.
 */

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

/**
 * Schedule a pg_cron job for a trigger.
 * Creates or replaces the job using cron.schedule().
 */
export async function schedulePgCronJob(
  triggerId: string,
  cronExpr: string,
): Promise<void> {
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
 */
export async function unschedulePgCronJob(triggerId: string): Promise<void> {
  assertUuid(triggerId);
  const name = jobName(triggerId);

  try {
    await db.execute(
      sql.raw(`SELECT cron.unschedule('${escSql(name)}');`),
    );
    console.log(`[scheduler] pg_cron job unscheduled: ${name}`);
  } catch (err: any) {
    // Job might not exist — that's fine.
    // Drizzle wraps Postgres errors: check err.message, err.cause.message, and err.cause.routine
    const msg = err?.message ?? '';
    const causeMsg = err?.cause?.message ?? '';
    const routine = err?.cause?.routine ?? '';
    if (
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      causeMsg.includes('does not exist') ||
      causeMsg.includes('could not find') ||
      routine === 'cron_unschedule_named' // pg_cron's internal "job not found" error
    ) {
      console.log(`[scheduler] No existing pg_cron job to unschedule: ${name}`);
      return;
    }
    throw err;
  }
}

/**
 * Start scheduler — for pg_cron mode this just logs.
 * pg_cron jobs are managed via CRUD routes, not on startup.
 */
export async function startScheduler(): Promise<void> {
  if (!config.SCHEDULER_ENABLED) {
    console.log('[scheduler] Scheduler is disabled via SCHEDULER_ENABLED=false');
    return;
  }

  if (!hasDatabase) {
    console.log('[scheduler] Scheduler disabled — no DATABASE_URL configured');
    return;
  }

  if (config.CRON_API_URL && config.CRON_TICK_SECRET) {
    console.log(`[scheduler] pg_cron mode — jobs managed per-trigger via cron.schedule()`);
    console.log(`[scheduler] API URL: ${config.CRON_API_URL}`);

    // Configure the global scheduler tick in PostgreSQL.
    // This sets the API URL and secret that kortix.scheduler_tick() uses
    // to fire the global tick every minute via pg_cron + pg_net.
    try {
      await db.execute(
        sql.raw(
          `SELECT kortix.configure_scheduler('${escSql(config.CRON_API_URL)}', '${escSql(config.CRON_TICK_SECRET)}')`
        ),
      );
      console.log(`[scheduler] Configured pg_cron scheduler in database`);
    } catch (err: any) {
      // Not fatal — configure_scheduler() may not exist if the
      // pg_cron migration (0001_pg_cron_scheduler.sql) hasn't been applied.
      const msg = err?.message ?? err?.cause?.message ?? '';
      console.warn(`[scheduler] Could not configure pg_cron in database: ${msg}`);
    }
  } else {
    console.log('[scheduler] CRON_API_URL or CRON_TICK_SECRET not set — pg_cron scheduling disabled');
    console.log('[scheduler] Triggers can still be executed manually via POST /v1/cron/trigger/:id/execute');
  }
}

export function stopScheduler(): void {
  // Nothing to stop — pg_cron runs in postgres
  console.log('[scheduler] Scheduler stopped');
}

export function getSchedulerStatus() {
  return {
    running: !!(config.CRON_API_URL && config.CRON_TICK_SECRET),
    mode: config.CRON_API_URL && config.CRON_TICK_SECRET ? 'pg_cron' : 'disabled',
    enabled: config.SCHEDULER_ENABLED,
    cronApiUrl: config.CRON_API_URL || null,
  };
}
