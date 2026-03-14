import type { Context } from 'hono';
import type { Hono } from 'hono';
import { BaseAdapter } from '../adapter';
import type { ChannelCapabilities } from '../../types';
import type { ChannelConfig } from '@kortix/db';
import { proxySlackWebhook } from './proxy';
import { config } from '../../../config';
import { db } from '../../../shared/db';
import { sandboxes, channelConfigs } from '@kortix/db';
import { eq, and } from 'drizzle-orm';
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

  registerRoutes(router: Hono): void {
    router.post('/slack/events', (c) => proxySlackWebhook(c));
    router.post('/slack/commands', (c) => proxySlackWebhook(c));
    router.post('/slack/interactivity', (c) => proxySlackWebhook(c));
    router.get('/slack/install', (c) => this.handleInstall(c));
    router.get('/slack/oauth_callback', (c) => this.handleOAuthCallback(c));
  }

  override async onChannelRemoved(channelConfig: ChannelConfig): Promise<void> {
    console.log(`[SLACK] Channel ${channelConfig.channelConfigId} removed.`);
  }

  /**
   * Start Slack OAuth flow.
   * Reads SLACK_CLIENT_ID from the SANDBOX (not DB, not kortix-api env).
   */
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

    // Read Slack app creds from sandbox (or kortix-api env as fallback)
    const platformCreds = await getSlackPlatformCredentials(resolvedAccountId, sandboxId);
    if (!platformCreds?.clientId) {
      return c.json({
        error: 'Slack app credentials not found. Push SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET to the sandbox first.',
      }, 400);
    }

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

  /**
   * Slack OAuth callback.
   * Reads SLACK_CLIENT_ID + SLACK_CLIENT_SECRET from the SANDBOX,
   * exchanges code → bot_token, pushes bot_token to sandbox, creates channelConfig.
   */
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

    // Read Slack app creds from sandbox
    const platformCreds = await getSlackPlatformCredentials(accountId, sandboxId);
    if (!platformCreds?.clientId || !platformCreds?.clientSecret) {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Slack credentials not found in sandbox')}`);
    }

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

    // Verify the token
    const authRes = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' },
    });
    const authResult = await authRes.json() as { ok: boolean; error?: string };
    if (!authResult.ok) {
      return c.redirect(`${frontendUrl}/channels?slack=error&message=${encodeURIComponent('Token verification failed')}`);
    }

    // Push bot token to sandbox
    if (sandboxId) {
      try {
        const target = await resolveSandboxTarget(sandboxId);
        if (target) {
          const { url, headers } = await resolveDirectEndpoint(target);
          console.log(`[SLACK] Pushing bot token to sandbox at ${url}`);

          // Push SLACK_BOT_TOKEN (the OAuth-issued token) and SLACK_SIGNING_SECRET to sandbox
          await fetch(`${url}/env`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keys: {
                SLACK_BOT_TOKEN: data.access_token,
                SLACK_SIGNING_SECRET: platformCreds.signingSecret,
              },
            }),
          });

          // Hot-reload opencode-channels
          try {
            await fetch(`${url}/channels/reload`, {
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
            console.log(`[SLACK] Hot-reload complete`);
          } catch (err) {
            console.warn('[SLACK] Hot-reload failed (non-fatal):', err);
          }
        }
      } catch (err) {
        console.warn('[SLACK] Failed to push credentials to sandbox:', err);
      }
    }

    // Create channelConfig DB record so it shows in the channels list
    try {
      const conditions = [
        eq(channelConfigs.accountId, accountId),
        eq(channelConfigs.channelType, 'slack'),
      ];
      if (sandboxId) conditions.push(eq(channelConfigs.sandboxId, sandboxId));

      const [existing] = await db
        .select({ channelConfigId: channelConfigs.channelConfigId })
        .from(channelConfigs)
        .where(and(...conditions));

      if (!existing) {
        const channelName = data.team?.name ? `Slack — ${data.team.name}` : 'Slack Bot';
        await db.insert(channelConfigs).values({
          accountId,
          sandboxId: sandboxId ?? null,
          channelType: 'slack',
          name: channelName,
          enabled: true,
          platformConfig: {
            team_id: data.team?.id ?? null,
            team_name: data.team?.name ?? null,
            bot_user_id: data.bot_user_id ?? null,
          },
          sessionStrategy: 'per-thread',
          metadata: {},
        });
        console.log(`[SLACK] Created channel config for team ${data.team?.name}`);
      }
    } catch (dbErr) {
      console.error('[SLACK] Failed to create channel config (non-fatal):', dbErr);
    }

    const redirectParams = sandboxId ? 'slack=connected' : 'slack=connected&needsLink=true';
    return c.redirect(`${frontendUrl}/channels?${redirectParams}`);
  }
}
