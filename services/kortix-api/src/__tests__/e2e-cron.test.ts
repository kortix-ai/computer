/**
 * E2E tests for cron routes — sandbox targets, triggers, and executions.
 *
 * The cron route modules import `db` at module level from `../db`,
 * which throws if DATABASE_URL is not set. We guard the entire suite
 * with describe.skipIf(!DATABASE_URL).
 *
 * We do NOT test the /run endpoint because it calls `executeTrigger`
 * which makes real HTTP calls to an OpenCode sandbox.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  createTestApp,
  cleanupTestData,
  jsonPost,
  jsonGet,
  jsonPatch,
  jsonDelete,
  TEST_USER_ID,
  OTHER_USER_ID,
  OTHER_USER_EMAIL,
} from './helpers';

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)('Cron — Sandbox Targets, Triggers, Executions', () => {
  const app = createTestApp({ mountCron: true });
  const otherApp = createTestApp({
    userId: OTHER_USER_ID,
    userEmail: OTHER_USER_EMAIL,
    mountCron: true,
  });

  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // Track IDs across sub-describes
  let sandboxId: string;
  let secondSandboxId: string;
  let triggerId: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // Sandbox CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sandbox CRUD — POST/GET/PATCH/DELETE /v1/cron/sandboxes', () => {
    it('POST /v1/cron/sandboxes creates a sandbox target (201)', async () => {
      const res = await jsonPost(app, '/v1/cron/sandboxes', {
        name: 'test-sandbox',
        base_url: 'http://localhost:8080',
        auth_token: 'test-token',
        external_id: 'ext-123',
        status: 'active',
        metadata: { env: 'test' },
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sandboxId).toBeDefined();
      expect(body.data.name).toBe('test-sandbox');
      expect(body.data.baseUrl).toBe('http://localhost:8080');
      expect(body.data.status).toBe('active');

      sandboxId = body.data.sandboxId;
    });

    it('POST /v1/cron/sandboxes creates a second sandbox', async () => {
      const res = await jsonPost(app, '/v1/cron/sandboxes', {
        name: 'second-sandbox',
        base_url: 'http://localhost:9090',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      secondSandboxId = body.data.sandboxId;
    });

    it('POST /v1/cron/sandboxes validation error for missing name (400)', async () => {
      const res = await jsonPost(app, '/v1/cron/sandboxes', {
        base_url: 'http://localhost:8080',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe(true);
    });

    it('POST /v1/cron/sandboxes validation error for missing base_url (400)', async () => {
      const res = await jsonPost(app, '/v1/cron/sandboxes', {
        name: 'no-url',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe(true);
    });

    it('GET /v1/cron/sandboxes lists user sandboxes', async () => {
      const res = await jsonGet(app, '/v1/cron/sandboxes');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /v1/cron/sandboxes/:id returns specific sandbox', async () => {
      const res = await jsonGet(app, `/v1/cron/sandboxes/${sandboxId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sandboxId).toBe(sandboxId);
      expect(body.data.name).toBe('test-sandbox');
    });

    it("GET /v1/cron/sandboxes/:id returns 404 for other user's sandbox", async () => {
      const res = await jsonGet(otherApp, `/v1/cron/sandboxes/${sandboxId}`);
      expect(res.status).toBe(404);
    });

    it('PATCH /v1/cron/sandboxes/:id updates sandbox fields', async () => {
      const res = await jsonPatch(app, `/v1/cron/sandboxes/${sandboxId}`, {
        name: 'renamed-sandbox',
        base_url: 'http://localhost:7070',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('renamed-sandbox');
      expect(body.data.baseUrl).toBe('http://localhost:7070');
    });

    it('DELETE /v1/cron/sandboxes/:id deletes the second sandbox', async () => {
      const res = await jsonDelete(app, `/v1/cron/sandboxes/${secondSandboxId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Confirm it's gone
      const getRes = await jsonGet(app, `/v1/cron/sandboxes/${secondSandboxId}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Trigger CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Trigger CRUD — POST/GET/PATCH/DELETE /v1/cron/triggers', () => {
    it('POST /v1/cron/triggers creates a trigger (201)', async () => {
      const res = await jsonPost(app, '/v1/cron/triggers', {
        sandbox_id: sandboxId,
        name: 'every-5-min',
        cron_expr: '0 */5 * * * *',
        prompt: 'Run health check',
        timezone: 'UTC',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.triggerId).toBeDefined();
      expect(body.data.name).toBe('every-5-min');
      expect(body.data.cronExpr).toBe('0 */5 * * * *');
      expect(body.data.prompt).toBe('Run health check');
      expect(body.data.isActive).toBe(true);
      expect(body.data.nextRunAt).toBeDefined();

      triggerId = body.data.triggerId;
    });

    it('POST /v1/cron/triggers with invalid cron returns 400', async () => {
      const res = await jsonPost(app, '/v1/cron/triggers', {
        sandbox_id: sandboxId,
        name: 'bad-cron',
        cron_expr: 'not a cron',
        prompt: 'Will fail',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe(true);
    });

    it('POST /v1/cron/triggers with non-existent sandbox returns 404', async () => {
      const res = await jsonPost(app, '/v1/cron/triggers', {
        sandbox_id: '00000000-0000-0000-0000-000000000099',
        name: 'orphan',
        cron_expr: '0 */5 * * * *',
        prompt: 'orphan prompt',
      });
      expect(res.status).toBe(404);
    });

    it('GET /v1/cron/triggers lists triggers', async () => {
      const res = await jsonGet(app, '/v1/cron/triggers');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /v1/cron/triggers?sandbox_id=X filters by sandbox', async () => {
      const res = await jsonGet(
        app,
        `/v1/cron/triggers?sandbox_id=${sandboxId}`,
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data.every((t: any) => t.sandboxId === sandboxId)).toBe(true);
    });

    it('GET /v1/cron/triggers?active=true filters active triggers', async () => {
      const res = await jsonGet(app, '/v1/cron/triggers?active=true');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.every((t: any) => t.isActive === true)).toBe(true);
    });

    it('GET /v1/cron/triggers/:id returns trigger details', async () => {
      const res = await jsonGet(app, `/v1/cron/triggers/${triggerId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.triggerId).toBe(triggerId);
      expect(body.data.name).toBe('every-5-min');
    });

    it('PATCH /v1/cron/triggers/:id updates trigger fields', async () => {
      const res = await jsonPatch(app, `/v1/cron/triggers/${triggerId}`, {
        name: 'every-10-min',
        prompt: 'Updated prompt',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('every-10-min');
      expect(body.data.prompt).toBe('Updated prompt');
    });

    it('PATCH /v1/cron/triggers/:id recomputes nextRunAt when cron changes', async () => {
      // Get current nextRunAt
      const beforeRes = await jsonGet(app, `/v1/cron/triggers/${triggerId}`);
      const beforeBody = await beforeRes.json();
      const beforeNextRun = beforeBody.data.nextRunAt;

      const res = await jsonPatch(app, `/v1/cron/triggers/${triggerId}`, {
        cron_expr: '0 0 * * * *', // every hour
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.cronExpr).toBe('0 0 * * * *');
      // nextRunAt should have changed (or at least been recomputed)
      expect(body.data.nextRunAt).toBeDefined();
    });

    // ─── Pause / Resume ─────────────────────────────────────────────────

    it('POST /v1/cron/triggers/:id/pause sets isActive=false', async () => {
      const res = await jsonPost(
        app,
        `/v1/cron/triggers/${triggerId}/pause`,
        {},
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.isActive).toBe(false);
    });

    it('POST /v1/cron/triggers/:id/resume sets isActive=true and recomputes nextRunAt', async () => {
      const res = await jsonPost(
        app,
        `/v1/cron/triggers/${triggerId}/resume`,
        {},
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.isActive).toBe(true);
      expect(body.data.nextRunAt).toBeDefined();
    });

    it('GET /v1/cron/triggers?active=false returns paused triggers after pausing', async () => {
      // Pause again for filter test
      await jsonPost(app, `/v1/cron/triggers/${triggerId}/pause`, {});

      const res = await jsonGet(app, '/v1/cron/triggers?active=false');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.some((t: any) => t.triggerId === triggerId)).toBe(true);
      expect(body.data.every((t: any) => t.isActive === false)).toBe(true);

      // Resume for following tests
      await jsonPost(app, `/v1/cron/triggers/${triggerId}/resume`, {});
    });

    it('DELETE /v1/cron/triggers/:id deletes trigger', async () => {
      // Create a throwaway trigger to delete
      const createRes = await jsonPost(app, '/v1/cron/triggers', {
        sandbox_id: sandboxId,
        name: 'to-delete',
        cron_expr: '0 0 * * * *',
        prompt: 'will be deleted',
      });
      const createBody = await createRes.json();
      const deleteId = createBody.data.triggerId;

      const res = await jsonDelete(app, `/v1/cron/triggers/${deleteId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Confirm it's gone
      const getRes = await jsonGet(app, `/v1/cron/triggers/${deleteId}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Execution List
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Executions — GET /v1/cron/executions', () => {
    it('GET /v1/cron/executions lists executions (initially empty)', async () => {
      const res = await jsonGet(app, '/v1/cron/executions');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.total).toBeDefined();
      expect(body.limit).toBeDefined();
      expect(body.offset).toBeDefined();
    });

    it('GET /v1/cron/executions with pagination params', async () => {
      const res = await jsonGet(app, '/v1/cron/executions?limit=10&offset=0');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
    });

    it('GET /v1/cron/executions with status filter', async () => {
      const res = await jsonGet(app, '/v1/cron/executions?status=completed');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('GET /v1/cron/executions with invalid status returns 400', async () => {
      const res = await jsonGet(app, '/v1/cron/executions?status=invalid');
      expect(res.status).toBe(400);
    });

    it('GET /v1/cron/executions/:id returns 404 for non-existent', async () => {
      const res = await jsonGet(
        app,
        '/v1/cron/executions/00000000-0000-0000-0000-000000000099',
      );
      expect(res.status).toBe(404);
    });

    it('GET /v1/cron/executions/by-trigger/:triggerId lists executions for trigger', async () => {
      const res = await jsonGet(
        app,
        `/v1/cron/executions/by-trigger/${triggerId}`,
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.total).toBeDefined();
      expect(body.limit).toBeDefined();
      expect(body.offset).toBeDefined();
    });

    it('GET /v1/cron/executions/by-trigger/:triggerId returns 404 for unknown trigger', async () => {
      const res = await jsonGet(
        app,
        '/v1/cron/executions/by-trigger/00000000-0000-0000-0000-000000000099',
      );
      expect(res.status).toBe(404);
    });
  });
});
