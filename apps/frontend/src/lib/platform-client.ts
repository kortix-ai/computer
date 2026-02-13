/**
 * Platform API client.
 *
 * Talks to kortix-platform (platform.kortix.com) for sandbox lifecycle:
 *   GET  /v1/account/providers          — available sandbox providers
 *   POST /v1/account/init               — ensure user has a sandbox, provision if needed
 *   GET  /v1/account/sandbox            — get user's active sandbox
 *   GET  /v1/account/sandboxes          — list all sandboxes
 *   POST /v1/account/sandbox/:id/start  — start a stopped sandbox
 *   POST /v1/account/sandbox/:id/stop   — stop a running sandbox
 *   DELETE /v1/account/sandbox/:id      — remove a sandbox
 *
 * Auth: Supabase JWT passed as Bearer token (same as all other services).
 */

import { getSupabaseAccessToken } from '@/lib/auth-token';

function getPlatformUrl(): string {
  // Explicit override takes priority
  if (process.env.NEXT_PUBLIC_PLATFORM_URL) {
    return process.env.NEXT_PUBLIC_PLATFORM_URL;
  }
  // Derive from environment mode
  const mode = process.env.NEXT_PUBLIC_ENV_MODE;
  if (mode === 'production') return 'https://platform.kortix.com';
  if (mode === 'staging') return 'https://platform.kortix.com';
  return 'http://localhost:8012';
}

const PLATFORM_URL = getPlatformUrl();

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
  const isLocal = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local';
  const token = isLocal ? null : await getSupabaseAccessToken();
  if (!isLocal && !token) {
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
 * - Daytona: https://kortix.cloud/{externalId}/8000
 * - Local Docker: uses the base_url directly (http://localhost:{port})
 */
export function getSandboxUrl(sandbox: SandboxInfo): string {
  if (sandbox.provider === 'local_docker') {
    return sandbox.base_url;
  }
  return `https://kortix.cloud/${sandbox.external_id}/8000`;
}

/**
 * Get available sandbox providers from the platform service.
 */
export async function getProviders(): Promise<ProvidersInfo> {
  const result = await platformFetch<ProvidersInfo>('/v1/account/providers');
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get providers');
  }
  return result.data;
}

/**
 * Initialize account — ensures the user has an active sandbox.
 * Idempotent: if a sandbox already exists, returns it.
 * If none exists, provisions a new one via the specified provider.
 */
export async function initAccount(opts?: {
  provider?: SandboxProviderName;
}): Promise<{ sandbox: SandboxInfo; created: boolean }> {
  const result = await platformFetch<SandboxInfo>('/v1/account/init', {
    method: 'POST',
    body: opts?.provider ? JSON.stringify({ provider: opts.provider }) : undefined,
  });

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to initialize account');
  }

  return { sandbox: result.data, created: result.created ?? false };
}

/**
 * Get the user's active sandbox.
 * Returns null if no sandbox exists (user should call initAccount first).
 */
export async function getSandbox(): Promise<SandboxInfo | null> {
  try {
    const result = await platformFetch<SandboxInfo>('/v1/account/sandbox', {
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
  const result = await platformFetch<SandboxInfo[]>('/v1/account/sandboxes', {
    method: 'GET',
  });

  if (!result.success || !result.data) {
    return [];
  }

  return result.data;
}

/**
 * Start a stopped sandbox.
 */
export async function startSandbox(sandboxId: string): Promise<void> {
  const result = await platformFetch<void>(`/v1/account/sandbox/${sandboxId}/start`, {
    method: 'POST',
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to start sandbox');
  }
}

/**
 * Stop a running sandbox.
 */
export async function stopSandbox(sandboxId: string): Promise<void> {
  const result = await platformFetch<void>(`/v1/account/sandbox/${sandboxId}/stop`, {
    method: 'POST',
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to stop sandbox');
  }
}

/**
 * Remove (archive) a sandbox.
 */
export async function removeSandbox(sandboxId: string): Promise<void> {
  const result = await platformFetch<void>(`/v1/account/sandbox/${sandboxId}`, {
    method: 'DELETE',
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to remove sandbox');
  }
}

// ─── Sandbox Update API ─────────────────────────────────────────────────────

export interface SandboxVersionInfo {
  version: string;
  package: string;
}

export interface SandboxUpdateStatus {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updatedAt: string;
  updateInProgress: boolean;
}

export interface SandboxUpdateResult {
  success?: boolean;
  upToDate?: boolean;
  previousVersion?: string;
  currentVersion: string;
  latestVersion: string;
  output?: string;
  error?: string;
}

/**
 * Get the latest available sandbox version from the platform.
 * Platform checks npm registry (cached 5min).
 */
export async function getLatestSandboxVersion(): Promise<SandboxVersionInfo> {
  const res = await fetch(`${PLATFORM_URL}/v1/sandbox/version`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Version check failed: ${res.status}`);
  return res.json();
}

/**
 * Get the current update status from a running sandbox.
 * Calls the sandbox directly (via cloud proxy).
 */
export async function getSandboxUpdateStatus(sandbox: SandboxInfo): Promise<SandboxUpdateStatus> {
  const url = getSandboxUrl(sandbox);
  const res = await fetch(`${url}/kortix/update/status`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

/**
 * Trigger an update on a running sandbox.
 * Calls POST /kortix/update on the sandbox directly (via cloud proxy).
 */
export async function triggerSandboxUpdate(sandbox: SandboxInfo): Promise<SandboxUpdateResult> {
  const url = getSandboxUrl(sandbox);
  const res = await fetch(`${url}/kortix/update`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Update failed: ${res.status}`);
  }
  return res.json();
}
