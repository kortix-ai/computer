import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../shared/db';
import { triggers, sandboxes, executions } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';
import { executeTrigger } from '../services/opencode';
import { isValidCronExpression, getNextRun } from '../services/cron';
import { schedulePgCronJob, unschedulePgCronJob } from '../services/scheduler';
import type { AppEnv } from '../../types';

const app = new Hono<AppEnv>();

// ─── Validation Schemas ──────────────────────────────────────────────────────
const createTriggerSchema = z.object({
  sandbox_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  cron_expr: z.string().min(1).max(100).refine(isValidCronExpression, {
    message: 'Invalid cron expression. Use 6-field format: second minute hour day month weekday',
  }),
  timezone: z.string().default('UTC'),
  agent_name: z.string().optional(),
  prompt: z.string().min(1),
  session_mode: z.enum(['new', 'reuse']).default('new'),
  session_id: z.string().optional(),
  max_retries: z.number().int().min(0).max(10).default(0),
  timeout_ms: z.number().int().min(1000).max(3600000).default(300000),
  metadata: z.record(z.unknown()).optional(),
});

const updateTriggerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  cron_expr: z
    .string()
    .min(1)
    .max(100)
    .refine(isValidCronExpression, {
      message: 'Invalid cron expression',
    })
    .optional(),
  timezone: z.string().optional(),
  agent_name: z.string().nullable().optional(),
  prompt: z.string().min(1).optional(),
  session_mode: z.enum(['new', 'reuse']).optional(),
  session_id: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  timeout_ms: z.number().int().min(1000).max(3600000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /v1/triggers - Create trigger
app.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json();
  const parsed = createTriggerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, parsed.data.sandbox_id), eq(sandboxes.accountId, userId)));

  if (!sandbox) {
    throw new NotFoundError('Sandbox', parsed.data.sandbox_id);
  }

  const nextRun = getNextRun(parsed.data.cron_expr, parsed.data.timezone);

  const [trigger] = await db
    .insert(triggers)
    .values({
      sandboxId: parsed.data.sandbox_id,
      accountId: userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      cronExpr: parsed.data.cron_expr,
      timezone: parsed.data.timezone,
      agentName: parsed.data.agent_name ?? null,
      prompt: parsed.data.prompt,
      sessionMode: parsed.data.session_mode,
      sessionId: parsed.data.session_id ?? null,
      maxRetries: parsed.data.max_retries,
      timeoutMs: parsed.data.timeout_ms,
      metadata: parsed.data.metadata ?? {},
      nextRunAt: nextRun,
    })
    .returning();

  // Schedule pg_cron job
  await schedulePgCronJob(trigger.triggerId, trigger.cronExpr).catch((err) =>
    console.error(`[triggers] Failed to schedule pg_cron job for ${trigger.triggerId}:`, err),
  );

  return c.json({ success: true, data: trigger }, 201);
});

// GET /v1/triggers - List triggers
app.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const sandboxId = c.req.query('sandbox_id');
  const active = c.req.query('active');

  const conditions = [eq(triggers.accountId, userId)];
  if (sandboxId) conditions.push(eq(triggers.sandboxId, sandboxId));
  if (active === 'true') conditions.push(eq(triggers.isActive, true));
  else if (active === 'false') conditions.push(eq(triggers.isActive, false));

  const results = await db
    .select()
    .from(triggers)
    .where(and(...conditions))
    .orderBy(desc(triggers.createdAt));

  return c.json({ success: true, data: results, total: results.length });
});

// GET /v1/triggers/:id
app.get('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('id');

  const [trigger] = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)));

  if (!trigger) throw new NotFoundError('Trigger', triggerId);
  return c.json({ success: true, data: trigger });
});

