/**
 * Test helpers for kortix-api E2E tests.
 *
 * Provides:
 * - createTestApp() — Hono app mimicking the monolith with auth bypassed + injectable mock providers
 * - getTestDb()     — shared Drizzle DB instance for assertions / cron routes
 * - cleanupTestData() — deletes all test rows (executions → triggers → sandboxes)
 * - Mock provider factories
 * - Request helpers (jsonPost, jsonGet, jsonPatch, jsonDelete)
 *
 * IMPORTANT: This file must be importable WITHOUT DATABASE_URL being set.
 * DB-dependent modules (routes/platform, routes/cron-*) are loaded dynamically
 * in createTestApp() only when DATABASE_URL is available.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { createDb, type Database, sandboxes, triggers, executions, deployments } from '@kortix/db';
import { BillingError } from '../errors';
import type { AuthVariables } from '../types';

// ─── Provider Types (re-declared to avoid importing ../providers which chains to heavy deps) ─

export type ProviderName = 'daytona' | 'local_docker';

export interface CreateSandboxOpts {
  accountId: string;
  userId: string;
  name: string;
  envVars?: Record<string, string>;
}

export interface ProvisionResult {
  externalId: string;
  baseUrl: string;
  metadata: Record<string, unknown>;
}

export type SandboxStatus = 'running' | 'stopped' | 'removed' | 'unknown';

export interface SandboxProvider {
  readonly name: ProviderName;
  create(opts: CreateSandboxOpts): Promise<ProvisionResult>;
  start(externalId: string): Promise<void>;
  stop(externalId: string): Promise<void>;
  remove(externalId: string): Promise<void>;
  getStatus(externalId: string): Promise<SandboxStatus>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const TEST_USER_ID = '00000000-0000-4000-a000-000000000001';
export const TEST_USER_EMAIL = 'test@kortix.dev';
export const OTHER_USER_ID = '00000000-0000-4000-a000-000000000002';
export const OTHER_USER_EMAIL = 'other@kortix.dev';

// ─── DB ──────────────────────────────────────────────────────────────────────

let testDb: Database | null = null;

export function getTestDb(): Database {
  if (!testDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL must be set for integration tests');
    }
    testDb = createDb(url);
  }
  return testDb;
}

// ─── Mock Provider Factory ───────────────────────────────────────────────────

/**
 * Creates a mock SandboxProvider that records calls and returns configurable results.
 */
export function createMockProvider(
  name: ProviderName,
  overrides: Partial<{
    createResult: ProvisionResult;
    statusResult: SandboxStatus;
    createError: Error;
    startError: Error;
    stopError: Error;
    removeError: Error;
    statusError: Error;
  }> = {},
): SandboxProvider & {
  calls: {
    create: CreateSandboxOpts[];
    start: string[];
    stop: string[];
    remove: string[];
    getStatus: string[];
  };
} {
  const calls = {
    create: [] as CreateSandboxOpts[],
    start: [] as string[],
    stop: [] as string[],
    remove: [] as string[],
    getStatus: [] as string[],
  };

  const defaultResult: ProvisionResult = {
    externalId: `mock-${name}-${Date.now()}`,
    baseUrl:
      name === 'daytona'
        ? `https://kortix.cloud/mock-daytona-id/8000`
        : `http://localhost:${30000 + Math.floor(Math.random() * 1000)}`,
    metadata: {
      provisionedBy: 'test',
      provider: name,
      authToken: 'sbt_mock_token_12345',
    },
  };

  return {
    name,
    calls,

    async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
      calls.create.push(opts);
      if (overrides.createError) throw overrides.createError;
      return overrides.createResult || defaultResult;
    },

    async start(externalId: string): Promise<void> {
      calls.start.push(externalId);
      if (overrides.startError) throw overrides.startError;
    },

    async stop(externalId: string): Promise<void> {
      calls.stop.push(externalId);
      if (overrides.stopError) throw overrides.stopError;
    },

    async remove(externalId: string): Promise<void> {
      calls.remove.push(externalId);
      if (overrides.removeError) throw overrides.removeError;
    },

    async getStatus(externalId: string): Promise<SandboxStatus> {
      calls.getStatus.push(externalId);
      if (overrides.statusError) throw overrides.statusError;
      return overrides.statusResult || 'running';
    },
  };
}

// ─── Test App Factory ────────────────────────────────────────────────────────

export interface TestAppOptions {
  userId?: string;
  userEmail?: string;
  /** Single mock provider (used for both daytona & docker if not separately provided) */
  provider?: ReturnType<typeof createMockProvider>;
  daytonaProvider?: ReturnType<typeof createMockProvider>;
  dockerProvider?: ReturnType<typeof createMockProvider>;
  /** Override default provider name */
  defaultProvider?: ProviderName;
  /** Override available providers list */
  availableProviders?: ProviderName[];
  /** Whether to mount cron routes (requires DATABASE_URL). Default: false */
  mountCron?: boolean;
  /** Whether to mount platform routes (requires DATABASE_URL). Default: true if DATABASE_URL set */
  mountPlatform?: boolean;
  /** Whether to mount deployment routes (requires DATABASE_URL). Default: false */
  mountDeployments?: boolean;
}

/**
 * Build the Hono app shell with health, system-status, version, 404, and error handlers.
 * Platform and cron routes are mounted only when DATABASE_URL is available.
 */
