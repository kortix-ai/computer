/**
 * Platform API client.
 *
 * Routes through kortix-api (the unified backend) for sandbox lifecycle:
 *   GET  /platform/providers          — available sandbox providers
 *   POST /platform/init               — ensure user has a sandbox, provision if needed
 *   GET  /platform/sandbox            — get user's active sandbox
 *   GET  /platform/sandbox/list        — list all sandboxes
 *   POST /platform/sandbox/stop       — stop the active sandbox
 *   POST /platform/sandbox/restart    — restart the active sandbox
 *   DELETE /platform/sandbox           — remove/archive the active sandbox
 *
 * In production: https://api.kortix.com/v1/platform/*  (base URL includes /v1)
 * In local:      http://localhost:8008/v1/platform/*  (base URL includes /v1)
 */

import { getSupabaseAccessToken } from '@/lib/auth-token';
import type { ServerEntry } from '@/stores/server-store';

// ─── Sandbox Port Constants ──────────────────────────────────────────────────

/**
 * Well-known container ports exposed by the sandbox image.
 * These are the ports INSIDE the container — Docker maps them to random host ports.
 */
export const SANDBOX_PORTS = {
  DESKTOP: '6080',
  DESKTOP_HTTPS: '6081',
  OPENCODE_UI: '3111',
  PRESENTATION_VIEWER: '3210',
  KORTIX_MASTER: '8000',
  BROWSER_STREAM: '9223',
  BROWSER_VIEWER: '9224',
} as const;

/**
 * Get a direct URL to a sandbox service via the preview proxy.
 *
 * - Local Docker: resolves via `mappedPorts` → `http://localhost:{hostPort}`
 * - Daytona (cloud): `{BACKEND_URL}/preview/{externalId}/{containerPort}`
 * - Manual/unknown: returns null (caller should fall back to proxy)
 */
export function getDirectPortUrl(
  server: ServerEntry,
  containerPort: string,
): string | null {
  // Cloud: route through the preview proxy (guard against undefined sandboxId)
  if (server.provider === 'daytona' && server.sandboxId && server.sandboxId !== 'undefined') {
    return `${PLATFORM_URL}/preview/${server.sandboxId}/${containerPort}`;
  }

  // Local Docker: look up the random host port from mappedPorts
  if (server.provider === 'local_docker' && server.mappedPorts) {
    const hostPort = server.mappedPorts[containerPort];
    if (!hostPort) return null;
    try {
      const base = new URL(server.url);
      return `${base.protocol}//${base.hostname}:${hostPort}`;
    } catch {
      return `http://localhost:${hostPort}`;
    }
  }

  return null;
}

/**
 * Get the base URL for platform API calls.
 *
 * Uses NEXT_PUBLIC_BACKEND_URL directly (includes /v1).
 */
function getPlatformUrl(): string {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (backendUrl) {
    return backendUrl;
  }

  // Fallback for local dev
  return 'http://localhost:8008/v1';
}

const PLATFORM_URL = getPlatformUrl();

function isLocalMode(): boolean {
  return process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local';
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type SandboxProviderName = 'daytona' | 'local_docker';

export interface SandboxInfo {
  sandbox_id: string;
  external_id: string;
  name: string;
  provider: SandboxProviderName;
  base_url: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProvidersInfo {
  providers: SandboxProviderName[];
  default: SandboxProviderName;
}

interface PlatformResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  created?: boolean;
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function platformFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<PlatformResponse<T>> {
  const local = isLocalMode();
  const token = local ? null : await getSupabaseAccessToken();
  if (!local && !token) {
    throw new Error('Not authenticated');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${PLATFORM_URL}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body?.error || body?.message || `Platform API error ${res.status}`);
  }

  return body as PlatformResponse<T>;
}

// ─── API methods ─────────────────────────────────────────────────────────────

/**
 * Build the OpenCode server URL for a sandbox.
 * - Local Docker: uses the base_url directly (http://localhost:{port})
 * - Daytona (cloud): {BACKEND_URL}/preview/{externalId}/8000
 *
 * Guards against missing external_id to prevent broken URLs.
 */
export function getSandboxUrl(sandbox: SandboxInfo): string {
  // Local Docker always uses base_url (direct localhost port mapping)
  if (sandbox.provider === 'local_docker') {
    return sandbox.base_url;
  }

  // Daytona requires a valid external_id for URL construction
  if (!sandbox.external_id) {
    // Fallback: if base_url is set, use it directly
    if (sandbox.base_url) return sandbox.base_url;
    throw new Error(
      `Cannot build sandbox URL: missing external_id for ${sandbox.provider} sandbox "${sandbox.sandbox_id}"`,
    );
  }

  return `${PLATFORM_URL}/preview/${sandbox.external_id}/${SANDBOX_PORTS.KORTIX_MASTER}`;
}

/**
 * Build a URL to access a specific container port on a sandbox.
 *
 * - Daytona (cloud): `{BACKEND_URL}/preview/{externalId}/{containerPort}`
 * - Local Docker: reads `metadata.mappedPorts[containerPort]` →
 *   `http://localhost:{hostPort}`. Returns null if no mapping exists.
 * - Falls back to null if the port can't be resolved.
 */
export function getSandboxPortUrl(
  sandbox: SandboxInfo,
  containerPort: string,
): string | null {
  if ((sandbox.provider === 'daytona' || (!sandbox.provider && sandbox.external_id)) && sandbox.external_id) {
    return `${PLATFORM_URL}/preview/${sandbox.external_id}/${containerPort}`;
  }

  if (sandbox.provider === 'local_docker') {
    const mappedPorts = sandbox.metadata?.mappedPorts as
      | Record<string, string>
      | undefined;
    const hostPort = mappedPorts?.[containerPort];
    if (!hostPort) return null;
    // base_url is http://localhost:{somePort} — extract the hostname
    try {
      const base = new URL(sandbox.base_url);
      return `${base.protocol}//${base.hostname}:${hostPort}`;
    } catch {
      return `http://localhost:${hostPort}`;
    }
  }

  return null;
}

/**
 * Extract mappedPorts from sandbox metadata (convenience for storing in ServerEntry).
 * Returns undefined if not available.
 */
export function extractMappedPorts(
  sandbox: SandboxInfo,
): Record<string, string> | undefined {
  if (sandbox.provider !== 'local_docker') return undefined;
  const ports = sandbox.metadata?.mappedPorts;
  if (ports && typeof ports === 'object' && !Array.isArray(ports)) {
    return ports as Record<string, string>;
  }
  return undefined;
}

/**
 * Get available sandbox providers from the platform service.
 */
export async function getProviders(): Promise<ProvidersInfo> {
  const result = await platformFetch<ProvidersInfo>('/platform/providers');
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get providers');
  }
  return result.data;
}

