import { Hono } from 'hono';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { executions, triggers } from '@kortix/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { AppEnv } from '../types';

const VALID_EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'timeout', 'skipped'] as const;
type ExecutionStatus = (typeof VALID_EXECUTION_STATUSES)[number];

function isValidExecutionStatus(s: string): s is ExecutionStatus {
  return (VALID_EXECUTION_STATUSES as readonly string[]).includes(s);
}

const app = new Hono<AppEnv>();

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /v1/executions - List all executions for the account
app.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const status = c.req.query('status');
  const triggerId = c.req.query('trigger_id');
  const since = c.req.query('since');
  const until = c.req.query('until');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Validate status if provided
  if (status && !isValidExecutionStatus(status)) {
    throw new ValidationError(
      `Invalid status '${status}'. Must be one of: ${VALID_EXECUTION_STATUSES.join(', ')}`,
    );
  }

  // We need to join with triggers to filter by account ownership
  const conditions = [eq(triggers.accountId, userId)];

  if (triggerId) {
    conditions.push(eq(executions.triggerId, triggerId));
  }

  if (status && isValidExecutionStatus(status)) {
    conditions.push(eq(executions.status, status));
  }

  if (since) {
    conditions.push(gte(executions.createdAt, new Date(since)));
  }

  if (until) {
    conditions.push(lte(executions.createdAt, new Date(until)));
  }

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(executions)
    .innerJoin(triggers, eq(executions.triggerId, triggers.triggerId))
    .where(and(...conditions));

  const total = countResult?.count ?? 0;

  const results = await db
    .select({
      execution: executions,
      triggerName: triggers.name,
    })
    .from(executions)
    .innerJoin(triggers, eq(executions.triggerId, triggers.triggerId))
    .where(and(...conditions))
    .orderBy(desc(executions.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: results.map((r) => ({
      ...r.execution,
      trigger_name: r.triggerName,
    })),
    total,
    limit,
    offset,
  });
});

// GET /v1/executions/:id - Get execution details
app.get('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const executionId = c.req.param('id');

  const [result] = await db
    .select({
      execution: executions,
      triggerName: triggers.name,
      triggerPrompt: triggers.prompt,
    })
    .from(executions)
    .innerJoin(triggers, eq(executions.triggerId, triggers.triggerId))
    .where(and(eq(executions.executionId, executionId), eq(triggers.accountId, userId)));

  if (!result) {
    throw new NotFoundError('Execution', executionId);
  }

  return c.json({
    success: true,
    data: {
      ...result.execution,
      trigger_name: result.triggerName,
      trigger_prompt: result.triggerPrompt,
    },
  });
});

// GET /v1/executions/by-trigger/:triggerId - List executions for a specific trigger
app.get('/by-trigger/:triggerId', async (c) => {
  const userId = c.get('userId') as string;
  const triggerId = c.req.param('triggerId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Verify trigger ownership
  const [trigger] = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.triggerId, triggerId), eq(triggers.accountId, userId)));

  if (!trigger) {
    throw new NotFoundError('Trigger', triggerId);
  }

  // Get total count for this trigger
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(executions)
    .where(eq(executions.triggerId, triggerId));

  const total = countResult?.count ?? 0;

  const results = await db
    .select()
    .from(executions)
    .where(eq(executions.triggerId, triggerId))
    .orderBy(desc(executions.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: results,
    total,
    limit,
    offset,
  });
});

export { app as executionsRouter };
