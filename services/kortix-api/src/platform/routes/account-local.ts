/**
 * Local-mode account router.
 *
 * Same API shape as the DB-backed platform.ts, but uses Docker
 * containers as the source of truth — no Postgres required.
 *
 * Containers with label `kortix.sandbox=true` are treated as sandboxes.
 * Port mappings are read live from Docker inspect on every request.
 */

import { Hono } from 'hono';
import { supabaseAuth as authMiddleware } from '../../middleware/auth';
import { LocalDockerProvider, type DockerSandboxInfo } from '../providers/local-docker';
import {
  getAvailableProviders,
  getDefaultProviderName,
  type ProviderName,
} from '../providers';
import type { AuthVariables } from '../../types';

const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000000';

const provider = new LocalDockerProvider();

/**
 * Convert a DockerSandboxInfo to the same serialized shape as the DB-backed router.
 * This ensures the frontend's `platform-client.ts` types work identically.
 */
function serializeContainer(c: DockerSandboxInfo) {
  return {
    sandbox_id: c.containerId.slice(0, 12), // short ID as sandbox_id
    external_id: c.containerId,
    name: c.name,
    provider: 'local_docker' as const,
    base_url: c.baseUrl,
    status: c.status === 'running' ? 'active' : c.status,
    metadata: {
      mappedPorts: c.mappedPorts,
      image: c.image,
      labels: c.labels,
    },
    created_at: c.createdAt,
    updated_at: c.createdAt,
  };
}

export function createLocalAccountRouter(): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  // Auth middleware — in local mode this injects the mock user
  router.use('/*', authMiddleware);

  // ─── GET /providers ────────────────────────────────────────────────────

  router.get('/providers', async (c) => {
    return c.json({
      success: true,
      data: {
        providers: getAvailableProviders(),
        default: getDefaultProviderName(),
      },
    });
  });

  // ─── POST /init ────────────────────────────────────────────────────────
  // Idempotent: if a running container exists, return it.
  // Otherwise, create a new one.

  router.post('/init', async (c) => {
    try {
      const containers = await provider.list();
      const running = containers.find((c) => c.status === 'running');

      if (running) {
        return c.json({
          success: true,
          data: serializeContainer(running),
          created: false,
        });
      }

      // Check for a stopped container we can restart
      const stopped = containers.find((c) => c.status === 'stopped');
      if (stopped) {
        await provider.start(stopped.containerId);
        const refreshed = await provider.inspect(stopped.containerId);
        return c.json({
          success: true,
          data: serializeContainer(refreshed),
          created: false,
        });
      }

      // No containers at all — create a new one
      const result = await provider.create({
        accountId: LOCAL_USER_ID,
        userId: LOCAL_USER_ID,
        name: 'local-sandbox',
      });

      const info = await provider.inspect(result.externalId);

      console.log(
        `[PLATFORM-LOCAL] Created sandbox ${info.name} (${info.containerId.slice(0, 12)})`,
      );

      return c.json(
        {
          success: true,
          data: serializeContainer(info),
          created: true,
        },
        201,
      );
    } catch (err) {
      console.error('[PLATFORM-LOCAL] init error:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  // ─── GET /sandbox ──────────────────────────────────────────────────────
  // Return the first running container.

  router.get('/sandbox', async (c) => {
    try {
      const containers = await provider.list();
      const running = containers.find((c) => c.status === 'running');

      if (!running) {
        return c.json(
          { success: false, error: 'No running sandbox found. Call POST /v1/account/init first.' },
          404,
        );
      }

      return c.json({
        success: true,
        data: serializeContainer(running),
      });
    } catch (err) {
      console.error('[PLATFORM-LOCAL] getSandbox error:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  // ─── GET /sandboxes ────────────────────────────────────────────────────
  // List all sandbox containers (running + stopped).

  router.get('/sandboxes', async (c) => {
    try {
      const containers = await provider.list();
      return c.json({
        success: true,
        data: containers.map(serializeContainer),
      });
    } catch (err) {
      console.error('[PLATFORM-LOCAL] listSandboxes error:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  // ─── POST /sandbox/:id/start ───────────────────────────────────────────

  router.post('/sandbox/:id/start', async (c) => {
    const sandboxId = c.req.param('id');

    try {
      // sandboxId is the short container ID — find the full one
      const containers = await provider.list();
      const target = containers.find(
        (c) => c.containerId.startsWith(sandboxId) || c.containerId.slice(0, 12) === sandboxId,
      );

      if (!target) {
        return c.json({ success: false, error: 'Sandbox not found' }, 404);
      }

      await provider.start(target.containerId);
      const refreshed = await provider.inspect(target.containerId);

      console.log(`[PLATFORM-LOCAL] Started sandbox ${refreshed.name}`);

      return c.json({ success: true, data: serializeContainer(refreshed) });
    } catch (err) {
      console.error('[PLATFORM-LOCAL] start error:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  // ─── POST /sandbox/:id/stop ────────────────────────────────────────────

  router.post('/sandbox/:id/stop', async (c) => {
    const sandboxId = c.req.param('id');

    try {
      const containers = await provider.list();
      const target = containers.find(
        (c) => c.containerId.startsWith(sandboxId) || c.containerId.slice(0, 12) === sandboxId,
      );

      if (!target) {
        return c.json({ success: false, error: 'Sandbox not found' }, 404);
      }

      await provider.stop(target.containerId);

      console.log(`[PLATFORM-LOCAL] Stopped sandbox ${target.name}`);

      return c.json({ success: true });
    } catch (err) {
      console.error('[PLATFORM-LOCAL] stop error:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  // ─── DELETE /sandbox/:id ───────────────────────────────────────────────

  router.delete('/sandbox/:id', async (c) => {
    const sandboxId = c.req.param('id');

    try {
      const containers = await provider.list();
      const target = containers.find(
        (c) => c.containerId.startsWith(sandboxId) || c.containerId.slice(0, 12) === sandboxId,
      );

      if (!target) {
        return c.json({ success: false, error: 'Sandbox not found' }, 404);
      }

      await provider.remove(target.containerId);

      console.log(`[PLATFORM-LOCAL] Removed sandbox ${target.name}`);

      return c.json({ success: true });
    } catch (err) {
      console.error('[PLATFORM-LOCAL] remove error:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  return router;
}

export const localAccountRouter = createLocalAccountRouter();
