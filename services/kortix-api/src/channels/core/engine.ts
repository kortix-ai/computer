import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/db';
import {
  channelConfigs,
  channelMessages,
  channelIdentityMap,
  sandboxes,
} from '@kortix/db';
import type { ChannelConfig } from '@kortix/db';

import type { ChannelAdapter, FileOutput } from '../adapters/adapter';
import type { ChannelType, NormalizedMessage, AgentResponse, SandboxTarget, SessionStrategy } from '../types';
import { SandboxConnector } from './sandbox-connector';
import type { StreamEvent } from './sandbox-connector';
import { SessionManager } from './session-manager';
import { MessageQueue } from './queue';
import { RateLimiter } from './rate-limiter';
import { ChannelError } from '../../errors';
import { createPermissionRequest } from './pending-permissions';
import { decryptCredentials } from '../lib/credentials';

export class ChannelEngineImpl {
  private adapters: Map<ChannelType, ChannelAdapter>;
  private sessionManager: SessionManager;
  private queue: MessageQueue;
  private rateLimiter: RateLimiter;

  constructor(adapters: Map<ChannelType, ChannelAdapter>) {
    this.adapters = adapters;
    this.sessionManager = new SessionManager();
    this.queue = new MessageQueue();
    this.rateLimiter = new RateLimiter();

    this.queue.onProcess((msg, config) => this.processInner(msg, config));
  }

