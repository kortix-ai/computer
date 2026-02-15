/**
 * E2E tests for channel routes — CRUD, enable/disable, messages.
 *
 * Channel routes import `db` at module level, so we guard the entire
 * suite with describe.skipIf(!DATABASE_URL).
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

describe.skipIf(!HAS_DB)('Channels — Config CRUD, Enable/Disable, Messages', () => {
  const app = createTestApp({ mountCron: true, mountChannels: true });
  const otherApp = createTestApp({
    userId: OTHER_USER_ID,
    userEmail: OTHER_USER_EMAIL,
    mountCron: true,
    mountChannels: true,
  });

  let sandboxId: string;
  let channelConfigId: string;
  let secondChannelId: string;

  beforeAll(async () => {
    await cleanupTestData();

    // Create a sandbox to attach channels to
    const res = await jsonPost(app, '/v1/sandboxes', {
      name: 'channel-test-sandbox',
      base_url: 'http://localhost:9999',
      auth_token: 'test-token',
      status: 'active',
    });
    const body = await res.json();
    sandboxId = body.data.sandboxId;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Channel Config CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Channel Config CRUD — POST/GET/PATCH/DELETE /v1/channels', () => {
    it('POST /v1/channels creates a channel config (201)', async () => {
      const res = await jsonPost(app, '/v1/channels', {
        sandbox_id: sandboxId,
        channel_type: 'telegram',
        name: 'Test Telegram Bot',
        credentials: { botToken: 'fake-token-123' },
        session_strategy: 'per-user',
        system_prompt: 'You are a test bot',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.channelConfigId).toBeDefined();
      expect(body.data.channelType).toBe('telegram');
      expect(body.data.name).toBe('Test Telegram Bot');
      expect(body.data.sessionStrategy).toBe('per-user');
      expect(body.data.systemPrompt).toBe('You are a test bot');
      expect(body.data.enabled).toBe(true);

      channelConfigId = body.data.channelConfigId;
    });

    it('POST /v1/channels creates a second channel', async () => {
      const res = await jsonPost(app, '/v1/channels', {
        sandbox_id: sandboxId,
        channel_type: 'slack',
        name: 'Test Slack Bot',
        session_strategy: 'single',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      secondChannelId = body.data.channelConfigId;
    });

    it('POST /v1/channels with missing sandbox_id returns 400', async () => {
      const res = await jsonPost(app, '/v1/channels', {
        channel_type: 'telegram',
        name: 'No Sandbox',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe(true);
    });

    it('POST /v1/channels with invalid channel_type returns 400', async () => {
      const res = await jsonPost(app, '/v1/channels', {
        sandbox_id: sandboxId,
        channel_type: 'invalid',
        name: 'Bad Type',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe(true);
    });

    it('POST /v1/channels with non-existent sandbox returns 404', async () => {
      const res = await jsonPost(app, '/v1/channels', {
        sandbox_id: '00000000-0000-0000-0000-000000000099',
        channel_type: 'telegram',
        name: 'Orphan',
      });
      expect(res.status).toBe(404);
    });

    it('POST /v1/channels with other user\'s sandbox returns 404', async () => {
      const res = await jsonPost(otherApp, '/v1/channels', {
        sandbox_id: sandboxId,
        channel_type: 'telegram',
        name: 'Stolen',
      });
      expect(res.status).toBe(404);
    });

    it('GET /v1/channels lists user channels', async () => {
      const res = await jsonGet(app, '/v1/channels');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /v1/channels?sandbox_id=X filters by sandbox', async () => {
      const res = await jsonGet(app, `/v1/channels?sandbox_id=${sandboxId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      expect(body.data.every((c: any) => c.sandboxId === sandboxId)).toBe(true);
    });

    it('GET /v1/channels?channel_type=telegram filters by type', async () => {
      const res = await jsonGet(app, '/v1/channels?channel_type=telegram');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.every((c: any) => c.channelType === 'telegram')).toBe(true);
    });

    it('GET /v1/channels?enabled=true filters enabled channels', async () => {
      const res = await jsonGet(app, '/v1/channels?enabled=true');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.every((c: any) => c.enabled === true)).toBe(true);
    });

    it('GET /v1/channels returns empty for other user', async () => {
      const res = await jsonGet(otherApp, '/v1/channels');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeArray();
      expect(body.data.length).toBe(0);
    });

    it('GET /v1/channels/:id returns channel with sandbox info', async () => {
      const res = await jsonGet(app, `/v1/channels/${channelConfigId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.channelConfigId).toBe(channelConfigId);
      expect(body.data.name).toBe('Test Telegram Bot');
      expect(body.data.sandbox).toBeDefined();
      expect(body.data.sandbox.name).toBe('channel-test-sandbox');
    });

    it('GET /v1/channels/:id returns 404 for other user', async () => {
      const res = await jsonGet(otherApp, `/v1/channels/${channelConfigId}`);
      expect(res.status).toBe(404);
    });

    it('PATCH /v1/channels/:id updates channel fields', async () => {
      const res = await jsonPatch(app, `/v1/channels/${channelConfigId}`, {
        name: 'Renamed Bot',
        session_strategy: 'single',
        system_prompt: 'Updated prompt',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Renamed Bot');
      expect(body.data.sessionStrategy).toBe('single');
      expect(body.data.systemPrompt).toBe('Updated prompt');
    });

    it('PATCH /v1/channels/:id returns 404 for other user', async () => {
      const res = await jsonPatch(otherApp, `/v1/channels/${channelConfigId}`, {
        name: 'Stolen Update',
      });
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Enable / Disable
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Enable/Disable — POST /v1/channels/:id/enable|disable', () => {
    it('POST /v1/channels/:id/disable sets enabled=false', async () => {
      const res = await jsonPost(app, `/v1/channels/${channelConfigId}/disable`, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(false);
    });

    it('GET /v1/channels?enabled=false returns disabled channels', async () => {
      const res = await jsonGet(app, '/v1/channels?enabled=false');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.some((c: any) => c.channelConfigId === channelConfigId)).toBe(true);
      expect(body.data.every((c: any) => c.enabled === false)).toBe(true);
    });

    it('POST /v1/channels/:id/enable sets enabled=true', async () => {
      const res = await jsonPost(app, `/v1/channels/${channelConfigId}/enable`, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(true);
    });

    it('POST /v1/channels/:id/enable returns 404 for other user', async () => {
      const res = await jsonPost(otherApp, `/v1/channels/${channelConfigId}/enable`, {});
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Messages Audit Trail
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Messages — GET /v1/channels/:id/messages', () => {
    it('GET /v1/channels/:id/messages returns empty initially', async () => {
      const res = await jsonGet(app, `/v1/channels/${channelConfigId}/messages`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBe(0);
    });

    it('GET /v1/channels/:id/messages returns 404 for other user', async () => {
      const res = await jsonGet(otherApp, `/v1/channels/${channelConfigId}/messages`);
      expect(res.status).toBe(404);
    });

    it('GET /v1/channels/:id/messages respects limit parameter', async () => {
      const res = await jsonGet(app, `/v1/channels/${channelConfigId}/messages?limit=10&offset=0`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Delete + Cascade
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Delete — DELETE /v1/channels/:id', () => {
    it('DELETE /v1/channels/:id returns 404 for other user', async () => {
      const res = await jsonDelete(otherApp, `/v1/channels/${secondChannelId}`);
      expect(res.status).toBe(404);
    });

    it('DELETE /v1/channels/:id deletes channel', async () => {
      const res = await jsonDelete(app, `/v1/channels/${secondChannelId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Confirm it's gone
      const getRes = await jsonGet(app, `/v1/channels/${secondChannelId}`);
      expect(getRes.status).toBe(404);
    });

    it('Deleting sandbox cascades to channel configs', async () => {
      // Create a new sandbox with a channel
      const sbRes = await jsonPost(app, '/v1/sandboxes', {
        name: 'cascade-test',
        base_url: 'http://localhost:7777',
      });
      const sbBody = await sbRes.json();
      const cascadeSandboxId = sbBody.data.sandboxId;

      const chRes = await jsonPost(app, '/v1/channels', {
        sandbox_id: cascadeSandboxId,
        channel_type: 'discord',
        name: 'Cascade Channel',
      });
      const chBody = await chRes.json();
      const cascadeChannelId = chBody.data.channelConfigId;

      // Delete the sandbox
      await jsonDelete(app, `/v1/sandboxes/${cascadeSandboxId}`);

      // Channel should be gone (cascade delete)
      const getRes = await jsonGet(app, `/v1/channels/${cascadeChannelId}`);
      expect(getRes.status).toBe(404);
    });
  });
});
