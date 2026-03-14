/**
 * Internal channels routes — for sandbox → kortix-api calls authenticated
 * via KORTIX_TOKEN (Kortix API key / combined auth), not user JWT.
 *
 * These endpoints are called by opencode-channels running inside the sandbox
 * to report session mappings back to the DB for frontend visibility.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/db';
import { channelConfigs, channelSessions } from '@kortix/db';
import { NotFoundError, ValidationError } from '../../errors';

export function createInternalChannelsRouter(): Hono {
  const app = new Hono();

  /**
   * POST /sessions/:channelConfigId
   * Upsert a channel session record. Called by opencode-channels after
   * creating or reusing an OpenCode session for a platform thread.
   * Auth: Bearer KORTIX_TOKEN (combined auth — accepts Kortix API key or Supabase JWT).
   */
  app.post('/sessions/:channelConfigId', async (c) => {
    const configId = c.req.param('channelConfigId');
    const body = await c.req.json() as {
      strategy_key: string;
      session_id: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.strategy_key || !body.session_id) {
      throw new ValidationError('strategy_key and session_id are required');
    }

    // Verify the channel config exists (no user-scope check — this is an internal call)
    const [config] = await db
      .select({ channelConfigId: channelConfigs.channelConfigId })
      .from(channelConfigs)
      .where(eq(channelConfigs.channelConfigId, configId));

    if (!config) {
      throw new NotFoundError('Channel config', configId);
    }

    // Upsert: if the same (channelConfigId, strategyKey) already maps to a session, update it
    const [existing] = await db
      .select()
      .from(channelSessions)
      .where(
        and(
          eq(channelSessions.channelConfigId, configId),
          eq(channelSessions.strategyKey, body.strategy_key),
        ),
      );

    let record;
    if (existing) {
      const [updated] = await db
        .update(channelSessions)
        .set({
          sessionId: body.session_id,
          lastUsedAt: new Date(),
          metadata: body.metadata ?? existing.metadata ?? {},
          updatedAt: new Date(),
        })
        .where(eq(channelSessions.channelSessionId, existing.channelSessionId))
        .returning();
      record = updated;
    } else {
      const [inserted] = await db
        .insert(channelSessions)
        .values({
          channelConfigId: configId,
          strategyKey: body.strategy_key,
          sessionId: body.session_id,
          lastUsedAt: new Date(),
          metadata: body.metadata ?? {},
        })
        .returning();
      record = inserted;
    }

    return c.json({ success: true, data: record }, existing ? 200 : 201);
  });

  return app;
}