// PATCH /v1/triggers/:id - Update trigger
app.patch('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateTriggerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const [current] = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)));

  if (!current) throw new NotFoundError('Trigger', triggerId);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.agent_name !== undefined) updateData.agentName = parsed.data.agent_name;
  if (parsed.data.prompt !== undefined) updateData.prompt = parsed.data.prompt;
  if (parsed.data.session_mode !== undefined) updateData.sessionMode = parsed.data.session_mode;
  if (parsed.data.session_id !== undefined) updateData.sessionId = parsed.data.session_id;
  if (parsed.data.is_active !== undefined) updateData.isActive = parsed.data.is_active;
  if (parsed.data.max_retries !== undefined) updateData.maxRetries = parsed.data.max_retries;
  if (parsed.data.timeout_ms !== undefined) updateData.timeoutMs = parsed.data.timeout_ms;
  if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata;

  const cronExpr = parsed.data.cron_expr ?? current.cronExpr;
  const timezone = parsed.data.timezone ?? current.timezone;
  if (parsed.data.cron_expr !== undefined) updateData.cronExpr = parsed.data.cron_expr;
  if (parsed.data.timezone !== undefined) updateData.timezone = parsed.data.timezone;

  if (parsed.data.cron_expr !== undefined || parsed.data.timezone !== undefined) {
    updateData.nextRunAt = getNextRun(cronExpr, timezone);
  }

  const [updated] = await db
    .update(triggers)
    .set(updateData)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)))
    .returning();

  // Reschedule pg_cron if cron changed or re-activated
  if (updated.isActive) {
    await schedulePgCronJob(updated.triggerId, updated.cronExpr).catch((err) =>
      console.error(`[triggers] Failed to reschedule pg_cron job for ${triggerId}:`, err),
    );
  } else {
    await unschedulePgCronJob(triggerId).catch((err) =>
      console.error(`[triggers] Failed to unschedule pg_cron job for ${triggerId}:`, err),
    );
  }

  return c.json({ success: true, data: updated });
});

// DELETE /v1/triggers/:id
app.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('id');

  const [deleted] = await db
    .delete(triggers)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)))
    .returning();

  if (!deleted) throw new NotFoundError('Trigger', triggerId);

  // Remove pg_cron job
  await unschedulePgCronJob(triggerId).catch((err) =>
    console.error(`[triggers] Failed to unschedule pg_cron job for ${triggerId}:`, err),
  );

  return c.json({ success: true, message: 'Trigger deleted' });
});

// POST /v1/triggers/:id/pause
app.post('/:id/pause', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('id');

  const [updated] = await db
    .update(triggers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)))
    .returning();

  if (!updated) throw new NotFoundError('Trigger', triggerId);

  // Remove pg_cron job
  await unschedulePgCronJob(triggerId).catch((err) =>
    console.error(`[triggers] Failed to unschedule pg_cron job for ${triggerId}:`, err),
  );

  return c.json({ success: true, data: updated });
});

// POST /v1/triggers/:id/resume
app.post('/:id/resume', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('id');

  const [current] = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)));

  if (!current) throw new NotFoundError('Trigger', triggerId);

  const nextRun = getNextRun(current.cronExpr, current.timezone);

  const [updated] = await db
    .update(triggers)
    .set({ isActive: true, nextRunAt: nextRun, updatedAt: new Date() })
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)))
    .returning();

  // Schedule pg_cron job
  await schedulePgCronJob(updated!.triggerId, updated!.cronExpr).catch((err) =>
    console.error(`[triggers] Failed to schedule pg_cron job for ${triggerId}:`, err),
  );

  return c.json({ success: true, data: updated });
});

// POST /v1/triggers/:id/run - Manual fire
app.post('/:id/run', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('id');

  const [trigger] = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)));

  if (!trigger) throw new NotFoundError('Trigger', triggerId);

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.sandboxId, trigger.sandboxId));

  if (!sandbox) throw new NotFoundError('Sandbox', trigger.sandboxId);

  const [execution] = await db
    .insert(executions)
    .values({
      triggerId: trigger.triggerId,
      sandboxId: trigger.sandboxId,
      status: 'running',
      startedAt: new Date(),
      metadata: { manual: true },
    })
    .returning();

  // Execute async — respond immediately
  executeTrigger(sandbox, trigger.prompt, {
    agentName: trigger.agentName ?? undefined,
    sessionMode: trigger.sessionMode as 'new' | 'reuse',
    sessionId: trigger.sessionId,
    timeoutMs: trigger.timeoutMs,
    triggerId: trigger.triggerId,
  })
    .then(async (result) => {
      await db
        .update(executions)
        .set({
          status: 'completed',
          sessionId: result.sessionId,
          completedAt: new Date(),
          durationMs: Date.now() - (execution.startedAt?.getTime() ?? Date.now()),
          metadata: { ...(execution.metadata as Record<string, unknown>), response: result.response },
        })
        .where(eq(executions.executionId, execution.executionId));
    })
    .catch(async (err) => {
      await db
        .update(executions)
        .set({
          status: 'failed',
          completedAt: new Date(),
          durationMs: Date.now() - (execution.startedAt?.getTime() ?? Date.now()),
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        .where(eq(executions.executionId, execution.executionId));
    });

  return c.json({
    success: true,
    data: {
      execution_id: execution.executionId,
      status: 'running',
      message: 'Trigger fired manually. Check execution status for results.',
    },
  });
});

export { app as triggersRouter };
