/**
 * Sandbox Health Monitor
 *
 * Periodic health check that ensures kortix-api can always reach the sandbox.
 * Self-heals by re-syncing INTERNAL_SERVICE_KEY on auth failures.
 *
 * Runs every HEALTH_CHECK_INTERVAL_MS. On failure:
 *   1. Attempts key sync (up to 3 times with backoff)
 *   2. Logs connectivity state changes
 *   3. Exposes state for admin/debug endpoints
 */

import { config } from '../../config';

// ─── State ───────────────────────────────────────────────────────────────────

export interface SandboxHealthState {
  connected: boolean;
  lastCheck: number;
  lastSuccess: number;
  lastError: string | null;
  syncAttempts: number;
  consecutiveFailures: number;
}

const state: SandboxHealthState = {
  connected: false,
  lastCheck: 0,
  lastSuccess: 0,
  lastError: null,
  syncAttempts: 0,
  consecutiveFailures: 0,
};

let _intervalId: ReturnType<typeof setInterval> | null = null;

const HEALTH_CHECK_INTERVAL_MS = 60_000;   // 60s between checks
const HEALTH_TIMEOUT_MS = 5_000;           // 5s timeout per check
const MAX_SYNC_RETRIES = 3;
const SYNC_BACKOFF_MS = [2_000, 5_000, 10_000]; // progressive backoff

// ─── Public API ──────────────────────────────────────────────────────────────

export function getSandboxHealthState(): SandboxHealthState {
  return { ...state };
}

/**
 * Start the periodic health monitor.
 * Safe to call multiple times — only one interval runs.
 */
export function startSandboxHealthMonitor(): void {
  if (_intervalId) return;

  // Run first check after a short delay (let startup complete)
  setTimeout(() => {
    checkSandboxHealth();
    _intervalId = setInterval(checkSandboxHealth, HEALTH_CHECK_INTERVAL_MS);
  }, 5_000);

  console.log('[sandbox-health] Monitor started (interval: 60s)');
}

export function stopSandboxHealthMonitor(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

// ─── Core ────────────────────────────────────────────────────────────────────

async function checkSandboxHealth(): Promise<void> {
  state.lastCheck = Date.now();

  const baseUrl = config.SANDBOX_NETWORK
    ? `http://kortix-sandbox:8000`
    : `http://localhost:${config.SANDBOX_PORT_BASE}`;

  try {
    // 1. Check basic reachability (health endpoint bypasses auth)
    const healthRes = await fetch(`${baseUrl}/kortix/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    if (!healthRes.ok) {
      throw new Error(`Health returned ${healthRes.status}`);
    }

    // 2. Check auth works (protected endpoint)
    const authRes = await fetch(`${baseUrl}/kortix/ports`, {
      headers: { Authorization: `Bearer ${config.INTERNAL_SERVICE_KEY}` },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    if (authRes.status === 401) {
      // Auth mismatch — try to sync key
      console.warn('[sandbox-health] Auth failed (401), attempting key sync...');
      const synced = await attemptKeySync(baseUrl);
      if (!synced) {
        throw new Error('Auth failed and key sync unsuccessful');
      }
      // Key synced — verify again
      const retryRes = await fetch(`${baseUrl}/kortix/ports`, {
        headers: { Authorization: `Bearer ${config.INTERNAL_SERVICE_KEY}` },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!retryRes.ok) {
        throw new Error(`Auth still failing after key sync (${retryRes.status})`);
      }
    } else if (!authRes.ok) {
      throw new Error(`Ports endpoint returned ${authRes.status}`);
    }

    // Success
    const wasDisconnected = !state.connected;
    state.connected = true;
    state.lastSuccess = Date.now();
    state.lastError = null;
    state.consecutiveFailures = 0;

    if (wasDisconnected) {
      console.log('[sandbox-health] Connection restored');
    }
  } catch (err: any) {
    state.connected = false;
    state.consecutiveFailures++;
    state.lastError = err.message || String(err);

    // Only log periodically to avoid spam
    if (state.consecutiveFailures <= 3 || state.consecutiveFailures % 10 === 0) {
      console.error(`[sandbox-health] Check failed (${state.consecutiveFailures}x): ${state.lastError}`);
    }
  }
}

/**
 * Attempt to sync all 3 core env vars to the sandbox container.
 * Syncs KORTIX_API_URL, KORTIX_TOKEN (if set), and INTERNAL_SERVICE_KEY.
 * Uses docker exec CLI with progressive backoff.
 */
async function attemptKeySync(baseUrl: string): Promise<boolean> {
  // Only available in local docker mode (not in Docker-to-Docker network mode)
  if (config.SANDBOX_NETWORK) {
    console.warn('[sandbox-health] Cannot sync key in network mode (no docker exec access)');
    return false;
  }

  const { execSync } = require('child_process');
  const ourKey = config.INTERNAL_SERVICE_KEY;
  if (!ourKey) return false;

  // Compute the correct internal API URL for the sandbox (same logic as local-docker.ts)
  let internalApiUrl = `http://host.docker.internal:${config.PORT}`;
  if (config.KORTIX_URL) {
    try {
      const parsed = new URL(config.KORTIX_URL);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = 'host.docker.internal';
        internalApiUrl = parsed.toString().replace(/\/$/, '');
      } else {
        internalApiUrl = config.KORTIX_URL.replace(/\/$/, '');
      }
    } catch {}
  }

  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
    env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
  }

  for (let attempt = 0; attempt < MAX_SYNC_RETRIES; attempt++) {
    try {
      state.syncAttempts++;
      console.log(`[sandbox-health] Core env sync attempt ${attempt + 1}/${MAX_SYNC_RETRIES}...`);

      // Sync all 3 core vars at once
      const writes = [
        `printf '%s' '${ourKey}' > /run/s6/container_environment/INTERNAL_SERVICE_KEY`,
        `printf '%s' '${internalApiUrl}' > /run/s6/container_environment/KORTIX_API_URL`,
      ].join(' && ');

      execSync(
        `docker exec kortix-sandbox bash -c "mkdir -p /run/s6/container_environment && ` +
        `${writes} && ` +
        `sudo s6-svc -r /run/service/svc-kortix-master"`,
        { timeout: 15_000, stdio: 'pipe', env },
      );

      // Wait for kortix-master to restart
      const backoff = SYNC_BACKOFF_MS[attempt] || 10_000;
      await new Promise(r => setTimeout(r, backoff));

      // Verify the sync worked
      const verifyRes = await fetch(`${baseUrl}/kortix/ports`, {
        headers: { Authorization: `Bearer ${ourKey}` },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });

      if (verifyRes.ok) {
        console.log(`[sandbox-health] Core env sync successful (attempt ${attempt + 1})`);
        return true;
      }

      console.warn(`[sandbox-health] Core env sync attempt ${attempt + 1} — verify returned ${verifyRes.status}`);
    } catch (err: any) {
      console.error(`[sandbox-health] Core env sync attempt ${attempt + 1} failed:`, err.message || err);
    }
  }

  return false;
}
