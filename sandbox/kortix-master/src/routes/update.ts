import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { ErrorResponse, UpdateResponse, UpdateStatusResponse } from '../schemas/common';
import { coreSupervisor } from '../services/core-supervisor';

// ─── Constants ──────────────────────────────────────────────────────────────

const VERSION_FILE = '/opt/kortix/.version';
const CHANGELOG_FILE = '/opt/kortix/CHANGELOG.json';
const UPDATE_LOCK_FILE = '/tmp/.kortix-update-lock';
const UPDATE_STATUS_FILE = '/tmp/.kortix-update-status.json';

// Directories managed by symlinks (atomic swap targets)
const SYMLINK_DIRS = ['kortix-master', 'opencode', 'agent-browser-viewer', 'kortix'] as const;

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

async function restartService(name: string): Promise<{ ok: boolean; output: string }> {
  const result = await run(`sudo s6-svc -r /run/service/${name}`);
  console.log(`[Update] restartService(${name}): ok=${result.ok} ${result.output}`);
  return result;
}

// ─── ACID Update Lock (Durability) ──────────────────────────────────────────

interface UpdateLock {
  version: string;
  previousVersion: string;
  status: 'staging' | 'committing' | 'done';
  pid: number;
  startedAt: string;
}

type UpdatePhase =
  | 'idle'
  | 'staging'
  | 'verifying'
  | 'committing'
  | 'restarting'
  | 'validating'
  | 'rolling_back'
  | 'complete'
  | 'failed';

interface UpdateStatus {
  inProgress: boolean;
  phase: UpdatePhase;
  message: string;
  targetVersion: string | null;
  previousVersion: string | null;
  currentVersion: string;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
}

const DEFAULT_UPDATE_STATUS: UpdateStatus = {
  inProgress: false,
  phase: 'idle',
  message: 'No update in progress',
  targetVersion: null,
  previousVersion: null,
  currentVersion: '0.0.0',
  startedAt: null,
  updatedAt: null,
  error: null,
};

async function writeLock(lock: UpdateLock): Promise<void> {
  await Bun.write(UPDATE_LOCK_FILE, JSON.stringify(lock));
}

async function readLock(): Promise<UpdateLock | null> {
  try {
    const file = Bun.file(UPDATE_LOCK_FILE);
    if (await file.exists()) return await file.json();
  } catch {}
  return null;
}

async function deleteLock(): Promise<void> {
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(UPDATE_LOCK_FILE);
  } catch {}
}

async function readStatus(): Promise<UpdateStatus> {
  try {
    const file = Bun.file(UPDATE_STATUS_FILE);
    if (await file.exists()) {
      const data = await file.json();
      return {
        ...DEFAULT_UPDATE_STATUS,
        ...data,
      } as UpdateStatus;
    }
  } catch {}
  return { ...DEFAULT_UPDATE_STATUS };
}

async function writeStatus(next: UpdateStatus): Promise<void> {
  await Bun.write(UPDATE_STATUS_FILE, JSON.stringify(next));
}

async function setStatus(
  patch: Partial<UpdateStatus> & Pick<UpdateStatus, 'phase' | 'message'>,
): Promise<void> {
  const current = await readStatus();
  const now = new Date().toISOString();
  const merged: UpdateStatus = {
    ...current,
    ...patch,
    updatedAt: now,
  };
  await writeStatus(merged);
}

async function resetStatus(currentVersion: string): Promise<void> {
  await writeStatus({
    ...DEFAULT_UPDATE_STATUS,
    currentVersion,
    updatedAt: new Date().toISOString(),
  });
}

// ─── ACID: Resolve current symlink target version ───────────────────────────

