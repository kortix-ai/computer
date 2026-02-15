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
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { generateSandboxToken } from '../services/token';
import type {
  SandboxProvider,
  ProviderName,
  CreateSandboxOpts,
  ProvisionResult,
  SandboxStatus,
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
};

const BASE_URL = `http://localhost:${PORT_MAP['8000']}`;

/** ExposedPorts for Docker container config. */
const EXPOSED_PORTS: Record<string, {}> = Object.fromEntries(
  Object.keys(PORT_MAP).map((p) => [`${p}/tcp`, {}]),
);

/** PortBindings for Docker HostConfig. */
const PORT_BINDINGS: Record<string, { HostPort: string }[]> = Object.fromEntries(
  Object.entries(PORT_MAP).map(([container, host]) => [
    `${container}/tcp`,
    [{ HostPort: host }],
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
    return new Docker({ socketPath: config.DOCKER_HOST });
  }
  return new Docker();
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class LocalDockerProvider implements SandboxProvider {
  readonly name: ProviderName = 'local_docker';
  private docker: Docker;

  constructor() {
    this.docker = getDocker();
  }

  // ── Core: get-or-create the single sandbox ──────────────────────────────

  /**
   * Ensure the sandbox is running. Idempotent:
   *   - If `kortix-sandbox` exists and is running → return it
   *   - If it exists but is stopped → start it
   *   - If it doesn't exist → create and start it
   */
  async ensure(): Promise<SandboxInfo> {
    const existing = await this.find();

    if (existing) {
      if (existing.status === 'running') {
        return existing;
      }
      // Stopped — start it
      console.log(`[LOCAL-DOCKER] Starting stopped sandbox...`);
      const container = this.docker.getContainer(existing.containerId);
      await container.start();
      return this.getSandboxInfo();
    }

    // No container — create one
    console.log(`[LOCAL-DOCKER] Creating sandbox (image: ${config.SANDBOX_IMAGE})...`);
    await this.createContainer();
    return this.getSandboxInfo();
  }

  /**
   * Find the `kortix-sandbox` container (running or stopped).
   * Returns null if it doesn't exist.
   */
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

  /**
   * Get sandbox info. Throws if not found.
   */
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
    await container.remove({ v: false }); // keep volumes
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
      externalId: info.containerId,
      baseUrl: info.baseUrl,
      metadata: {
        containerName: info.name,
        containerId: info.containerId,
        image: info.image,
        mappedPorts: info.mappedPorts,
      },
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _lastCreateOpts?: CreateSandboxOpts;

  private async createContainer(): Promise<void> {
    const authToken = this._lastCreateOpts?.envVars?.KORTIX_TOKEN || generateSandboxToken();
    const sandboxEnvVars = readSandboxEnv();

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
      // OpenCode is always unprotected in local mode (no auth)
      `KORTIX_API_URL=${config.KORTIX_URL || ''}`,
      `KORTIX_TOKEN=${authToken}`,
      `SANDBOX_ID=${CONTAINER_NAME}`,
      'PROJECT_ID=local',
      'ENV_MODE=local',
      ...sandboxEnvVars,
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
        ShmSize: 2 * 1024 * 1024 * 1024, // 2GB
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [
          `${CONTAINER_NAME}-workspace:/workspace`,
          `${CONTAINER_NAME}-secrets:/app/secrets`,
        ],
        ...(config.SANDBOX_NETWORK ? { NetworkMode: config.SANDBOX_NETWORK } : {}),
      },
      Labels: {
        'kortix.sandbox': 'true',
        // Helpful for debugging / parity with cloud labeling
        'kortix.account': 'local',
        'kortix.user': 'local',
      },
    });

    await container.start();
    console.log(
      `[LOCAL-DOCKER] Sandbox created and started on ports ${PORT_BASE}-${PORT_BASE + 6}`,
    );
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
