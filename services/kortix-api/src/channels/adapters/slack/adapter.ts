import type { Context } from 'hono';
import type { Hono } from 'hono';
import type { ChannelEngine } from '../adapter';
import { BaseAdapter } from '../adapter';
import type { ChannelCapabilities, NormalizedMessage, AgentResponse } from '../../types';
import type { ChannelConfig } from '@kortix/db';
import { SlackApi } from './api';
import { handleSlackWebhook } from './webhook';
import { splitMessage } from '../../lib/message-splitter';
import { config } from '../../../config';
import { db } from '../../../shared/db';
import { channelConfigs, sandboxes } from '@kortix/db';
import { eq } from 'drizzle-orm';

export class SlackAdapter extends BaseAdapter {
  readonly type = 'slack' as const;
  readonly name = 'Slack';
  readonly capabilities: ChannelCapabilities = {
    textChunkLimit: 4000,
    supportsRichText: true,
    supportsEditing: true,
    supportsTypingIndicator: true,
    supportsAttachments: true,
    connectionType: 'webhook',
  };

  registerRoutes(router: Hono, engine: ChannelEngine): void {
    router.post('/slack/events', (c) => handleSlackWebhook(c, engine));
    router.get('/slack/install', (c) => this.handleInstall(c));
    router.get('/slack/oauth_callback', (c) => this.handleOAuthCallback(c));
  }

  async sendResponse(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
    response: AgentResponse,
  ): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) {
      console.error('[SLACK] No bot token in credentials');
      return;
    }

    const api = new SlackApi(botToken);

    const rawPayload = message.raw as Record<string, unknown> | undefined;
    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = event?.channel as string;

    if (!channel) {
      console.error('[SLACK] Cannot determine channel from message');
      return;
    }

    const threadTs = message.threadId || (message.chatType !== 'dm' ? message.externalId : undefined);
    const chunks = splitMessage(response.content, this.capabilities.textChunkLimit);

    for (const chunk of chunks) {
      const result = await api.postMessage({
        channel,
        text: chunk,
        thread_ts: threadTs,
      });

      if (!result.ok) {
        console.error(`[SLACK] postMessage failed: ${result.error}`);
      }
    }
  }

  private static PROGRESS_EMOJI = 'hourglass_flowing_sand';

  override async sendTypingIndicator(channelConfig: ChannelConfig, message: NormalizedMessage): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const rawPayload = message.raw as Record<string, unknown> | undefined;
    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = event?.channel as string;
    if (!channel) return;

    const api = new SlackApi(botToken);
    await api.addReaction(channel, message.externalId, SlackAdapter.PROGRESS_EMOJI);
  }

  override async removeTypingIndicator(channelConfig: ChannelConfig, message: NormalizedMessage): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const rawPayload = message.raw as Record<string, unknown> | undefined;
    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = event?.channel as string;
    if (!channel) return;

    const api = new SlackApi(botToken);
    await api.removeReaction(channel, message.externalId, SlackAdapter.PROGRESS_EMOJI);
  }

  override async onChannelRemoved(channelConfig: ChannelConfig): Promise<void> {
    console.log(
      `[SLACK] Channel ${channelConfig.channelConfigId} removed.`,
    );
  }

  override async validateCredentials(
    credentials: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const botToken = credentials.botToken as string;
    if (!botToken) {
      return { valid: false, error: 'botToken is required' };
    }

    try {
      const api = new SlackApi(botToken);
      const result = await api.authTest();
      if (!result.ok) {
        return { valid: false, error: `Invalid bot token: ${result.error}` };
      }
      if (result.user_id) {
        credentials.botUserId = result.user_id;
      }
      if (result.team_id) {
        credentials.teamId = result.team_id;
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Failed to validate Slack credentials' };
    }
  }

  private async handleInstall(c: Context): Promise<Response> {
    const sandboxId = c.req.query('sandboxId');

    if (!sandboxId) {
      return c.json({ error: 'Missing sandboxId' }, 400);
    }

    const [sandbox] = await db
      .select({ accountId: sandboxes.accountId })
      .from(sandboxes)
      .where(eq(sandboxes.sandboxId, sandboxId));

    if (!sandbox) {
      return c.json({ error: 'Sandbox not found' }, 404);
    }

    const clientId = config.SLACK_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: 'Slack OAuth not configured (missing client ID)' }, 500);
    }

    const state = JSON.stringify({ sandboxId, accountId: sandbox.accountId });
    const scopes = 'chat:write,reactions:write,app_mentions:read,im:history,channels:history,groups:history,mpim:history';

    const slackUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackUrl.searchParams.set('client_id', clientId);
    slackUrl.searchParams.set('scope', scopes);
    slackUrl.searchParams.set('state', state);

    const publicUrl = config.CHANNELS_PUBLIC_URL;
    if (publicUrl) {
      slackUrl.searchParams.set('redirect_uri', `${publicUrl}/webhooks/slack/oauth_callback`);
    }

    return c.redirect(slackUrl.toString());
  }

  private async handleOAuthCallback(c: Context): Promise<Response> {
    const frontendUrl = config.FRONTEND_URL;
    const code = c.req.query('code');
    const stateRaw = c.req.query('state');

    if (!code || !stateRaw) {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Missing code or state')}`);
    }

    let sandboxId: string;
    let accountId: string;
    try {
      const parsed = JSON.parse(stateRaw) as { sandboxId?: string; accountId?: string };
      if (!parsed.sandboxId || !parsed.accountId) throw new Error('incomplete state');
      sandboxId = parsed.sandboxId;
      accountId = parsed.accountId;
    } catch {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Invalid state parameter')}`);
    }

    const clientId = config.SLACK_CLIENT_ID;
    const clientSecret = config.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Slack OAuth not configured')}`);
    }

    const publicUrl = config.CHANNELS_PUBLIC_URL;
    const redirectUri = publicUrl ? `${publicUrl}/webhooks/slack/oauth_callback` : undefined;

    const body: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
    };
    if (redirectUri) body.redirect_uri = redirectUri;

    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });

    const data = (await res.json()) as {
      ok: boolean;
      access_token?: string;
      bot_user_id?: string;
      team?: { id: string; name: string };
      error?: string;
    };

    if (!data.ok) {
      console.error(`[SLACK] OAuth exchange failed: ${data.error}`);
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent(data.error || 'OAuth exchange failed')}`);
    }

    console.log(`[SLACK] OAuth success for team ${data.team?.name} (${data.team?.id})`);

    const api = new SlackApi(data.access_token!);
    const authResult = await api.authTest();
    if (!authResult.ok) {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Token verification failed')}`);
    }

    try {
      const teamName = data.team?.name || 'Slack';
      await db
        .insert(channelConfigs)
        .values({
          sandboxId,
          accountId,
          channelType: 'slack',
          name: `${teamName} Slack`,
          enabled: true,
          credentials: {
            botToken: data.access_token,
            botUserId: data.bot_user_id || authResult.user_id,
            teamId: data.team?.id || authResult.team_id,
            teamName,
          },
          sessionStrategy: 'per-user',
          metadata: {},
        });
    } catch (err) {
      console.error('[SLACK] Failed to create channel config:', err);
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Failed to save channel config')}`);
    }

    return c.redirect(`${frontendUrl}/channels?slack=connected`);
  }
}
