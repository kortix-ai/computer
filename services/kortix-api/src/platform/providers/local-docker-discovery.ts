import Docker from 'dockerode';

import { config } from '../../config';

export const LEGACY_LOCAL_SANDBOX_NAME = 'kortix-sandbox';
export const LOCAL_SANDBOX_LABEL = 'kortix.sandbox';
export const LOCAL_SANDBOX_LABEL_VALUE = 'true';
export const LOCAL_SANDBOX_DEFAULT_PORT = '8000';
export const LOCAL_SANDBOX_SSH_PORT = '22';

export function getDockerClient(): Docker {
  if (config.DOCKER_HOST) {
    if (config.DOCKER_HOST.startsWith('tcp://') || config.DOCKER_HOST.startsWith('http://')) {
      const url = new URL(config.DOCKER_HOST);
      return new Docker({ host: url.hostname, port: parseInt(url.port || '2375', 10) });
    }
    const socketPath = config.DOCKER_HOST.replace(/^unix:\/\//, '');
    return new Docker({ socketPath });
  }
  return new Docker();
}

export function sanitizeSandboxName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 36);
}

export function buildUniqueLocalSandboxName(name: string): string {
  const slug = sanitizeSandboxName(name) || 'local';
  const base = slug.startsWith('kortix-sandbox') ? slug : `kortix-sandbox-${slug}`;
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${base}-${suffix}`;
}

export function getMappedPortsFromInspect(
  info: Docker.ContainerInspectInfo,
): Record<string, string> {
  const ports = info.NetworkSettings?.Ports || {};
  const mapped: Record<string, string> = {};
  for (const [key, bindings] of Object.entries(ports)) {
    const containerPort = key.replace(/\/tcp$/, '');
    const binding = Array.isArray(bindings) ? bindings[0] : undefined;
    if (binding?.HostPort) {
      mapped[containerPort] = binding.HostPort;
    }
  }
  return mapped;
}

export function getContainerNameFromInspect(info: Docker.ContainerInspectInfo): string {
  return info.Name?.replace(/^\//, '') || LEGACY_LOCAL_SANDBOX_NAME;
}

export function getBaseUrlFromInspect(info: Docker.ContainerInspectInfo): string {
  const mappedPorts = getMappedPortsFromInspect(info);
  const hostPort = mappedPorts[LOCAL_SANDBOX_DEFAULT_PORT];
  if (!hostPort) {
    throw new Error(`Sandbox ${getContainerNameFromInspect(info)} is missing a published ${LOCAL_SANDBOX_DEFAULT_PORT}/tcp port`);
  }
  return `http://localhost:${hostPort}`;
}

export async function inspectLocalSandboxContainer(
  containerName: string,
): Promise<Docker.ContainerInspectInfo | null> {
  try {
    return await getDockerClient().getContainer(containerName).inspect();
  } catch (err: any) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

export async function listLocalSandboxContainers(
  opts: { all?: boolean } = {},
): Promise<Docker.ContainerInspectInfo[]> {
  const docker = getDockerClient();
  const containers = await docker.listContainers({
    all: opts.all ?? true,
    filters: {
      label: [`${LOCAL_SANDBOX_LABEL}=${LOCAL_SANDBOX_LABEL_VALUE}`],
    } as any,
  });

  const inspected = await Promise.all(
    containers.map(async (container) => {
      try {
        return await docker.getContainer(container.Id).inspect();
      } catch {
        return null;
      }
    }),
  );

  return inspected.filter((info): info is Docker.ContainerInspectInfo => info !== null);
}

export async function getPrimaryLocalSandboxContainer(): Promise<Docker.ContainerInspectInfo | null> {
  const containers = await listLocalSandboxContainers({ all: true });
  if (containers.length === 0) return null;

  const running = containers
    .filter((info) => info.State?.Running)
    .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
  if (running.length > 0) return running[0];

  return containers.sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0] || null;
}
