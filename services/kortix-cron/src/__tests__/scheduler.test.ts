/**
 * Tests for the scheduler tick logic and executor.
 * Uses real DB for integration, but mocks the OpenCode HTTP calls.
 */
import { describe, test, expect, beforeEach, afterAll, mock, spyOn } from 'bun:test';
import { eq, and, desc } from 'drizzle-orm';
import { triggers, sandboxes, executions } from '@kortix/db';
import { cleanupTestData, getTestDb, TEST_USER_ID } from './helpers';

// We'll test processTrigger directly
import { processTrigger } from '../scheduler/executor';

const db = getTestDb();

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

async function createSandboxDirect(overrides: Record<string, unknown> = {}) {
  const [sandbox] = await db
    .insert(sandboxes)
    .values({
      accountId: TEST_USER_ID,
      name: 'Test Sandbox',
      baseUrl: 'http://localhost:9999',
      authToken: 'test-token',
      status: 'active',
      ...overrides,
    })
    .returning();
  return sandbox;
}

async function createTriggerDirect(sandboxId: string, overrides: Record<string, unknown> = {}) {
  const [trigger] = await db
    .insert(triggers)
    .values({
      sandboxId,
      accountId: TEST_USER_ID,
      name: 'Test Trigger',
      cronExpr: '0 */5 * * * *',
      prompt: 'Run the test',
      isActive: true,
      nextRunAt: new Date(Date.now() - 60_000), // due 1 min ago
      ...overrides,
    })
    .returning();
  return trigger;
}

describe('processTrigger', () => {
  test('skips trigger when sandbox not found', async () => {
    const sandbox = await createSandboxDirect();
    const trigger = await createTriggerDirect(sandbox.sandboxId);

    // Delete the sandbox to simulate "not found"
    await db.delete(sandboxes).where(eq(sandboxes.sandboxId, sandbox.sandboxId));

    await processTrigger(trigger);

    // Should not have created any execution
    const execs = await db.select().from(executions).where(eq(executions.triggerId, trigger.triggerId));
    expect(execs.length).toBe(0);
  });

  test('creates skipped execution when sandbox is not active', async () => {
    const sandbox = await createSandboxDirect({ status: 'stopped' });
    const trigger = await createTriggerDirect(sandbox.sandboxId);

    await processTrigger(trigger);

    const execs = await db.select().from(executions).where(eq(executions.triggerId, trigger.triggerId));
    expect(execs.length).toBe(1);
    expect(execs[0].status).toBe('skipped');
    expect(execs[0].errorMessage).toContain('stopped');

    // Should still advance nextRunAt
    const [updatedTrigger] = await db.select().from(triggers).where(eq(triggers.triggerId, trigger.triggerId));
    expect(updatedTrigger.lastRunAt).toBeDefined();
    expect(updatedTrigger.nextRunAt).toBeDefined();
    // Next run should be in the future
    expect(new Date(updatedTrigger.nextRunAt!).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  test('creates execution and updates trigger on successful run', async () => {
    const sandbox = await createSandboxDirect();
    const trigger = await createTriggerDirect(sandbox.sandboxId);

    // Mock global fetch to simulate a successful OpenCode interaction
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: any, opts: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/session') && opts?.method === 'POST' && !urlStr.includes('/prompt')) {
        // Create session
        return new Response(JSON.stringify({ id: 'sess-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/prompt')) {
        // Send prompt
        return new Response(JSON.stringify({ result: 'Task completed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      await processTrigger(trigger);

      // Check execution was created and completed
      const execs = await db
        .select()
        .from(executions)
        .where(eq(executions.triggerId, trigger.triggerId))
        .orderBy(desc(executions.createdAt));

      expect(execs.length).toBe(1);
      expect(execs[0].status).toBe('completed');
      expect(execs[0].sessionId).toBe('sess-123');
      expect(execs[0].durationMs).toBeGreaterThanOrEqual(0);

      // Check trigger was updated
      const [updatedTrigger] = await db.select().from(triggers).where(eq(triggers.triggerId, trigger.triggerId));
      expect(updatedTrigger.lastRunAt).toBeDefined();
      expect(updatedTrigger.nextRunAt).toBeDefined();

      // Check sandbox lastUsedAt was updated
      const [updatedSandbox] = await db.select().from(sandboxes).where(eq(sandboxes.sandboxId, sandbox.sandboxId));
      expect(updatedSandbox.lastUsedAt).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('records failed execution when OpenCode returns error', async () => {
    const sandbox = await createSandboxDirect();
    const trigger = await createTriggerDirect(sandbox.sandboxId, { maxRetries: 0 });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response('Internal Server Error', { status: 500 });
    }) as any;

    try {
      await processTrigger(trigger);

      const execs = await db.select().from(executions).where(eq(executions.triggerId, trigger.triggerId));
      expect(execs.length).toBe(1);
      expect(execs[0].status).toBe('failed');
      expect(execs[0].errorMessage).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('retries failed execution up to maxRetries', async () => {
    const sandbox = await createSandboxDirect();
    const trigger = await createTriggerDirect(sandbox.sandboxId, { maxRetries: 2 });

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: any, opts: any) => {
      callCount++;
      // All attempts fail
      return new Response('Service Unavailable', { status: 503 });
    }) as any;

    try {
      await processTrigger(trigger);

      const execs = await db
        .select()
        .from(executions)
        .where(eq(executions.triggerId, trigger.triggerId))
        .orderBy(desc(executions.createdAt));

      // Original + 2 retries = 3 executions
      expect(execs.length).toBe(3);

      // All should be failed
      expect(execs.every((e) => e.status === 'failed')).toBe(true);

      // Retry counts should be 0, 1, 2 (ordered desc by createdAt, so reversed)
      const retryCounts = execs.map((e) => e.retryCount).sort();
      expect(retryCounts).toEqual([0, 1, 2]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('retry succeeds on second attempt', async () => {
    const sandbox = await createSandboxDirect();
    const trigger = await createTriggerDirect(sandbox.sandboxId, { maxRetries: 3 });

    let sessionCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: any, opts: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('/session') && opts?.method === 'POST' && !urlStr.includes('/prompt')) {
        sessionCallCount++;
        if (sessionCallCount <= 1) {
          // First attempt fails
          return new Response('Service Unavailable', { status: 503 });
        }
        // Retry succeeds
        return new Response(JSON.stringify({ id: 'sess-retry-ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/prompt')) {
        return new Response(JSON.stringify({ result: 'Retried OK' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    try {
      await processTrigger(trigger);

      const execs = await db
        .select()
        .from(executions)
        .where(eq(executions.triggerId, trigger.triggerId))
        .orderBy(desc(executions.createdAt));

      // First attempt failed, retry succeeded = 2 executions
      expect(execs.length).toBe(2);

      const statuses = execs.map((e) => e.status).sort();
      expect(statuses).toEqual(['completed', 'failed']);

      // The completed one should have retryCount=1
      const completed = execs.find((e) => e.status === 'completed');
      expect(completed!.retryCount).toBe(1);
      expect(completed!.sessionId).toBe('sess-retry-ok');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
