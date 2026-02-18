import type { Context } from 'hono';
import type { Hono } from 'hono';
import type { ChannelEngine } from '../adapter';
import { BaseAdapter } from '../adapter';
import type { PermissionRequest, FileOutput } from '../adapter';
import type { ChannelCapabilities, NormalizedMessage, AgentResponse } from '../../types';
import type { ChannelConfig } from '@kortix/db';
import { SlackApi } from './api';
import { handleSlackWebhook } from './webhook';
import { handleSlackCommand, postToResponseUrl } from './commands';
import { handleSlackInteractivity } from './interactivity';
import { splitMessage } from '../../lib/message-splitter';
import { markdownToSlack } from '../../lib/markdown-to-slack';
import { buildBlockKitMessage, type UsageMetadata } from './block-kit-builder';
import { config } from '../../../config';
import { db } from '../../../shared/db';
import { channelConfigs, sandboxes } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { encryptCredentials } from '../../lib/credentials';

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
    router.post('/slack/commands', (c) => handleSlackCommand(c, engine));
    router.post('/slack/interactivity', (c) => handleSlackInteractivity(c, engine));
    router.get('/slack/install', (c) => this.handleInstall(c));
    router.get('/slack/oauth_callback', (c) => this.handleOAuthCallback(c));
  }

  async sendResponse(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
    response: AgentResponse,
  ): Promise<void> {
    const rawPayload = message.raw as Record<string, unknown> | undefined;
    if (rawPayload?._slackCommand && rawPayload?.responseUrl) {
      const sessionUrl = `${config.FRONTEND_URL}/sessions/${response.sessionId}`;
      const slackText = markdownToSlack(response.content) + `\n\n<${sessionUrl}|View full session>`;
      await postToResponseUrl(rawPayload.responseUrl as string, slackText);
      return;
    }

    const botToken = this.getBotToken(channelConfig);
    if (!botToken) {
      console.error('[SLACK] No bot token in credentials');
      return;
    }

    const api = new SlackApi(botToken);

    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = event?.channel as string;

    if (!channel) {
      console.error('[SLACK] Cannot determine channel from message');
      return;
    }

    const threadTs = message.threadId || message.externalId;

    const sessionUrl = `${config.FRONTEND_URL}/sessions/${response.sessionId}`;
    const usageMeta: UsageMetadata = {
      modelName: response.modelName,
      durationMs: response.durationMs,
    };
    const blocks = buildBlockKitMessage(response.content, sessionUrl, usageMeta);
    const fallbackText = markdownToSlack(response.content) + `\n\n<${sessionUrl}|View full session>`;

    const chunks = splitMessage(fallbackText, this.capabilities.textChunkLimit);

    const meta = channelConfig.metadata as Record<string, unknown> | null;
    const customIdentity = meta?.customIdentity as { username?: string; iconUrl?: string } | undefined;

    const firstResult = await api.postMessage({
      channel,
      text: chunks[0] || fallbackText,
      thread_ts: threadTs,
      blocks,
      ...(customIdentity?.username && { username: customIdentity.username }),
      ...(customIdentity?.iconUrl && { icon_url: customIdentity.iconUrl }),
    });

    if (!firstResult.ok) {
      console.error(`[SLACK] postMessage failed: ${firstResult.error}`);
    }

    for (let i = 1; i < chunks.length; i++) {
      const result = await api.postMessage({
        channel,
        text: chunks[i],
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

  override async sendPermissionRequest(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
    permission: PermissionRequest,
  ): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const rawPayload = message.raw as Record<string, unknown> | undefined;
    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = event?.channel as string;
    if (!channel) return;

    const api = new SlackApi(botToken);
    const threadTs = message.threadId || message.externalId;

    await api.postMessage({
      channel,
      text: `Permission requested: ${permission.tool}`,
      thread_ts: threadTs,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:lock: *Permission Request*\n*Tool:* \`${permission.tool}\`\n${permission.description || ''}`,
          },
        },
        {
          type: 'actions',
          block_id: `perm_${permission.id}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve', emoji: true },
              style: 'primary',
              action_id: 'permission_approve',
              value: permission.id,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Reject', emoji: true },
              style: 'danger',
              action_id: 'permission_reject',
              value: permission.id,
            },
          ],
        },
      ],
    });
  }

  async sendUnlinkedMessage(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
  ): Promise<void> {
    // For slash commands, respond via response_url
    const rawPayload = message.raw as Record<string, unknown> | undefined;
    if (rawPayload?._slackCommand && rawPayload?.responseUrl) {
      const { postToResponseUrl } = await import('./commands');
      const frontendUrl = config.FRONTEND_URL;
      await postToResponseUrl(
        rawPayload.responseUrl as string,
        `:warning: This Slack channel isn't linked to an instance yet. <${frontendUrl}/channels|Link one in the dashboard> to start chatting.`,
        true,
      );
      return;
    }

    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = event?.channel as string;
    if (!channel) return;

    const api = new SlackApi(botToken);
    const threadTs = message.threadId || message.externalId;
    const frontendUrl = config.FRONTEND_URL;

    await api.postMessage({
      channel,
      text: "This channel isn't linked to an instance yet. Link one to start chatting.",
      thread_ts: threadTs,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ":warning: *No instance linked*\nThis Slack channel isn't connected to a Kortix instance yet. Link one to start chatting.",
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Link Instance', emoji: true },
              style: 'primary',
              action_id: 'link_instance',
              url: `${frontendUrl}/channels`,
            },
          ],
        },
      ],
    });
  }

  override async sendFiles(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
    files: FileOutput[],
  ): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) {
      console.warn('[SLACK] sendFiles: no bot token, skipping');
      return;
    }

    const rawPayload = message.raw as Record<string, unknown> | undefined;
    const event = rawPayload?.event as Record<string, unknown> | undefined;
    const channel = (event?.channel as string) || (rawPayload?.channelId as string);
    if (!channel) {
      console.warn('[SLACK] sendFiles: no channel in event payload, skipping');
      return;
    }

    const api = new SlackApi(botToken);
    // For slash commands, externalId is synthetic (cmd-*) and not a valid Slack ts
    const isSlashCommand = rawPayload?._slackCommand === true;
    const threadTs = message.threadId || (isSlashCommand ? undefined : message.externalId);

    console.log(`[SLACK] sendFiles: ${files.length} file(s) to channel=${channel} thread=${threadTs}`);

    for (const file of files) {
      try {
        let fileBuffer: Buffer;
        if (file.content) {
          fileBuffer = file.content;
        } else {
          console.log(`[SLACK] Downloading file from URL: ${file.url.slice(0, 120)}`);
          const fileRes = await fetch(file.url);
          if (!fileRes.ok) {
            console.error(`[SLACK] Failed to download file ${file.name}: ${fileRes.status}`);
            continue;
          }
          fileBuffer = Buffer.from(await fileRes.arrayBuffer());
        }

        console.log(`[SLACK] Uploading file to Slack: ${file.name} (${fileBuffer.length} bytes)`);
        const result = await api.filesUploadV2({
          channel,
          threadTs,
          filename: file.name,
          content: fileBuffer,
          title: file.name,
        });

        if (!result.ok) {
          console.error(`[SLACK] filesUploadV2 failed for ${file.name}: ${result.error}`);
        } else {
          console.log(`[SLACK] File uploaded to Slack: ${file.name}`);
        }
      } catch (err) {
        console.error(`[SLACK] Failed to upload file ${file.name}:`, err);
      }
    }
  }

  private async handleInstall(c: Context): Promise<Response> {
    const sandboxId = c.req.query('sandboxId');
    const accountId = c.req.query('accountId');

    let resolvedAccountId: string | undefined;

    if (sandboxId) {
      const [sandbox] = await db
        .select({ accountId: sandboxes.accountId })
        .from(sandboxes)
        .where(eq(sandboxes.sandboxId, sandboxId));

      if (!sandbox) {
        return c.json({ error: 'Sandbox not found' }, 404);
      }
      resolvedAccountId = sandbox.accountId;
    } else if (accountId) {
      resolvedAccountId = accountId;
    } else {
      return c.json({ error: 'Missing sandboxId or accountId' }, 400);
    }

    const clientId = config.SLACK_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: 'Slack OAuth not configured (missing client ID)' }, 500);
    }

    const state = JSON.stringify({
      sandboxId: sandboxId || null,
      accountId: resolvedAccountId,
    });
    const scopes = 'chat:write,chat:write.customize,reactions:read,reactions:write,app_mentions:read,im:history,im:write,channels:history,channels:read,channels:join,channels:manage,groups:history,mpim:history,commands,files:read,files:write,links:read,links:write,users:read,users:read.email,users.profile:read,search:read.public,search:read.files,search:read.users,pins:read,pins:write,usergroups:read,bookmarks:read,bookmarks:write,dnd:read,team:read,emoji:read';

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

    let sandboxId: string | null;
    let accountId: string;
    try {
      const parsed = JSON.parse(stateRaw) as { sandboxId?: string | null; accountId?: string };
      if (!parsed.accountId) throw new Error('incomplete state');
      sandboxId = parsed.sandboxId || null;
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
      const rawCreds = {
        botToken: data.access_token,
        botUserId: data.bot_user_id || authResult.user_id,
        teamId: data.team?.id || authResult.team_id,
        teamName,
      };
      const encryptedCreds = await encryptCredentials(rawCreds);

      await db
        .insert(channelConfigs)
        .values({
          sandboxId,
          accountId,
          channelType: 'slack',
          name: `${teamName} Slack`,
          enabled: true,
          credentials: encryptedCreds,
          sessionStrategy: 'per-user',
          metadata: {},
        });
    } catch (err) {
      console.error('[SLACK] Failed to create channel config:', err);
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Failed to save channel config')}`);
    }

    const redirectParams = sandboxId
      ? 'slack=connected'
      : 'slack=connected&needsLink=true';
    return c.redirect(`${frontendUrl}/channels?${redirectParams}`);
  }
}
