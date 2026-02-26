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
import { generateSandboxKeyPair, isApiKeySecretConfigured } from '../../shared/crypto';
import { createApiKey } from '../../repositories/api-keys';
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
 * Read key=value pairs from the sandbox/.env file.
 * API keys and credentials that OpenCode needs inside the container.
 */
function readSandboxEnv(): string[] {
  const candidates = [
    resolve(__dirname, '../../../../sandbox/.env'),
    resolve(process.cwd(), 'sandbox/.env'),
    resolve(process.cwd(), '../../sandbox/.env'),
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
        await this.syncServiceKey();
        return existing;
      }
      console.log(`[LOCAL-DOCKER] Starting stopped sandbox...`);
      const container = this.docker.getContainer(existing.containerId);
      await container.start();
      await this.syncServiceKey();
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
      await this.syncServiceKey();
      return;
    }
    if (info) {
      console.log('[LOCAL-DOCKER] Container stopped, starting for cron execution...');
      const container = this.docker.getContainer(CONTAINER_NAME);
      await container.start();
      await this.syncServiceKey();
      return;
    }
    console.log('[LOCAL-DOCKER] No container found, creating for cron execution...');
    await this.ensure();
  }

  /**
   * Ensure the running container's INTERNAL_SERVICE_KEY matches ours.
   * If missing or different, inject via s6 env dir and restart kortix-master.
   * Uses `docker exec` CLI (more reliable than dockerode exec across Docker setups).
   */
  async syncServiceKey(): Promise<void> {
    if (this._serviceKeySynced) return;

    const info = await this.find();
    if (!info || info.status !== 'running') {
      console.log('[LOCAL-DOCKER] syncServiceKey: no running container found, skipping');
      return;
    }

    const ourKey = config.INTERNAL_SERVICE_KEY; // triggers auto-generation if empty
    const containerEnv = await this.getContainerEnv();
    const containerKey = containerEnv['INTERNAL_SERVICE_KEY'] || '';
    console.log(`[LOCAL-DOCKER] syncServiceKey: container has key=${containerKey ? 'yes' : 'no'}, ours=${ourKey ? 'yes' : 'no'}, match=${containerKey === ourKey}`);

    if (containerKey === ourKey) {
      this._serviceKeySynced = true;
      return; // already in sync
    }

    console.log('[LOCAL-DOCKER] Syncing INTERNAL_SERVICE_KEY to sandbox container...');
    try {
      // Ensure DOCKER_HOST has the unix:// prefix for the docker CLI
      const env = { ...process.env };
      if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
        env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
      }
      const cmd =
        `docker exec ${CONTAINER_NAME} bash -c ` +
        `"mkdir -p /run/s6/container_environment && ` +
        `printf '%s' '${ourKey}' > /run/s6/container_environment/INTERNAL_SERVICE_KEY && ` +
        `sudo s6-svc -r /run/service/svc-kortix-master"`;
      execSync(cmd, { timeout: 15_000, stdio: 'pipe', env });
      this._serviceKeySynced = true;
      console.log('[LOCAL-DOCKER] INTERNAL_SERVICE_KEY synced and kortix-master restarted');
    } catch (err: any) {
      console.error('[LOCAL-DOCKER] Failed to sync INTERNAL_SERVICE_KEY:', err.message || err);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _lastCreateOpts?: CreateSandboxOpts;

  /**
   * Check if the sandbox image exists locally.
   */
  async hasImage(): Promise<boolean> {
    try {
      await this.docker.getImage(config.SANDBOX_IMAGE).inspect();
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

  private async createContainer(): Promise<void> {
    // Pull image if not present locally
    if (!(await this.hasImage())) {
      console.log(`[LOCAL-DOCKER] Image ${config.SANDBOX_IMAGE} not found locally, pulling...`);
      await this.pullImage();
    }

    let authToken = this._lastCreateOpts?.envVars?.KORTIX_TOKEN || '';
    if (!authToken && isApiKeySecretConfigured()) {
      const accountId = this._lastCreateOpts?.accountId || 'local';
      const key = await createApiKey({
        sandboxId: CONTAINER_NAME,
        accountId,
        title: 'Sandbox Token',
        type: 'sandbox',
      });
      authToken = key.secretKey;
    }
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

    // Vars we set explicitly — sandbox/.env must NOT override these
    const MANAGED_VARS = new Set([
      'KORTIX_TOKEN',
      'KORTIX_API_URL',
      'SANDBOX_ID',
      'INTERNAL_SERVICE_KEY',
      'PROJECT_ID',
      'ENV_MODE',
      'CORS_ALLOWED_ORIGINS',
    ]);

    // Filter sandbox/.env: drop any var we manage ourselves
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
      `KORTIX_API_URL=${config.KORTIX_URL || ''}`,
      // KORTIX_TOKEN: sandbox → kortix-api auth (kortix_sb_ key from DB).
      `KORTIX_TOKEN=${authToken}`,
      `SANDBOX_ID=${CONTAINER_NAME}`,
      'PROJECT_ID=local',
      // Cloud mode when billing is enabled — routes LLM traffic through the proxy for metering.
      // Local mode otherwise — SDKs call providers directly (no billing).
      `ENV_MODE=${config.KORTIX_BILLING_INTERNAL_ENABLED ? 'cloud' : 'local'}`,
      // INTERNAL_SERVICE_KEY: proxy/cron → sandbox auth (always present)
      `INTERNAL_SERVICE_KEY=${serviceKey}`,
      // CORS: tell the sandbox which origins to allow (includes frontend URL)
      `CORS_ALLOWED_ORIGINS=${[config.FRONTEND_URL, config.KORTIX_URL].filter(Boolean).join(',')}`,
      // Extra env from sandbox/.env (API keys, etc.) — managed vars already filtered out
      ...filteredSandboxEnv,
    ];

    const container = await this.docker.createContainer({
      Image: config.SANDBOX_IMAGE,
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


