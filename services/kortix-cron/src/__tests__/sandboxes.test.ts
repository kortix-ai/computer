/**
 * Integration tests for sandbox routes.
 * Tests CRUD operations against the real database.
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

describe('POST /v1/sandboxes', () => {
  test('creates a sandbox with valid data', async () => {
    const res = await jsonPost(app, '/v1/sandboxes', {
      name: 'My Sandbox',
      base_url: 'http://localhost:8000',
      auth_token: 'secret123',
      status: 'active',
      metadata: { region: 'us-west-2' },
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('My Sandbox');
    expect(json.data.baseUrl).toBe('http://localhost:8000');
    expect(json.data.authToken).toBe('secret123');
    expect(json.data.status).toBe('active');
    expect(json.data.accountId).toBe(TEST_USER_ID);
    expect(json.data.sandboxId).toBeDefined();
    expect(json.data.metadata).toEqual({ region: 'us-west-2' });
  });

  test('creates a sandbox with defaults', async () => {
    const res = await jsonPost(app, '/v1/sandboxes', {
      name: 'Default Sandbox',
      base_url: 'http://localhost:8000',
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.data.status).toBe('active');
    expect(json.data.authToken).toBeNull();
  });

  test('rejects invalid base_url', async () => {
    const res = await jsonPost(app, '/v1/sandboxes', {
      name: 'Bad URL',
      base_url: 'not-a-url',
    });

    expect(res.status).toBe(400);
  });

  test('rejects missing name', async () => {
    const res = await jsonPost(app, '/v1/sandboxes', {
      base_url: 'http://localhost:8000',
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/sandboxes', () => {
  test('lists sandboxes for the authenticated user', async () => {
    await createTestSandbox(app, { name: 'Sandbox A' });
    await createTestSandbox(app, { name: 'Sandbox B' });
    // Create one for another user — should not appear
    await createTestSandbox(otherApp, { name: 'Other User Sandbox' });

    const res = await jsonGet(app, '/v1/sandboxes');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(2);
    expect(json.data.map((s: any) => s.name).sort()).toEqual(['Sandbox A', 'Sandbox B']);
  });

  test('returns empty array when no sandboxes exist', async () => {
    const res = await jsonGet(app, '/v1/sandboxes');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data).toEqual([]);
    expect(json.total).toBe(0);
  });
});

describe('GET /v1/sandboxes/:id', () => {
  test('returns sandbox by ID', async () => {
    const sandbox = await createTestSandbox(app, { name: 'Specific Sandbox' });

    const res = await jsonGet(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.name).toBe('Specific Sandbox');
  });

  test('returns 404 for non-existent sandbox', async () => {
    const res = await jsonGet(app, '/v1/sandboxes/00000000-0000-4000-a000-999999999999');
    expect(res.status).toBe(404);
  });

  test('returns 404 when querying another users sandbox', async () => {
    const sandbox = await createTestSandbox(otherApp, { name: 'Private Sandbox' });

    const res = await jsonGet(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/sandboxes/:id', () => {
  test('updates sandbox fields', async () => {
    const sandbox = await createTestSandbox(app);

    const res = await jsonPatch(app, `/v1/sandboxes/${sandbox.sandboxId}`, {
      name: 'Updated Name',
      status: 'stopped',
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.name).toBe('Updated Name');
    expect(json.data.status).toBe('stopped');
  });

  test('returns 404 for non-existent sandbox', async () => {
    const res = await jsonPatch(app, '/v1/sandboxes/00000000-0000-4000-a000-999999999999', {
      name: 'Ghost',
    });
    expect(res.status).toBe(404);
  });

  test('cannot update another users sandbox', async () => {
    const sandbox = await createTestSandbox(otherApp);

    const res = await jsonPatch(app, `/v1/sandboxes/${sandbox.sandboxId}`, {
      name: 'Hacked',
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/sandboxes/:id', () => {
  test('deletes sandbox', async () => {
    const sandbox = await createTestSandbox(app);

    const res = await jsonDelete(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(res.status).toBe(200);

    // Verify it's gone
    const getRes = await jsonGet(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(getRes.status).toBe(404);
  });

  test('returns 404 for non-existent sandbox', async () => {
    const res = await jsonDelete(app, '/v1/sandboxes/00000000-0000-4000-a000-999999999999');
    expect(res.status).toBe(404);
  });

  test('cannot delete another users sandbox', async () => {
    const sandbox = await createTestSandbox(otherApp);

    const res = await jsonDelete(app, `/v1/sandboxes/${sandbox.sandboxId}`);
    expect(res.status).toBe(404);
  });
});
