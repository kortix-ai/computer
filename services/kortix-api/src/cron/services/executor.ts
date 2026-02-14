import { eq } from 'drizzle-orm';
import { db } from '../../shared/db';
import { executions, triggers, sandboxes } from '@kortix/db';
import type { Trigger } from '@kortix/db';
import { executeTrigger } from './opencode';
import { getNextRun } from './cron';

/**
 * Process a single due trigger:
 * 1. Fetch sandbox and validate it's active
 * 2. Create execution record (status: running)
 * 3. Update trigger's nextRunAt and lastRunAt
 * 4. Execute prompt against sandbox
 * 5. Update execution with result (completed/failed/timeout)
 * 6. If failed and retries remain, schedule a retry via processTriggerRetry
 */
export async function processTrigger(trigger: Trigger): Promise<void> {
  // Fetch the sandbox
  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.sandboxId, trigger.sandboxId));

  if (!sandbox) {
    console.error(`[scheduler] Sandbox not found for trigger ${trigger.triggerId}: ${trigger.sandboxId}`);
    return;
  }

  if (sandbox.status !== 'active') {
    console.warn(`[scheduler] Sandbox ${sandbox.sandboxId} status is '${sandbox.status}', skipping trigger ${trigger.triggerId}`);

    // Create a skipped execution record
    await db.insert(executions).values({
      triggerId: trigger.triggerId,
      sandboxId: trigger.sandboxId,
      status: 'skipped',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      errorMessage: `Sandbox status is '${sandbox.status}', not active`,
    });

    // Still advance nextRunAt so we don't retry this tick forever
    const nextRun = getNextRun(trigger.cronExpr, trigger.timezone);
    await db
      .update(triggers)
      .set({ lastRunAt: new Date(), nextRunAt: nextRun, updatedAt: new Date() })
      .where(eq(triggers.triggerId, trigger.triggerId));

    return;
  }

  // 1. Create execution record
  const [execution] = await db
    .insert(executions)
    .values({
      triggerId: trigger.triggerId,
      sandboxId: trigger.sandboxId,
      status: 'running',
      startedAt: new Date(),
    })
    .returning();

  // 2. Update trigger's lastRunAt and compute next run
  const nextRun = getNextRun(trigger.cronExpr, trigger.timezone);
  await db
    .update(triggers)
    .set({
      lastRunAt: new Date(),
      nextRunAt: nextRun,
      updatedAt: new Date(),
    })
    .where(eq(triggers.triggerId, trigger.triggerId));

  // 3. Execute
  const startTime = Date.now();

  try {
    const result = await executeTrigger(sandbox, trigger.prompt, {
      agentName: trigger.agentName ?? undefined,
      sessionMode: trigger.sessionMode as 'new' | 'reuse',
      sessionId: trigger.sessionId,
      timeoutMs: trigger.timeoutMs,
      triggerId: trigger.triggerId,
    });

    // 4. Success — update execution and sandbox lastUsedAt
    const durationMs = Date.now() - startTime;
    await Promise.all([
      db
        .update(executions)
        .set({
          status: 'completed',
          sessionId: result.sessionId,
          completedAt: new Date(),
          durationMs,
          metadata: { response: result.response },
        })
        .where(eq(executions.executionId, execution.executionId)),
      db
        .update(sandboxes)
        .set({ lastUsedAt: new Date() })
        .where(eq(sandboxes.sandboxId, trigger.sandboxId)),
    ]);

    console.log(
      `[scheduler] Trigger ${trigger.name} (${trigger.triggerId}) completed in ${durationMs}ms, session: ${result.sessionId}`,
    );
  } catch (err) {
    // 4. Failure
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Check if this was a timeout (AbortError)
    const isTimeout =
      err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));

    await db
      .update(executions)
      .set({
        status: isTimeout ? 'timeout' : 'failed',
        completedAt: new Date(),
        durationMs,
        errorMessage,
        retryCount: 0,
      })
      .where(eq(executions.executionId, execution.executionId));

    console.error(
      `[scheduler] Trigger ${trigger.name} (${trigger.triggerId}) ${isTimeout ? 'timed out' : 'failed'} after ${durationMs}ms: ${errorMessage}`,
    );

    // Handle retries: schedule retry executions inline
    if (trigger.maxRetries > 0) {
      await scheduleRetries(trigger, execution.executionId, 0, errorMessage);
    }
  }
}

/**
 * Retry a failed trigger execution up to maxRetries.
 * Each retry is recorded as a separate execution record linked via metadata.
 */
async function scheduleRetries(
  trigger: Trigger,
  originalExecutionId: string,
  currentRetryCount: number,
  lastError: string,
): Promise<void> {
  if (currentRetryCount >= trigger.maxRetries) {
    console.log(
      `[scheduler] All ${trigger.maxRetries} retries exhausted for trigger ${trigger.triggerId}`,
    );
    return;
  }

  const retryNumber = currentRetryCount + 1;
  console.log(
    `[scheduler] Retry ${retryNumber}/${trigger.maxRetries} for trigger ${trigger.triggerId}`,
  );

  // Fetch sandbox again (status may have changed)
  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.sandboxId, trigger.sandboxId));

  if (!sandbox || sandbox.status !== 'active') {
    console.warn(`[scheduler] Sandbox not available for retry, aborting retries for trigger ${trigger.triggerId}`);
    return;
  }

  // Create retry execution record
  const [retryExecution] = await db
    .insert(executions)
    .values({
      triggerId: trigger.triggerId,
      sandboxId: trigger.sandboxId,
      status: 'running',
      startedAt: new Date(),
      retryCount: retryNumber,
      metadata: { retryOf: originalExecutionId, retryNumber },
    })
    .returning();

  const startTime = Date.now();

  try {
    const result = await executeTrigger(sandbox, trigger.prompt, {
      agentName: trigger.agentName ?? undefined,
      sessionMode: trigger.sessionMode as 'new' | 'reuse',
      sessionId: trigger.sessionId,
      timeoutMs: trigger.timeoutMs,
      triggerId: trigger.triggerId,
    });

    const durationMs = Date.now() - startTime;
    await db
      .update(executions)
      .set({
        status: 'completed',
        sessionId: result.sessionId,
        completedAt: new Date(),
        durationMs,
        metadata: { retryOf: originalExecutionId, retryNumber, response: result.response },
      })
      .where(eq(executions.executionId, retryExecution.executionId));

    console.log(
      `[scheduler] Retry ${retryNumber} for trigger ${trigger.triggerId} succeeded in ${durationMs}ms`,
    );
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout =
      err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));

    await db
      .update(executions)
      .set({
        status: isTimeout ? 'timeout' : 'failed',
        completedAt: new Date(),
        durationMs,
        errorMessage,
        retryCount: retryNumber,
        metadata: { retryOf: originalExecutionId, retryNumber },
      })
      .where(eq(executions.executionId, retryExecution.executionId));

    console.error(
      `[scheduler] Retry ${retryNumber} for trigger ${trigger.triggerId} failed: ${errorMessage}`,
    );

    // Recurse for next retry
    await scheduleRetries(trigger, originalExecutionId, retryNumber, errorMessage);
  }
}
