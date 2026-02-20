/**
 * Local-mode account router.
 *
 * In local mode there's no real user management — we use a mock user.
 * Unlike cloud mode (which stores sandboxes in Postgres), local mode
 * talks directly to Docker via LocalDockerProvider.
 *
 * POST /init now auto-provisions the Docker sandbox (idempotent) and
 * returns the same SandboxInfo shape as cloud mode. This means the
 * frontend has a single code path for both modes — no special-casing.
 *
 * Routes:
 *   POST /init      → Ensure Docker sandbox is running, return SandboxInfo
 *   GET  /providers  → List available sandbox providers
 */

import { Hono } from 'hono';
import { supabaseAuth as authMiddleware } from '../../middleware/auth';
import { LocalDockerProvider, type SandboxInfo } from '../providers/local-docker';
import { sandboxAuthStore } from '../sandbox-auth-store';
import { LOCAL_SANDBOX_ID } from '../local-identity';
import { hasDatabase } from '../../shared/db';
import {
  getAvailableProviders,
  getDefaultProviderName,
} from '../providers';
import type { AuthVariables } from '../../types';

const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000000';

const provider = new LocalDockerProvider();

/**
 * Serialize LocalDockerProvider's SandboxInfo to the frontend-expected shape.
 * Keeps the same contract as the DB-backed cloud router so the frontend
 * doesn't need to care which mode it's in.
 */
function serialize(info: SandboxInfo) {
  return {
    sandbox_id: hasDatabase ? LOCAL_SANDBOX_ID : info.name,
    external_id: info.name,  // Container name (e.g. 'kortix-sandbox') — used for Docker DNS & URL routing
    name: info.name,
    provider: 'local_docker' as const,
    base_url: info.baseUrl,
    status: info.status === 'running' ? 'active' : info.status,
    metadata: {
      mappedPorts: info.mappedPorts,
      image: info.image,
    },
    created_at: info.createdAt,
    updated_at: info.createdAt,
  };
}

export function createLocalAccountRouter(): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

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
  // Auto-provisions the local Docker sandbox (idempotent) and returns
  // SandboxInfo with the same shape as cloud mode. The frontend calls
  // this once on dashboard load — zero manual steps.

  router.post('/init', async (c) => {
    try {
      const existed = !!(await provider.find());
      const info = await provider.ensure();
      // Invalidate cached auth token — container may have been recreated
      sandboxAuthStore.invalidate();

      console.log(
        `[PLATFORM-LOCAL] ${existed ? 'Found existing' : 'Created'} sandbox (${info.status})`,
      );

      return c.json(
        {
          success: true,
          data: serialize(info),
          created: !existed,
        },
        existed ? 200 : 201,
      );
    } catch (err) {
      console.error('[PLATFORM-LOCAL] init error:', err);
      return c.json(
        {
          success: false,
          error: `Failed to initialize local sandbox: ${String(err)}`,
        },
        500,
      );
    }
  });

  return router;
}

export const localAccountRouter = createLocalAccountRouter();
