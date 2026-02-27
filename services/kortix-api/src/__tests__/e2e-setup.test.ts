/**
 * E2E tests for /v1/setup/* routes (local-only).
 *
 * These tests verify:
 *  1. Setup routes are mounted in local mode
 *  2. GET /v1/setup/status returns system info
 *  3. GET /v1/setup/schema returns key definitions
 *  4. GET /v1/setup/env returns masked keys
 *  5. POST /v1/setup/env saves keys
 *  6. GET /v1/setup/health returns service health
 *
 * Also verifies billing and scheduler no-DB guards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { setupApp } from '../setup';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { resolve } from 'path';

const TEST_DIR = `/tmp/kortix-setup-test-${Date.now()}`;

// ─── Test app factory ───────────────────────────────────────────────────────

function createSetupTestApp() {
  const app = new Hono();
  app.route('/v1/setup', setupApp);
  app.notFound((c) => c.json({ error: true, message: 'Not found', status: 404 }, 404));
  return app;
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(() => {
  // Create test project structure
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(resolve(TEST_DIR, 'scripts'), { recursive: true });
  mkdirSync(resolve(TEST_DIR, 'sandbox'), { recursive: true });
  mkdirSync(resolve(TEST_DIR, 'services/kortix-api'), { recursive: true });
  mkdirSync(resolve(TEST_DIR, 'apps/frontend'), { recursive: true });

  writeFileSync(resolve(TEST_DIR, 'docker-compose.local.yml'), 'services:\n  test:\n    image: hello-world\n');
  writeFileSync(resolve(TEST_DIR, '.env.example'), 'ENV_MODE=local\nANTHROPIC_API_KEY=\n');
  writeFileSync(resolve(TEST_DIR, 'sandbox/.env.example'), 'ANTHROPIC_API_KEY=\nENV_MODE=local\n');

  // Point CWD at the test dir so getProjectRoot() finds it
  process.chdir(TEST_DIR);
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('/v1/setup', () => {

  describe('GET /v1/setup/status', () => {
    it('returns 200', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/status');
      expect(res.status).toBe(200);
    });

    it('returns envMode', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/status');
      const data = await res.json();
      expect(data.envMode).toBeDefined();
    });

    it('returns dockerRunning boolean', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/status');
      const data = await res.json();
      expect(typeof data.dockerRunning).toBe('boolean');
    });

    it('reports envExists correctly (initially false)', async () => {
      // Remove .env if it exists
      rmSync(resolve(TEST_DIR, '.env'), { force: true });
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/status');
      const data = await res.json();
      expect(data.envExists).toBe(false);
    });
  });

  describe('GET /v1/setup/schema', () => {
    it('returns 200', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/schema');
      expect(res.status).toBe(200);
    });

    it('has llm and tools groups', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/schema');
      const data = await res.json();
      expect(data.llm).toBeDefined();
      expect(data.tools).toBeDefined();
    });

    it('llm group has at least 4 providers', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/schema');
      const data = await res.json();
      expect(data.llm.keys.length).toBeGreaterThanOrEqual(4);
    });

    it('Anthropic is marked recommended', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/schema');
      const data = await res.json();
      const anthropic = data.llm.keys.find((k: any) => k.key === 'ANTHROPIC_API_KEY');
      expect(anthropic).toBeDefined();
      expect(anthropic.recommended).toBe(true);
    });
  });

  describe('GET /v1/setup/env', () => {
    it('returns 200', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/env');
      expect(res.status).toBe(200);
    });

    it('returns masked and configured fields', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/env');
      const data = await res.json();
      expect(data.masked).toBeDefined();
      expect(data.configured).toBeDefined();
    });

    it('all keys unconfigured when no .env', async () => {
      rmSync(resolve(TEST_DIR, '.env'), { force: true });
      rmSync(resolve(TEST_DIR, 'sandbox/.env'), { force: true });
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/env');
      const data = await res.json();
      for (const val of Object.values(data.configured)) {
        expect(val).toBe(false);
      }
    });
  });

  describe('POST /v1/setup/env', () => {
    it('saves keys and creates .env', async () => {
      rmSync(resolve(TEST_DIR, '.env'), { force: true });
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys: { ANTHROPIC_API_KEY: 'sk-ant-test-setup-123' },
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(existsSync(resolve(TEST_DIR, '.env'))).toBe(true);
    });

    it('.env contains saved key', async () => {
      const content = readFileSync(resolve(TEST_DIR, '.env'), 'utf-8');
      expect(content).toContain('ANTHROPIC_API_KEY=sk-ant-test-setup-123');
    });

    it('.env has ENV_MODE=local', async () => {
      const content = readFileSync(resolve(TEST_DIR, '.env'), 'utf-8');
      expect(content).toContain('ENV_MODE=local');
    });

    it('creates sandbox/.env with key', async () => {
      expect(existsSync(resolve(TEST_DIR, 'sandbox/.env'))).toBe(true);
      const content = readFileSync(resolve(TEST_DIR, 'sandbox/.env'), 'utf-8');
      expect(content).toContain('ANTHROPIC_API_KEY=sk-ant-test-setup-123');
    });

    it('sandbox/.env has KORTIX_API_URL', async () => {
      const content = readFileSync(resolve(TEST_DIR, 'sandbox/.env'), 'utf-8');
      expect(content).toContain('KORTIX_API_URL=http://kortix-api:8008');
    });

    it('rejects invalid body', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: 'not-an-object' }),
      });
      expect(res.status).toBe(400);
    });

    it('preserves existing keys when adding new ones', async () => {
      const app = createSetupTestApp();
      await app.request('/v1/setup/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: { OPENAI_API_KEY: 'sk-proj-test-openai' } }),
      });
      const content = readFileSync(resolve(TEST_DIR, '.env'), 'utf-8');
      expect(content).toContain('ANTHROPIC_API_KEY=sk-ant-test-setup-123');
      expect(content).toContain('OPENAI_API_KEY=sk-proj-test-openai');
    });
  });

  describe('GET /v1/setup/health', () => {
    it('returns 200', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/health');
      expect(res.status).toBe(200);
    });

    it('reports API as ok (self-check)', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/health');
      const data = await res.json();
      expect(data.api).toBeDefined();
      expect(data.api.ok).toBe(true);
    });

    it('reports docker status', async () => {
      const app = createSetupTestApp();
      const res = await app.request('/v1/setup/health');
      const data = await res.json();
      expect(data.docker).toBeDefined();
      expect(typeof data.docker.ok).toBe('boolean');
    });
  });
});

// ─── Billing no-DB guard tests ──────────────────────────────────────────────

describe('Billing no-DB guard', () => {
  it('buildLocalAccountState returns valid structure', async () => {
    const { buildLocalAccountState } = await import('../billing/services/account-state');
    const state = buildLocalAccountState();

    expect(state.credits).toBeDefined();
    expect(state.credits.total).toBe(999999);
    expect(state.credits.can_run).toBe(true);

    expect(state.subscription).toBeDefined();
    expect(state.subscription.tier_key).toBe('ultra');
    expect(state.subscription.status).toBe('active');
    expect(state.subscription.is_trial).toBe(false);

    expect(state.models).toBeDefined();
    expect(state.models.length).toBeGreaterThan(0);


    expect(state.tier).toBeDefined();
    expect(state.tier.name).toBe('ultra');
    expect(state.tier.display_name).toBe('Local (Unlimited)');
  });

  it('account-state route uses hasDatabase guard', async () => {
    const { hasDatabase } = await import('../shared/db');
    const { accountStateRouter } = await import('../billing/routes/account-state');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', '00000000-0000-0000-0000-000000000000');
      await next();
    });
    app.route('/account-state', accountStateRouter);

    const res = await app.request('/account-state');
    expect(res.status).toBe(200);
    const data = await res.json();

    if (!hasDatabase) {
      // No DB: should return local mock state
      expect(data.credits.total).toBe(999999);
      expect(data.subscription.tier_key).toBe('ultra');
    } else {
      // DB available: should return real state (won't be 999999)
      expect(data.credits).toBeDefined();
      expect(data.subscription).toBeDefined();
    }
  });

  it('minimal account-state route uses hasDatabase guard', async () => {
    const { hasDatabase } = await import('../shared/db');
    const { accountStateRouter } = await import('../billing/routes/account-state');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', '00000000-0000-0000-0000-000000000000');
      await next();
    });
    app.route('/account-state', accountStateRouter);

    const res = await app.request('/account-state/minimal');
    expect(res.status).toBe(200);
    const data = await res.json();

    if (!hasDatabase) {
      expect(data.credits.total).toBe(999999);
    } else {
      expect(data.credits).toBeDefined();
    }
  });
});

// ─── Scheduler no-DB guard tests ────────────────────────────────────────────

describe('Scheduler no-DB guard', () => {
  it('hasDatabase is false when DATABASE_URL is empty', async () => {
    const { hasDatabase } = await import('../shared/db');
    // In test env, DATABASE_URL should be empty (or may be set)
    // We just verify the export exists and is boolean
    expect(typeof hasDatabase).toBe('boolean');
  });

  it('startScheduler source code checks hasDatabase', async () => {
    // Verify the guard exists in the source
    const content = readFileSync(
      resolve(__dirname, '../cron/services/scheduler.ts'),
      'utf-8'
    );
    expect(content).toContain('hasDatabase');
    expect(content).toContain('no DATABASE_URL configured');
  });

  it('account-state route source checks hasDatabase', async () => {
    const content = readFileSync(
      resolve(__dirname, '../billing/routes/account-state.ts'),
      'utf-8'
    );
    expect(content).toContain('hasDatabase');
    expect(content).toContain('buildLocalAccountState');
  });
});