  getAdapter(type: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  async processMessage(message: NormalizedMessage): Promise<void> {
    const [config] = await db
      .select()
      .from(channelConfigs)
      .where(
        and(
          eq(channelConfigs.channelConfigId, message.channelConfigId),
          eq(channelConfigs.enabled, true),
        ),
      );

    if (!config) {
      console.warn(`[CHANNELS] No enabled config found for ${message.channelConfigId}`);
      return;
    }

    config.credentials = await decryptCredentials(config.credentials as Record<string, unknown>);

    const rateResult = this.rateLimiter.check(config.channelConfigId, message.platformUser.id);
    if (!rateResult.allowed) {
      console.warn(`[CHANNELS] Rate limited: config=${config.channelConfigId} user=${message.platformUser.id}`);
      return;
    }

    const allowed = await this.checkAccess(config, message);
    if (!allowed) {
      console.warn(`[CHANNELS] Access denied: config=${config.channelConfigId} user=${message.platformUser.id}`);
      return;
    }

    await this.processInner(message, config);
  }

  private async processInner(message: NormalizedMessage, config: ChannelConfig): Promise<void> {
    const adapter = this.adapters.get(config.channelType as ChannelType);
    if (!adapter) {
      console.error(`[CHANNELS] No adapter for type: ${config.channelType}`);
      return;
    }

    const target = await this.resolveSandbox(config.sandboxId);
    if (!target) {
      console.error(`[CHANNELS] Sandbox not found: ${config.sandboxId}`);
      return;
    }

    const connector = new SandboxConnector(target);

    await this.logMessage(config, message, 'inbound');

    if (adapter.sendTypingIndicator) {
      adapter.sendTypingIndicator(config, message).catch((err) => {
        console.warn(`[CHANNELS] Typing indicator failed:`, err);
      });
    }

    const removeReaction = () => {
      if (adapter.removeTypingIndicator) {
        adapter.removeTypingIndicator(config, message).catch((err) => {
          console.warn(`[CHANNELS] Remove typing indicator failed:`, err);
        });
      }
    };

    try {
      const ready = await connector.isReady();
      if (!ready) {
        console.log(`[CHANNELS] Sandbox ${config.sandboxId} offline, queuing message`);
        try {
          await this.queue.enqueue(config.sandboxId, message, config, connector);
        } catch (err) {
          console.error(`[CHANNELS] Queue processing failed:`, err);
        }
        return;
      }

      const agentName = message.overrides?.agentName ?? config.agentName ?? undefined;
      const sessionId = await this.sessionManager.resolve(config, message, connector);
      const prompt = this.buildPrompt(config, message);
      const model = message.overrides?.model ?? this.resolveModel(config);

      let responseText = '';
      const collectedFiles: FileOutput[] = [];
      const startTime = Date.now();

      const fileParts = message.attachments
        .filter((a) => a.url)
        .map((a) => ({ type: 'file' as const, mime: a.mimeType || 'application/octet-stream', url: a.url!, filename: a.name }));

      try {
        for await (const event of connector.promptStreaming(sessionId, prompt, agentName, model, fileParts)) {
          responseText = await this.handleStreamEvent(
            event, responseText, collectedFiles, connector, adapter, config, message,
          );
        }
      } catch (err) {
        console.error(`[CHANNELS] Agent prompt failed:`, err);
        throw new ChannelError(`Failed to get response from agent: ${err instanceof Error ? err.message : String(err)}`);
      }

      const agentResponse: AgentResponse = {
        content: responseText,
        sessionId,
        truncated: false,
        modelName: model.modelID,
        durationMs: Date.now() - startTime,
      };

      await adapter.sendResponse(config, message, agentResponse);

      if (collectedFiles.length > 0 && adapter.sendFiles) {
        for (const file of collectedFiles) {
          if (!file.content) {
            const buffer = await connector.downloadFile(file.url);
            if (buffer) file.content = buffer;
          }
        }
        const downloadedFiles = collectedFiles.filter((f) => f.content);
        if (downloadedFiles.length > 0) {
          await adapter.sendFiles(config, message, downloadedFiles).catch((err) => {
            console.error('[CHANNELS] File upload failed:', err);
          });
        }
      }

      await this.logMessage(config, message, 'outbound', responseText, sessionId);
    } finally {
      removeReaction();
    }
  }

  private async handleStreamEvent(
    event: StreamEvent,
    responseText: string,
    collectedFiles: FileOutput[],
    connector: SandboxConnector,
    adapter: ChannelAdapter,
    config: ChannelConfig,
    message: NormalizedMessage,
  ): Promise<string> {
    switch (event.type) {
      case 'text':
        return responseText + (event.data || '');

      case 'permission':
        if (event.permission && adapter.sendPermissionRequest) {
          await this.handlePermissionEvent(event, connector, adapter, config, message);
        }
        return responseText;

      case 'file':
        if (event.file && event.file.url) {
          collectedFiles.push(event.file);
        }
        return responseText;

      case 'error':
        throw new Error(`Agent error: ${event.data}`);

      default:
        return responseText;
    }
  }

  private async handlePermissionEvent(
    event: StreamEvent,
    connector: SandboxConnector,
    adapter: ChannelAdapter,
    config: ChannelConfig,
    message: NormalizedMessage,
  ): Promise<void> {
    const perm = event.permission!;

    await adapter.sendPermissionRequest!(config, message, perm);
    const approved = await createPermissionRequest(perm.id);
    await connector.replyPermission(perm.id, approved);
  }

  private resolveModel(config: ChannelConfig): { providerID: string; modelID: string } {
    const meta = config.metadata as Record<string, unknown> | null;

    if (meta?.model && typeof meta.model === 'object' && !Array.isArray(meta.model)) {
      const m = meta.model as Record<string, unknown>;
      if (typeof m.providerID === 'string' && typeof m.modelID === 'string') {
        return { providerID: m.providerID, modelID: m.modelID };
      }
    }

    return { providerID: 'anthropic', modelID: 'claude-3-5-haiku-20241022' };
  }

  private buildPrompt(config: ChannelConfig, message: NormalizedMessage): string {
    const parts: string[] = [];

    if (config.systemPrompt) {
      parts.push(config.systemPrompt);
    }

    if (message.groupId) {
      const platformConfig = config.platformConfig as Record<string, unknown> | null;
      const channelPrompts = platformConfig?.channelPrompts as Record<string, string> | undefined;
      const channelPrompt = channelPrompts?.[message.groupId];
      if (channelPrompt) {
        parts.push(`[Channel-specific instructions]\n${channelPrompt}`);
      }
    }

    parts.push(
      `[Channel: ${config.channelType} | Chat: ${message.chatType} | User: ${message.platformUser.name}]`,
    );

    if (message.threadContext && message.threadContext.length > 0) {
      const threadLines = message.threadContext.map((m) => {
        const role = m.isBot ? 'Kortix' : m.sender;
        return `${role}: ${m.text}`;
      });
      parts.push(`--- Thread context ---\n${threadLines.join('\n')}\n--- End thread context ---`);
    }

    parts.push(message.content);

    return parts.join('\n\n');
  }

  private async checkAccess(config: ChannelConfig, message: NormalizedMessage): Promise<boolean> {
    const [identity] = await db
      .select()
      .from(channelIdentityMap)
      .where(
        and(
          eq(channelIdentityMap.channelConfigId, config.channelConfigId),
          eq(channelIdentityMap.platformUserId, message.platformUser.id),
        ),
      );

    if (identity) {
      return identity.allowed;
    }

    return true;
  }

  private async resolveSandbox(sandboxId: string): Promise<SandboxTarget | null> {
    const [sandbox] = await db
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.sandboxId, sandboxId));

    if (!sandbox) return null;

    return {
      sandboxId: sandbox.sandboxId,
      baseUrl: sandbox.baseUrl,
      authToken: sandbox.authToken,
      provider: sandbox.provider,
      externalId: sandbox.externalId,
    };
  }

  private async logMessage(
    config: ChannelConfig,
    message: NormalizedMessage,
    direction: 'inbound' | 'outbound',
    content?: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      await db.insert(channelMessages).values({
        channelConfigId: config.channelConfigId,
        direction,
        externalId: message.externalId,
        sessionId: sessionId ?? null,
        chatType: message.chatType,
        content: direction === 'inbound' ? message.content : (content ?? null),
        attachments: message.attachments,
        platformUser: message.platformUser,
        metadata: {},
      });
    } catch (err) {
      console.error(`[CHANNELS] Failed to log ${direction} message:`, err);
    }
  }

  async resetSession(
    configId: string,
    channelType: string,
    strategy: SessionStrategy,
    message: NormalizedMessage,
  ): Promise<void> {
    await this.sessionManager.invalidateSession(configId, channelType, strategy, message);
  }

  cleanup(): void {
    this.sessionManager.cleanup();
    this.rateLimiter.cleanup();
  }
}
