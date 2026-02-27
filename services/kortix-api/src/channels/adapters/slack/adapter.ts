import type { Context } from 'hono';
import type { Hono } from 'hono';
import type { ChannelEngine } from '../adapter';
import { BaseAdapter } from '../adapter';
import type { ChannelCapabilities, NormalizedMessage, AgentResponse } from '../../types';
import type { ChannelConfig } from '@kortix/db';
import { proxySlackWebhook } from './proxy';
import { config } from '../../../config';
import { db } from '../../../shared/db';
import { channelConfigs, sandboxes } from '@kortix/db';
import { eq, and } from 'drizzle-orm';
import { encryptCredentials } from '../../lib/credentials';
import { getSlackPlatformCredentials } from '../../lib/platform-credentials';
import { resolveDirectEndpoint, resolveSandboxTarget } from '../../core/opencode-connector';

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

  registerRoutes(router: Hono, _engine: ChannelEngine): void {
    router.post('/slack/events', (c) => proxySlackWebhook(c));
    router.post('/slack/commands', (c) => proxySlackWebhook(c));
    router.post('/slack/interactivity', (c) => proxySlackWebhook(c));
    router.get('/slack/install', (c) => this.handleInstall(c));
    router.get('/slack/oauth_callback', (c) => this.handleOAuthCallback(c));
  }

  async sendResponse(
    _channelConfig: ChannelConfig,
    _message: NormalizedMessage,
    _response: AgentResponse,
  ): Promise<void> {}

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
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
      });
      const result = await res.json() as { ok: boolean; error?: string; user_id?: string; team_id?: string };
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

    const platformCreds = await getSlackPlatformCredentials(resolvedAccountId, sandboxId);
    if (!platformCreds?.clientId) {
      return c.json({ error: 'Slack OAuth not configured (missing client ID)' }, 500);
    }

    // Resolve public URL: query param from wizard > env config
    const publicUrl = c.req.query('publicUrl') || config.CHANNELS_PUBLIC_URL;

    const state = JSON.stringify({
      sandboxId: sandboxId || null,
      accountId: resolvedAccountId,
      publicUrl: publicUrl || null,
    });
    const scopes = 'assistant:write,chat:write,chat:write.customize,chat:write.public,reactions:read,reactions:write,app_mentions:read,im:history,im:read,im:write,channels:history,channels:read,channels:join,channels:manage,groups:history,groups:read,mpim:history,mpim:read,commands,files:read,files:write,links:read,links:write,users:read,users:read.email,users.profile:read,search:read.public,search:read.files,search:read.users,pins:read,pins:write,usergroups:read,bookmarks:read,bookmarks:write,dnd:read,team:read,emoji:read';

    const slackUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackUrl.searchParams.set('client_id', platformCreds.clientId);
    slackUrl.searchParams.set('scope', scopes);
    slackUrl.searchParams.set('state', state);

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
    let statePublicUrl: string | null = null;
    try {
      const parsed = JSON.parse(stateRaw) as { sandboxId?: string | null; accountId?: string; publicUrl?: string | null };
      if (!parsed.accountId) throw new Error('incomplete state');
      sandboxId = parsed.sandboxId || null;
      accountId = parsed.accountId;
      statePublicUrl = parsed.publicUrl || null;
    } catch {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Invalid state parameter')}`);
    }

    const platformCreds = await getSlackPlatformCredentials(accountId, sandboxId);
    if (!platformCreds?.clientId || !platformCreds?.clientSecret) {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Slack OAuth not configured')}`);
    }

    // Use same public URL from the install step (stored in state) for consistency
    const publicUrl = statePublicUrl || config.CHANNELS_PUBLIC_URL;
    const redirectUri = publicUrl ? `${publicUrl}/webhooks/slack/oauth_callback` : undefined;

    const body: Record<string, string> = {
      client_id: platformCreds.clientId,
      client_secret: platformCreds.clientSecret,
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
    const authRes = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const authResult = await authRes.json() as { ok: boolean; user_id?: string; team_id?: string; error?: string };
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

      if (sandboxId) {
        const [existing] = await db
          .select({ channelConfigId: channelConfigs.channelConfigId })
          .from(channelConfigs)
          .where(
            and(
              eq(channelConfigs.sandboxId, sandboxId),
              eq(channelConfigs.channelType, 'slack'),
            ),
          );

        if (existing) {
          await db
            .update(channelConfigs)
            .set({
              credentials: encryptedCreds,
              name: `${teamName} Slack`,
              enabled: true,
              updatedAt: new Date(),
            })
            .where(eq(channelConfigs.channelConfigId, existing.channelConfigId));
        } else {
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
        }
      } else {
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
      }

      if (sandboxId) {
        try {
          const target = await resolveSandboxTarget(sandboxId);
          if (target) {
            const { url, headers } = await resolveDirectEndpoint(target);
            console.log(`[SLACK] Pushing credentials to sandbox at ${url}`);
            const envRes = await fetch(`${url}/env`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keys: {
                  SLACK_BOT_TOKEN: data.access_token,
                  SLACK_SIGNING_SECRET: platformCreds.signingSecret,
                },
              }),
            });
            const envResult = await envRes.json() as Record<string, unknown>;
            console.log(`[SLACK] Env push result:`, envResult);

            try {
              const reloadRes = await fetch(`${url}/channels/reload`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  credentials: {
                    slack: {
                      botToken: data.access_token,
                      signingSecret: platformCreds.signingSecret,
                    },
                  },
                }),
              });
              const reloadText = await reloadRes.text();
              if (reloadRes.ok) {
                try {
                  const reloadResult = JSON.parse(reloadText);
                  console.log(`[SLACK] Hot-reload result:`, reloadResult);
                } catch {
                  console.log(`[SLACK] Hot-reload responded (${reloadRes.status}):`, reloadText.slice(0, 200));
                }
              } else {
                console.warn(`[SLACK] Hot-reload returned ${reloadRes.status}:`, reloadText.slice(0, 200));
              }
            } catch (reloadErr) {
              console.warn('[SLACK] Hot-reload failed (service may not be running yet):', reloadErr);
            }
          } else {
            console.warn('[SLACK] No sandbox target found for', sandboxId);
          }
        } catch (err) {
          console.warn('[SLACK] Failed to push credentials to sandbox:', err);
        }
      }
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
