/**
 * Hetzner Cloud sandbox provider.
 *
 * Spawns a real Hetzner VPS per sandbox from a pre-built snapshot.
 * Each sandbox gets a dedicated server with a public IP.
 *
 * Updates: replace the snapshot and rebuild — no SDK overhead.
 * Auth: INTERNAL_SERVICE_KEY for kortix-api → sandbox communication.
 */

import { eq } from 'drizzle-orm';
import { sandboxes } from '@kortix/db';
import { db } from '../../shared/db';
import { config, SANDBOX_VERSION } from '../../config';
import { releaseManifest } from '../../release';
import type {
  SandboxProvider,
  ProviderName,
  CreateSandboxOpts,
  ProvisionResult,
  SandboxStatus,
  ResolvedEndpoint,
} from './index';

// ─── Constants ───────────────────────────────────────────────────────────────

const HETZNER_API = 'https://api.hetzner.cloud/v1';
const KORTIX_MASTER_PORT = 8000;

/** Server types we expose to users (shared + general-purpose AMD). */
const ALLOWED_SERVER_TYPE_PREFIXES = ['cx', 'ccx', 'cpx', 'cax'];

/** Timeout for Hetzner API calls (ms). */
const API_TIMEOUT_MS = 30_000;

/**
 * Max wait for server to reach "running" state (ms).
 *
 * Snapshot-backed boots on Hetzner can occasionally take >2 minutes
 * (image attach + first boot + cloud-init), so 120s causes false failures
 * even when the server comes up shortly after. Use a safer 10-minute window.
 */
const PROVISION_TIMEOUT_MS = 600_000;

/** Poll interval when waiting for server state (ms). */
const POLL_INTERVAL_MS = 3_000;

// ─── Hetzner API Types ──────────────────────────────────────────────────────

export interface HetznerServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number; // GB
  disk: number;   // GB
  prices: Array<{
    location: string;
    price_hourly: { net: string; gross: string };
    price_monthly: { net: string; gross: string };
  }>;
  cpu_type: 'shared' | 'dedicated';
  architecture: 'x86' | 'arm';
}

interface HetznerServer {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4: { ip: string };
    ipv6: { ip: string };
  };
  server_type: { name: string };
  labels: Record<string, string>;
}

interface HetznerImage {
  id: number;
  description: string | null;
  created?: string;
  architecture: 'x86' | 'arm' | string;
  disk_size: number;
}

let snapshotRequirementsCache:
  | {
      snapshotId: string;
      description: string | null;
      diskSize: number;
      architecture: string;
      fetchedAt: number;
    }
  | null = null;
const SNAPSHOT_REQUIREMENTS_TTL_MS = 5 * 60 * 1000;

async function resolveSnapshot(): Promise<{ snapshotId: string; description: string | null; diskSize: number; architecture: string }> {
  const configuredSnapshotId = config.HETZNER_SNAPSHOT_ID;
  const versionOverride = config.HETZNER_SNAPSHOT_VERSION_OVERRIDE;
  const effectiveDescription = versionOverride
    ? `kortix-computer-v${versionOverride}`
    : releaseManifest.sandbox.hetznerSnapshotDescription;

  const now = Date.now();
  if (
    snapshotRequirementsCache &&
    (
      (configuredSnapshotId && snapshotRequirementsCache.snapshotId === configuredSnapshotId) ||
      (effectiveDescription && snapshotRequirementsCache.description === effectiveDescription)
    ) &&
    now - snapshotRequirementsCache.fetchedAt < SNAPSHOT_REQUIREMENTS_TTL_MS
  ) {
    return {
      snapshotId: snapshotRequirementsCache.snapshotId,
      description: snapshotRequirementsCache.description,
      diskSize: snapshotRequirementsCache.diskSize,
      architecture: snapshotRequirementsCache.architecture,
    };
  }

  let image: HetznerImage | null = null;

  // Resolve by description: override version if set, otherwise from release manifest
  const data = await hetznerFetch<{ images: HetznerImage[] }>('/images?type=snapshot&per_page=50');
  const exact = data.images
    .filter((img) => img.description === effectiveDescription)
    .sort((a, b) => Date.parse(b.created || '') - Date.parse(a.created || ''));

  if (exact.length > 0) {
    image = exact[0];
  }

  // Fallback: explicit snapshot ID
  if (!image && configuredSnapshotId) {
    const idData = await hetznerFetch<{ image: HetznerImage }>(`/images/${configuredSnapshotId}`);
    image = idData.image;
  }

  if (!image) {
    throw new Error(
      `No Hetzner snapshot found. Checked description "${effectiveDescription}" and ID "${configuredSnapshotId || ''}"`,
    );
  }

  snapshotRequirementsCache = {
    snapshotId: String(image.id),
    description: image.description,
    diskSize: image.disk_size,
    architecture: image.architecture,
    fetchedAt: now,
  };

  return {
    snapshotId: String(image.id),
    description: image.description,
    diskSize: image.disk_size,
    architecture: image.architecture,
  };
}

