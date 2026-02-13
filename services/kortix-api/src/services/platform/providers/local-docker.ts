/**
 * Local Docker sandbox provider.
 *
 * Creates sandbox containers on the local Docker daemon using the
 * same image built from sandbox/Dockerfile. Uses Dockerode to talk
 * to the Docker Engine API.
 */

import Docker from 'dockerode';
import { config } from '../../../config';
import { generateSandboxToken } from '../token';
import type {
  SandboxProvider,
  ProviderName,
  CreateSandboxOpts,
  ProvisionResult,
  SandboxStatus,
} from './index';

const CONTAINER_PREFIX = 'kortix-sandbox-';

// Ports exposed by the sandbox image (see sandbox/Dockerfile)
// We let Docker assign random host ports for each container to avoid conflicts.
const EXPOSED_PORTS: Record<string, {}> = {
  '6080/tcp': {},  // Desktop (noVNC)
  '6081/tcp': {},  // Desktop (HTTPS)
  '3111/tcp': {},  // OpenCode Web UI
  '3210/tcp': {},  // Presentation Viewer
  '8000/tcp': {},  // Kortix Master (main entry point)
  '9223/tcp': {},  // Agent Browser Stream
  '9224/tcp': {},  // Agent Browser Viewer
};

function getDocker(): Docker {
  if (config.DOCKER_HOST) {
    // Support tcp:// or unix:// hosts
    if (config.DOCKER_HOST.startsWith('tcp://') || config.DOCKER_HOST.startsWith('http://')) {
      const url = new URL(config.DOCKER_HOST);
      return new Docker({ host: url.hostname, port: parseInt(url.port || '2375') });
    }
    return new Docker({ socketPath: config.DOCKER_HOST });
  }
  // Default: local Docker socket
  return new Docker();
}

export class LocalDockerProvider implements SandboxProvider {
  readonly name: ProviderName = 'local_docker';
  private docker: Docker;

  constructor() {
    this.docker = getDocker();
  }

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    const authToken = generateSandboxToken();
    const containerName = `${CONTAINER_PREFIX}${opts.accountId.slice(0, 8)}-${Date.now().toString(36)}`;

    // Build environment variables for the sandbox container
    const env = [
      'PUID=1000',
      'PGID=1000',
      'TZ=Etc/UTC',
      'SUBFOLDER=/',
      `TITLE=Kortix Sandbox`,
      'OPENCODE_CONFIG_DIR=/opt/opencode',
      'OPENCODE_PERMISSION={"*":"allow"}',
      'DISPLAY=:1',
      'LSS_DIR=/workspace/.lss',
      'KORTIX_WORKSPACE=/workspace',
      `OPENCODE_SERVER_USERNAME=admin`,
      `OPENCODE_SERVER_PASSWORD=${authToken.slice(0, 16)}`,
      `KORTIX_API_URL=${config.KORTIX_URL || ''}`,
      `KORTIX_TOKEN=${authToken}`,
      `SANDBOX_ID=${containerName}`,
      `PROJECT_ID=local`,
      `ENV_MODE=local`,
      // Pass through any extra env vars from the caller
      ...Object.entries(opts.envVars || {}).map(([k, v]) => `${k}=${v}`),
    ];

    // Create the container
    const container = await this.docker.createContainer({
      Image: config.SANDBOX_IMAGE,
      name: containerName,
      Env: env,
      ExposedPorts: EXPOSED_PORTS,
      HostConfig: {
        // Auto-assign host ports for each exposed port
        PortBindings: Object.fromEntries(
          Object.keys(EXPOSED_PORTS).map((port) => [
            port,
            [{ HostPort: '0' }], // 0 = Docker assigns a random available port
          ]),
        ),
        CapAdd: ['SYS_ADMIN'],
        SecurityOpt: ['seccomp=unconfined'],
        ShmSize: 2 * 1024 * 1024 * 1024, // 2GB
        RestartPolicy: { Name: 'unless-stopped' },
        // Named volumes for persistence
        Binds: [
          `${containerName}-workspace:/workspace`,
          `${containerName}-secrets:/app/secrets`,
        ],
        ...(config.SANDBOX_NETWORK ? { NetworkMode: config.SANDBOX_NETWORK } : {}),
      },
      Labels: {
        'kortix.sandbox': 'true',
        'kortix.account': opts.accountId,
        'kortix.user': opts.userId,
      },
    });

    // Start the container
    await container.start();

    // Inspect to get assigned ports
    const info = await container.inspect();
    const portBindings = info.NetworkSettings.Ports;
    const masterPort = portBindings['8000/tcp']?.[0]?.HostPort;

    if (!masterPort) {
      throw new Error('Failed to get mapped port for Kortix Master (8000)');
    }

    const baseUrl = `http://localhost:${masterPort}`;

    // Collect all mapped ports for metadata
    const mappedPorts: Record<string, string> = {};
    for (const [containerPort, bindings] of Object.entries(portBindings)) {
      if (bindings?.[0]?.HostPort) {
        const portNum = containerPort.split('/')[0];
        mappedPorts[portNum] = bindings[0].HostPort;
      }
    }

    return {
      externalId: container.id,
      baseUrl,
      metadata: {
        provisionedBy: opts.userId,
        containerName,
        containerId: container.id,
        authToken,
        image: config.SANDBOX_IMAGE,
        mappedPorts,
      },
    };
  }

  async start(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId);
    await container.start();
  }

  async stop(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId);
    await container.stop({ t: 10 });
  }

  async remove(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId);
    try {
      await container.stop({ t: 5 });
    } catch {
      // May already be stopped
    }
    await container.remove({ v: false }); // keep volumes
  }

  async getStatus(externalId: string): Promise<SandboxStatus> {
    try {
      const container = this.docker.getContainer(externalId);
      const info = await container.inspect();

      if (info.State.Running) return 'running';
      if (info.State.Status === 'exited' || info.State.Status === 'stopped') return 'stopped';
      return 'unknown';
    } catch (err: any) {
      if (err?.statusCode === 404) return 'removed';
      return 'unknown';
    }
  }
}
