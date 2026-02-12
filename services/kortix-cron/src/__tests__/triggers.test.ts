/**
 * Integration tests for trigger routes.
 * Tests CRUD, pause/resume, and validation against real DB.
 */
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import {
  createTestApp,
  cleanupTestData,
  jsonPost,
  jsonGet,
  jsonPatch,
  jsonDelete,
  createTestSandbox,
  createTestTrigger,
  TEST_USER_ID,
  OTHER_USER_ID,
} from './helpers';

const app = createTestApp();
const otherApp = createTestApp(OTHER_USER_ID);

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe('POST /v1/triggers', () => {
  test('creates a trigger with valid data', async () => {
    const sandbox = await createTestSandbox(app);

    const res = await jsonPost(app, '/v1/triggers', {
      sandbox_id: sandbox.sandboxId,
      name: 'Every 5 Minutes',
      cron_expr: '0 */5 * * * *',
      prompt: 'Run daily check',
      timezone: 'America/New_York',
      max_retries: 3,
      timeout_ms: 60000,
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Every 5 Minutes');
    expect(json.data.cronExpr).toBe('0 */5 * * * *');
    expect(json.data.prompt).toBe('Run daily check');
    expect(json.data.timezone).toBe('America/New_York');
    expect(json.data.maxRetries).toBe(3);
    expect(json.data.timeoutMs).toBe(60000);
    expect(json.data.isActive).toBe(true);
    expect(json.data.sessionMode).toBe('new');
    expect(json.data.nextRunAt).toBeDefined();
    expect(json.data.accountId).toBe(TEST_USER_ID);
  });

  test('creates trigger with defaults', async () => {
    const sandbox = await createTestSandbox(app);

    const res = await jsonPost(app, '/v1/triggers', {
      sandbox_id: sandbox.sandboxId,
      name: 'Default Trigger',
      cron_expr: '0 0 * * * *',
      prompt: 'Do something',
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.data.timezone).toBe('UTC');
    expect(json.data.maxRetries).toBe(0);
    expect(json.data.timeoutMs).toBe(300000);
    expect(json.data.sessionMode).toBe('new');
  });

  test('rejects invalid cron expression', async () => {
    const sandbox = await createTestSandbox(app);

    const res = await jsonPost(app, '/v1/triggers', {
      sandbox_id: sandbox.sandboxId,
      name: 'Bad Cron',
      cron_expr: 'not a cron',
      prompt: 'fail',
    });

    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toContain('Invalid cron expression');
  });

  test('rejects non-existent sandbox', async () => {
    const res = await jsonPost(app, '/v1/triggers', {
      sandbox_id: '00000000-0000-4000-a000-999999999999',
      name: 'Orphan Trigger',
      cron_expr: '0 0 * * * *',
      prompt: 'fail',
    });

    expect(res.status).toBe(404);
  });

  test('rejects another users sandbox', async () => {
    const sandbox = await createTestSandbox(otherApp);

    const res = await jsonPost(app, '/v1/triggers', {
      sandbox_id: sandbox.sandboxId,
      name: 'Cross-User Trigger',
      cron_expr: '0 0 * * * *',
      prompt: 'should fail',
    });

    expect(res.status).toBe(404);
  });

  test('rejects missing required fields', async () => {
    const res = await jsonPost(app, '/v1/triggers', {});
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/triggers', () => {
  test('lists triggers for the authenticated user', async () => {
    const sandbox = await createTestSandbox(app);
    await createTestTrigger(app, sandbox.sandboxId, { name: 'Trigger A' });
    await createTestTrigger(app, sandbox.sandboxId, { name: 'Trigger B' });

    const res = await jsonGet(app, '/v1/triggers');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.length).toBe(2);
  });

  test('filters by sandbox_id', async () => {
    const sandbox1 = await createTestSandbox(app, { name: 'S1' });
    const sandbox2 = await createTestSandbox(app, { name: 'S2' });
    await createTestTrigger(app, sandbox1.sandboxId);
    await createTestTrigger(app, sandbox2.sandboxId);

    const res = await jsonGet(app, `/v1/triggers?sandbox_id=${sandbox1.sandboxId}`);
    const json = await res.json() as any;
    expect(json.data.length).toBe(1);
    expect(json.data[0].sandboxId).toBe(sandbox1.sandboxId);
  });

  test('filters by active status', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    // Pause the trigger
    await jsonPost(app, `/v1/triggers/${trigger.triggerId}/pause`, {});

    const activeRes = await jsonGet(app, '/v1/triggers?active=true');
    const activeJson = await activeRes.json() as any;
    expect(activeJson.data.length).toBe(0);

    const inactiveRes = await jsonGet(app, '/v1/triggers?active=false');
    const inactiveJson = await inactiveRes.json() as any;
    expect(inactiveJson.data.length).toBe(1);
  });
});

describe('GET /v1/triggers/:id', () => {
  test('returns trigger by ID', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId, { name: 'Find Me' });

    const res = await jsonGet(app, `/v1/triggers/${trigger.triggerId}`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.name).toBe('Find Me');
  });

  test('returns 404 for non-existent trigger', async () => {
    const res = await jsonGet(app, '/v1/triggers/00000000-0000-4000-a000-999999999999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/triggers/:id', () => {
  test('updates trigger fields', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    const res = await jsonPatch(app, `/v1/triggers/${trigger.triggerId}`, {
      name: 'Updated Name',
      prompt: 'New prompt',
      max_retries: 5,
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.name).toBe('Updated Name');
    expect(json.data.prompt).toBe('New prompt');
    expect(json.data.maxRetries).toBe(5);
  });

  test('recomputes nextRunAt when cron changes', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId, { cron_expr: '0 0 * * * *' });
    const originalNextRun = trigger.nextRunAt;

    const res = await jsonPatch(app, `/v1/triggers/${trigger.triggerId}`, {
      cron_expr: '0 */1 * * * *', // every minute instead of every hour
    });

    const json = await res.json() as any;
    // Next run should be sooner now
    expect(new Date(json.data.nextRunAt).getTime()).toBeLessThanOrEqual(
      new Date(originalNextRun).getTime(),
    );
  });

  test('rejects invalid cron on update', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    const res = await jsonPatch(app, `/v1/triggers/${trigger.triggerId}`, {
      cron_expr: 'garbage',
    });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /v1/triggers/:id', () => {
  test('deletes a trigger', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    const res = await jsonDelete(app, `/v1/triggers/${trigger.triggerId}`);
    expect(res.status).toBe(200);

    const getRes = await jsonGet(app, `/v1/triggers/${trigger.triggerId}`);
    expect(getRes.status).toBe(404);
  });

  test('cascade deletes when sandbox is deleted', async () => {
    const sandbox = await createTestSandbox(app);
    await createTestTrigger(app, sandbox.sandboxId);

    await jsonDelete(app, `/v1/sandboxes/${sandbox.sandboxId}`);

    const res = await jsonGet(app, '/v1/triggers');
    const json = await res.json() as any;
    expect(json.data.length).toBe(0);
  });
});

describe('POST /v1/triggers/:id/pause', () => {
  test('pauses an active trigger', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    const res = await jsonPost(app, `/v1/triggers/${trigger.triggerId}/pause`, {});
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.isActive).toBe(false);
  });

  test('returns 404 for non-existent trigger', async () => {
    const res = await jsonPost(app, '/v1/triggers/00000000-0000-4000-a000-999999999999/pause', {});
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/triggers/:id/resume', () => {
  test('resumes a paused trigger and recomputes nextRunAt', async () => {
    const sandbox = await createTestSandbox(app);
    const trigger = await createTestTrigger(app, sandbox.sandboxId);

    // Pause
    await jsonPost(app, `/v1/triggers/${trigger.triggerId}/pause`, {});

    // Resume
    const res = await jsonPost(app, `/v1/triggers/${trigger.triggerId}/resume`, {});
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.isActive).toBe(true);
    expect(json.data.nextRunAt).toBeDefined();
  });
});
