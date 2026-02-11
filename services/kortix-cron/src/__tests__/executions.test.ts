/**
 * Integration tests for execution routes.
 * Tests listing and filtering executions against real DB.
 */
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { executions } from '@kortix/db';
import {
  createTestApp,
  cleanupTestData,
  getTestDb,
  jsonGet,
  createTestSandbox,
  createTestTrigger,
  TEST_USER_ID,
  OTHER_USER_ID,
} from './helpers';

const app = createTestApp();
const otherApp = createTestApp(OTHER_USER_ID);
const db = getTestDb();

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

async function insertExecution(
  triggerId: string,
  sandboxId: string,
  overrides: Record<string, unknown> = {},
) {
  const [exec] = await db
    .insert(executions)
    .values({
      triggerId,
      sandboxId,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 1234,
      ...overrides,
    })
    .returning();
  return exec;
}

describe('GET /v1/executions', () => {
  test('lists executions for the authenticated user', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    await insertExecution(trigger.triggerId, sandbox.sandboxId);
    await insertExecution(trigger.triggerId, sandbox.sandboxId, { status: 'failed' });

    const res = await jsonGet(app, '/v1/executions');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(2);
    // Should include trigger_name
    expect(json.data[0].trigger_name).toBe(trigger.name);
  });

  test('filters by status', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    await insertExecution(trigger.triggerId, sandbox.sandboxId, { status: 'completed' });
    await insertExecution(trigger.triggerId, sandbox.sandboxId, { status: 'failed' });
    await insertExecution(trigger.triggerId, sandbox.sandboxId, { status: 'failed' });

    const res = await jsonGet(app, '/v1/executions?status=failed');
    const json = await res.json() as any;
    expect(json.data.length).toBe(2);
    expect(json.data.every((e: any) => e.status === 'failed')).toBe(true);
  });

  test('rejects invalid status filter', async () => {
    const res = await jsonGet(app, '/v1/executions?status=bogus');
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toContain('Invalid status');
  });

  test('filters by trigger_id', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger1 = await createTestTrigger(app, sandbox.sandboxId, { name: 'T1' });
    const trigger2 = await createTestTrigger(app, sandbox.sandboxId, { name: 'T2' });

    await insertExecution(trigger1.triggerId, sandbox.sandboxId);
    await insertExecution(trigger2.triggerId, sandbox.sandboxId);

    const res = await jsonGet(app, `/v1/executions?trigger_id=${trigger1.triggerId}`);
    const json = await res.json() as any;
    expect(json.data.length).toBe(1);
  });

  test('returns correct total for pagination', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    for (let i = 0; i < 5; i++) {
      await insertExecution(trigger.triggerId, sandbox.sandboxId);
    }

    const res = await jsonGet(app, '/v1/executions?limit=2&offset=0');
    const json = await res.json() as any;
    expect(json.data.length).toBe(2);
    expect(json.total).toBe(5);
    expect(json.limit).toBe(2);
    expect(json.offset).toBe(0);
  });

  test('does not return executions from other users', async () => {
    const otherSandbox = await createTestSandbox(otherApp, { name: 'Other' });
    const otherTrigger = await createTestTrigger(otherApp, otherSandbox.sandboxId);
    await insertExecution(otherTrigger.triggerId, otherSandbox.sandboxId);

    const res = await jsonGet(app, '/v1/executions');
    const json = await res.json() as any;
    expect(json.data.length).toBe(0);
  });
});

describe('GET /v1/executions/:id', () => {
  test('returns execution by ID with trigger info', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);
    const exec = await insertExecution(trigger.triggerId, sandbox.sandboxId);

    const res = await jsonGet(app, `/v1/executions/${exec.executionId}`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.executionId).toBe(exec.executionId);
    expect(json.data.trigger_name).toBe(trigger.name);
    expect(json.data.trigger_prompt).toBe(trigger.prompt);
  });

  test('returns 404 for non-existent execution', async () => {
    const res = await jsonGet(app, '/v1/executions/00000000-0000-4000-a000-999999999999');
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/executions/by-trigger/:triggerId', () => {
  test('lists executions for a specific trigger', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);
    await insertExecution(trigger.triggerId, sandbox.sandboxId);
    await insertExecution(trigger.triggerId, sandbox.sandboxId);

    const res = await jsonGet(app, `/v1/executions/by-trigger/${trigger.triggerId}`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.length).toBe(2);
    expect(json.total).toBe(2);
  });

  test('returns 404 for non-existent trigger', async () => {
    const res = await jsonGet(app, '/v1/executions/by-trigger/00000000-0000-4000-a000-999999999999');
    expect(res.status).toBe(404);
  });

  test('cannot see other users trigger executions', async () => {
    const otherSandbox = await createTestSandbox(otherApp);
    const otherTrigger = await createTestTrigger(otherApp, otherSandbox.sandboxId);

    const res = await jsonGet(app, `/v1/executions/by-trigger/${otherTrigger.triggerId}`);
    expect(res.status).toBe(404);
  });
});