async function getCurrentStagingVersion(): Promise<string | null> {
  try {
    const result = await run('readlink -f /opt/kortix-master');
    if (!result.ok) return null;
    // /opt/kortix-staging-0.7.5/kortix-master → extract 0.7.5
    const match = result.output.trim().match(/kortix-staging-([^/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── ACID: Atomic Symlink Swap ──────────────────────────────────────────────

async function commitSymlinks(stagingDir: string): Promise<{ ok: boolean; output: string }> {
  // ln -sfn is atomic on Linux (single rename() syscall internally)
  // We swap all 4 symlinks. If one fails mid-way, rollback handles it.
  const cmds: string[] = [];
  for (const dir of SYMLINK_DIRS) {
    const target = `${stagingDir}/${dir}`;
    const link = `/opt/${dir}`;
    cmds.push(`sudo ln -sfn "${target}" "${link}"`);
  }
  return run(cmds.join(' && '));
}

async function rollbackSymlinks(previousStagingDir: string): Promise<void> {
  console.warn(`[Update] Rolling back symlinks to ${previousStagingDir}`);
  for (const dir of SYMLINK_DIRS) {
    const target = `${previousStagingDir}/${dir}`;
    const link = `/opt/${dir}`;
    await run(`sudo ln -sfn "${target}" "${link}"`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthyTargetVersion(
  targetVersion: string,
  timeoutMs = 90_000,
): Promise<{ ok: boolean; output: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastOutput = 'Health check did not complete';

  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:8000/kortix/health', {
        signal: AbortSignal.timeout(4_000),
      });
      const body = await res.json().catch(() => ({}));
      const bodyVersion = typeof body?.version === 'string' ? body.version : 'unknown';
      const bodyStatus = typeof body?.status === 'string' ? body.status : 'unknown';
      const bodyOpenCode = !!body?.opencode;
      lastOutput = `http=${res.status} status=${bodyStatus} version=${bodyVersion} opencode=${bodyOpenCode}`;

      if (res.status === 200 && bodyVersion === targetVersion && bodyOpenCode) {
        return { ok: true, output: lastOutput };
      }
    } catch (e) {
      lastOutput = `health probe error: ${String(e)}`;
    }
    await sleep(2_000);
  }

  return { ok: false, output: lastOutput };
}

// ─── ACID: Full Update Flow ─────────────────────────────────────────────────

async function performUpdate(targetVersion: string, currentVersion: string): Promise<{
  success: boolean;
  output: string;
}> {
  const stagingDir = `/opt/kortix-staging-${targetVersion}`;

  // Resolve previous staging dir (for rollback)
  const prevStagingVersion = await getCurrentStagingVersion();
  const prevStagingDir = prevStagingVersion
    ? `/opt/kortix-staging-${prevStagingVersion}`
    : null;

  // Phase 1: STAGING — npm install triggers postinstall.sh which builds staging dir
  await setStatus({
    inProgress: true,
    phase: 'staging',
    message: `Staging @kortix/sandbox@${targetVersion}`,
    targetVersion,
    previousVersion: currentVersion,
    currentVersion,
    startedAt: new Date().toISOString(),
    error: null,
  });
  console.log(`[Update] Phase 1: Staging @kortix/sandbox@${targetVersion}...`);
  await writeLock({
    version: targetVersion,
    previousVersion: currentVersion,
    status: 'staging',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  const installResult = await run(`sudo npm install -g @kortix/sandbox@${targetVersion} 2>&1`);

  if (!installResult.ok) {
    console.error('[Update] npm install failed:', installResult.output);
    // Clean up failed staging
    await run(`sudo rm -rf "${stagingDir}"`);
    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Update failed during package staging',
      error: installResult.output.slice(0, 1200),
    });
    await deleteLock();
    return { success: false, output: `npm install failed: ${installResult.output.slice(0, 800)}` };
  }

  // Phase 2: VERIFY — check staging manifest exists and is complete
  await setStatus({
    phase: 'verifying',
    message: 'Verifying staged artifacts',
  });
  console.log('[Update] Phase 2: Verifying staging...');
  try {
    const manifestFile = Bun.file(`${stagingDir}/.manifest`);
    if (!await manifestFile.exists()) {
      console.error('[Update] Staging manifest not found — postinstall may have failed');
      await run(`sudo rm -rf "${stagingDir}"`);
      await setStatus({
        inProgress: false,
        phase: 'failed',
        message: 'Staging verification failed',
        error: 'Staging incomplete: manifest not found',
      });
      await deleteLock();
      return { success: false, output: 'Staging incomplete: manifest not found' };
    }
    const manifest = await manifestFile.json();
    if (manifest.status !== 'staged' || manifest.version !== targetVersion) {
      console.error('[Update] Staging manifest invalid:', manifest);
      await run(`sudo rm -rf "${stagingDir}"`);
      await setStatus({
        inProgress: false,
        phase: 'failed',
        message: 'Staging verification failed',
        error: `Staging incomplete: ${JSON.stringify(manifest)}`,
      });
      await deleteLock();
      return { success: false, output: `Staging incomplete: ${JSON.stringify(manifest)}` };
    }

    const coreManifestFile = Bun.file(`${stagingDir}/kortix/core/manifest.json`);
    const serviceSpecFile = Bun.file(`${stagingDir}/kortix/core/service-spec.json`);
    if (!await coreManifestFile.exists() || !await serviceSpecFile.exists()) {
      await run(`sudo rm -rf "${stagingDir}"`);
      await setStatus({
        inProgress: false,
        phase: 'failed',
        message: 'Core manifest/spec verification failed',
        error: 'Missing core/manifest.json or core/service-spec.json in staged release',
      });
      await deleteLock();
      return { success: false, output: 'Staging incomplete: missing core manifest/spec' };
    }
  } catch (e) {
    console.error('[Update] Failed to read staging manifest:', e);
    await run(`sudo rm -rf "${stagingDir}"`);
    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Staging verification failed',
      error: String(e),
    });
    await deleteLock();
    return { success: false, output: `Staging verification failed: ${String(e)}` };
  }

  // Phase 3: COMMIT — atomic symlink swap
  await setStatus({
    phase: 'committing',
    message: 'Committing staged version via atomic symlink swap',
  });
  console.log('[Update] Phase 3: Committing (atomic symlink swap)...');
  await writeLock({
    version: targetVersion,
    previousVersion: currentVersion,
    status: 'committing',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  const commitResult = await commitSymlinks(stagingDir);
  if (!commitResult.ok) {
    console.error('[Update] Symlink swap failed:', commitResult.output);
    await setStatus({
      phase: 'rolling_back',
      message: 'Commit failed, rolling back symlinks',
      error: commitResult.output.slice(0, 1200),
    });
    // Rollback if we have a previous version
    if (prevStagingDir) {
      await rollbackSymlinks(prevStagingDir);
    }
    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Update failed during commit',
      error: commitResult.output.slice(0, 1200),
    });
    await deleteLock();
    return { success: false, output: `Symlink swap failed: ${commitResult.output}` };
  }

  // Phase 4: RESTART services (now pointing to new code via symlinks)
  await setStatus({
    phase: 'restarting',
    message: 'Restarting services on new version',
  });
  console.log('[Update] Phase 4: Reconciling core services...');
  const reconcileResult = await coreSupervisor.reconcileFromDisk();
  if (!reconcileResult.ok) {
    const restartError = `Core reconcile failed: ${reconcileResult.output}`;
    console.error('[Update]', restartError);
    await setStatus({
      phase: 'rolling_back',
      message: 'Core reconcile failed, rolling back',
      error: restartError.slice(0, 1200),
    });

    if (prevStagingDir) {
      await rollbackSymlinks(prevStagingDir);
      await coreSupervisor.reconcileFromDisk();
    }

    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Update rolled back after service reconcile failure',
      error: restartError.slice(0, 1200),
    });
    await deleteLock();
    return { success: false, output: restartError };
  }

  // Phase 5: VALIDATE — ensure new version is healthy before finalizing
  await setStatus({
    phase: 'validating',
    message: 'Validating health of committed version',
  });
  const healthResult = await waitForHealthyTargetVersion(targetVersion);
  if (!healthResult.ok) {
    const healthError = `Post-commit health check failed: ${healthResult.output}`;
    console.error('[Update]', healthError);
    await setStatus({
      phase: 'rolling_back',
      message: 'Health check failed, rolling back',
      error: healthError.slice(0, 1200),
    });

    if (prevStagingDir) {
      await rollbackSymlinks(prevStagingDir);
      await coreSupervisor.reconcileFromDisk();
    }

    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Update rolled back after health validation failure',
      error: healthError.slice(0, 1200),
    });
    await deleteLock();
    return { success: false, output: healthError };
  }

  // Phase 6: CLEANUP — remove old staging (keep current for future rollback)
  if (prevStagingDir && prevStagingDir !== stagingDir) {
    console.log(`[Update] Phase 6: Cleaning up old staging ${prevStagingDir}...`);
    await run(`sudo rm -rf "${prevStagingDir}"`);
  }

  // Mark lock as done, then delete it
  await writeLock({
    version: targetVersion,
    previousVersion: currentVersion,
    status: 'done',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
  await deleteLock();

  await setStatus({
    inProgress: false,
    phase: 'complete',
    message: `Update complete: ${currentVersion} -> ${targetVersion}`,
    targetVersion,
    previousVersion: currentVersion,
    currentVersion: targetVersion,
    error: null,
  });

  // Self-restart deferred so the HTTP response completes
  console.log('[Update] Scheduling kortix-master restart in 2s...');
  setTimeout(() => restartService('svc-kortix-master'), 2000);

  return { success: true, output: installResult.output.slice(0, 1000) };
}

// ─── Crash Recovery (called from index.ts on boot) ──────────────────────────

export async function recoverFromCrashedUpdate(): Promise<void> {
  const lock = await readLock();
  if (!lock) return;

  console.warn(`[Update] Found stale update lock:`, lock);

  if (lock.status === 'staging') {
    // Crashed during staging — staging dir is incomplete, live system untouched
    console.warn(`[Update] Cleaning up incomplete staging for ${lock.version}`);
    await run(`sudo rm -rf /opt/kortix-staging-${lock.version}`);
    await deleteLock();
    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Recovered from interrupted staging update',
      targetVersion: lock.version,
      previousVersion: lock.previousVersion,
      error: 'Recovered interrupted staging update on boot',
    });
    console.log('[Update] Crash recovery complete — system unchanged');
  } else if (lock.status === 'committing') {
    // Crashed during symlink swap — may be in partial state
    // Safest: try to rollback to previous version
    const prevDir = `/opt/kortix-staging-${lock.previousVersion}`;
    const prevExists = await Bun.file(`${prevDir}/.manifest`).exists();
    if (prevExists) {
      console.warn(`[Update] Rolling back partial commit to ${lock.previousVersion}`);
      await rollbackSymlinks(prevDir);
      await run(`sudo rm -rf /opt/kortix-staging-${lock.version}`);
    } else {
      // No previous staging to rollback to — try to complete the commit
      const newDir = `/opt/kortix-staging-${lock.version}`;
      const newExists = await Bun.file(`${newDir}/.manifest`).exists();
      if (newExists) {
        console.warn(`[Update] Completing interrupted commit for ${lock.version}`);
        await commitSymlinks(newDir);
      } else {
        console.error('[Update] Both staging dirs missing — system may be in bad state');
      }
    }
    await deleteLock();
    await setStatus({
      inProgress: false,
      phase: 'failed',
      message: 'Recovered from interrupted commit update',
      targetVersion: lock.version,
      previousVersion: lock.previousVersion,
      error: 'Recovered interrupted commit update on boot',
    });
    console.log('[Update] Crash recovery complete');
  } else if (lock.status === 'done') {
    // Lock left behind after successful update — just clean it up
    await deleteLock();
  }
}

