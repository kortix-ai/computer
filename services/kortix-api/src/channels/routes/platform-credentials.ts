import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../shared/db';
import { channelPlatformCredentials, sandboxes } from '@kortix/db';
import { config } from '../../config';
import type { AppEnv } from '../../types';
import { resolveAccountId } from '../../shared/resolve-account';
import { encryptCredentials, decryptCredentials } from '../lib/credentials';
import { clearPlatformCredentialsCache } from '../lib/platform-credentials';
import { resolveDirectEndpoint, resolveSandboxTarget } from '../core/opencode-connector';

const VALID_CHANNEL_TYPES = ['slack', 'discord'] as const;
type SupportedChannelType = (typeof VALID_CHANNEL_TYPES)[number];

function isValidChannelType(type: string): type is SupportedChannelType {
  return (VALID_CHANNEL_TYPES as readonly string[]).includes(type);
}

export function createPlatformCredentialsRouter(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // List ALL platform credentials for the account
  app.get('/', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);

    const rows = await db
      .select({
        id: channelPlatformCredentials.id,
        channelType: channelPlatformCredentials.channelType,
        sandboxId: channelPlatformCredentials.sandboxId,
        credentials: channelPlatformCredentials.credentials,
        createdAt: channelPlatformCredentials.createdAt,
        updatedAt: channelPlatformCredentials.updatedAt,
      })
      .from(channelPlatformCredentials)
      .where(eq(channelPlatformCredentials.accountId, accountId));

    // Enrich with sandbox names
    const sandboxIds = rows
      .map((r) => r.sandboxId)
      .filter((id): id is string => id !== null);

    let sandboxMap: Record<string, string> = {};
    if (sandboxIds.length > 0) {
      const sbRows = await db
        .select({ sandboxId: sandboxes.sandboxId, name: sandboxes.name })
        .from(sandboxes)
        .where(eq(sandboxes.accountId, accountId));
      sandboxMap = Object.fromEntries(sbRows.map((s) => [s.sandboxId, s.name]));
    }

    const results = await Promise.all(
      rows.map(async (row) => {
        let configured = false;
        try {
          const decrypted = await decryptCredentials(
            row.credentials as Record<string, unknown>,
          );
          if (row.channelType === 'discord') {
            configured = !!(decrypted.botToken && decrypted.publicKey && decrypted.applicationId);
          } else {
            configured = !!(decrypted.clientId && decrypted.clientSecret && decrypted.signingSecret);
          }
        } catch {
          // leave configured = false
        }

        return {
          id: row.id,
          channelType: row.channelType,
          sandboxId: row.sandboxId,
          sandboxName: row.sandboxId ? sandboxMap[row.sandboxId] || null : null,
          configured,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    );

    return c.json({ success: true, data: results });
  });

  app.get('/:channelType', async (c) => {
    const channelType = c.req.param('channelType');
    if (!isValidChannelType(channelType)) {
      return c.json({ error: `Unsupported channel type: ${channelType}` }, 400);
    }

    const sandboxId = c.req.query('sandbox_id') || null;

    if (channelType === 'slack') {
      const envSet = !!(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET && config.SLACK_SIGNING_SECRET);

      if (config.isCloud() || envSet) {
        return c.json({
          configured: true,
          source: 'env',
          fields: {
            clientId: true,
            clientSecret: true,
            signingSecret: true,
          },
        });
      }
    }

    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);

    const conditions = [
      eq(channelPlatformCredentials.accountId, accountId),
      eq(channelPlatformCredentials.channelType, channelType),
    ];

    if (sandboxId) {
      conditions.push(eq(channelPlatformCredentials.sandboxId, sandboxId));
    } else {
      conditions.push(isNull(channelPlatformCredentials.sandboxId));
    }

    const [row] = await db
      .select()
      .from(channelPlatformCredentials)
      .where(and(...conditions));

    const discordFields = { botToken: false, publicKey: false, applicationId: false };
    const slackFields = { clientId: false, clientSecret: false, signingSecret: false };
    const emptyFields = channelType === 'discord' ? discordFields : slackFields;

    if (!row || !row.credentials) {
      return c.json({
        configured: false,
        source: 'none',
        fields: emptyFields,
      });
    }

    const decrypted = await decryptCredentials(row.credentials as Record<string, unknown>);

    if (channelType === 'discord') {
      return c.json({
        configured: !!(decrypted.botToken && decrypted.publicKey && decrypted.applicationId),
        source: 'db',
        fields: {
          botToken: !!decrypted.botToken,
          publicKey: !!decrypted.publicKey,
          applicationId: !!decrypted.applicationId,
        },
      });
    }

    return c.json({
      configured: !!(decrypted.clientId && decrypted.clientSecret && decrypted.signingSecret),
      source: 'db',
      fields: {
        clientId: !!decrypted.clientId,
        clientSecret: !!decrypted.clientSecret,
        signingSecret: !!decrypted.signingSecret,
      },
    });
  });

  app.put('/:channelType', async (c) => {
    const channelType = c.req.param('channelType');
    if (!isValidChannelType(channelType)) {
      return c.json({ error: `Unsupported channel type: ${channelType}` }, 400);
    }

    if (config.isCloud()) {
      return c.json({ error: 'Platform credentials are managed via environment variables in cloud mode' }, 403);
    }

    const body = await c.req.json() as Record<string, unknown>;

    if (channelType === 'slack') {
      const { clientId, clientSecret, signingSecret, sandbox_id } = body as {
        clientId?: string;
        clientSecret?: string;
        signingSecret?: string;
        sandbox_id?: string | null;
      };

      if (!clientId || !clientSecret || !signingSecret) {
        return c.json({ error: 'clientId, clientSecret, and signingSecret are all required' }, 400);
      }

      const userId = c.get('userId') as string;
      const accountId = await resolveAccountId(userId);
      const sandboxId = sandbox_id || null;
      const encrypted = await encryptCredentials({ clientId, clientSecret, signingSecret });

      const existingConditions = [
        eq(channelPlatformCredentials.accountId, accountId),
        eq(channelPlatformCredentials.channelType, channelType),
      ];

      if (sandboxId) {
        existingConditions.push(eq(channelPlatformCredentials.sandboxId, sandboxId));
      } else {
        existingConditions.push(isNull(channelPlatformCredentials.sandboxId));
      }

      const [existing] = await db
        .select({ id: channelPlatformCredentials.id })
        .from(channelPlatformCredentials)
        .where(and(...existingConditions));

      if (existing) {
        await db
          .update(channelPlatformCredentials)
          .set({ credentials: encrypted, updatedAt: new Date() })
          .where(eq(channelPlatformCredentials.id, existing.id));
      } else {
        await db
          .insert(channelPlatformCredentials)
          .values({
            accountId,
            sandboxId,
            channelType,
            credentials: encrypted,
          });
      }

      clearPlatformCredentialsCache();

      return c.json({
        success: true,
        configured: true,
        source: 'db',
      });
    }

    if (channelType === 'discord') {
      const { botToken, publicKey, applicationId, sandbox_id } = body as {
        botToken?: string;
        publicKey?: string;
        applicationId?: string;
        sandbox_id?: string | null;
      };

      if (!botToken || !publicKey || !applicationId) {
        return c.json({ error: 'botToken, publicKey, and applicationId are all required' }, 400);
      }

      const userId = c.get('userId') as string;
      const accountId = await resolveAccountId(userId);
      const sandboxId = sandbox_id || null;
      const encrypted = await encryptCredentials({ botToken, publicKey, applicationId });

      const existingConditions = [
        eq(channelPlatformCredentials.accountId, accountId),
        eq(channelPlatformCredentials.channelType, channelType),
      ];

      if (sandboxId) {
        existingConditions.push(eq(channelPlatformCredentials.sandboxId, sandboxId));
      } else {
        existingConditions.push(isNull(channelPlatformCredentials.sandboxId));
      }

      const [existing] = await db
        .select({ id: channelPlatformCredentials.id })
        .from(channelPlatformCredentials)
        .where(and(...existingConditions));

      if (existing) {
        await db
          .update(channelPlatformCredentials)
          .set({ credentials: encrypted, updatedAt: new Date() })
          .where(eq(channelPlatformCredentials.id, existing.id));
      } else {
        await db
          .insert(channelPlatformCredentials)
          .values({
            accountId,
            sandboxId,
            channelType,
            credentials: encrypted,
          });
      }

      clearPlatformCredentialsCache();

      // Push credentials to sandbox so opencode-channels can connect to Discord gateway
      if (sandboxId) {
        try {
          const target = await resolveSandboxTarget(sandboxId);
          if (target) {
            const { url, headers } = await resolveDirectEndpoint(target);
            console.log(`[DISCORD] Pushing credentials to sandbox at ${url}`);

            await fetch(`${url}/env`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keys: {
                  DISCORD_BOT_TOKEN: botToken,
                  DISCORD_PUBLIC_KEY: publicKey,
                  DISCORD_APPLICATION_ID: applicationId,
                },
              }),
            });

            try {
              const reloadRes = await fetch(`${url}/channels/reload`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  credentials: {
                    discord: { botToken, publicKey, applicationId },
                  },
                }),
              });
              const reloadText = await reloadRes.text();
              if (reloadRes.ok) {
                try {
                  const reloadResult = JSON.parse(reloadText);
                  console.log(`[DISCORD] Hot-reload result:`, reloadResult);
                } catch {
                  console.log(`[DISCORD] Hot-reload responded (${reloadRes.status}):`, reloadText.slice(0, 200));
                }
              } else {
                console.warn(`[DISCORD] Hot-reload returned ${reloadRes.status}:`, reloadText.slice(0, 200));
              }
            } catch (reloadErr) {
              console.warn('[DISCORD] Hot-reload failed (service may not be running yet):', reloadErr);
            }
          } else {
            console.warn('[DISCORD] No sandbox target found for', sandboxId);
          }
        } catch (err) {
          console.warn('[DISCORD] Failed to push credentials to sandbox:', err);
        }
      }

      return c.json({
        success: true,
        configured: true,
        source: 'db',
      });
    }

    return c.json({ error: 'Not implemented' }, 501);
  });

  // Delete platform credentials
  app.delete('/:channelType', async (c) => {
    const channelType = c.req.param('channelType');
    if (!isValidChannelType(channelType)) {
      return c.json({ error: `Unsupported channel type: ${channelType}` }, 400);
    }

    if (config.isCloud()) {
      return c.json({ error: 'Platform credentials are managed via environment variables in cloud mode' }, 403);
    }

    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const sandboxId = c.req.query('sandbox_id') || null;

    const conditions = [
      eq(channelPlatformCredentials.accountId, accountId),
      eq(channelPlatformCredentials.channelType, channelType),
    ];

    if (sandboxId) {
      conditions.push(eq(channelPlatformCredentials.sandboxId, sandboxId));
    } else {
      conditions.push(isNull(channelPlatformCredentials.sandboxId));
    }

    const deleted = await db
      .delete(channelPlatformCredentials)
      .where(and(...conditions))
      .returning({ id: channelPlatformCredentials.id });

    clearPlatformCredentialsCache();

    if (deleted.length === 0) {
      return c.json({ error: 'Platform credentials not found' }, 404);
    }

    return c.json({ success: true, message: 'Platform credentials deleted' });
  });

  return app;
}
