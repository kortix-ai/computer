/**
 * Sandbox update route — Docker image-based updates.
 *
 * The update flow:
 *   1. Frontend POSTs /v1/platform/sandbox/update with { version }
 *   2. This route calls LocalDockerProvider.updateSandbox(version)
 *   3. Provider: pulls new image → stops container → removes (preserves volume) → recreates → health check
 *   4. Frontend polls GET /v1/platform/sandbox/update/status for progress
 *
 * All update coordination goes through kortix-api.
 */

import { Hono } from 'hono';
import { config } from '../../config';
import {
  LocalDockerProvider,
  getSandboxUpdateStatus,
  resetSandboxUpdateStatus,
  type SandboxUpdateStatus,
} from '../providers/local-docker';
import { getProvider, type ProviderName } from '../providers';

const sandboxUpdateRouter = new Hono();

/**
 * POST /v1/platform/sandbox/update
 *
 * Trigger a Docker image-based sandbox update.
 * Body: { version: "0.8.0" }
 *
 * This is a long-running operation (~30s-5min depending on image pull).
 * The endpoint returns immediately with { started: true } and the frontend
 * should poll GET /status for progress.
 */
sandboxUpdateRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const targetVersion = body?.version;

  if (!targetVersion || typeof targetVersion !== 'string') {
    return c.json({ success: false, error: 'Missing or invalid version' }, 400);
  }

  // Only local_docker supports image-based updates
  let provider: LocalDockerProvider;
  try {
    const p = getProvider('local_docker' as ProviderName);
    if (!(p instanceof LocalDockerProvider)) {
      return c.json({ success: false, error: 'Sandbox update only supported for local_docker provider' }, 400);
    }
    provider = p;
  } catch {
    return c.json({ success: false, error: 'local_docker provider not available' }, 400);
  }

  // Check if update is already in progress
  const currentStatus = getSandboxUpdateStatus();
  if (currentStatus.phase !== 'idle' && currentStatus.phase !== 'complete' && currentStatus.phase !== 'failed') {
    return c.json({
      success: false,
      error: `Update already in progress (phase: ${currentStatus.phase})`,
      status: currentStatus,
    }, 409);
  }

  // Fire and forget — the update runs in the background
  // Frontend polls GET /status for progress
  provider.updateSandbox(targetVersion).catch((err) => {
    console.error('[SANDBOX-UPDATE] Background update failed:', err.message || err);
    // Status is already set to 'failed' by updateSandbox
  });

  return c.json({
    success: true,
    started: true,
    message: `Update to v${targetVersion} started. Poll GET /status for progress.`,
    targetVersion,
  });
});

/**
 * GET /v1/platform/sandbox/update/status
 *
 * Poll the current update status.
 * Returns phase, progress %, message, and version info.
 */
sandboxUpdateRouter.get('/status', async (c) => {
  const status = getSandboxUpdateStatus();
  return c.json(status);
});

/**
 * POST /v1/platform/sandbox/update/reset
 *
 * Reset the update status back to idle.
 * Useful after a failed update to allow retrying.
 */
sandboxUpdateRouter.post('/reset', async (c) => {
  resetSandboxUpdateStatus();
  return c.json({ success: true, message: 'Update status reset to idle' });
});

export { sandboxUpdateRouter };