// ─── API Helper ─────────────────────────────────────────────────────────────

async function hetznerFetch<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${HETZNER_API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${config.HETZNER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hetzner API ${options.method || 'GET'} ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ─── Public: List Available Server Types ────────────────────────────────────

export interface ServerTypeWithPricing {
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  cpuType: 'shared' | 'dedicated';
  architecture: 'x86' | 'arm';
  priceHourly: number;
  priceMonthly: number;
  /** Our selling price (Hetzner price * 1.2x markup). */
  priceMonthlyMarkup: number;
  location: string;
}

/** Markup applied to Hetzner prices for customer-facing pricing. */
const COMPUTE_MARKUP = 1.2;

/**
 * Fetch available Hetzner server types with pricing for a given location.
 * Filters to regular/general-purpose types only.
 * Returns both raw Hetzner prices and our marked-up selling prices.
 */
export async function listServerTypes(
  location?: string,
): Promise<ServerTypeWithPricing[]> {
  const loc = location || config.HETZNER_DEFAULT_LOCATION;
  const { diskSize: minDiskSize, architecture: snapshotArchitecture } = await resolveSnapshot();
  const data = await hetznerFetch<{ server_types: HetznerServerType[] }>('/server_types?per_page=50');

  return data.server_types
    .filter((st) => ALLOWED_SERVER_TYPE_PREFIXES.some((p) => st.name.startsWith(p)))
    .filter((st) => st.prices.some((p) => p.location === loc))
    .filter((st) => st.disk >= minDiskSize)
    .filter((st) => {
      if (snapshotArchitecture === 'x86') return st.architecture === 'x86';
      if (snapshotArchitecture === 'arm') return st.architecture === 'arm';
      return true;
    })
    .map((st) => {
      const locPrice = st.prices.find((p) => p.location === loc)!;
      const monthly = parseFloat(locPrice?.price_monthly?.gross || '0');
      return {
        name: st.name,
        description: st.description,
        cores: st.cores,
        memory: st.memory,
        disk: st.disk,
        cpuType: st.cpu_type,
        architecture: st.architecture,
        priceHourly: parseFloat(locPrice?.price_hourly?.gross || '0'),
        priceMonthly: monthly,
        priceMonthlyMarkup: Math.round(monthly * COMPUTE_MARKUP * 100) / 100,
        location: loc,
      };
    })
    .sort((a, b) => a.priceMonthly - b.priceMonthly);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class HetznerProvider implements SandboxProvider {
  readonly name: ProviderName = 'hetzner';

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    const snapshot = await resolveSnapshot();
    const snapshotId = snapshot.snapshotId;

    const requestedServerType = opts.hetznerServerType;
    const serverType = requestedServerType || config.HETZNER_DEFAULT_SERVER_TYPE;
    // Allow any server type that matches our prefix filters (cx*, ccx*, cpx*, cax*)
    if (requestedServerType && !ALLOWED_SERVER_TYPE_PREFIXES.some((p) => requestedServerType.startsWith(p))) {
      throw new Error(`Invalid Hetzner server type: ${requestedServerType}. Must start with: ${ALLOWED_SERVER_TYPE_PREFIXES.join(', ')}`);
    }
    const location = opts.hetznerLocation || config.HETZNER_DEFAULT_LOCATION;

    // Match Daytona behavior: one sandbox-scoped token for both directions.
    // KORTIX_TOKEN: sandbox -> API auth
    // INTERNAL_SERVICE_KEY: API proxy -> sandbox auth
    const serviceKey = opts.envVars?.KORTIX_TOKEN || '';

    const serverName = `kortix-sandbox-${opts.accountId.slice(0, 8)}-${Date.now().toString(36)}`;

    // Build cloud-init user_data to inject env vars on first boot.
    // The snapshot runs Docker with a systemd service (kortix-sandbox.service)
    // that reads /etc/kortix/env as --env-file. Cloud-init writes the env vars
    // there and starts the service.
    const envVars: Record<string, string> = {
      KORTIX_API_URL: config.KORTIX_URL.replace(/\/v1\/router\/?$/, ''),
      ENV_MODE: 'cloud',
      INTERNAL_SERVICE_KEY: serviceKey,
      KORTIX_TOKEN: serviceKey,
      // Pin the sandbox npm package version so startup.sh bootstraps the exact
      // version that matches this API deployment (not "latest" from npm registry).
      KORTIX_SANDBOX_VERSION: SANDBOX_VERSION,
      ...opts.envVars,
    };

    // Docker --env-file format: KEY=VALUE per line (no quoting needed)
    const envLines = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // Safely encode env vars as base64 to avoid shell injection via heredoc
    const envLinesBase64 = Buffer.from(envLines).toString('base64');

    const userData = [
      '#!/bin/bash',
      '# Fix: disable root password expiry (baked into ubuntu-24.04 snapshot base)',
      'chage -d 99999 root 2>/dev/null || true',
      'chage -M 99999 root 2>/dev/null || true',
      '',
      '# Write env vars to /etc/kortix/env (read by kortix-sandbox.service)',
      '# Use base64 to safely write env vars without heredoc injection issues',
      'mkdir -p /etc/kortix',
      `echo '${envLinesBase64}' | base64 -d > /etc/kortix/env`,
      '',
      '# Ensure startup script runs sandbox with required kernel capabilities',
      // startup.sh inside the sandbox image calls `unshare --pid --fork /init`.
      // Without SYS_ADMIN + unconfined seccomp, unshare fails with EPERM.
      "cat > /usr/local/bin/kortix-start.sh <<'STARTEOF'",
      '#!/bin/bash',
      'set -e',
      '',
      'ENV_FILE="/etc/kortix/env"',
      'for i in $(seq 1 60); do',
      '  [ -s "$ENV_FILE" ] && break',
      '  sleep 1',
      'done',
      'if [ ! -s "$ENV_FILE" ]; then',
      '  echo "[kortix] No env file at $ENV_FILE - starting with defaults"',
      '  touch "$ENV_FILE"',
      'fi',
      '',
      'docker rm -f kortix-sandbox 2>/dev/null || true',
      'exec docker run --rm --name kortix-sandbox \\',
      '  --env-file "$ENV_FILE" \\',
      '  --cap-add SYS_ADMIN \\',
      '  --security-opt seccomp=unconfined \\',
      '  --shm-size 2g \\',
      '  -p 8000:8000 \\',
      '  -p 6080:6080 \\',
      '  -p 6081:6081 \\',
      '  -p 3456:3456 \\',
      '  -p 3111:3111 \\',
      '  -p 3210:3210 \\',
      '  -p 9223:9223 \\',
      '  -p 9224:9224 \\',
      '  -p 22222:22 \\',
      '  -v kortix-workspace:/workspace \\',
      `  ${config.SANDBOX_IMAGE}`,
      'STARTEOF',
      'chmod +x /usr/local/bin/kortix-start.sh',
      '',
      '# Ensure the systemd service unit exists (may be missing from older snapshots)',
      "cat > /etc/systemd/system/kortix-sandbox.service <<'SVCEOF'",
      '[Unit]',
      'Description=Kortix Sandbox Container',
      'After=docker.service',
      'Requires=docker.service',
      '',
      '[Service]',
      'Type=simple',
      'ExecStart=/usr/local/bin/kortix-start.sh',
      'Restart=on-failure',
      'RestartSec=5',
      'StandardOutput=journal',
      'StandardError=journal',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'SVCEOF',
      'systemctl daemon-reload',
      'systemctl enable kortix-sandbox.service',
      '# Start (or restart) the sandbox container',
      'systemctl start kortix-sandbox.service',
    ].join('\n');

    // Create the server
    const createBody: Record<string, unknown> = {
      name: serverName,
      server_type: serverType,
      image: parseInt(snapshotId, 10) || snapshotId,
      location,
      backups: true,
      start_after_create: true,
      user_data: userData,
      labels: {
        'kortix-sandbox': 'true',
        'kortix-account': opts.accountId.slice(0, 63),
        'kortix-user': opts.userId.slice(0, 63),
        'kortix-version': SANDBOX_VERSION,
      },
    };

    // Attach SSH key if configured
    if (config.HETZNER_SSH_KEY_ID) {
      createBody.ssh_keys = [parseInt(config.HETZNER_SSH_KEY_ID, 10)];
    }

    const result = await hetznerFetch<{ server: HetznerServer }>('/servers', {
      method: 'POST',
      body: createBody,
    });

    const server = result.server;
    const serverId = String(server.id);

    // Wait for the server to be running
    await this.waitForStatus(serverId, 'running');

    // Re-fetch to get the assigned public IP
    const info = await hetznerFetch<{ server: HetznerServer }>(`/servers/${serverId}`);
    const publicIp = info.server.public_net.ipv4.ip;
    const baseUrl = `http://${publicIp}:${KORTIX_MASTER_PORT}`;

    console.log(
      `[HETZNER] Created server ${serverName} (ID: ${serverId}, IP: ${publicIp}, ` +
      `type: ${serverType}) for account ${opts.accountId}`,
    );

    return {
      externalId: serverId,
      baseUrl,
      metadata: {
        hetznerServerId: serverId,
        serverName,
        serverType,
        location,
        publicIp,
        snapshotId,
        version: SANDBOX_VERSION,
      },
    };
  }

  async start(externalId: string): Promise<void> {
    await hetznerFetch(`/servers/${externalId}/actions/poweron`, { method: 'POST' });
    console.log(`[HETZNER] Started server ${externalId}`);
  }

  async stop(externalId: string): Promise<void> {
    await hetznerFetch(`/servers/${externalId}/actions/poweroff`, { method: 'POST' });
    console.log(`[HETZNER] Stopped server ${externalId}`);
  }

  async remove(externalId: string): Promise<void> {
    await hetznerFetch(`/servers/${externalId}`, { method: 'DELETE' });
    console.log(`[HETZNER] Deleted server ${externalId}`);
  }

  async getStatus(externalId: string): Promise<SandboxStatus> {
    try {
      const data = await hetznerFetch<{ server: HetznerServer }>(`/servers/${externalId}`);
      const status = data.server.status;
      if (status === 'running') return 'running';
      if (status === 'off' || status === 'stopping') return 'stopped';
      if (status === 'deleting') return 'removed';
      return 'unknown';
    } catch (err: any) {
      if (err.message?.includes('404')) return 'removed';
      return 'unknown';
    }
  }

  async resolveEndpoint(externalId: string): Promise<ResolvedEndpoint> {
    // Get the server's public IP from Hetzner API
    const data = await hetznerFetch<{ server: HetznerServer }>(`/servers/${externalId}`);
    const publicIp = data.server.public_net.ipv4.ip;
    const url = `http://${publicIp}:${KORTIX_MASTER_PORT}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Look up the service key from the sandbox config
    try {
      const [row] = await db
        .select({ config: sandboxes.config })
        .from(sandboxes)
        .where(eq(sandboxes.externalId, externalId))
        .limit(1);
      const serviceKey = (row?.config as Record<string, unknown>)?.serviceKey as string | undefined;
      if (serviceKey) {
        headers['Authorization'] = `Bearer ${serviceKey}`;
      }
    } catch (err) {
      console.warn(`[HETZNER] Failed to look up service key for ${externalId}:`, err);
      // Fall back to global service key
      if (config.INTERNAL_SERVICE_KEY) {
        headers['Authorization'] = `Bearer ${config.INTERNAL_SERVICE_KEY}`;
      }
    }

    return { url, headers };
  }

  async ensureRunning(externalId: string): Promise<void> {
    const status = await this.getStatus(externalId);
    if (status === 'running') return;
    console.log(`[HETZNER] Server ${externalId} is ${status}, starting...`);
    await this.start(externalId);
    await this.waitForStatus(externalId, 'running');
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private async waitForStatus(
    serverId: string,
    target: string,
    timeoutMs = PROVISION_TIMEOUT_MS,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const data = await hetznerFetch<{ server: HetznerServer }>(`/servers/${serverId}`);
      if (data.server.status === target) return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(`[HETZNER] Server ${serverId} did not reach '${target}' within ${timeoutMs / 1000}s`);
  }
}