/**
 * Ensure a sandbox is running. Idempotent:
 *   - Running  → return it
 *   - Stopped  → start it
 *   - Missing  → create it
 */
export async function ensureSandbox(opts?: {
  provider?: SandboxProviderName;
}): Promise<{ sandbox: SandboxInfo; created: boolean }> {
  const result = await platformFetch<SandboxInfo>('/platform/init', {
    method: 'POST',
    body: opts?.provider ? JSON.stringify({ provider: opts.provider }) : undefined,
  });

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to ensure sandbox');
  }

  return { sandbox: result.data, created: result.created ?? false };
}

/**
 * Backwards-compatible alias for ensureSandbox.
 * @deprecated Use ensureSandbox() directly.
 */
export const initAccount = ensureSandbox;

/**
 * Get the user's sandbox.
 * Returns null if no sandbox exists (call ensureSandbox first).
 */
export async function getSandbox(): Promise<SandboxInfo | null> {
  try {
    const result = await platformFetch<SandboxInfo>('/platform/sandbox', {
      method: 'GET',
    });

    if (!result.success || !result.data) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

/**
 * List all sandboxes for the user's account.
 */
export async function listSandboxes(): Promise<SandboxInfo[]> {
  const result = await platformFetch<SandboxInfo[]>('/platform/sandbox/list', {
    method: 'GET',
  });

  if (!result.success || !result.data) {
    return [];
  }

  return result.data;
}

/**
 * Restart the active sandbox (stop + start).
 */
export async function restartSandbox(): Promise<void> {
  const result = await platformFetch<void>('/platform/sandbox/restart', {
    method: 'POST',
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to restart sandbox');
  }
}

/**
 * Stop the active sandbox.
 */
export async function stopSandbox(): Promise<void> {
  const result = await platformFetch<void>('/platform/sandbox/stop', {
    method: 'POST',
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to stop sandbox');
  }
}

/**
 * Remove (destroy) the active sandbox.
 * Calls the backend which destroys the Daytona VM and archives the DB row.
 */
export async function removeSandbox(): Promise<void> {
  const result = await platformFetch<void>('/platform/sandbox', {
    method: 'DELETE',
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to remove sandbox');
  }
}

// ─── Sandbox Update API ─────────────────────────────────────────────────────

export interface ChangelogChange {
  type: 'feature' | 'fix' | 'improvement' | 'breaking' | 'upstream' | 'security' | 'deprecation';
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  changes: ChangelogChange[];
}

export interface SandboxVersionInfo {
  version: string;
  package: string;
  changelog: ChangelogEntry | null;
}

export interface SandboxUpdateResult {
  success?: boolean;
  upToDate?: boolean;
  previousVersion?: string;
  currentVersion: string;
  changelog?: ChangelogEntry | null;
  output?: string;
  error?: string;
}

/**
 * Get the latest available sandbox version from the platform.
 * Platform checks npm registry (cached 5min).
 */
export async function getLatestSandboxVersion(): Promise<SandboxVersionInfo> {
  const res = await fetch(`${PLATFORM_URL}/platform/sandbox/version`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Version check failed: ${res.status}`);
  return res.json();
}

/**
 * Trigger an update on a running sandbox.
 * Frontend passes the target version — sandbox doesn't need to fetch it.
 */
export async function triggerSandboxUpdate(
  sandbox: SandboxInfo,
  version: string,
): Promise<SandboxUpdateResult> {
  const url = getSandboxUrl(sandbox);
  const token = await getSupabaseAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${url}/kortix/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ version }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Update failed: ${res.status}`);
  }
  return res.json();
}
