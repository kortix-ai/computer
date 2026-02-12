/**
 * Platform API client.
 *
 * Talks to kortix-platform (platform.kortix.com) for sandbox lifecycle:
 *   POST /v1/account/init   — ensure user has a sandbox, provision if needed
 *   GET  /v1/account/sandbox — get user's active sandbox
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

export interface SandboxInfo {
  sandbox_id: string;
  external_id: string;
  name: string;
  base_url: string;
  status: string;
  created_at: string;
}

/**
 * Build the OpenCode server URL for a sandbox.
 * Format: https://kortix.cloud/{externalId}/8000
 */
export function getSandboxUrl(sandbox: SandboxInfo): string {
  return `https://kortix.cloud/${sandbox.external_id}/8000`;
}

interface PlatformResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  created?: boolean;
}

async function platformFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<PlatformResponse<T>> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`${PLATFORM_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body?.error || body?.message || `Platform API error ${res.status}`);
  }

  return body as PlatformResponse<T>;
}

/**
 * Initialize account — ensures the user has an active sandbox.
 * Idempotent: if a sandbox already exists, returns it.
 * If none exists, provisions a new one via Daytona.
 */
export async function initAccount(): Promise<{ sandbox: SandboxInfo; created: boolean }> {
  const result = await platformFetch<SandboxInfo>('/v1/account/init', {
    method: 'POST',
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
