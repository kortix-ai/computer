/**
 * E2E tests for the platform (sandbox lifecycle) routes.
 *
 * Uses mock providers via DI — no Docker or Daytona needed.
 * Requires DATABASE_URL to be set (tests touch the DB for sandbox CRUD).
 *
 * Routes tested:
 *   GET    /v1/platform/providers
 *   POST   /v1/platform/init              (ensure — idempotent create-or-return)
 *   GET    /v1/platform/sandbox           (get active)
 *   GET    /v1/platform/sandboxes         (list all)
 *   POST   /v1/platform/sandbox/:id/stop  (stop)
 *   POST   /v1/platform/sandbox/:id/start (start)
 *   DELETE /v1/platform/sandbox/:id       (archive)
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  createTestApp,
  createMockProvider,
  cleanupTestData,
  jsonPost,
  jsonGet,
  jsonDelete,
  TEST_USER_ID,
  OTHER_USER_ID,
  OTHER_USER_EMAIL,
} from './helpers';

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)('Platform — Sandbox Lifecycle', () => {
  const dockerProvider = createMockProvider('local_docker');
  const daytonaProvider = createMockProvider('daytona');

  const app = createTestApp({
    dockerProvider,
    daytonaProvider,
    defaultProvider: 'local_docker',
    mountCron: false,
  });

  // Separate app for cross-user isolation tests
  const otherApp = createTestApp({
    userId: OTHER_USER_ID,
    userEmail: OTHER_USER_EMAIL,
    dockerProvider: createMockProvider('local_docker'),
    daytonaProvider: createMockProvider('daytona'),
    defaultProvider: 'local_docker',
    mountCron: false,
  });

  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ─── GET /v1/platform/providers ──────────────────────────────────────────

  describe('GET /v1/platform/providers', () => {
    it('returns available providers and default', async () => {
      const res = await jsonGet(app, '/v1/platform/providers');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.providers).toBeArray();
      expect(body.data.providers.length).toBeGreaterThanOrEqual(1);
      expect(body.data.default).toBe('local_docker');
    });
  });

  // ─── POST /v1/platform/init ──────────────────────────────────────────────

  describe('POST /v1/platform/init', () => {
    it('creates a sandbox on first call (201, created: true)', async () => {
      const res = await jsonPost(app, '/v1/platform/init', {});
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.created).toBe(true);
      expect(body.data.sandbox_id).toBeDefined();
      expect(body.data.provider).toBe('local_docker');
      expect(body.data.status).toBe('active');
      expect(body.data.base_url).toBeDefined();

      // Provider should have been called
      expect(dockerProvider.calls.create.length).toBe(1);
    });

    it('returns existing sandbox on second call (200, created: false)', async () => {
      const res = await jsonPost(app, '/v1/platform/init', {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.created).toBe(false);
      expect(body.data.sandbox_id).toBeDefined();

      // Provider should NOT have been called again
      expect(dockerProvider.calls.create.length).toBe(1);
    });

    it('uses specific provider when requested', async () => {
      // Archive the existing sandbox first so init creates a new one
      const listRes = await jsonGet(app, '/v1/platform/sandboxes');
      const listBody = await listRes.json();
      const sandboxId = listBody.data[0].sandbox_id;
      await jsonDelete(app, `/v1/platform/sandbox/${sandboxId}`);

      const res = await jsonPost(app, '/v1/platform/init', {
        provider: 'daytona',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.created).toBe(true);
      expect(body.data.provider).toBe('daytona');
      expect(daytonaProvider.calls.create.length).toBe(1);
    });
  });

  // ─── GET /v1/platform/sandbox ────────────────────────────────────────────

  describe('GET /v1/platform/sandbox', () => {
    it('returns the active sandbox', async () => {
      const res = await jsonGet(app, '/v1/platform/sandbox');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('active');
      expect(body.data.sandbox_id).toBeDefined();
    });

    it('returns 404 when no sandbox exists', async () => {
      // Other user has no sandbox
      const res = await jsonGet(otherApp, '/v1/platform/sandbox');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('No sandbox found');
    });
  });

  // ─── GET /v1/platform/sandboxes ──────────────────────────────────────────

  describe('GET /v1/platform/sandboxes', () => {
    it('returns all sandboxes including archived', async () => {
      const res = await jsonGet(app, '/v1/platform/sandboxes');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      // We should have at least 2 (one archived, one active)
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── POST /v1/platform/sandbox/:id/stop ──────────────────────────────────

  describe('POST /v1/platform/sandbox/:id/stop', () => {
    it('stops a running sandbox', async () => {
      // Get the current active sandbox
      const getRes = await jsonGet(app, '/v1/platform/sandbox');
      const getBody = await getRes.json();
      const sandboxId = getBody.data.sandbox_id;

      const res = await jsonPost(
        app,
        `/v1/platform/sandbox/${sandboxId}/stop`,
        {},
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── POST /v1/platform/sandbox/:id/start ─────────────────────────────────

  describe('POST /v1/platform/sandbox/:id/start', () => {
    it('starts a stopped sandbox', async () => {
      // Get the sandboxes — find one that's not archived
      const listRes = await jsonGet(app, '/v1/platform/sandboxes');
      const listBody = await listRes.json();
      const stopped = listBody.data.find(
        (s: any) => s.status === 'stopped',
      );
      expect(stopped).toBeDefined();

      const res = await jsonPost(
        app,
        `/v1/platform/sandbox/${stopped.sandbox_id}/start`,
        {},
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── DELETE /v1/platform/sandbox/:id ─────────────────────────────────────

  describe('DELETE /v1/platform/sandbox/:id', () => {
    it('archives a sandbox', async () => {
      const getRes = await jsonGet(app, '/v1/platform/sandbox');
      const getBody = await getRes.json();
      const sandboxId = getBody.data.sandbox_id;

      const res = await jsonDelete(
        app,
        `/v1/platform/sandbox/${sandboxId}`,
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify it's now archived — GET /sandbox should 404
      const afterRes = await jsonGet(app, '/v1/platform/sandbox');
      expect(afterRes.status).toBe(404);
    });
  });

  // ─── Cross-user isolation ───────────────────────────────────────────────

  describe('Cross-user isolation', () => {
    it("other user cannot see first user's sandboxes", async () => {
      const res = await jsonGet(otherApp, '/v1/platform/sandboxes');
      expect(res.status).toBe(200);

      const body = await res.json();
      // Other user should have zero sandboxes
      expect(body.data.length).toBe(0);
    });

    it("other user cannot start first user's sandbox", async () => {
      // Get test user's sandboxes directly
      const listRes = await jsonGet(app, '/v1/platform/sandboxes');
      const listBody = await listRes.json();
      const sandbox = listBody.data[0];

      const res = await jsonPost(
        otherApp,
        `/v1/platform/sandbox/${sandbox.sandbox_id}/start`,
        {},
      );
      expect(res.status).toBe(404);
    });

    it("other user cannot delete first user's sandbox", async () => {
      const listRes = await jsonGet(app, '/v1/platform/sandboxes');
      const listBody = await listRes.json();
      const sandbox = listBody.data[0];

      const res = await jsonDelete(
        otherApp,
        `/v1/platform/sandbox/${sandbox.sandbox_id}`,
      );
      expect(res.status).toBe(404);
    });
  });
});
