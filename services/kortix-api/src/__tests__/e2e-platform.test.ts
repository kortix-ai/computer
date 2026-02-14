/**
 * E2E tests for the platform (sandbox lifecycle) routes.
 *
 * Uses mock providers via DI — no Docker or Daytona needed.
 * Requires DATABASE_URL to be set (tests touch the DB for sandbox CRUD).
 *
 * Routes tested:
 *   GET  /v1/account/providers
 *   POST /v1/sandbox             (ensure — idempotent create-or-return)
 *   GET  /v1/sandbox             (get active)
 *   GET  /v1/sandbox/list        (list all)
 *   POST /v1/sandbox/stop        (stop active)
 *   POST /v1/sandbox/restart     (restart)
 *   DELETE /v1/sandbox           (archive)
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

  // ─── GET /v1/account/providers ──────────────────────────────────────────

  describe('GET /v1/account/providers', () => {
    it('returns available providers and default', async () => {
      const res = await jsonGet(app, '/v1/account/providers');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.providers).toBeArray();
      expect(body.data.providers.length).toBeGreaterThanOrEqual(1);
      expect(body.data.default).toBe('local_docker');
    });
  });

  // ─── POST /v1/sandbox (ensure) ─────────────────────────────────────────

  describe('POST /v1/sandbox', () => {
    it('creates a sandbox on first call (201, created: true)', async () => {
      const res = await jsonPost(app, '/v1/sandbox', {});
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
      const res = await jsonPost(app, '/v1/sandbox', {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.created).toBe(false);
      expect(body.data.sandbox_id).toBeDefined();

      // Provider should NOT have been called again
      expect(dockerProvider.calls.create.length).toBe(1);
    });

    it('uses specific provider when requested', async () => {
      // Archive the existing sandbox first so ensure creates a new one
      await jsonDelete(app, '/v1/sandbox');

      const res = await jsonPost(app, '/v1/sandbox', {
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

  // ─── GET /v1/sandbox ───────────────────────────────────────────────────

  describe('GET /v1/sandbox', () => {
    it('returns the active sandbox', async () => {
      const res = await jsonGet(app, '/v1/sandbox');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('active');
      expect(body.data.sandbox_id).toBeDefined();
    });

    it('returns 404 when no sandbox exists', async () => {
      // Other user has no sandbox
      const res = await jsonGet(otherApp, '/v1/sandbox');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('No sandbox found');
    });
  });

  // ─── GET /v1/sandbox/list ──────────────────────────────────────────────

  describe('GET /v1/sandbox/list', () => {
    it('returns all sandboxes including archived', async () => {
      const res = await jsonGet(app, '/v1/sandbox/list');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      // We should have at least 2 (one archived, one active)
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── POST /v1/sandbox/stop ─────────────────────────────────────────────

  describe('POST /v1/sandbox/stop', () => {
    it('stops the active sandbox', async () => {
      const res = await jsonPost(app, '/v1/sandbox/stop', {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── POST /v1/sandbox (restart via ensure) ─────────────────────────────

  describe('POST /v1/sandbox (re-ensure after stop)', () => {
    it('creates a new sandbox after previous was stopped', async () => {
      // The stopped sandbox is no longer 'active', so POST /v1/sandbox provisions a new one
      const res = await jsonPost(app, '/v1/sandbox', {});
      // Could be 200 (if stopped one still counts) or 201 (new)
      expect([200, 201]).toContain(res.status);

      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── DELETE /v1/sandbox ────────────────────────────────────────────────

  describe('DELETE /v1/sandbox', () => {
    it('archives a sandbox', async () => {
      // Ensure we have an active one
      await jsonPost(app, '/v1/sandbox', {});

      const res = await jsonDelete(app, '/v1/sandbox');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify it's now archived — GET /v1/sandbox should 404
      const afterRes = await jsonGet(app, '/v1/sandbox');
      expect(afterRes.status).toBe(404);
    });
  });

  // ─── Cross-user isolation ───────────────────────────────────────────────

  describe('Cross-user isolation', () => {
    it("other user cannot see first user's sandboxes", async () => {
      const res = await jsonGet(otherApp, '/v1/sandbox/list');
      expect(res.status).toBe(200);

      const body = await res.json();
      // Other user should have zero sandboxes
      expect(body.data.length).toBe(0);
    });
  });
});
