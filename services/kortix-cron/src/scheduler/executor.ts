import { eq } from 'drizzle-orm';
import { db } from '../db';
import { executions, triggers, sandboxes } from '@kortix/db';
import type { Trigger } from '@kortix/db';
import { executeTrigger, type ExecuteResult } from '../lib/opencode';
import { getNextRun } from './cron';

/**
 * Process a single due trigger:
 * 1. Create execution record
 * 2. Update trigger's nextRunAt and lastRunAt
 * 3. Execute against sandbox
 * 4. Update execution status
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
        retryCount: execution.retryCount,
      })
      .where(eq(executions.executionId, execution.executionId));

    console.error(
      `[scheduler] Trigger ${trigger.name} (${trigger.triggerId}) ${isTimeout ? 'timed out' : 'failed'} after ${durationMs}ms: ${errorMessage}`,
    );

    // Handle retries
    if (execution.retryCount < trigger.maxRetries) {
      console.log(
        `[scheduler] Scheduling retry ${execution.retryCount + 1}/${trigger.maxRetries} for trigger ${trigger.triggerId}`,
      );

      await db.insert(executions).values({
        triggerId: trigger.triggerId,
        sandboxId: trigger.sandboxId,
        status: 'pending',
        retryCount: execution.retryCount + 1,
        metadata: { retryOf: execution.executionId },
      });
    }
  }
}
