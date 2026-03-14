import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../shared/db';
import { channelConfigs, channelMessages, channelSessions, sandboxes } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';
import type { AppEnv } from '../../types';
import type { ChannelAdapter } from '../adapters/adapter';
import type { ChannelType } from '../types';
import { resolveAccountId } from '../../shared/resolve-account';

const CHANNEL_TYPES = [
  'telegram',
  'slack',
  'discord',
  'whatsapp',
  'teams',
  'voice',
  'email',
  'sms',
] as const;

const SESSION_STRATEGIES = ['single', 'per-thread', 'per-user', 'per-message'] as const;

const createChannelSchema = z.object({
  sandbox_id: z.string().uuid().nullable().optional(),
  channel_type: z.enum(CHANNEL_TYPES),
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  platform_config: z.record(z.unknown()).default({}),
  session_strategy: z.enum(SESSION_STRATEGIES).default('per-user'),
  system_prompt: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateChannelSchema = z.object({
  sandbox_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  platform_config: z.record(z.unknown()).optional(),
  session_strategy: z.enum(SESSION_STRATEGIES).optional(),
  system_prompt: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export function createChannelsRouter(adapters: Map<ChannelType, ChannelAdapter>): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post('/', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const body = await c.req.json();
    const parsed = createChannelSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    if (parsed.data.sandbox_id) {
      const [sandbox] = await db
        .select()
        .from(sandboxes)
        .where(
          and(
            eq(sandboxes.sandboxId, parsed.data.sandbox_id),
            eq(sandboxes.accountId, accountId),
          ),
        );

      if (!sandbox) {
        throw new NotFoundError('Sandbox', parsed.data.sandbox_id);
      }

      // Enforce one channel per (sandbox, channelType)
      const [existing] = await db
        .select({ channelConfigId: channelConfigs.channelConfigId })
        .from(channelConfigs)
        .where(
          and(
            eq(channelConfigs.sandboxId, parsed.data.sandbox_id),
            eq(channelConfigs.channelType, parsed.data.channel_type),
          ),
        );

      if (existing) {
        return c.json(
          { error: `A ${parsed.data.channel_type} channel already exists for this sandbox` },
          409,
        );
      }
    }

    const [config] = await db
      .insert(channelConfigs)
      .values({
        sandboxId: parsed.data.sandbox_id ?? null,
        accountId: accountId,
        channelType: parsed.data.channel_type,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        platformConfig: parsed.data.platform_config,
        sessionStrategy: parsed.data.session_strategy,
        systemPrompt: parsed.data.system_prompt ?? null,
        agentName: parsed.data.agent_name ?? null,
        metadata: parsed.data.metadata ?? {},
      })
      .returning();

    const adapter = adapters.get(parsed.data.channel_type);
    if (adapter?.onChannelCreated) {
      try {
        await adapter.onChannelCreated(config);
      } catch (err) {
        console.error(`[CHANNELS] onChannelCreated failed for ${parsed.data.channel_type}:`, err);
      }
    }

    return c.json({ success: true, data: config }, 201);
  });

  /**
   * GET /sessions/:sessionId
   * Reverse lookup: given an OpenCode session ID, return its channel context.
   * MUST be registered before GET /:id so Hono doesn't treat "sessions" as a channel config ID.
   */
  app.get('/sessions/:sessionId', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const sessionId = c.req.param('sessionId');

    // Find the channelSession record
    const [record] = await db
      .select()
      .from(channelSessions)
      .where(eq(channelSessions.sessionId, sessionId));

    if (!record) {
      return c.json({ success: true, data: null });
    }

    // Verify the channel config belongs to this account
    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, record.channelConfigId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!config) {
      // Session exists but belongs to another account — return null (not 403)
      return c.json({ success: true, data: null });
    }

    return c.json({
      success: true,
      data: {
        channelSessionId: record.channelSessionId,
        channelConfigId: record.channelConfigId,
        sessionId: record.sessionId,
        strategyKey: record.strategyKey,
        lastUsedAt: record.lastUsedAt,
        metadata: record.metadata,
        createdAt: record.createdAt,
        // Channel context
        channelType: config.channelType,
        channelName: config.name,
        platform: config.channelType,
        sandboxId: config.sandboxId,
      },
    });
  });

  app.get('/', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const sandboxId = c.req.query('sandbox_id');
    const channelType = c.req.query('channel_type');
    const enabled = c.req.query('enabled');

    const conditions = [eq(channelConfigs.accountId, accountId)];

    if (sandboxId) {
      conditions.push(eq(channelConfigs.sandboxId, sandboxId));
    }
    if (channelType) {
      conditions.push(eq(channelConfigs.channelType, channelType as typeof CHANNEL_TYPES[number]));
    }
    if (enabled === 'true') {
      conditions.push(eq(channelConfigs.enabled, true));
    } else if (enabled === 'false') {
      conditions.push(eq(channelConfigs.enabled, false));
    }

    const results = await db
      .select()
      .from(channelConfigs)
      .where(and(...conditions))
      .orderBy(desc(channelConfigs.createdAt));

    return c.json({ success: true, data: results, total: results.length });
  });

  app.get('/:id', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');

    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!config) {
      throw new NotFoundError('Channel config', configId);
    }

    let sandbox: { name: string; status: string } | null = null;
    if (config.sandboxId) {
      const [sb] = await db
        .select({ name: sandboxes.name, status: sandboxes.status })
        .from(sandboxes)
        .where(eq(sandboxes.sandboxId, config.sandboxId));
      sandbox = sb ?? null;
    }

    return c.json({ success: true, data: { ...config, sandbox } });
  });

  app.patch('/:id', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateChannelSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const [current] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!current) {
      throw new NotFoundError('Channel config', configId);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.sandbox_id !== undefined) {
      if (parsed.data.sandbox_id) {
        const [sandbox] = await db
          .select()
          .from(sandboxes)
          .where(
            and(
              eq(sandboxes.sandboxId, parsed.data.sandbox_id),
              eq(sandboxes.accountId, accountId),
            ),
          );
        if (!sandbox) {
          throw new NotFoundError('Sandbox', parsed.data.sandbox_id);
        }
      }
      updateData.sandboxId = parsed.data.sandbox_id;
    }
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;
    if (parsed.data.platform_config !== undefined) updateData.platformConfig = parsed.data.platform_config;
    if (parsed.data.session_strategy !== undefined) updateData.sessionStrategy = parsed.data.session_strategy;
    if (parsed.data.system_prompt !== undefined) updateData.systemPrompt = parsed.data.system_prompt;
    if (parsed.data.agent_name !== undefined) updateData.agentName = parsed.data.agent_name;
    if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata;

    const [updated] = await db
      .update(channelConfigs)
      .set(updateData)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      )
      .returning();

    return c.json({ success: true, data: updated });
  });

  app.post('/:id/link', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');
    const body = await c.req.json();

    const sandboxId = z.string().uuid().parse(body.sandbox_id);

    const [sandbox] = await db
      .select()
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.sandboxId, sandboxId),
          eq(sandboxes.accountId, accountId),
        ),
      );

    if (!sandbox) {
      throw new NotFoundError('Sandbox', sandboxId);
    }

    // Get the current channel config to know its type
    const [current] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!current) {
      throw new NotFoundError('Channel config', configId);
    }

    // Enforce one channel per (sandbox, channelType)
    const [existing] = await db
      .select({ channelConfigId: channelConfigs.channelConfigId })
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.sandboxId, sandboxId),
          eq(channelConfigs.channelType, current.channelType),
        ),
      );

    if (existing && existing.channelConfigId !== configId) {
      return c.json(
        { error: `A ${current.channelType} channel is already linked to this sandbox` },
        409,
      );
    }

    const [updated] = await db
      .update(channelConfigs)
      .set({ sandboxId, updatedAt: new Date() })
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('Channel config', configId);
    }

    return c.json({ success: true, data: updated });
  });

  app.post('/:id/unlink', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');

    const [updated] = await db
      .update(channelConfigs)
      .set({ sandboxId: null, updatedAt: new Date() })
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('Channel config', configId);
    }

    return c.json({ success: true, data: updated });
  });

  app.delete('/:id', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');

    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!config) {
      throw new NotFoundError('Channel config', configId);
    }

    const adapter = adapters.get(config.channelType as typeof CHANNEL_TYPES[number]);
    if (adapter?.onChannelRemoved) {
      try {
        await adapter.onChannelRemoved(config);
      } catch (err) {
        console.error(`[CHANNELS] onChannelRemoved failed:`, err);
      }
    }

    await db
      .delete(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    return c.json({ success: true, message: 'Channel config deleted' });
  });

  app.post('/:id/enable', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');

    const [updated] = await db
      .update(channelConfigs)
      .set({ enabled: true, updatedAt: new Date() })
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('Channel config', configId);
    }

    return c.json({ success: true, data: updated });
  });

  app.post('/:id/disable', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');

    const [updated] = await db
      .update(channelConfigs)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError('Channel config', configId);
    }

    return c.json({ success: true, data: updated });
  });

  app.get('/:id/messages', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!config) {
      throw new NotFoundError('Channel config', configId);
    }

    const messages = await db
      .select()
      .from(channelMessages)
      .where(eq(channelMessages.channelConfigId, configId))
      .orderBy(desc(channelMessages.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ success: true, data: messages, total: messages.length });
  });

  // ── Channel Sessions ────────────────────────────────────────────────────────
  // NOTE: POST /:id/sessions is in channels-internal.ts (sandbox auth via KORTIX_TOKEN)

  /**
   * GET /:id/sessions
   * List all OpenCode sessions triggered via this channel, most recent first.
   * User-authenticated.
   */
  app.get('/:id/sessions', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const configId = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, configId),
          eq(channelConfigs.accountId, accountId),
        ),
      );

    if (!config) {
      throw new NotFoundError('Channel config', configId);
    }

    const sessions = await db
      .select()
      .from(channelSessions)
      .where(eq(channelSessions.channelConfigId, configId))
      .orderBy(desc(channelSessions.lastUsedAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: sessions.map(s => ({
        ...s,
        channelType: config.channelType,
        channelName: config.name,
        platform: config.channelType,
      })),
      total: sessions.length,
    });
  });

  return app;
}
