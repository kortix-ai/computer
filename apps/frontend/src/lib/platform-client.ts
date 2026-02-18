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
 * ALL providers route through the backend preview proxy:
 *   `{BACKEND_URL}/preview/{sandboxId}/{containerPort}`
 *
 * For local_docker, sandboxId is 'local' (the backend resolves it to localhost).
 * For daytona, sandboxId is the external_id from the platform.
 */
export function getDirectPortUrl(
  server: ServerEntry,
  containerPort: string,
): string | null {
  // Cloud: route through the preview proxy
  if (server.provider === 'daytona' && server.sandboxId && server.sandboxId !== 'undefined') {
    return `${PLATFORM_URL}/preview/${server.sandboxId}/${containerPort}`;
  }

  // Local Docker: also route through the preview proxy
  if (server.provider === 'local_docker') {
    return `${PLATFORM_URL}/preview/local/${containerPort}`;
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
 *
 * ALL providers route through the backend preview proxy:
 *   `{BACKEND_URL}/preview/{sandboxId}/8000`
 *
 * For local_docker, uses 'local' as the sandboxId.
 * For daytona, uses the external_id.
 */
export function getSandboxUrl(sandbox: SandboxInfo): string {
  // Determine the sandbox identifier for the preview proxy
  const sandboxId =
    sandbox.provider === 'local_docker'
      ? 'local'
      : sandbox.external_id;

  if (!sandboxId) {
    throw new Error(
      `Cannot build sandbox URL: missing external_id for ${sandbox.provider} sandbox "${sandbox.sandbox_id}"`,
    );
  }

  return `${PLATFORM_URL}/preview/${sandboxId}/${SANDBOX_PORTS.KORTIX_MASTER}`;
}

/**
 * Build a URL to access a specific container port on a sandbox.
 *
 * ALL providers route through the backend preview proxy:
 *   `{BACKEND_URL}/preview/{sandboxId}/{containerPort}`
 */
export function getSandboxPortUrl(
  sandbox: SandboxInfo,
  containerPort: string,
): string | null {
  const sandboxId =
    sandbox.provider === 'local_docker'
      ? 'local'
      : sandbox.external_id;

  if (!sandboxId) return null;

  return `${PLATFORM_URL}/preview/${sandboxId}/${containerPort}`;
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

export interface ChangelogArtifact {
  name: string;
  target: 'npm' | 'docker-hub' | 'github-release' | 'daytona';
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  changes: ChangelogChange[];
  artifacts?: ChangelogArtifact[];
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
 * Get the full changelog history from the platform.
 * Returns all changelog entries (newest first).
 */
export async function getFullChangelog(): Promise<ChangelogEntry[]> {
  const res = await fetch(`${PLATFORM_URL}/platform/sandbox/version/changelog`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Changelog fetch failed: ${res.status}`);
  const data = await res.json();
  return data.changelog ?? [];
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
