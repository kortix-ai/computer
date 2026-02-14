/**
 * Local-mode account router.
 *
 * In local mode there's no real user management — we return a mock user.
 * Sandbox lifecycle has been moved to sandbox-local.ts (/v1/sandbox/*).
 *
 * Routes:
 *   POST /init      → Return mock user account info (no sandbox side-effects)
 *   GET  /providers  → List available sandbox providers
 */

import { Hono } from 'hono';
import { supabaseAuth as authMiddleware } from '../../middleware/auth';
import {
  getAvailableProviders,
  getDefaultProviderName,
} from '../providers';
import type { AuthVariables } from '../../types';

const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000000';

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
  // Returns mock account info. Does NOT create/start a sandbox.
  // The frontend should call POST /v1/sandbox to ensure a sandbox exists.

  router.post('/init', async (c) => {
    return c.json({
      success: true,
      data: {
        user_id: LOCAL_USER_ID,
        account_id: LOCAL_USER_ID,
        mode: 'local',
        default_provider: getDefaultProviderName(),
      },
    });
  });

  return router;
}

export const localAccountRouter = createLocalAccountRouter();
