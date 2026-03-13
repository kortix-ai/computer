/**
 * Local Docker sandbox provider.
 *
 * Manages a SINGLE sandbox container on the local Docker daemon.
 * Uses FIXED host ports (SANDBOX_PORT_BASE..SANDBOX_PORT_BASE+6)
 * so the frontend always connects to the same address regardless of
 * container lifecycle.
 *
 * Container name is always `kortix-sandbox` — there is exactly one.
 */

import Docker from 'dockerode';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { generateSandboxKeyPair } from '../../shared/crypto';
import type {
  SandboxProvider,
  ProviderName,
  CreateSandboxOpts,
  ProvisionResult,
  SandboxStatus,
  ResolvedEndpoint,
} from './index';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Fixed container name — one sandbox, ever. */
const CONTAINER_NAME = 'kortix-sandbox';

const PORT_BASE = config.SANDBOX_PORT_BASE;

/**
 * Fixed port mappings: containerPort → hostPort.
 * Default base is 14000 but can be overridden via SANDBOX_PORT_BASE.
 */
const PORT_MAP: Record<string, string> = {
  '8000': String(PORT_BASE + 0), // Kortix Master (OpenCode proxy)
  '3111': String(PORT_BASE + 1), // OpenCode Web UI
  '6080': String(PORT_BASE + 2), // Desktop (noVNC)
  '6081': String(PORT_BASE + 3), // Desktop (HTTPS)
  '3210': String(PORT_BASE + 4), // Presentation Viewer
  '9223': String(PORT_BASE + 5), // Agent Browser Stream
  '9224': String(PORT_BASE + 6), // Agent Browser Viewer
  '22':   String(PORT_BASE + 7), // SSH
};

const BASE_URL = `http://localhost:${PORT_MAP['8000']}`;



/** ExposedPorts for Docker container config. */
const EXPOSED_PORTS: Record<string, {}> = Object.fromEntries(
  Object.keys(PORT_MAP).map((p) => [`${p}/tcp`, {}]),
);

/** PortBindings for Docker HostConfig — bound to 127.0.0.1 (localhost only). */
const PORT_BINDINGS: Record<string, { HostPort: string; HostIp: string }[]> = Object.fromEntries(
  Object.entries(PORT_MAP).map(([container, host]) => [
    `${container}/tcp`,
    [{ HostPort: host, HostIp: '127.0.0.1' }],
  ]),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the URL the sandbox container should use to reach kortix-api.
 *
 * This is the INTERNAL url — how the sandbox talks to kortix-api from inside Docker.
 * NOT the external/browser-facing URL.
 *
 * - Shared Docker network (SANDBOX_NETWORK set):  http://kortix-api:{PORT}  (Docker DNS)
 * - Default bridge (sandbox on host ports):        http://host.docker.internal:{PORT}
 *
 * If KORTIX_URL is set to something other than localhost (e.g. a real domain),
 * we use it as-is since the sandbox can reach it directly.
 */
function getSandboxInternalApiUrl(): string {
  // Shared Docker network: both containers resolve each other by name
  if (config.SANDBOX_NETWORK) {
    return `http://kortix-api:${config.PORT}`;
  }

  const externalUrl = config.KORTIX_URL?.replace(/\/v1\/router\/?$/, '');
  if (externalUrl) {
    try {
      const parsed = new URL(externalUrl);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = 'host.docker.internal';
        return parsed.toString().replace(/\/$/, '');
      }
      return externalUrl.replace(/\/$/, '');
    } catch {
    }
  }

  return `http://host.docker.internal:${config.PORT}`;
}

/**
 * Read key=value pairs from the sandbox/docker/.env file.
 * API keys and credentials that OpenCode needs inside the container.
 */
function readSandboxEnv(): string[] {
  const candidates = [
    resolve(__dirname, '../../../../sandbox/docker/.env'),
    resolve(process.cwd(), 'sandbox/docker/.env'),
    resolve(process.cwd(), '../../sandbox/docker/.env'),
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='));
    } catch {
      continue;
    }
  }
  return [];
}

