import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/db';
import { channelSessions } from '@kortix/db';
import { SandboxConnector } from './sandbox-connector';
import type { NormalizedMessage, SessionStrategy } from '../types';
import type { ChannelConfig } from '@kortix/db';

interface CachedSession {
  sessionId: string;
  lastUsedAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class SessionManager {
  private cache = new Map<string, CachedSession>();

  private buildKey(
    configId: string,
    channelType: string,
    strategy: SessionStrategy,
    message: NormalizedMessage,
  ): string {
    let discriminator: string;

    switch (strategy) {
      case 'single':
        discriminator = 'global';
        break;
      case 'per-thread':
        discriminator = message.threadId || message.groupId || message.platformUser.id;
        break;
      case 'per-user':
        discriminator = message.platformUser.id;
        break;
      case 'per-message':
        discriminator = message.externalId;
        break;
      default:
        discriminator = message.platformUser.id;
    }

    return `${configId}:${channelType}:${strategy}:${discriminator}`;
  }

  async resolve(
    config: ChannelConfig,
    message: NormalizedMessage,
    connector: SandboxConnector,
  ): Promise<string> {
    const strategy = config.sessionStrategy as SessionStrategy;
    const key = this.buildKey(
      config.channelConfigId,
      config.channelType,
      strategy,
      message,
    );

    if (strategy === 'per-message') {
      const sessionId = await connector.createSession(config.agentName ?? undefined);
      return sessionId;
    }

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.lastUsedAt < SESSION_TTL_MS) {
      cached.lastUsedAt = Date.now();
      this.touchDb(config.channelConfigId, key).catch(() => {});
      return cached.sessionId;
    }

    const [dbSession] = await db
      .select()
      .from(channelSessions)
      .where(
        and(
          eq(channelSessions.channelConfigId, config.channelConfigId),
          eq(channelSessions.strategyKey, key),
        ),
      );

    if (dbSession) {
      const age = Date.now() - dbSession.lastUsedAt.getTime();
      if (age < SESSION_TTL_MS) {
        this.cache.set(key, {
          sessionId: dbSession.sessionId,
          lastUsedAt: Date.now(),
        });
        this.touchDb(config.channelConfigId, key).catch(() => {});
        return dbSession.sessionId;
      }
    }

    const sessionId = await connector.createSession(config.agentName ?? undefined);

    this.cache.set(key, { sessionId, lastUsedAt: Date.now() });

    if (dbSession) {
      await db
        .update(channelSessions)
        .set({
          sessionId,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(channelSessions.channelSessionId, dbSession.channelSessionId));
    } else {
      await db.insert(channelSessions).values({
        channelConfigId: config.channelConfigId,
        strategyKey: key,
        sessionId,
      });
    }

    return sessionId;
  }

  private async touchDb(configId: string, key: string): Promise<void> {
    await db
      .update(channelSessions)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(channelSessions.channelConfigId, configId),
          eq(channelSessions.strategyKey, key),
        ),
      );
  }

  async invalidateSession(
    configId: string,
    channelType: string,
    strategy: SessionStrategy,
    message: NormalizedMessage,
  ): Promise<void> {
    const key = this.buildKey(configId, channelType, strategy, message);
    this.cache.delete(key);
    await db
      .delete(channelSessions)
      .where(
        and(
          eq(channelSessions.channelConfigId, configId),
          eq(channelSessions.strategyKey, key),
        ),
      );
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.lastUsedAt > SESSION_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}
