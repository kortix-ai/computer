import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { ErrorResponse, UpdateResponse } from '../schemas/common';

// ─── Constants ──────────────────────────────────────────────────────────────

const VERSION_FILE = '/opt/kortix/.version';
const CHANGELOG_FILE = '/opt/kortix/CHANGELOG.json';
const UPDATE_LOCK_FILE = '/opt/kortix/.update-lock';

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

/**
 * Services to restart after update. Order matters:
 * - opencode first (depends on /opt/opencode/)
 * - then other services
 * - kortix-master LAST (deferred — it's us)
 */
const SERVICES_TO_RESTART = [
  'svc-opencode-serve',
  'svc-opencode-web',
  'svc-lss-sync',
  'svc-agent-browser-viewer',
  'svc-presentation-viewer',
];

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
  const result = await run(`sudo s6-svc -r /run/service/${name}`);
  console.log(`[Update] restartService(${name}): ok=${result.ok} ${result.output}`);
}

// ─── ACID Update Lock (Durability) ──────────────────────────────────────────

interface UpdateLock {
  version: string;
  previousVersion: string;
  status: 'staging' | 'committing' | 'done';
  pid: number;
  startedAt: string;
}

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
    await run(`sudo rm -rf ${stagingDir}`);
    await deleteLock();
    return { success: false, output: `npm install failed: ${installResult.output.slice(0, 800)}` };
  }

  // Phase 2: VERIFY — check staging manifest exists and is complete
  console.log('[Update] Phase 2: Verifying staging...');
  try {
    const manifestFile = Bun.file(`${stagingDir}/.manifest`);
    if (!await manifestFile.exists()) {
      console.error('[Update] Staging manifest not found — postinstall may have failed');
      await run(`sudo rm -rf ${stagingDir}`);
      await deleteLock();
      return { success: false, output: 'Staging incomplete: manifest not found' };
    }
    const manifest = await manifestFile.json();
    if (manifest.status !== 'staged' || manifest.version !== targetVersion) {
      console.error('[Update] Staging manifest invalid:', manifest);
      await run(`sudo rm -rf ${stagingDir}`);
      await deleteLock();
      return { success: false, output: `Staging incomplete: ${JSON.stringify(manifest)}` };
    }
  } catch (e) {
    console.error('[Update] Failed to read staging manifest:', e);
    await run(`sudo rm -rf ${stagingDir}`);
    await deleteLock();
    return { success: false, output: `Staging verification failed: ${String(e)}` };
  }

  // Phase 3: COMMIT — atomic symlink swap
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
    // Rollback if we have a previous version
    if (prevStagingDir) {
      await rollbackSymlinks(prevStagingDir);
    }
    await deleteLock();
    return { success: false, output: `Symlink swap failed: ${commitResult.output}` };
  }

  // Phase 4: RESTART services (now pointing to new code via symlinks)
  console.log('[Update] Phase 4: Restarting services...');
  for (const svc of SERVICES_TO_RESTART) {
    console.log(`[Update] Restarting: ${svc}`);
    await restartService(svc);
  }

  // Phase 5: CLEANUP — remove old staging (keep current for future rollback)
  if (prevStagingDir && prevStagingDir !== stagingDir) {
    console.log(`[Update] Phase 5: Cleaning up old staging ${prevStagingDir}...`);
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
      return c.json({ error: 'Update failed', details: String(e) }, 500);
    }
  },
);

export default updateRouter;
