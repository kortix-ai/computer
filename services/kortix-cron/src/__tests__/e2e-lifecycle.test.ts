/**
 * End-to-end lifecycle test:
 *
 * 1. Register a sandbox
 * 2. Create a cron trigger pointing at it
 * 3. Fire the trigger manually via API
 * 4. Verify execution was recorded
 * 5. Pause the trigger
 * 6. Resume the trigger
 * 7. Verify trigger state transitions
 * 8. Update the trigger
 * 9. Delete trigger (cascades executions)
 * 10. Delete sandbox
 */
import { describe, test, expect, beforeEach, afterAll, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { executions } from '@kortix/db';
import {
  createTestApp,
  cleanupTestData,
  getTestDb,
  jsonPost,
  jsonGet,
  jsonPatch,
  jsonDelete,
} from './helpers';

const app = createTestApp();
const db = getTestDb();

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe('E2E: Full trigger lifecycle', () => {
  test('complete lifecycle from creation to deletion', async () => {
    // ── Step 1: Register sandbox ────────────────────────────────────────
    const sandboxRes = await jsonPost(app, '/v1/sandboxes', {
      name: 'E2E Sandbox',
      base_url: 'http://localhost:9999',
      auth_token: 'e2e-token',
      status: 'active',
      metadata: { env: 'test' },
    });
    expect(sandboxRes.status).toBe(201);
    const sandbox = ((await sandboxRes.json()) as any).data;
    expect(sandbox.sandboxId).toBeDefined();

    // ── Step 2: Create cron trigger ─────────────────────────────────────
    const triggerRes = await jsonPost(app, '/v1/triggers', {
      sandbox_id: sandbox.sandboxId,
      name: 'E2E Trigger',
      cron_expr: '0 0 * * * *', // every hour
      prompt: 'Run E2E task',
      timezone: 'UTC',
      max_retries: 1,
      timeout_ms: 30000,
      session_mode: 'new',
      metadata: { test: true },
    });
    expect(triggerRes.status).toBe(201);
    const trigger = ((await triggerRes.json()) as any).data;
    expect(trigger.triggerId).toBeDefined();
    expect(trigger.isActive).toBe(true);
    expect(trigger.nextRunAt).toBeDefined();

    // ── Step 3: Mock OpenCode and fire trigger manually ─────────────────
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: any, opts: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/session') && opts?.method === 'POST' && !urlStr.includes('/prompt')) {
        return new Response(JSON.stringify({ id: 'e2e-session-001' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/prompt')) {
        return new Response(JSON.stringify({ result: 'E2E task completed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    let runExecutionId: string;
    try {
      const runRes = await jsonPost(app, `/v1/triggers/${trigger.triggerId}/run`, {});
      expect(runRes.status).toBe(200);
      const runJson = (await runRes.json()) as any;
      runExecutionId = runJson.data.execution_id;
      expect(runExecutionId).toBeDefined();
      expect(runJson.data.status).toBe('running');

      // Give async execution time to complete
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      globalThis.fetch = originalFetch;
    }

    // ── Step 4: Verify execution was recorded ───────────────────────────
    const execsRes = await jsonGet(app, `/v1/executions/by-trigger/${trigger.triggerId}`);
    expect(execsRes.status).toBe(200);
    const execsJson = (await execsRes.json()) as any;
    expect(execsJson.data.length).toBe(1);
    const execution = execsJson.data[0];
    expect(execution.status).toBe('completed');
    expect(execution.sessionId).toBe('e2e-session-001');
    expect(execution.durationMs).toBeGreaterThanOrEqual(0);

    // Verify via executions/:id endpoint too
    const execDetailRes = await jsonGet(app, `/v1/executions/${execution.executionId}`);
    expect(execDetailRes.status).toBe(200);
    const execDetail = ((await execDetailRes.json()) as any).data;
    expect(execDetail.trigger_name).toBe('E2E Trigger');
    expect(execDetail.trigger_prompt).toBe('Run E2E task');

    // ── Step 5: Pause trigger ──────────────────────────────────────────
    const pauseRes = await jsonPost(app, `/v1/triggers/${trigger.triggerId}/pause`, {});
    expect(pauseRes.status).toBe(200);
    const paused = ((await pauseRes.json()) as any).data;
    expect(paused.isActive).toBe(false);

    // ── Step 6: Resume trigger ──────────────────────────────────────────
    const resumeRes = await jsonPost(app, `/v1/triggers/${trigger.triggerId}/resume`, {});
    expect(resumeRes.status).toBe(200);
    const resumed = ((await resumeRes.json()) as any).data;
    expect(resumed.isActive).toBe(true);
    expect(resumed.nextRunAt).toBeDefined();

    // ── Step 7: Verify state transitions ────────────────────────────────
    const triggerDetailRes = await jsonGet(app, `/v1/triggers/${trigger.triggerId}`);
    const triggerDetail = ((await triggerDetailRes.json()) as any).data;
    expect(triggerDetail.isActive).toBe(true);
    expect(triggerDetail.name).toBe('E2E Trigger');

    // ── Step 8: Update trigger ──────────────────────────────────────────
    const updateRes = await jsonPatch(app, `/v1/triggers/${trigger.triggerId}`, {
      name: 'Updated E2E Trigger',
      prompt: 'Updated prompt',
      cron_expr: '0 */30 * * * *', // change to every 30 min
      max_retries: 5,
    });
    expect(updateRes.status).toBe(200);
    const updated = ((await updateRes.json()) as any).data;
    expect(updated.name).toBe('Updated E2E Trigger');
    expect(updated.prompt).toBe('Updated prompt');
    expect(updated.cronExpr).toBe('0 */30 * * * *');
    expect(updated.maxRetries).toBe(5);

    // ── Step 9: Delete trigger (cascades executions) ─────────────────────
    const deleteTriggerRes = await jsonDelete(app, `/v1/triggers/${trigger.triggerId}`);
    expect(deleteTriggerRes.status).toBe(200);

    // Verify trigger is gone
    const getDeletedTrigger = await jsonGet(app, `/v1/triggers/${trigger.triggerId}`);
    expect(getDeletedTrigger.status).toBe(404);

    // Verify executions were cascade-deleted
    const orphanExecs = await db
      .select()
      .from(executions)
      .where(eq(executions.triggerId, trigger.triggerId));
    expect(orphanExecs.length).toBe(0);

    // ── Step 10: Delete sandbox ──────────────────────────────────────────
    const deleteSandboxRes = await jsonDelete(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(deleteSandboxRes.status).toBe(200);

    // Verify sandbox is gone
    const getDeletedSandbox = await jsonGet(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(getDeletedSandbox.status).toBe(404);
  }, 30000); // 30s timeout for E2E

  test('manual trigger run fails gracefully when sandbox is unreachable', async () => {
    const sandboxRes = await jsonPost(app, '/v1/sandboxes', {
      name: 'Unreachable Sandbox',
      base_url: 'http://localhost:1',
      status: 'active',
    });
    const sandbox = ((await sandboxRes.json()) as any).data;

    const triggerRes = await jsonPost(app, '/v1/triggers', {
      sandbox_id: sandbox.sandboxId,
      name: 'Fail Trigger',
      cron_expr: '0 0 * * * *',
      prompt: 'This will fail',
    });
    const trigger = ((await triggerRes.json()) as any).data;

    // Mock fetch to simulate network failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('Connection refused');
    }) as any;

    try {
      const runRes = await jsonPost(app, `/v1/triggers/${trigger.triggerId}/run`, {});
      expect(runRes.status).toBe(200);
      const runJson = (await runRes.json()) as any;
      expect(runJson.data.status).toBe('running');

      // Wait for async execution
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Check execution recorded as failed
    const execsRes = await jsonGet(app, `/v1/executions/by-trigger/${trigger.triggerId}`);
    const execsJson = (await execsRes.json()) as any;
    expect(execsJson.data.length).toBe(1);
    expect(execsJson.data[0].status).toBe('failed');
    expect(execsJson.data[0].errorMessage).toContain('Connection refused');
  }, 15000);
});

describe('E2E: Health check', () => {
  test('returns health status', async () => {
    const res = await jsonGet(app, '/health');
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.status).toBe('ok');
  });
});

describe('E2E: 404 handling', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await jsonGet(app, '/v1/nonexistent');
    expect(res.status).toBe(404);
  });
});
