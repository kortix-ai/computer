/**
 * Local Docker sandbox provider.
 *
 * Supports multiple concurrent sandbox containers on the local Docker daemon.
 * Each sandbox gets its own container name, volume, and dynamically published
 * localhost ports so provisioning never blocks on a reused fixed name.
 */

import Docker from 'dockerode';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { config } from '../../config';
import { createApiKey } from '../../repositories/api-keys';
import { generateSandboxKeyPair, isApiKeySecretConfigured } from '../../shared/crypto';
import {
  LEGACY_LOCAL_SANDBOX_NAME,
  LOCAL_SANDBOX_LABEL,
  LOCAL_SANDBOX_LABEL_VALUE,
  buildUniqueLocalSandboxName,
  getBaseUrlFromInspect,
  getContainerNameFromInspect,
  getDockerClient,
  getMappedPortsFromInspect,
  inspectLocalSandboxContainer,
} from './local-docker-discovery';
import type {
  CreateSandboxOpts,
  ProviderName,
  ProvisionResult,
  ResolvedEndpoint,
  SandboxProvider,
  SandboxStatus,
} from './index';

const CONTAINER_PORTS = ['8000', '3111', '6080', '6081', '3210', '3211', '9223', '9224', '22'] as const;

const EXPOSED_PORTS: Record<string, {}> = Object.fromEntries(
  CONTAINER_PORTS.map((port) => [`${port}/tcp`, {}]),
);

function buildPortBindings(): Record<string, { HostPort: string; HostIp: string }[]> {
  return Object.fromEntries(
    CONTAINER_PORTS.map((port) => [
      `${port}/tcp`,
      [{ HostPort: '', HostIp: '127.0.0.1' }],
    ]),
  );
}

