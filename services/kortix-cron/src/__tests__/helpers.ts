/**
 * Test helpers for kortix-cron integration tests.
 *
 * Provides:
 * - createTestApp() — Hono app with auth bypassed (fixed userId)
 * - getTestDb() — shared Drizzle DB instance for assertions
 * - cleanupTestData() — deletes all rows created during tests
 * - TEST_USER_ID — a fixed UUID used as the auth identity
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { createDb, type Database, sandboxes, triggers, executions } from '@kortix/db';
import { sandboxesRouter } from '../routes/sandboxes';
import { triggersRouter } from '../routes/triggers';
import { executionsRouter } from '../routes/executions';
import type { AppEnv } from '../types';
import { sql } from 'drizzle-orm';

// ─── Constants ───────────────────────────────────────────────────────────────
export const TEST_USER_ID = '00000000-0000-4000-a000-000000000001';
export const TEST_USER_EMAIL = 'test@kortix.dev';
export const OTHER_USER_ID = '00000000-0000-4000-a000-000000000002';

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

// ─── Test App Factory ────────────────────────────────────────────────────────
/**
 * Create a Hono app identical to production but with auth middleware replaced
 * by a stub that always sets the given userId.
 */
export function createTestApp(userId: string = TEST_USER_ID): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', cors());

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Stub auth: always set the given userId
  app.use('/v1/*', async (c, next) => {
    c.set('userId', userId);
    c.set('userEmail', TEST_USER_EMAIL);
    await next();
  });

  // Mount routes
  app.route('/v1/sandboxes', sandboxesRouter);
  app.route('/v1/triggers', triggersRouter);
  app.route('/v1/executions', executionsRouter);

  // 404
  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  // Error handler
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error('Test app error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
/**
 * Delete all test data from kortix schema tables.
 * Order matters: executions -> triggers -> sandboxes (FK constraints).
 */
export async function cleanupTestData(): Promise<void> {
  const db = getTestDb();
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

export function jsonPatch(app: Hono<any>, path: string, body: unknown) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function jsonGet(app: Hono<any>, path: string) {
  return app.request(path, { method: 'GET' });
}

export function jsonDelete(app: Hono<any>, path: string) {
  return app.request(path, { method: 'DELETE' });
}

// ─── Fixture Factories ──────────────────────────────────────────────────────
export async function createTestSandbox(
  app: Hono<any>,
  overrides: Record<string, unknown> = {},
) {
  const res = await jsonPost(app, '/v1/sandboxes', {
    name: 'Test Sandbox',
    base_url: 'http://localhost:9999',
    auth_token: 'test-token',
    status: 'active',
    ...overrides,
  });
  const json = await res.json() as any;
  if (res.status !== 201) {
    throw new Error(`createTestSandbox failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.data;
}

export async function createTestTrigger(
  app: Hono<any>,
  sandboxId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await jsonPost(app, '/v1/triggers', {
    sandbox_id: sandboxId,
    name: 'Test Trigger',
    cron_expr: '0 */5 * * * *',
    prompt: 'Hello, run this test task',
    ...overrides,
  });
  const json = await res.json() as any;
  if (res.status !== 201) {
    throw new Error(`createTestTrigger failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.data;
}
