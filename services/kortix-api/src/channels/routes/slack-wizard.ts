import { Hono } from 'hono';
import { config } from '../../config';
import type { AppEnv } from '../../types';

export function createSlackWizardRouter(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Detect public URL for webhooks (ngrok or config)
  app.get('/detect-url', async (c) => {
    // 1. Check CHANNELS_PUBLIC_URL from config
    if (config.CHANNELS_PUBLIC_URL) {
      return c.json({
        url: config.CHANNELS_PUBLIC_URL,
        source: 'config' as const,
        detected: true,
      });
    }

    // 2. Try ngrok local API
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tunnels: Array<{ public_url: string; proto: string; config?: { addr?: string } }>;
        };
        const httpsTunnel = data.tunnels.find((t) => t.proto === 'https');
        const tunnel = httpsTunnel ?? data.tunnels[0];
        if (tunnel) {
          return c.json({
            url: tunnel.public_url,
            source: 'ngrok' as const,
            detected: true,
          });
        }
      }
    } catch {
      // ngrok not running — fall through
    }

    return c.json({
      url: '',
      source: 'none' as const,
      detected: false,
    });
  });

  // Generate Slack App manifest JSON
  app.post('/generate-manifest', async (c) => {
    const body = await c.req.json<{ publicUrl: string; botName?: string }>();
    const { publicUrl, botName = 'Kortix Agent' } = body;

    if (!publicUrl) {
      return c.json({ error: 'publicUrl is required' }, 400);
    }

    const baseUrl = publicUrl.replace(/\/+$/, '');
    const commandName = `/${botName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'ask'}`;

    const manifest = {
      display_information: { name: botName },
      features: {
        bot_user: { display_name: botName, always_online: true },
        slash_commands: [
          {
            command: commandName,
            url: `${baseUrl}/webhooks/slack/commands`,
            description: `${botName} slash command`,
            usage_hint: `${commandName} [message]`,
            should_escape: false,
          },
        ],
      },
      oauth_config: {
        redirect_urls: [`${baseUrl}/webhooks/slack/oauth_callback`],
        scopes: {
          bot: [
            'app_mentions:read',
            'assistant:write',
            'channels:history',
            'channels:read',
            'chat:write',
            'chat:write.public',
            'commands',
            'files:read',
            'files:write',
            'groups:history',
            'groups:read',
            'im:history',
            'im:read',
            'im:write',
            'mpim:history',
            'mpim:read',
            'reactions:read',
            'reactions:write',
            'users:read',
          ],
        },
      },
      settings: {
        event_subscriptions: {
          request_url: `${baseUrl}/webhooks/slack/events`,
          bot_events: [
            'app_mention',
            'message.channels',
            'message.groups',
            'message.im',
            'message.mpim',
            'reaction_added',
          ],
        },
        interactivity: {
          is_enabled: true,
          request_url: `${baseUrl}/webhooks/slack/interactivity`,
        },
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false,
      },
    };

    return c.json({ manifest });
  });

  return app;
}