function getSandboxInternalApiUrl(): string {
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

async function pickContainerName(requestedName: string): Promise<string> {
  const legacy = await inspectLocalSandboxContainer(LEGACY_LOCAL_SANDBOX_NAME);
  if (!legacy) return LEGACY_LOCAL_SANDBOX_NAME;
  return buildUniqueLocalSandboxName(requestedName);
}

export interface ImagePullStatus {
  state: 'idle' | 'pulling' | 'done' | 'error';
  progress: number;
  message: string;
  error?: string;
}

let _pullStatus: ImagePullStatus = { state: 'idle', progress: 0, message: '' };

export function getImagePullStatus(): ImagePullStatus {
  return { ..._pullStatus };
}

export class LocalDockerProvider implements SandboxProvider {
  readonly name: ProviderName = 'local_docker';

  private docker: Docker;
  private _lastCreateOpts?: CreateSandboxOpts;
  private _syncedContainers = new Set<string>();

  constructor() {
    this.docker = getDockerClient();
  }

  async find(externalId = LEGACY_LOCAL_SANDBOX_NAME): Promise<SandboxInfo | null> {
    try {
      const info = await this.docker.getContainer(externalId).inspect();
      return this.toSandboxInfo(info);
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  async getSandboxInfo(externalId = LEGACY_LOCAL_SANDBOX_NAME): Promise<SandboxInfo> {
    const info = await this.find(externalId);
    if (!info) throw new Error(`Sandbox container not found: ${externalId}`);
    return info;
  }

  async start(externalId: string): Promise<void> {
    await this.docker.getContainer(externalId || LEGACY_LOCAL_SANDBOX_NAME).start();
  }

  async stop(externalId: string): Promise<void> {
    await this.docker.getContainer(externalId || LEGACY_LOCAL_SANDBOX_NAME).stop({ t: 10 });
  }

  async remove(externalId: string): Promise<void> {
    const containerName = externalId || LEGACY_LOCAL_SANDBOX_NAME;
    const container = this.docker.getContainer(containerName);
    try {
      await container.stop({ t: 5 });
    } catch {
    }
    await container.remove({ v: false });
    this._syncedContainers.delete(containerName);
  }

  async getStatus(externalId: string): Promise<SandboxStatus> {
    try {
      const info = await this.docker.getContainer(externalId || LEGACY_LOCAL_SANDBOX_NAME).inspect();
      if (info.State.Running) return 'running';
      if (info.State.Status === 'exited' || info.State.Status === 'stopped' || info.State.Status === 'created') {
        return 'stopped';
      }
      return 'unknown';
    } catch (err: any) {
      if (err?.statusCode === 404) return 'removed';
      return 'unknown';
    }
  }

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    this._lastCreateOpts = opts;
    const requestedName = opts.name || `sandbox-${opts.accountId.slice(0, 8)}`;
    const containerName = await pickContainerName(requestedName);
    const info = await this.createContainer(containerName);
    return {
      externalId: info.name,
      baseUrl: info.baseUrl,
      metadata: {
        containerName: info.name,
        containerId: info.containerId,
        image: info.image,
        mappedPorts: info.mappedPorts,
      },
    };
  }

  async resolveEndpoint(externalId: string): Promise<ResolvedEndpoint> {
    const containerName = externalId || LEGACY_LOCAL_SANDBOX_NAME;
    const url = config.SANDBOX_NETWORK
      ? `http://${containerName}:8000`
      : (await this.getSandboxInfo(containerName)).baseUrl;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.INTERNAL_SERVICE_KEY) {
      headers['Authorization'] = `Bearer ${config.INTERNAL_SERVICE_KEY}`;
    }

    return { url, headers };
  }

  async ensureRunning(externalId: string): Promise<void> {
    const containerName = externalId || LEGACY_LOCAL_SANDBOX_NAME;
    const info = await this.find(containerName);
    if (!info) {
      throw new Error(`Local Docker sandbox not found: ${containerName}`);
    }
    if (info.status !== 'running') {
      await this.docker.getContainer(containerName).start();
    }
    await this.syncCoreEnvVars(containerName);
  }

  async syncCoreEnvVars(externalId = LEGACY_LOCAL_SANDBOX_NAME): Promise<void> {
    if (this._syncedContainers.has(externalId)) return;

    const info = await this.find(externalId);
    if (!info || info.status !== 'running') {
      console.log(`[LOCAL-DOCKER] syncCoreEnvVars: no running container found for ${externalId}, skipping`);
      return;
    }

    const containerEnv = await this.getContainerEnv(externalId);
    const desired: Record<string, string> = {
      KORTIX_API_URL: getSandboxInternalApiUrl(),
      KORTIX_TOKEN: containerEnv['KORTIX_TOKEN'] || '',
      INTERNAL_SERVICE_KEY: config.INTERNAL_SERVICE_KEY,
    };

    let currentEnv: Record<string, string> = {};
    try {
      currentEnv = await this.fetchMasterEnv(info.baseUrl);
    } catch {
      currentEnv = containerEnv;
    }

    const stale: Record<string, string> = {};
    for (const [key, val] of Object.entries(desired)) {
      if (val && currentEnv[key] !== val) {
        stale[key] = val;
      }
    }

    if (Object.keys(stale).length === 0) {
      this._syncedContainers.add(externalId);
      return;
    }

    try {
      await this.postMasterEnv(info.baseUrl, stale);
      this._syncedContainers.add(externalId);
    } catch (err: any) {
      console.error('[LOCAL-DOCKER] Failed to sync core env vars via /env API, falling back to docker exec:', err.message || err);
      this.syncCoreEnvVarsFallback(externalId, stale);
      this._syncedContainers.add(externalId);
    }
  }

  private async fetchMasterEnv(baseUrl: string): Promise<Record<string, string>> {
    const res = await fetch(`${baseUrl}/env`, {
      headers: {
        Authorization: `Bearer ${config.INTERNAL_SERVICE_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GET /env returned ${res.status}`);
    return (await res.json()) as Record<string, string>;
  }

  private async postMasterEnv(baseUrl: string, keys: Record<string, string>): Promise<void> {
    const res = await fetch(`${baseUrl}/env`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.INTERNAL_SERVICE_KEY}`,
      },
      body: JSON.stringify({ keys }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`POST /env returned ${res.status}`);
  }

  private syncCoreEnvVarsFallback(externalId: string, stale: Record<string, string>): void {
    const env = { ...process.env };
    if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
      env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
    }

    const writes = Object.entries(stale)
      .map(([key, val]) => `printf '%s' '${val}' > /run/s6/container_environment/${key}`)
      .join(' && ');

    const cmd = `docker exec ${externalId} bash -c "mkdir -p /run/s6/container_environment && ${writes}"`;
    execSync(cmd, { timeout: 15_000, stdio: 'pipe', env });
  }

  async hasImage(): Promise<boolean> {
    try {
      await this.docker.getImage(config.SANDBOX_IMAGE).inspect();
      return true;
    } catch {
      return false;
    }
  }

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
          (progressErr: Error | null) => {
            if (progressErr) {
              _pullStatus = { state: 'error', progress: 0, message: progressErr.message, error: progressErr.message };
              return reject(progressErr);
            }
            _pullStatus = { state: 'done', progress: 100, message: 'Image pulled successfully' };
            resolve();
          },
          (event: any) => {
            if (event.id && event.progressDetail?.total) {
              layerProgress[event.id] = {
                current: event.progressDetail.current || 0,
                total: event.progressDetail.total,
              };
              const layers = Object.values(layerProgress);
              const totalBytes = layers.reduce((sum, layer) => sum + layer.total, 0);
              const currentBytes = layers.reduce((sum, layer) => sum + layer.current, 0);
              const pct = totalBytes > 0 ? Math.round((currentBytes / totalBytes) * 100) : 0;
              _pullStatus = {
                state: 'pulling',
                progress: Math.min(pct, 99),
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

  private async createContainer(containerName: string): Promise<SandboxInfo> {
    if (!(await this.hasImage())) {
      await this.pullImage();
    }

    let authToken = this._lastCreateOpts?.envVars?.KORTIX_TOKEN || '';
    if (!authToken && isApiKeySecretConfigured()) {
      const accountId = this._lastCreateOpts?.accountId || 'local';
      const key = await createApiKey({
        sandboxId: containerName,
        accountId,
        title: 'Sandbox Token',
        type: 'sandbox',
      });
      authToken = key.secretKey;
    }
    if (!authToken) {
      authToken = generateSandboxKeyPair().secretKey;
    }

    if (!config.INTERNAL_SERVICE_KEY) {
      process.env.INTERNAL_SERVICE_KEY = randomBytes(32).toString('hex');
    }
    const serviceKey = config.INTERNAL_SERVICE_KEY;

    const managedVars = new Set([
      'KORTIX_TOKEN',
      'KORTIX_API_URL',
      'SANDBOX_ID',
      'INTERNAL_SERVICE_KEY',
      'PROJECT_ID',
      'ENV_MODE',
      'CORS_ALLOWED_ORIGINS',
    ]);

    const filteredSandboxEnv = readSandboxEnv().filter((entry) => {
      const varName = entry.split('=')[0];
      return !managedVars.has(varName);
    });

    const env = [
      'PUID=1000',
      'PGID=1000',
      'TZ=Etc/UTC',
      'SUBFOLDER=/',
      `TITLE=Kortix Sandbox ${containerName}`,
      'OPENCODE_CONFIG_DIR=/opt/opencode',
      'OPENCODE_PERMISSION={"*":"allow"}',
      'DISPLAY=:1',
      'LSS_DIR=/workspace/.lss',
      'KORTIX_WORKSPACE=/workspace',
      'SECRET_FILE_PATH=/workspace/.secrets/.secrets.json',
      'SALT_FILE_PATH=/workspace/.secrets/.salt',
      `KORTIX_API_URL=${getSandboxInternalApiUrl()}`,
      `KORTIX_TOKEN=${authToken}`,
      `INTERNAL_SERVICE_KEY=${serviceKey}`,
      `SANDBOX_ID=${containerName}`,
      'PROJECT_ID=local',
      `ENV_MODE=${config.KORTIX_BILLING_INTERNAL_ENABLED ? 'cloud' : 'local'}`,
      `CORS_ALLOWED_ORIGINS=${[config.FRONTEND_URL, config.KORTIX_URL].filter(Boolean).join(',')}`,
      ...filteredSandboxEnv,
    ];

    const container = await this.docker.createContainer({
      Image: config.SANDBOX_IMAGE,
      name: containerName,
      Env: env,
      ExposedPorts: EXPOSED_PORTS,
      HostConfig: {
        PortBindings: buildPortBindings(),
        CapAdd: ['SYS_ADMIN'],
        SecurityOpt: ['seccomp=unconfined'],
        ShmSize: 2 * 1024 * 1024 * 1024,
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [
          `${containerName}-data:/workspace`,
          `${containerName}-data:/config`,
        ],
        ...(config.SANDBOX_NETWORK ? { NetworkMode: config.SANDBOX_NETWORK } : {}),
      },
      Labels: {
        [LOCAL_SANDBOX_LABEL]: LOCAL_SANDBOX_LABEL_VALUE,
        'kortix.account': this._lastCreateOpts?.accountId || 'local',
        'kortix.user': this._lastCreateOpts?.userId || 'local',
      },
    });

    await container.start();
    const info = await container.inspect();
    return this.toSandboxInfo(info);
  }

  async getContainerEnv(externalId = LEGACY_LOCAL_SANDBOX_NAME): Promise<Record<string, string>> {
    try {
      const info = await this.docker.getContainer(externalId).inspect();
      const result: Record<string, string> = {};
      for (const entry of info.Config.Env || []) {
        const index = entry.indexOf('=');
        if (index > 0) {
          result[entry.slice(0, index)] = entry.slice(index + 1);
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
      name: getContainerNameFromInspect(info),
      status,
      image: info.Config.Image || config.SANDBOX_IMAGE,
      baseUrl: getBaseUrlFromInspect(info),
      mappedPorts: getMappedPortsFromInspect(info),
      createdAt: info.Created,
    };
  }
}

export interface SandboxInfo {
  containerId: string;
  name: string;
  status: SandboxStatus;
  image: string;
  baseUrl: string;
  mappedPorts: Record<string, string>;
  createdAt: string;
}