export function createTestApp(opts: TestAppOptions = {}) {
  const userId = opts.userId || TEST_USER_ID;
  const userEmail = opts.userEmail || TEST_USER_EMAIL;
  const hasDb = !!process.env.DATABASE_URL;

  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', cors());

  // ─── Health (no auth) ───────────────────────────────────────────────────
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'kortix-api',
      timestamp: new Date().toISOString(),
    }),
  );

  app.get('/v1/health', (c) =>
    c.json({
      status: 'ok',
      service: 'kortix',
      timestamp: new Date().toISOString(),
    }),
  );

  // ─── System status (no auth) ────────────────────────────────────────────
  app.get('/v1/system/status', (c) =>
    c.json({
      maintenanceNotice: { enabled: false },
      technicalIssue: { enabled: false },
      updatedAt: new Date().toISOString(),
    }),
  );

  // ─── Version (no auth — does NOT import db) ────────────────────────────
  // version.ts has zero db imports, safe to require unconditionally
  const { versionRouter } = require('../platform/routes/version');
  app.route('/v1/platform/sandbox/version', versionRouter);

  // ─── Auth stub for all /v1/* routes that need it ───────────────────────
  app.use('/v1/*', async (c, next) => {
    c.set('userId', userId);
    c.set('userEmail', userEmail);
    await next();
  });

  // ─── Platform routes (DI — mock providers, test DB) ────────────────────
  const shouldMountPlatform = opts.mountPlatform !== false && hasDb;
  if (shouldMountPlatform) {
    try {
      const { createAccountRouter } = require('../platform/routes/account');
      const db = getTestDb();

      const providerMap = new Map<ProviderName, SandboxProvider>();
      if (opts.provider) {
        providerMap.set(opts.provider.name, opts.provider);
      }
      if (opts.daytonaProvider) {
        providerMap.set('daytona', opts.daytonaProvider);
      }
      if (opts.dockerProvider) {
        providerMap.set('local_docker', opts.dockerProvider);
      }
      if (providerMap.size === 0) {
        providerMap.set('daytona', createMockProvider('daytona'));
        providerMap.set('local_docker', createMockProvider('local_docker'));
      }

      const deps = {
        db,
        getProvider: (name: ProviderName) => {
          const p = providerMap.get(name);
          if (!p) throw new Error(`Mock provider not configured for: ${name}`);
          return p;
        },
        getDefaultProviderName: () => opts.defaultProvider || 'local_docker',
        getAvailableProviders: () =>
          opts.availableProviders || Array.from(providerMap.keys()),
        resolveAccountId: async (uid: string) => uid,
        useAuth: false,
      };

      const accountRouter = createAccountRouter(deps);
      app.route('/v1/platform', accountRouter);

      // Also mount the cloud sandbox router at /v1/platform/sandbox
      const { createCloudSandboxRouter } = require('../platform/routes/sandbox-cloud');
      const sandboxRouter = createCloudSandboxRouter({
        db,
        getProvider: deps.getProvider,
        getDefaultProviderName: deps.getDefaultProviderName,
        resolveAccountId: deps.resolveAccountId,
        useAuth: false,
      });
      app.route('/v1/platform/sandbox', sandboxRouter);
    } catch (e) {
      console.warn('[test] Failed to mount platform routes:', e);
    }
  }

  // ─── Cron routes (module-level db — requires DATABASE_URL) ─────────────
  if (opts.mountCron && hasDb) {
    try {
      const { sandboxesRouter } = require('../cron/routes/sandboxes');
      const { triggersRouter } = require('../cron/routes/triggers');
      const { executionsRouter } = require('../cron/routes/executions');

      app.route('/v1/cron/sandboxes', sandboxesRouter);
      app.route('/v1/cron/triggers', triggersRouter);
      app.route('/v1/cron/executions', executionsRouter);
    } catch (e) {
      console.warn('[test] Failed to mount cron routes:', e);
    }
  }

  // ─── Deployment routes (module-level db — requires DATABASE_URL) ───────
  if (opts.mountDeployments && hasDb) {
    try {
      const { deploymentsRouter } = require('../deployments/routes/deployments');
      app.route('/v1/deployments/', deploymentsRouter);
    } catch (e) {
      console.warn('[test] Failed to mount deployment routes:', e);
    }
  }

  // ─── Error handler (matches production) ────────────────────────────────
  app.onError((err, c) => {
    if (err instanceof BillingError) {
      return c.json({ error: err.message }, err.statusCode as any);
    }

    if (err instanceof HTTPException) {
      const response: Record<string, unknown> = {
        error: true,
        message: err.message,
        status: err.status,
      };
      if (err.status === 503) {
        c.header('Retry-After', '10');
      }
      return c.json(response, err.status);
    }

    console.error('Test app error:', err);
    return c.json(
      { error: true, message: 'Internal server error', status: 500 },
      500,
    );
  });

  // ─── 404 handler (matches production) ──────────────────────────────────
  app.notFound((c) =>
    c.json({ error: true, message: 'Not found', status: 404 }, 404),
  );

  return app;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Delete all test data from kortix schema tables.
 * Order: executions → triggers → sandboxes (FK constraints).
 */
export async function cleanupTestData(): Promise<void> {
  const db = getTestDb();
  await db.delete(deployments).execute();
  await db.delete(executions).execute();
  await db.delete(triggers).execute();
  await db.delete(sandboxes).execute();
}

// ─── Request Helpers ─────────────────────────────────────────────────────────

export function jsonPost(app: Hono<any>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function jsonGet(app: Hono<any>, path: string) {
  return app.request(path, { method: 'GET' });
}

export function jsonPatch(app: Hono<any>, path: string, body: unknown) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function jsonDelete(app: Hono<any>, path: string) {
  return app.request(path, { method: 'DELETE' });
}
