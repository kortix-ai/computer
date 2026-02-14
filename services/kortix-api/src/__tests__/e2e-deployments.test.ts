/**
 * E2E tests for deployment routes — CRUD, lifecycle, cross-user isolation.
 *
 * Requires DATABASE_URL to be set (tests touch the DB).
 * Sandbox calls will fail (mock sandbox URLs are unreachable) which is expected —
 * the deployment record will be created with status 'failed'.
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

describe.skipIf(!HAS_DB)('Deployments — CRUD & Lifecycle', () => {
  const dockerProvider = createMockProvider('local_docker');

  const app = createTestApp({
    dockerProvider,
    defaultProvider: 'local_docker',
    mountCron: false,
    mountDeployments: true,
  });

  const otherApp = createTestApp({
    userId: OTHER_USER_ID,
    userEmail: OTHER_USER_EMAIL,
    dockerProvider: createMockProvider('local_docker'),
    defaultProvider: 'local_docker',
    mountCron: false,
    mountDeployments: true,
  });

  let sandboxId: string;
  let deploymentId: string;

  beforeAll(async () => {
    await cleanupTestData();

    // Create a sandbox to deploy into (via platform routes)
    const res = await jsonPost(app, '/v1/platform/init', {});
    const body = await res.json();
    sandboxId = body.data.sandbox_id;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ─── POST /v1/deployments — Create ──────────────────────────────────────

  describe('POST /v1/deployments', () => {
    it('creates a deployment (status = failed because sandbox is mock)', async () => {
      const res = await jsonPost(app, '/v1/deployments', {
        sandbox_id: sandboxId,
        source_type: 'files',
        source_path: '/workspace',
        framework: 'static',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.deploymentId).toBeDefined();
      expect(body.data.accountId).toBe(TEST_USER_ID);
      expect(body.data.sandboxId).toBe(sandboxId);
      expect(body.data.sourceType).toBe('files');
      expect(body.data.framework).toBe('static');
      // Status will be 'failed' because sandbox URL is unreachable
      expect(['pending', 'building', 'failed']).toContain(body.data.status);

      deploymentId = body.data.deploymentId;
    });

    it('returns 400 on missing sandbox_id', async () => {
      const res = await jsonPost(app, '/v1/deployments', {
        source_type: 'files',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 on missing source_type', async () => {
      const res = await jsonPost(app, '/v1/deployments', {
        sandbox_id: sandboxId,
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 on invalid source_type', async () => {
      const res = await jsonPost(app, '/v1/deployments', {
        sandbox_id: sandboxId,
        source_type: 'invalid',
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 on non-existent sandbox_id', async () => {
      const res = await jsonPost(app, '/v1/deployments', {
        sandbox_id: '00000000-0000-0000-0000-000000000099',
        source_type: 'files',
      });
      expect(res.status).toBe(404);
    });

    it('creates deployment with all optional fields', async () => {
      const res = await jsonPost(app, '/v1/deployments', {
        sandbox_id: sandboxId,
        source_type: 'git',
        source_ref: 'https://github.com/example/app.git',
        source_path: '/workspace/myapp',
        framework: 'nextjs',
        domains: ['myapp.example.com'],
        env_var_keys: ['API_KEY', 'DATABASE_URL'],
        build_config: { nodeVersion: '20' },
        entrypoint: 'npm run start:prod',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data.sourceType).toBe('git');
      expect(body.data.sourceRef).toBe('https://github.com/example/app.git');
      expect(body.data.framework).toBe('nextjs');
      expect(body.data.entrypoint).toBe('npm run start:prod');
    });
  });

  // ─── GET /v1/deployments — List ─────────────────────────────────────────

  describe('GET /v1/deployments', () => {
    it('returns deployments for the user', async () => {
      const res = await jsonGet(app, '/v1/deployments');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      expect(body.total).toBeGreaterThanOrEqual(2);
      expect(body.limit).toBeDefined();
      expect(body.offset).toBeDefined();
    });

    it('supports pagination', async () => {
      const res = await jsonGet(app, '/v1/deployments?limit=1&offset=0');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.length).toBe(1);
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(0);
    });

    it('filters by sandbox_id', async () => {
      const res = await jsonGet(app, `/v1/deployments?sandbox_id=${sandboxId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.every((d: any) => d.sandboxId === sandboxId)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await jsonGet(app, '/v1/deployments?status=failed');
      expect(res.status).toBe(200);

      const body = await res.json();
      // All should be 'failed' (sandbox was unreachable)
      expect(body.data.every((d: any) => d.status === 'failed')).toBe(true);
    });
  });

  // ─── GET /v1/deployments/:id — Get ──────────────────────────────────────

  describe('GET /v1/deployments/:id', () => {
    it('returns deployment details', async () => {
      const res = await jsonGet(app, `/v1/deployments/${deploymentId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.deploymentId).toBe(deploymentId);
    });

    it('returns 404 for non-existent deployment', async () => {
      const res = await jsonGet(app, '/v1/deployments/00000000-0000-0000-0000-000000000099');
      expect(res.status).toBe(404);
    });
  });

  // ─── POST /v1/deployments/:id/stop — Stop ──────────────────────────────

  describe('POST /v1/deployments/:id/stop', () => {
    it('stops a deployment (marks as stopped)', async () => {
      const res = await jsonPost(app, `/v1/deployments/${deploymentId}/stop`, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('stopped');
    });

    it('returns 404 for non-existent deployment', async () => {
      const res = await jsonPost(app, '/v1/deployments/00000000-0000-0000-0000-000000000099/stop', {});
      expect(res.status).toBe(404);
    });
  });

  // ─── POST /v1/deployments/:id/redeploy — Redeploy ──────────────────────

  describe('POST /v1/deployments/:id/redeploy', () => {
    it('creates a new deployment with incremented version', async () => {
      const res = await jsonPost(app, `/v1/deployments/${deploymentId}/redeploy`, {});
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.deploymentId).toBeDefined();
      expect(body.data.deploymentId).not.toBe(deploymentId); // new deployment
      expect(body.data.version).toBe(2); // incremented
      expect(body.data.sourceType).toBe('files'); // same source config
    });

    it('returns 404 for non-existent deployment', async () => {
      const res = await jsonPost(app, '/v1/deployments/00000000-0000-0000-0000-000000000099/redeploy', {});
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /v1/deployments/:id/logs — Logs ────────────────────────────────

  describe('GET /v1/deployments/:id/logs', () => {
    it('returns 502 when sandbox is unreachable', async () => {
      const res = await jsonGet(app, `/v1/deployments/${deploymentId}/logs`);
      // 502 because sandbox is a mock URL
      expect(res.status).toBe(502);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('returns 404 for non-existent deployment', async () => {
      const res = await jsonGet(app, '/v1/deployments/00000000-0000-0000-0000-000000000099/logs');
      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /v1/deployments/:id — Delete ────────────────────────────────

  describe('DELETE /v1/deployments/:id', () => {
    it('deletes a deployment', async () => {
      const res = await jsonDelete(app, `/v1/deployments/${deploymentId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getRes = await jsonGet(app, `/v1/deployments/${deploymentId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent deployment', async () => {
      const res = await jsonDelete(app, '/v1/deployments/00000000-0000-0000-0000-000000000099');
      expect(res.status).toBe(404);
    });
  });

  // ─── Cross-user isolation ───────────────────────────────────────────────

  describe('Cross-user isolation', () => {
    let isolationDeploymentId: string;

    beforeAll(async () => {
      // Create a deployment as the primary user
      const res = await jsonPost(app, '/v1/deployments', {
        sandbox_id: sandboxId,
        source_type: 'files',
        framework: 'node',
      });
      const body = await res.json();
      isolationDeploymentId = body.data.deploymentId;
    });

    it("other user cannot list first user's deployments", async () => {
      const res = await jsonGet(otherApp, '/v1/deployments');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.length).toBe(0);
    });

    it("other user cannot get first user's deployment by ID", async () => {
      const res = await jsonGet(otherApp, `/v1/deployments/${isolationDeploymentId}`);
      expect(res.status).toBe(404);
    });

    it("other user cannot stop first user's deployment", async () => {
      const res = await jsonPost(otherApp, `/v1/deployments/${isolationDeploymentId}/stop`, {});
      expect(res.status).toBe(404);
    });

    it("other user cannot delete first user's deployment", async () => {
      const res = await jsonDelete(otherApp, `/v1/deployments/${isolationDeploymentId}`);
      expect(res.status).toBe(404);
    });
  });
});
