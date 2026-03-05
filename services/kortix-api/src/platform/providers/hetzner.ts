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
  location: string;
}

/**
 * Fetch available Hetzner server types with pricing for a given location.
 * Filters to regular (cx*) and general-purpose (ccx*) types only.
 */
export async function listServerTypes(
  location?: string,
): Promise<ServerTypeWithPricing[]> {
  const loc = location || config.HETZNER_DEFAULT_LOCATION;
  const data = await hetznerFetch<{ server_types: HetznerServerType[] }>('/server_types?per_page=50');

  return data.server_types
    .filter((st) => ALLOWED_SERVER_TYPE_PREFIXES.some((p) => st.name.startsWith(p)))
    .map((st) => {
      const locPrice = st.prices.find((p) => p.location === loc) || st.prices[0];
      return {
        name: st.name,
        description: st.description,
        cores: st.cores,
        memory: st.memory,
        disk: st.disk,
        cpuType: st.cpu_type,
        architecture: st.architecture,
        priceHourly: parseFloat(locPrice?.price_hourly?.gross || '0'),
        priceMonthly: parseFloat(locPrice?.price_monthly?.gross || '0'),
        location: loc,
      };
    })
    .sort((a, b) => a.priceMonthly - b.priceMonthly);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class HetznerProvider implements SandboxProvider {
  readonly name: ProviderName = 'hetzner';

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    const snapshotId = config.HETZNER_SNAPSHOT_ID;
    if (!snapshotId) {
      throw new Error('HETZNER_SNAPSHOT_ID is not configured — set it to the Hetzner snapshot ID');
    }

    const requestedServerType = opts.hetznerServerType;
    const serverType = requestedServerType || config.HETZNER_DEFAULT_SERVER_TYPE;
    if (requestedServerType && requestedServerType !== 'cpx22' && requestedServerType !== 'cpx32') {
      throw new Error(`Invalid Hetzner server type: ${requestedServerType}. Allowed: cpx22, cpx32`);
    }
    const location = config.HETZNER_DEFAULT_LOCATION;

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
      ...opts.envVars,
    };

    // Docker --env-file format: KEY=VALUE per line (no quoting needed)
    const envLines = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const userData = [
      '#!/bin/bash',
      '# Write env vars to /etc/kortix/env (read by kortix-sandbox.service)',
      'mkdir -p /etc/kortix',
      `cat > /etc/kortix/env <<\'ENVEOF\'`,
      envLines,
      'ENVEOF',
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
      `  kortix/sandbox:${SANDBOX_VERSION}`,
      'STARTEOF',
      'chmod +x /usr/local/bin/kortix-start.sh',
      'systemctl daemon-reload',
      '# Start (or restart) the sandbox container',
      'systemctl start kortix-sandbox.service',
    ].join('\n');

    // Create the server
    const createBody: Record<string, unknown> = {
      name: serverName,
      server_type: serverType,
      image: parseInt(snapshotId, 10) || snapshotId,
      location,
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
