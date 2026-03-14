import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/auth-token';
import { getActiveOpenCodeUrl, useServerStore } from '@/stores/server-store';
import { backendApi } from '@/lib/api-client';
import { ensureSandbox } from '@/lib/platform-client';

export interface DetectUrlResult {
  url: string;
  source: 'ngrok' | 'config' | 'none';
  detected: boolean;
}

export interface VerifyTokenResult {
  valid: boolean;
  error?: string;
  bot?: {
    id: number;
    username: string;
    firstName: string;
  };
}

/**
 * Verify a Telegram bot token by calling the Telegram API directly from the browser.
 * No backend/DB involved — just a simple HTTPS call to api.telegram.org.
 */
export function useTelegramVerifyToken() {
  return useMutation({
    mutationFn: async ({ botToken }: { botToken: string }): Promise<VerifyTokenResult> => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
          signal: AbortSignal.timeout(10_000),
        });
        const data = await res.json() as {
          ok: boolean;
          result?: { id: number; first_name: string; username: string };
          description?: string;
        };

        if (data.ok && data.result) {
          return {
            valid: true,
            bot: {
              id: data.result.id,
              username: data.result.username,
              firstName: data.result.first_name,
            },
          };
        }
        return { valid: false, error: data.description || 'Invalid token' };
      } catch {
        return { valid: false, error: 'Failed to reach Telegram API' };
      }
    },
  });
}

/**
 * Detect the public URL (ngrok) from inside the sandbox.
 * Calls the opencode-channels wizard endpoint via the sandbox proxy.
 */
export function useTelegramDetectUrl() {
  return useQuery({
    queryKey: ['telegram-wizard', 'detect-url'],
    queryFn: async (): Promise<DetectUrlResult> => {
      const baseUrl = getActiveOpenCodeUrl();
      if (!baseUrl) {
        return { detected: false, url: '', source: 'none' };
      }

      try {
        const res = await authenticatedFetch(`${baseUrl}/channels/wizard/detect-url`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) {
          return await res.json() as DetectUrlResult;
        }
      } catch { /* sandbox unreachable */ }
      return { detected: false, url: '', source: 'none' };
    },
    staleTime: 0,
    retry: false,
  });
}

/**
 * Push Telegram credentials to the sandbox as env vars, reload the channels
 * service, and set the Telegram webhook — all sandbox-direct, no DB.
 */
export function useTelegramConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      botToken,
      publicUrl,
      botUsername,
    }: {
      botToken: string;
      publicUrl: string;
      botUsername?: string;
    }) => {
      const baseUrl = getActiveOpenCodeUrl();
      if (!baseUrl) throw new Error('No active instance found');

      const secretToken = `oc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // 1. Push env vars to sandbox
      for (const [key, value] of Object.entries({
        TELEGRAM_BOT_TOKEN: botToken,
        TELEGRAM_WEBHOOK_SECRET_TOKEN: secretToken,
      })) {
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

      // 2. Reload opencode-channels with new credentials
      const reloadRes = await authenticatedFetch(`${baseUrl}/channels/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: {
            telegram: { botToken, secretToken },
          },
        }),
      });
      if (!reloadRes.ok) {
        const err = await reloadRes.text().catch(() => 'unknown');
        throw new Error(`Failed to reload channels: ${err}`);
      }

      // 3. Set Telegram webhook via Telegram API (from browser)
      // Uses /webhooks/telegram on kortix-api so both Slack and Telegram
      // can share a single tunnel on port 8008.
      const webhookUrl = `${publicUrl}/webhooks/telegram`;
      const whRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secretToken,
          allowed_updates: ['message', 'edited_message', 'callback_query', 'message_reaction'],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const whData = await whRes.json() as { ok: boolean; description?: string };
      if (!whData.ok) {
        throw new Error(`Failed to set webhook: ${whData.description || 'unknown'}`);
      }

      // 4. Create a channel config DB record so it shows up in the channels list
      let sandboxId: string | null = null;
      try {
        const result = await ensureSandbox();
        sandboxId = result.sandbox.sandbox_id;
      } catch {
        // Try from server store
        const store = useServerStore.getState();
        for (const s of store.servers) {
          if (s.sandboxId) { sandboxId = s.sandboxId; break; }
        }
      }

      const channelName = botUsername ? `@${botUsername}` : 'Telegram Bot';
      try {
        await backendApi.post('/channels', {
          sandbox_id: sandboxId,
          channel_type: 'telegram',
          name: channelName,
          enabled: true,
          platform_config: {
            webhook_url: webhookUrl,
            bot_username: botUsername || null,
          },
          session_strategy: 'per-thread',
        });
      } catch (err) {
        // Channel may already exist for this sandbox — not fatal
        console.warn('[telegram-wizard] Failed to create channel config (may already exist):', err);
      }

      return { webhookUrl, secretToken };
    },
    onSuccess: () => {
      // Invalidate channels list so it shows up immediately
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}