// ─── Stale staging cleanup (called from index.ts on boot) ───────────────────

export async function cleanupStaleStagingDirs(): Promise<void> {
  try {
    // Find all staging dirs
    const result = await run('ls -d /opt/kortix-staging-* 2>/dev/null || true');
    if (!result.ok || !result.output.trim()) return;

    const currentVersion = await getCurrentStagingVersion();
    const dirs = result.output.trim().split('\n').filter(Boolean);

    for (const dir of dirs) {
      // Extract version from dir name
      const match = dir.match(/kortix-staging-(.+)$/);
      if (!match) continue;
      const version = match[1];
      // Keep current version's staging dir (it's the live one)
      if (version === currentVersion) continue;
      console.log(`[Update] Cleaning stale staging dir: ${dir}`);
      await run(`sudo rm -rf "${dir}"`);
    }
  } catch (e) {
    console.warn('[Update] Cleanup error:', e);
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const updateRouter = new Hono();

updateRouter.get('/status',
  describeRoute({
    tags: ['System'],
    summary: 'Sandbox update status',
    description: 'Returns current update phase, target/current versions, and last error if any.',
    responses: {
      200: {
        description: 'Current update status',
        content: { 'application/json': { schema: resolver(UpdateStatusResponse) } },
      },
    },
  }),
  async (c) => {
    const currentVersion = await readLocalVersion();
    const lock = await readLock();
    const status = await readStatus();
    const inProgress = !!(lock && lock.status !== 'done') || status.inProgress;

    return c.json({
      ...status,
      inProgress,
      currentVersion,
    });
  },
);

/**
 * POST /kortix/update
 *
 * ACID update flow:
 *   1. STAGE — npm install builds new version in /opt/kortix-staging-{version}/
 *   2. VERIFY — check staging manifest is complete
 *   3. COMMIT — atomic symlink swap (/opt/kortix-master → staging dir)
 *   4. RESTART — restart all services
 *   5. CLEANUP — remove old staging dir
 *
 * On failure before commit: staging dir is deleted, live system untouched.
 * On failure during commit: rollback symlinks to previous staging dir.
 * On crash: lock file enables recovery on next boot.
 */
updateRouter.post('/',
  describeRoute({
    tags: ['System'],
    summary: 'Trigger sandbox update (ACID)',
    description: 'ACID sandbox update. Stages new version in isolation, atomically swaps symlinks, restarts services. On failure: auto-rollback. On crash: auto-recovery on boot.',
    responses: {
      200: { description: 'Update result', content: { 'application/json': { schema: resolver(UpdateResponse) } } },
      400: { description: 'Missing version', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      409: { description: 'Update already in progress', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      500: { description: 'Update failed', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  async (c) => {
    // Check for in-progress update via lock file (survives crashes)
    const existingLock = await readLock();
    if (existingLock && existingLock.status !== 'done') {
      return c.json({ error: 'Update already in progress' }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const targetVersion = body.version;

    if (!targetVersion || typeof targetVersion !== 'string') {
      return c.json({ error: 'Missing "version" in request body' }, 400);
    }

    try {
      const currentVersion = await readLocalVersion();

      if (currentVersion === targetVersion) {
        await resetStatus(currentVersion);
        return c.json({
          upToDate: true,
          currentVersion,
        });
      }

      console.log(`[Update] User triggered: ${currentVersion} -> ${targetVersion}`);
      const update = await performUpdate(targetVersion, currentVersion);

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
      await deleteLock();
      const currentVersion = await readLocalVersion();
      await setStatus({
        inProgress: false,
        phase: 'failed',
        message: 'Update failed with unexpected error',
        currentVersion,
        error: String(e).slice(0, 1200),
      });
      return c.json({ error: 'Update failed', details: String(e) }, 500);
    }
  },
);

export default updateRouter;
