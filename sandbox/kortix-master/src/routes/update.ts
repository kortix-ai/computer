import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { ErrorResponse, UpdateResponse } from '../schemas/common';

// ─── Constants ──────────────────────────────────────────────────────────────

const VERSION_FILE = '/opt/kortix/.version';
const CHANGELOG_FILE = '/opt/kortix/CHANGELOG.json';

async function getChangelog(version: string) {
  try {
    const file = Bun.file(CHANGELOG_FILE);
    if (await file.exists()) {
      const entries = await file.json();
      return entries.find((e: any) => e.version === version) ?? null;
    }
  } catch {}
  return null;
}

/**
 * Services to restart after update. Order matters:
 * - opencode first (depends on /opt/opencode/)
 * - then other services
 * - kortix-master LAST (deferred — it's us)
 *
 * Names must match s6-rc.d service directories (svc-* prefix).
 */
const SERVICES_TO_RESTART = [
  'svc-opencode-serve',
  'svc-opencode-web',
  'svc-lss-sync',
  'svc-agent-browser-viewer',
  'svc-presentation-viewer',
];

// ─── State ──────────────────────────────────────────────────────────────────

let updateInProgress = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readLocalVersion(): Promise<string> {
  try {
    const file = Bun.file(VERSION_FILE);
    if (await file.exists()) {
      const data = await file.json();
      return data.version || '0.0.0';
    }
  } catch (e) {
    console.error('[Update] Failed to read version file:', e);
  }
  return '0.0.0';
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
  // s6-overlay v3: supervise control pipe is root-owned, so sudo is required.
  // Services live under /run/service/{name} in the LinuxServer webtop base.
  const result = await run(`sudo s6-svc -r /run/service/${name}`);
  console.log(`[Update] restartService(${name}): ok=${result.ok} ${result.output}`);
}

async function performUpdate(targetVersion: string): Promise<{
  success: boolean;
  output: string;
}> {
  console.log(`[Update] Installing @kortix/sandbox@${targetVersion}...`);

  const result = await run(`sudo npm install -g @kortix/sandbox@${targetVersion} 2>&1`);

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
  setTimeout(() => restartService('svc-kortix-master'), 2000);

  return { success: true, output: result.output.slice(0, 1000) };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const updateRouter = new Hono();

/**
 * POST /kortix/update
 *
 * User-triggered update. Frontend passes the target version.
 * Installs the package, restarts services.
 * Only runs when explicitly called.
 *
 * Body: { "version": "0.4.3" }
 */
updateRouter.post('/',
  describeRoute({
    tags: ['System'],
    summary: 'Trigger sandbox update',
    description: 'User-triggered sandbox update. Installs the specified @kortix/sandbox version, restarts all services, and self-restarts kortix-master (deferred 2s so the response completes).',
    responses: {
      200: { description: 'Update result', content: { 'application/json': { schema: resolver(UpdateResponse) } } },
      400: { description: 'Missing version', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      409: { description: 'Update already in progress', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      500: { description: 'Update failed', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    if (updateInProgress) {
      return c.json({ error: 'Update already in progress' }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const targetVersion = body.version;

    if (!targetVersion || typeof targetVersion !== 'string') {
      return c.json({ error: 'Missing "version" in request body' }, 400);
    }

    updateInProgress = true;
    try {
      const currentVersion = await readLocalVersion();

      if (currentVersion === targetVersion) {
        return c.json({
          upToDate: true,
          currentVersion,
        });
      }

      console.log(`[Update] User triggered: ${currentVersion} -> ${targetVersion}`);
      const update = await performUpdate(targetVersion);

      const changelog = update.success ? await getChangelog(targetVersion) : null;
      return c.json({
        success: update.success,
        previousVersion: currentVersion,
        currentVersion: update.success ? targetVersion : currentVersion,
        changelog,
        output: update.output,
      });
    } catch (e) {
      console.error('[Update] Error:', e);
      return c.json({ error: 'Update failed', details: String(e) }, 500);
    } finally {
      updateInProgress = false;
    }
  },
);

export default updateRouter;