function getDocker(): Docker {
  if (config.DOCKER_HOST) {
    if (config.DOCKER_HOST.startsWith('tcp://') || config.DOCKER_HOST.startsWith('http://')) {
      const url = new URL(config.DOCKER_HOST);
      return new Docker({ host: url.hostname, port: parseInt(url.port || '2375') });
    }
    // Strip unix:// prefix — dockerode expects a bare path (e.g. /var/run/docker.sock)
    const socketPath = config.DOCKER_HOST.replace(/^unix:\/\//, '');
    return new Docker({ socketPath });
  }
  return new Docker();
}

// ─── Image Pull State ────────────────────────────────────────────────────────

export interface ImagePullStatus {
  state: 'idle' | 'pulling' | 'done' | 'error';
  /** 0-100 progress percentage */
  progress: number;
  /** Human-readable status message */
  message: string;
  error?: string;
}

/** Singleton pull state — one sandbox, one pull at a time. */
let _pullStatus: ImagePullStatus = { state: 'idle', progress: 0, message: '' };

export function getImagePullStatus(): ImagePullStatus {
  return { ..._pullStatus };
}

// ─── Sandbox Update State ────────────────────────────────────────────────────

export type SandboxUpdatePhase =
  | 'idle'
  | 'pulling'
  | 'stopping'
  | 'removing'
  | 'recreating'
  | 'starting'
  | 'health_check'
  | 'complete'
  | 'failed';

export interface SandboxUpdateStatus {
  phase: SandboxUpdatePhase;
  progress: number;
  message: string;
  targetVersion: string | null;
  previousVersion: string | null;
  currentVersion: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
}

const IDLE_UPDATE_STATUS: SandboxUpdateStatus = {
  phase: 'idle',
  progress: 0,
  message: '',
  targetVersion: null,
  previousVersion: null,
  currentVersion: null,
  error: null,
  startedAt: null,
  updatedAt: null,
};

let _updateStatus: SandboxUpdateStatus = { ...IDLE_UPDATE_STATUS };

export function getSandboxUpdateStatus(): SandboxUpdateStatus {
  return { ..._updateStatus };
}

export function resetSandboxUpdateStatus(): void {
  _updateStatus = { ...IDLE_UPDATE_STATUS };
}

function setUpdateStatus(partial: Partial<SandboxUpdateStatus>): void {
  _updateStatus = { ..._updateStatus, ...partial, updatedAt: new Date().toISOString() };
}

/**
 * Derive the target image name from a version string.
 * Uses the current SANDBOX_IMAGE config as the base (strips existing tag).
 * e.g. "kortix/computer:0.7.5" + version "0.8.0" → "kortix/computer:0.8.0"
 */
function getImageForVersion(version: string): string {
  const current = config.SANDBOX_IMAGE;
  const colonIdx = current.lastIndexOf(':');
  const base = colonIdx > 0 ? current.slice(0, colonIdx) : current;
  return `${base}:${version}`;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class LocalDockerProvider implements SandboxProvider {
  readonly name: ProviderName = 'local_docker';
  private docker: Docker;
  private _serviceKeySynced = false;

  constructor() {
    this.docker = getDocker();
  }

  // ── Core: get-or-create the single sandbox ──────────────────────────────

  async ensure(): Promise<SandboxInfo> {
    const existing = await this.find();

    if (existing) {
      if (existing.status === 'running') {
        await this.syncCoreEnvVars();
        // If the caller provided a KORTIX_TOKEN (e.g. POST /init/local registered
        // a new key in the DB), push it into the running container so the container
        // token always matches the DB. Without this, a warm-started container keeps
        // its auto-generated token while the DB has a different one.
        const callerToken = this._lastCreateOpts?.envVars?.KORTIX_TOKEN;
        if (callerToken) {
          await this.syncTokenToContainer(callerToken);
        }
        return existing;
      }
      console.log(`[LOCAL-DOCKER] Starting stopped sandbox...`);
      const container = this.docker.getContainer(existing.containerId);
      try {
        await container.start();
      } catch (err: any) {
        const message = err?.message || String(err);
        if (!message.includes('marked for removal')) throw err;
        console.warn('[LOCAL-DOCKER] Existing sandbox container is marked for removal, recreating...');
        try {
          await container.remove({ force: true, v: false });
        } catch {
          // ignore and continue to recreate
        }
        await this.createContainer();
        return this.getSandboxInfo();
      }
      await this.syncCoreEnvVars();
      return this.getSandboxInfo();
    }

    console.log(`[LOCAL-DOCKER] Creating sandbox (image: ${config.SANDBOX_IMAGE})...`);
    await this.createContainer();
    return this.getSandboxInfo();
  }

  async find(): Promise<SandboxInfo | null> {
    try {
      const container = this.docker.getContainer(CONTAINER_NAME);
      const info = await container.inspect();
      return this.toSandboxInfo(info);
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  async getSandboxInfo(): Promise<SandboxInfo> {
    const info = await this.find();
    if (!info) throw new Error('Sandbox container not found');
    return info;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const container = this.docker.getContainer(CONTAINER_NAME);
    await container.start();
  }

  async stop(): Promise<void> {
    const container = this.docker.getContainer(CONTAINER_NAME);
    await container.stop({ t: 10 });
  }

  async restart(): Promise<void> {
    const container = this.docker.getContainer(CONTAINER_NAME);
    await container.restart({ t: 10 });
  }

  async remove(): Promise<void> {
    const container = this.docker.getContainer(CONTAINER_NAME);
    try {
      await container.stop({ t: 5 });
    } catch {
      // May already be stopped
    }
    await container.remove({ v: false });
  }

  /**
   * Update the sandbox to a new Docker image version.
   *
   * Flow: pull new image → stop container → remove container (preserve volumes)
   *       → recreate container with new image → start → health check.
   *
   * The /workspace volume is preserved across the recreate (v: false on remove).
   * Returns the new SandboxInfo on success, throws on failure.
   */
  async updateSandbox(targetVersion: string): Promise<SandboxInfo> {
    if (_updateStatus.phase !== 'idle' && _updateStatus.phase !== 'complete' && _updateStatus.phase !== 'failed') {
      throw new Error(`Update already in progress (phase: ${_updateStatus.phase})`);
    }

    const targetImage = getImageForVersion(targetVersion);
    let previousVersion: string | null = null;

    try {
      // Get current version from running container
      const existing = await this.find();
      if (existing) {
        const currentTag = existing.image.split(':').pop() || null;
        previousVersion = currentTag;
      }

      setUpdateStatus({
        phase: 'pulling',
        progress: 10,
        message: `Checking image ${targetImage}...`,
        targetVersion,
        previousVersion,
        currentVersion: previousVersion,
        error: null,
        startedAt: new Date().toISOString(),
      });

      // 1. Pull the new image (skip if already exists locally)
      let imageExistsLocally = false;
      try {
        await this.docker.getImage(targetImage).inspect();
        imageExistsLocally = true;
        console.log(`[LOCAL-DOCKER] Image ${targetImage} already exists locally, skipping pull`);
        setUpdateStatus({ progress: 50, message: `Image ${targetImage} found locally` });
      } catch {
        // Image not found locally — pull it
      }

      if (!imageExistsLocally) {
        console.log(`[LOCAL-DOCKER] Pulling image ${targetImage} for update...`);
        setUpdateStatus({ message: `Pulling image ${targetImage}...` });
        await this.pullImageByName(targetImage);
      }

      // 2. Stop the running container
      setUpdateStatus({ phase: 'stopping', progress: 50, message: 'Stopping sandbox...' });
      console.log(`[LOCAL-DOCKER] Stopping sandbox for update...`);
      try {
        const container = this.docker.getContainer(CONTAINER_NAME);
        await container.stop({ t: 15 });
      } catch (err: any) {
        // Container may not be running — that's fine
        if (!err?.message?.includes('not running') && !err?.message?.includes('No such container')) {
          console.warn(`[LOCAL-DOCKER] Stop warning: ${err.message}`);
        }
      }

      // 3. Remove the container (preserve volumes with v: false)
      setUpdateStatus({ phase: 'removing', progress: 60, message: 'Removing old container...' });
      console.log(`[LOCAL-DOCKER] Removing old container (preserving volumes)...`);
      try {
        const container = this.docker.getContainer(CONTAINER_NAME);
        await container.remove({ v: false, force: true });
      } catch (err: any) {
        if (err?.statusCode !== 404) {
          console.warn(`[LOCAL-DOCKER] Remove warning: ${err.message}`);
        }
      }

      // 3.5. Prepare the data volume for the new container.
      // After container recreate with a different image, two things can go wrong:
      //   a) Stale WAL/SHM files from the old sqlite instance → "readonly database"
      //   b) Wrong UID ownership (old container UID != new container UID) → write errors
      // We fix both using a throwaway alpine container (lightweight, no custom entrypoint).
      console.log(`[LOCAL-DOCKER] Preparing volume for new container...`);
      try {
        const cleanupContainer = await this.docker.createContainer({
          Image: 'alpine:latest',
          Cmd: ['sh', '-c', [
            // Fix ownership — use numeric UID 1000 (standard abc user in sandbox images)
            'chown -R 1000:1000 /workspace 2>/dev/null || true',
            // Remove stale WAL/SHM files that cause "readonly database" errors
            'find /workspace -name "*.db-wal" -o -name "*.db-shm" 2>/dev/null | xargs rm -f',
            'echo "volume prepared"',
          ].join(' && ')],
          HostConfig: {
            Binds: [`${CONTAINER_NAME}-data:/workspace`],
          },
        });
        await cleanupContainer.start();
        await cleanupContainer.wait();
        await cleanupContainer.remove().catch(() => {}); // Clean up
        console.log(`[LOCAL-DOCKER] Volume prepared (ownership + WAL cleanup)`);
      } catch (cleanErr: any) {
        // Non-fatal — the new image's startup.sh may handle it
        console.warn(`[LOCAL-DOCKER] Volume prep warning: ${cleanErr.message}`);
      }

      // 4. Recreate the container with the new image
      setUpdateStatus({ phase: 'recreating', progress: 70, message: `Recreating with ${targetImage}...` });
      console.log(`[LOCAL-DOCKER] Recreating sandbox with image ${targetImage}...`);
      this._serviceKeySynced = false; // Force re-sync of env vars
      await this.createContainer(targetImage);

      // 5. Container is created and starting — s6-overlay boots services
      setUpdateStatus({ phase: 'starting', progress: 80, message: 'Container starting...' });
      console.log(`[LOCAL-DOCKER] Container created, starting up...`);

      // 6. Health check — wait for the sandbox to come back up
      setUpdateStatus({ phase: 'health_check', progress: 90, message: 'Waiting for sandbox to become healthy...' });
      console.log(`[LOCAL-DOCKER] Waiting for sandbox health check...`);
      await this.waitForHealth(120_000); // 120s timeout — s6 + OpenCode boot can take 60-90s

      setUpdateStatus({
        phase: 'complete',
        progress: 100,
        message: `Updated to v${targetVersion}`,
        currentVersion: targetVersion,
      });
      console.log(`[LOCAL-DOCKER] Sandbox updated to ${targetImage} successfully`);

      return this.getSandboxInfo();
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setUpdateStatus({
        phase: 'failed',
        progress: 0,
        message: `Update failed: ${errorMsg}`,
        error: errorMsg,
      });
      console.error(`[LOCAL-DOCKER] Sandbox update failed:`, errorMsg);
      throw err;
    }
  }

  async getStatus(): Promise<SandboxStatus> {
    try {
      const container = this.docker.getContainer(CONTAINER_NAME);
      const info = await container.inspect();
      if (info.State.Running) return 'running';
      if (info.State.Status === 'exited' || info.State.Status === 'stopped') return 'stopped';
      return 'unknown';
    } catch (err: any) {
      if (err?.statusCode === 404) return 'removed';
      return 'unknown';
    }
  }

  // ── Legacy SandboxProvider interface (for provider registry) ────────────

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    this._lastCreateOpts = opts;
    const info = await this.ensure();
    return {
      externalId: info.name,  // Container name (e.g. 'kortix-sandbox') — used for Docker DNS & URL routing
      baseUrl: info.baseUrl,
      metadata: {
        containerName: info.name,
        containerId: info.containerId,
        image: info.image,
        mappedPorts: info.mappedPorts,
      },
    };
  }

  // ── Cron / Endpoint resolution ───────────────────────────────────────

  async resolveEndpoint(externalId: string): Promise<ResolvedEndpoint> {
    // Inside Docker (SANDBOX_NETWORK set): resolve via Docker DNS using the container name.
    // On host (pnpm dev): fall back to localhost with mapped ports.
    const url = config.SANDBOX_NETWORK
      ? `http://${externalId}:8000`
      : BASE_URL;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use INTERNAL_SERVICE_KEY for sandbox auth. The cron executor calls the sandbox
    // directly (not through the proxy), so it needs the service key if auth is configured.
    if (config.INTERNAL_SERVICE_KEY) {
      headers['Authorization'] = `Bearer ${config.INTERNAL_SERVICE_KEY}`;
    }

    return { url, headers };
  }

  async ensureRunning(_externalId: string): Promise<void> {
    const info = await this.find();
    if (info && info.status === 'running') {
      await this.syncCoreEnvVars();
      return;
    }
    if (info) {
      console.log('[LOCAL-DOCKER] Container stopped, starting for cron execution...');
      const container = this.docker.getContainer(CONTAINER_NAME);
      await container.start();
      await this.syncCoreEnvVars();
      return;
    }
    console.log('[LOCAL-DOCKER] No container found, creating for cron execution...');
    await this.ensure();
  }

  /**
   * Ensure the running container has the correct values for all 3 core env vars:
   *   - KORTIX_API_URL        (how sandbox reaches kortix-api)
   *   - KORTIX_TOKEN           (sandbox → kortix-api auth)
   *   - INTERNAL_SERVICE_KEY   (kortix-api → sandbox auth)
   *
   * If any differ from what kortix-api has, inject via s6 env dir and restart
   * kortix-master so the sandbox picks them up without a full container recreate.
   */
  /**
   * Sync the 3 core env vars to the sandbox via the secrets manager API.
   *
   * Uses kortix-master's /env endpoint which does triple-write:
   *   1. SecretStore (.secrets.json — encrypted at rest)
   *   2. s6 env dir  (/run/s6/container_environment/ — tools read this on every call)
   *   3. process.env (kortix-master's own process)
   *
   * Since getEnv() reads s6 first (always fresh from disk), updated values
   * take effect immediately — no service restart needed.
   * Only POSTs when values actually differ from what's currently set.
   */
  async syncCoreEnvVars(): Promise<void> {
    if (this._serviceKeySynced) return;

    const info = await this.find();
    if (!info || info.status !== 'running') {
      console.log('[LOCAL-DOCKER] syncCoreEnvVars: no running container found, skipping');
      return;
    }

    const containerEnv = await this.getContainerEnv();

    // The 3 core vars kortix-api is the source of truth for
    const desired: Record<string, string> = {
      KORTIX_API_URL: getSandboxInternalApiUrl(),
      KORTIX_TOKEN: containerEnv['KORTIX_TOKEN'] || '',  // keep existing token (generated at creation)
      INTERNAL_SERVICE_KEY: config.INTERNAL_SERVICE_KEY,  // triggers auto-generation if empty
    };

    // Read current values from the secrets manager to compare
    let currentEnv: Record<string, string> = {};
    try {
      currentEnv = await this.fetchMasterEnv();
    } catch {
      // Sandbox may not be ready yet — fall back to Docker env comparison
      currentEnv = containerEnv;
    }

    // Only sync vars that actually differ
    const stale: Record<string, string> = {};
    for (const [key, val] of Object.entries(desired)) {
      if (val && currentEnv[key] !== val) {
        stale[key] = val;
      }
    }

    if (Object.keys(stale).length === 0) {
      this._serviceKeySynced = true;
      console.log('[LOCAL-DOCKER] syncCoreEnvVars: all 3 core vars in sync');
      return;
    }

    console.log(`[LOCAL-DOCKER] Syncing ${Object.keys(stale).join(', ')} via secrets manager...`);
    try {
      // POST to kortix-master /env API — no restart needed since getEnv() reads s6 directly
      await this.postMasterEnv(stale);
      this._serviceKeySynced = true;
      console.log(`[LOCAL-DOCKER] Core env vars synced: ${Object.keys(stale).join(', ')}`);
    } catch (err: any) {
      console.error('[LOCAL-DOCKER] Failed to sync core env vars via /env API, falling back to docker exec:', err.message || err);
      // Fallback: write directly to s6 env dir if the /env API is unreachable
      try {
        this.syncCoreEnvVarsFallback(stale);
        this._serviceKeySynced = true;
      } catch (fallbackErr: any) {
        console.error('[LOCAL-DOCKER] Fallback sync also failed:', fallbackErr.message || fallbackErr);
      }
    }
  }

  /**
   * GET /env from kortix-master — returns all current env vars.
   */
  private async fetchMasterEnv(): Promise<Record<string, string>> {
    const url = `http://localhost:${config.SANDBOX_PORT_BASE || 14000}/env`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.INTERNAL_SERVICE_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GET /env returned ${res.status}`);
    return (await res.json()) as Record<string, string>;
  }

  /**
   * POST /env to kortix-master — sets env vars via the secrets manager.
   * No restart needed: getEnv() reads s6 env dir directly on every call.
   */
  private async postMasterEnv(keys: Record<string, string>): Promise<void> {
    const url = `http://localhost:${config.SANDBOX_PORT_BASE || 14000}/env`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.INTERNAL_SERVICE_KEY}`,
      },
      body: JSON.stringify({ keys }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`POST /env returned ${res.status}`);
  }

  /**
   * Fallback: write directly to s6 env dir via docker exec.
   * Used only when the /env API is unreachable (e.g. kortix-master not ready yet).
   */
  private syncCoreEnvVarsFallback(stale: Record<string, string>): void {
    const env = { ...process.env };
    if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
      env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
    }

    const writes = Object.entries(stale)
      .map(([key, val]) => `printf '%s' '${val}' > /run/s6/container_environment/${key}`)
      .join(' && ');

    const cmd =
      `docker exec ${CONTAINER_NAME} bash -c ` +
      `"mkdir -p /run/s6/container_environment && ${writes}"`;

    execSync(cmd, { timeout: 15_000, stdio: 'pipe', env });
    console.log(`[LOCAL-DOCKER] Core env vars synced via fallback (docker exec): ${Object.keys(stale).join(', ')}`);
  }

  /**
   * Push a KORTIX_TOKEN into a running container so it matches the DB.
   *
   * Called by ensure() when the caller (e.g. POST /init/local) registered a
   * new token in the DB but the container is already running with a stale one.
   * Uses the same /env API and docker-exec fallback as syncCoreEnvVars.
   */
  private async syncTokenToContainer(token: string): Promise<void> {
    const containerEnv = await this.getContainerEnv();
    if (containerEnv['KORTIX_TOKEN'] === token) return; // already in sync

    console.log('[LOCAL-DOCKER] Syncing DB-registered KORTIX_TOKEN into running container...');
    try {
      await this.postMasterEnv({ KORTIX_TOKEN: token });
      console.log('[LOCAL-DOCKER] KORTIX_TOKEN synced to container via /env API');
    } catch {
      try {
        this.syncCoreEnvVarsFallback({ KORTIX_TOKEN: token });
        console.log('[LOCAL-DOCKER] KORTIX_TOKEN synced to container via docker exec fallback');
      } catch (err: any) {
        console.error('[LOCAL-DOCKER] Failed to sync KORTIX_TOKEN into container:', err.message || err);
      }
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _lastCreateOpts?: CreateSandboxOpts;

  /**
   * Check if the sandbox image exists locally.
   */
  async hasImage(imageOverride?: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageOverride || config.SANDBOX_IMAGE).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pull the sandbox image with progress tracking.
   * Resolves when pull is complete. Updates _pullStatus throughout.
   */
  async pullImage(): Promise<void> {
    const image = config.SANDBOX_IMAGE;
    _pullStatus = { state: 'pulling', progress: 0, message: `Pulling ${image}...` };

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          _pullStatus = { state: 'error', progress: 0, message: err.message, error: err.message };
          return reject(err);
        }
        const layerProgress: Record<string, { current: number; total: number }> = {};
        this.docker.modem.followProgress(
          stream,
          (err2: Error | null) => {
            if (err2) {
              _pullStatus = { state: 'error', progress: 0, message: err2.message, error: err2.message };
              return reject(err2);
            }
            _pullStatus = { state: 'done', progress: 100, message: 'Image pulled successfully' };
            console.log(`[LOCAL-DOCKER] Image ${image} pulled successfully`);
            resolve();
          },
          (event: any) => {
            // Track layer-level progress
            if (event.id && event.progressDetail?.total) {
              layerProgress[event.id] = {
                current: event.progressDetail.current || 0,
                total: event.progressDetail.total,
              };
              const layers = Object.values(layerProgress);
              const totalBytes = layers.reduce((s, l) => s + l.total, 0);
              const currentBytes = layers.reduce((s, l) => s + l.current, 0);
              const pct = totalBytes > 0 ? Math.round((currentBytes / totalBytes) * 100) : 0;
              _pullStatus = {
                state: 'pulling',
                progress: Math.min(pct, 99), // never show 100 until fully done
                message: `Pulling image... ${pct}%`,
              };
            } else if (event.status) {
              _pullStatus = { ..._pullStatus, message: event.status };
            }
          },
        );
      });
    });
  }

  /**
   * Pull a specific image by full name (e.g. "kortix/computer:0.8.0").
   * Updates both _pullStatus and _updateStatus with progress.
   */
  private async pullImageByName(imageName: string): Promise<void> {
    _pullStatus = { state: 'pulling', progress: 0, message: `Pulling ${imageName}...` };

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          _pullStatus = { state: 'error', progress: 0, message: err.message, error: err.message };
          return reject(err);
        }
        const layerProgress: Record<string, { current: number; total: number }> = {};
        this.docker.modem.followProgress(
          stream,
          (err2: Error | null) => {
            if (err2) {
              _pullStatus = { state: 'error', progress: 0, message: err2.message, error: err2.message };
              return reject(err2);
            }
            _pullStatus = { state: 'done', progress: 100, message: 'Image pulled successfully' };
            console.log(`[LOCAL-DOCKER] Image ${imageName} pulled successfully`);
            resolve();
          },
          (event: any) => {
            if (event.id && event.progressDetail?.total) {
              layerProgress[event.id] = {
                current: event.progressDetail.current || 0,
                total: event.progressDetail.total,
              };
              const layers = Object.values(layerProgress);
              const totalBytes = layers.reduce((s, l) => s + l.total, 0);
              const currentBytes = layers.reduce((s, l) => s + l.current, 0);
              const pct = totalBytes > 0 ? Math.round((currentBytes / totalBytes) * 100) : 0;
              _pullStatus = {
                state: 'pulling',
                progress: Math.min(pct, 99),
                message: `Pulling image... ${pct}%`,
              };
              // Also update the sandbox update status with pull progress
              setUpdateStatus({
                progress: 10 + Math.round(pct * 0.4), // 10-50% range for pulling
                message: `Pulling image... ${pct}%`,
              });
            } else if (event.status) {
              _pullStatus = { ..._pullStatus, message: event.status };
            }
          },
        );
      });
    });
  }

  private async createContainer(imageOverride?: string): Promise<void> {
    const image = imageOverride || config.SANDBOX_IMAGE;
    // Pull image if not present locally
    if (!(await this.hasImage(image))) {
      console.log(`[LOCAL-DOCKER] Image ${image} not found locally, pulling...`);
      await this.pullImage();
    }

    let authToken = this._lastCreateOpts?.envVars?.KORTIX_TOKEN || '';
    if (!authToken) {
      authToken = generateSandboxKeyPair().secretKey;
    }
    const sandboxEnvVars = readSandboxEnv();

    // INTERNAL_SERVICE_KEY: used for proxy/cron → sandbox auth.
    // Auto-generate if not set — every sandbox must have a service key.
    if (!config.INTERNAL_SERVICE_KEY) {
      process.env.INTERNAL_SERVICE_KEY = randomBytes(32).toString('hex');
      console.log('[LOCAL-DOCKER] Auto-generated INTERNAL_SERVICE_KEY for sandbox auth');
    }
    const serviceKey = config.INTERNAL_SERVICE_KEY;

    // Vars we set explicitly — sandbox/docker/.env must NOT override these
    const MANAGED_VARS = new Set([
      'KORTIX_TOKEN',
      'KORTIX_API_URL',
      'SANDBOX_ID',
      'INTERNAL_SERVICE_KEY',
      'PROJECT_ID',
      'ENV_MODE',
      'CORS_ALLOWED_ORIGINS',
    ]);

    // Filter sandbox/docker/.env: drop any var we manage ourselves
    const filteredSandboxEnv = sandboxEnvVars.filter((entry) => {
      const varName = entry.split('=')[0];
      return !MANAGED_VARS.has(varName);
    });

    const env = [
      'PUID=1000',
      'PGID=1000',
      'TZ=Etc/UTC',
      'SUBFOLDER=/',
      'TITLE=Kortix Sandbox',
      'OPENCODE_CONFIG_DIR=/opt/opencode',
      'OPENCODE_PERMISSION={"*":"allow"}',
      'DISPLAY=:1',
      'LSS_DIR=/workspace/.lss',
      'KORTIX_WORKSPACE=/workspace',
      'SECRET_FILE_PATH=/workspace/.secrets/.secrets.json',
      'SALT_FILE_PATH=/workspace/.secrets/.salt',
      // ── 3 core vars managed by kortix-api (source of truth) ──
      // KORTIX_API_URL: how the sandbox reaches kortix-api (internal Docker URL).
      `KORTIX_API_URL=${getSandboxInternalApiUrl()}`,
      // KORTIX_TOKEN (sandbox → kortix-api): sandbox identity + SecretStore encryption key.
      `KORTIX_TOKEN=${authToken}`,
      // INTERNAL_SERVICE_KEY (kortix-api → sandbox): platform authenticates to sandbox.
      `INTERNAL_SERVICE_KEY=${serviceKey}`,
      `SANDBOX_ID=${CONTAINER_NAME}`,
      'PROJECT_ID=local',
      ...(config.KORTIX_LOCAL_IMAGES ? ['KORTIX_LOCAL_SOURCE=1'] : []),
      // Cloud mode when billing is enabled — routes LLM traffic through the proxy for metering.
      // Local mode otherwise — SDKs call providers directly (no billing).
      `ENV_MODE=${config.KORTIX_BILLING_INTERNAL_ENABLED ? 'cloud' : 'local'}`,
      // CORS: tell the sandbox which origins to allow (includes frontend URL)
      `CORS_ALLOWED_ORIGINS=${[config.FRONTEND_URL, config.KORTIX_URL].filter(Boolean).join(',')}`,
      // Extra env from sandbox/docker/.env (API keys, etc.) — managed vars already filtered out
      ...filteredSandboxEnv,
    ];

    const container = await this.docker.createContainer({
      Image: image,
      name: CONTAINER_NAME,
      Env: env,
      ExposedPorts: EXPOSED_PORTS,
      HostConfig: {
        PortBindings: PORT_BINDINGS,
        CapAdd: ['SYS_ADMIN'],
        SecurityOpt: ['seccomp=unconfined'],
        ShmSize: 2 * 1024 * 1024 * 1024,
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [
          `${CONTAINER_NAME}-data:/workspace`,
          `${CONTAINER_NAME}-data:/config`,
        ],
        ...(config.SANDBOX_NETWORK ? { NetworkMode: config.SANDBOX_NETWORK } : {}),
      },
      Labels: {
        'kortix.sandbox': 'true',
        'kortix.account': 'local',
        'kortix.user': 'local',
      },
    });

    await container.start();
    console.log(
      `[LOCAL-DOCKER] Sandbox created and started on ports ${PORT_BASE}-${PORT_BASE + 7}`,
    );
  }

  /**
   * Read environment variables from the running container via Docker inspect.
   * Returns a map of VAR_NAME → value.
   */
  async getContainerEnv(): Promise<Record<string, string>> {
    try {
      const container = this.docker.getContainer(CONTAINER_NAME);
      const info = await container.inspect();
      const envList = info.Config.Env || [];
      const result: Record<string, string> = {};
      for (const entry of envList) {
        const eqIdx = entry.indexOf('=');
        if (eqIdx > 0) {
          result[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private toSandboxInfo(info: Docker.ContainerInspectInfo): SandboxInfo {
    const status: SandboxStatus =
      info.State.Running ? 'running' :
      info.State.Status === 'exited' || info.State.Status === 'created' ? 'stopped' :
      'unknown';

    return {
      containerId: info.Id,
      name: CONTAINER_NAME,
      status,
      image: info.Config.Image || config.SANDBOX_IMAGE,
      baseUrl: BASE_URL,
      mappedPorts: { ...PORT_MAP },
      createdAt: info.Created,
    };
  }

  /**
   * Wait for the sandbox to pass health checks.
   * Polls GET /kortix/health until it returns 200 with status "ok".
   */
  private async waitForHealth(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const healthUrl = `http://localhost:${PORT_MAP['8000']}/kortix/health`;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.status === 'ok') {
            console.log(`[LOCAL-DOCKER] Health check passed`);
            return;
          }
        }
      } catch {
        // Container still starting — keep polling
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }

    // Timeout — throw so callers (especially updateSandbox) can mark as failed
    throw new Error(`Health check timed out after ${Math.round(timeoutMs / 1000)}s — sandbox may still be starting`);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SandboxInfo {
  containerId: string;
  name: string;
  status: SandboxStatus;
  image: string;
  baseUrl: string;
  mappedPorts: Record<string, string>;
  createdAt: string;
}
