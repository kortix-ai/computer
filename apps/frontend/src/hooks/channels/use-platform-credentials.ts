/**
 * Platform credential hooks — sandbox-first architecture.
 *
 * All channel credentials now live in the sandbox's SecretStore.
 * The frontend pushes them directly to the sandbox via the OpenCode proxy
 * (authenticatedFetch to the sandbox's /env endpoint).
 *
 * The `channel_platform_credentials` DB table is NO LONGER USED.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/auth-token';
import { getActiveOpenCodeUrl } from '@/stores/server-store';

/**
 * Push platform credentials directly to the sandbox's SecretStore.
 * Replaces the old `useSavePlatformCredentials` that wrote to kortix-api DB.
 */
export function useSavePlatformCredentials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelType,
      credentials,
    }: {
      channelType: string;
      credentials: Record<string, string>;
      sandboxId?: string | null;
    }) => {
      const baseUrl = getActiveOpenCodeUrl();
      if (!baseUrl) throw new Error('No active instance found');

      // Map credential fields to env var names
      const envKeys: Record<string, string> = {};
      if (channelType === 'slack') {
        if (credentials.clientId) envKeys.SLACK_CLIENT_ID = credentials.clientId;
        if (credentials.clientSecret) envKeys.SLACK_CLIENT_SECRET = credentials.clientSecret;
        if (credentials.signingSecret) envKeys.SLACK_SIGNING_SECRET = credentials.signingSecret;
      } else if (channelType === 'telegram') {
        if (credentials.botToken) envKeys.TELEGRAM_BOT_TOKEN = credentials.botToken;
      } else if (channelType === 'discord') {
        if (credentials.botToken) envKeys.DISCORD_BOT_TOKEN = credentials.botToken;
      }

      if (Object.keys(envKeys).length === 0) {
        throw new Error('No credentials to save');
      }

      // Push each key to the sandbox's /env endpoint
      for (const [key, value] of Object.entries(envKeys)) {
        const res = await authenticatedFetch(`${baseUrl}/env/${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => 'unknown');
          throw new Error(`Failed to set ${key}: ${err}`);
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      // Invalidate any cached credential status queries
      queryClient.invalidateQueries({ queryKey: ['platform-credentials'] });
    },
  });
}

// ── Stubs for backward compatibility ──────────────────────────────────────────
// These types/hooks are still imported in a few places but no longer need real
// DB-backed implementations. We keep them as no-ops or simple stubs.

export interface PlatformCredentialStatus {
  configured: boolean;
  source: 'env' | 'db' | 'sandbox' | 'none';
  fields: Record<string, boolean>;
}

export interface PlatformCredentialEntry {
  id: string;
  channelType: string;
  sandboxId: string | null;
  sandboxName: string | null;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Check if platform credentials are configured.
 * Now always returns 'sandbox' source — the actual check happens
 * when kortix-api reads from the sandbox during OAuth install.
 */
export function usePlatformCredentialStatus(
  _channelType: string | null,
  _sandboxId?: string | null,
) {
  // Always indicate "not from env" so the wizard is shown (users push creds to sandbox)
  return {
    data: { configured: false, source: 'none' as const, fields: {} } as PlatformCredentialStatus,
    isLoading: false,
    error: null,
  };
}

export function usePlatformCredentialsList() {
  return {
    data: [] as PlatformCredentialEntry[],
    isLoading: false,
    error: null,
  };
}

export function useDeletePlatformCredentials() {
  return useMutation({
    mutationFn: async (_params: { channelType: string; sandboxId?: string | null }) => {
      // No-op — credentials are managed in the sandbox
      return { success: true };
    },
  });
}
