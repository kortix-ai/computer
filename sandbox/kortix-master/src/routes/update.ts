import { Hono } from 'hono';
import { config } from '../config';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LocalVersion {
  version: string;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VERSION_FILE = '/opt/kortix/.version';

/**
 * Services to restart after update. Order matters:
 * - opencode first (depends on /opt/opencode/)
 * - then other services
 * - kortix-master LAST (deferred — it's us)
 */
const SERVICES_TO_RESTART = [
  'opencode-serve',
  'opencode-web',
  'lss-sync',
  'agent-browser-viewer',
  'KORTIX-presentation-viewer',
];

// ─── State ──────────────────────────────────────────────────────────────────

let updateInProgress = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readLocalVersion(): Promise<LocalVersion> {
  try {
    const file = Bun.file(VERSION_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch (e) {
    console.error('[Update] Failed to read version file:', e);
  }
  return { version: '0.0.0', updatedAt: '' };
}

async function fetchLatestVersion(): Promise<string | null> {
  const url = `${config.KORTIX_API_URL}/v1/sandbox/version`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[Update] Version fetch failed: ${res.status}`);
      return null;
    }
    const data = await res.json() as { version: string };
    return data.version;
  } catch (e) {
    console.error('[Update] Failed to fetch version:', e);
    return null;
  }
}

async function run(cmd: string): Promise<{ ok: boolean; output: string }> {
  try {
    const proc = Bun.spawn(['bash', '-c', cmd], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: '/workspace' },
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { ok: exitCode === 0, output: (stdout + '\n' + stderr).trim() };
  } catch (e) {
    return { ok: false, output: String(e) };
  }
}

async function restartService(name: string): Promise<void> {
  await run(`s6-svc -r /var/run/s6/services/${name} 2>/dev/null || s6-svc -r /etc/services.d/${name} 2>/dev/null || true`);
}

async function performUpdate(targetVersion: string): Promise<{
  success: boolean;
  output: string;
}> {
  console.log(`[Update] Installing @kortix/sandbox@${targetVersion}...`);

  const result = await run(`npm install -g @kortix/sandbox@${targetVersion} 2>&1`);

  if (!result.ok) {
    console.error('[Update] npm install failed:', result.output);
    return { success: false, output: result.output.slice(0, 1000) };
  }

  console.log('[Update] Install complete, restarting services...');

  for (const svc of SERVICES_TO_RESTART) {
    console.log(`[Update] Restarting: ${svc}`);
    await restartService(svc);
  }

  // Self-restart deferred so the HTTP response completes
  console.log('[Update] Scheduling kortix-master restart in 2s...');
  setTimeout(() => restartService('kortix-master'), 2000);

  return { success: true, output: result.output.slice(0, 1000) };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const updateRouter = new Hono();

/**
 * GET /kortix/update/status
 *
 * Returns current sandbox version + latest available version.
 * Frontend uses this to decide whether to show "Update available".
 * Read-only — does NOT trigger any update.
 */
updateRouter.get('/status', async (c) => {
  const local = await readLocalVersion();
  const latest = await fetchLatestVersion();

  return c.json({
    currentVersion: local.version,
    latestVersion: latest || 'unknown',
    updateAvailable: latest ? local.version !== latest : false,
    updatedAt: local.updatedAt,
    updateInProgress,
  });
});

/**
 * POST /kortix/update
 *
 * User-triggered update. Fetches latest version, installs the package,
 * restarts services. Only runs when explicitly called.
 */
updateRouter.post('/', async (c) => {
  if (updateInProgress) {
    return c.json({ error: 'Update already in progress' }, 409);
  }

  updateInProgress = true;
  try {
    const local = await readLocalVersion();
    const latestVersion = await fetchLatestVersion();

    if (!latestVersion) {
      return c.json({ error: 'Could not reach version service' }, 502);
    }

    if (local.version === latestVersion) {
      return c.json({
        upToDate: true,
        currentVersion: local.version,
        latestVersion,
      });
    }

    console.log(`[Update] User triggered: ${local.version} -> ${latestVersion}`);
    const update = await performUpdate(latestVersion);

    return c.json({
      success: update.success,
      previousVersion: local.version,
      currentVersion: update.success ? latestVersion : local.version,
      latestVersion,
      output: update.output,
    });
  } catch (e) {
    console.error('[Update] Error:', e);
    return c.json({ error: 'Update failed', details: String(e) }, 500);
  } finally {
    updateInProgress = false;
  }
});

export default updateRouter;
