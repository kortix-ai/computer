import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../shared/db';
import { channelConfigs, channelMessages, sandboxes, accountUser } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';
import type { AppEnv } from '../../types';
import type { ChannelEngineImpl } from '../core/engine';

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
  sandbox_id: z.string().uuid(),
  channel_type: z.enum(CHANNEL_TYPES),
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  credentials: z.record(z.unknown()).default({}),
  platform_config: z.record(z.unknown()).default({}),
  session_strategy: z.enum(SESSION_STRATEGIES).default('per-user'),
  system_prompt: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  credentials: z.record(z.unknown()).optional(),
  platform_config: z.record(z.unknown()).optional(),
  session_strategy: z.enum(SESSION_STRATEGIES).optional(),
  system_prompt: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

async function resolveAccountId(userId: string): Promise<string> {
  const [membership] = await db
    .select({ accountId: accountUser.accountId })
    .from(accountUser)
    .where(eq(accountUser.userId, userId))
    .limit(1);
  return membership?.accountId ?? userId;
}

export function createChannelsRouter(engine: ChannelEngineImpl): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post('/', async (c) => {
    const userId = c.get('userId') as string;
    const accountId = await resolveAccountId(userId);
    const body = await c.req.json();
    const parsed = createChannelSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

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

    const adapter = engine.getAdapter(parsed.data.channel_type);
    if (adapter?.validateCredentials) {
      const validation = await adapter.validateCredentials(parsed.data.credentials);
      if (!validation.valid) {
        throw new ValidationError(`Invalid credentials: ${validation.error}`);
      }
    }

    const [config] = await db
      .insert(channelConfigs)
      .values({
        sandboxId: parsed.data.sandbox_id,
        accountId: accountId,
        channelType: parsed.data.channel_type,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        credentials: parsed.data.credentials,
        platformConfig: parsed.data.platform_config,
        sessionStrategy: parsed.data.session_strategy,
        systemPrompt: parsed.data.system_prompt ?? null,
        agentName: parsed.data.agent_name ?? null,
        metadata: parsed.data.metadata ?? {},
      })
      .returning();

    if (adapter?.onChannelCreated) {
      try {
        await adapter.onChannelCreated(config);
      } catch (err) {
        console.error(`[CHANNELS] onChannelCreated failed for ${parsed.data.channel_type}:`, err);
      }
    }

    return c.json({ success: true, data: config }, 201);
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

    const [sandbox] = await db
      .select({ name: sandboxes.name, status: sandboxes.status })
      .from(sandboxes)
      .where(eq(sandboxes.sandboxId, config.sandboxId));

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
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;
    if (parsed.data.credentials !== undefined) updateData.credentials = parsed.data.credentials;
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

    const adapter = engine.getAdapter(config.channelType as typeof CHANNEL_TYPES[number]);
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

  return app;
}
