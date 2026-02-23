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
import { getSupabase, isSupabaseConfigured } from '../../shared/supabase';

const STORAGE_BUCKET = 'channel-files';

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

    if (!config.sandboxId) {
      const adapter = this.adapters.get(config.channelType as ChannelType);
      if (adapter?.sendUnlinkedMessage) {
        await adapter.sendUnlinkedMessage(config, message);
      } else {
        console.warn(`[CHANNELS] Channel ${config.channelConfigId} has no linked instance`);
      }
      return;
    }

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

    if (!config.sandboxId) {
      console.error(`[CHANNELS] No sandbox linked for config: ${config.channelConfigId}`);
      return;
    }

    const sandboxId = config.sandboxId;
    const target = await this.resolveSandbox(sandboxId);
    if (!target) {
      console.error(`[CHANNELS] Sandbox not found: ${sandboxId}`);
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
        console.log(`[CHANNELS] Sandbox ${sandboxId} offline, queuing message`);
        try {
          await this.queue.enqueue(sandboxId, message, config, connector);
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

      const filesBefore = new Set(
        (await connector.getModifiedFiles().catch(() => [])).map((f) => f.path),
      );

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
        modelName: model?.modelID ?? 'default',
        durationMs: Date.now() - startTime,
      };

      await adapter.sendResponse(config, message, agentResponse);

      const uploadedFileNames = new Set<string>();

      if (collectedFiles.length > 0 && adapter.sendFiles) {
        console.log(`[CHANNELS] Strategy 1: ${collectedFiles.length} file(s) from SSE stream`);
        for (const file of collectedFiles) {
          if (!file.content) {
            console.log(`[CHANNELS] Downloading SSE file: name=${file.name} url=${file.url}`);
            const buffer = await connector.downloadFile(file.url);
            if (buffer) {
              console.log(`[CHANNELS] Downloaded: ${file.name} (${buffer.length} bytes)`);
              file.content = buffer;
            } else {
              console.warn(`[CHANNELS] Download failed for ${file.url}, trying by name...`);
              const fallback = await connector.downloadFileByPath(file.name);
              if (fallback) {
                console.log(`[CHANNELS] Fallback download succeeded: ${file.name} (${fallback.length} bytes)`);
                file.content = fallback;
              } else {
                console.error(`[CHANNELS] All download attempts failed for: ${file.name}`);
              }
            }
          }
          if (file.content) {
            const publicUrl = await this.uploadToSupabaseStorage(file.name, file.content, file.mimeType);
            if (publicUrl) {
              file.url = publicUrl;
            }
          }
        }
        const downloadedFiles = collectedFiles.filter((f) => f.content);
        if (downloadedFiles.length > 0) {
          console.log(`[CHANNELS] Sending ${downloadedFiles.length} SSE file(s) to channel`);
          await adapter.sendFiles(config, message, downloadedFiles).catch((err) => {
            console.error('[CHANNELS] File send to channel failed:', err);
          });
          for (const f of downloadedFiles) {
            uploadedFileNames.add(f.name);
          }
        }
      }

      if (adapter.sendFiles) {
        try {
          const filesAfter = await connector.getModifiedFiles().catch(() => []);
          const newFiles: FileOutput[] = [];

          console.log(`[CHANNELS] Strategy 2: git status before=${filesBefore.size} after=${filesAfter.length} already_uploaded=${uploadedFileNames.size}`);

          for (const f of filesAfter) {
            if (filesBefore.has(f.path)) continue;
            if (uploadedFileNames.has(f.name)) continue;

            console.log(`[CHANNELS] New file from git status: ${f.path}`);
            const buffer = await connector.downloadFileByPath(f.path);
            if (buffer) {
              console.log(`[CHANNELS] Downloaded: ${f.name} (${buffer.length} bytes)`);
              const publicUrl = await this.uploadToSupabaseStorage(f.name, buffer);
              newFiles.push({ name: f.name, url: publicUrl || f.path, content: buffer });
            } else {
              console.warn(`[CHANNELS] Failed to download: ${f.path}`);
            }
          }

          if (newFiles.length > 0) {
            console.log(`[CHANNELS] Sending ${newFiles.length} git-detected file(s) to channel`);
            await adapter.sendFiles(config, message, newFiles).catch((err) => {
              console.error('[CHANNELS] File send to channel failed:', err);
            });
          }
        } catch (err) {
          console.warn('[CHANNELS] Strategy 2 (git status) failed:', err);
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
        if (event.file && (event.file.url || event.file.name)) {
          console.log(`[CHANNELS] SSE file event: name=${event.file.name} url=${event.file.url}`);
          collectedFiles.push({
            name: event.file.name,
            url: event.file.url || event.file.name,
            mimeType: event.file.mimeType,
          });
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

  private resolveModel(config: ChannelConfig): { providerID: string; modelID: string } | undefined {
    const meta = config.metadata as Record<string, unknown> | null;

    if (meta?.model && typeof meta.model === 'object' && !Array.isArray(meta.model)) {
      const m = meta.model as Record<string, unknown>;
      if (typeof m.providerID === 'string' && typeof m.modelID === 'string') {
        return { providerID: m.providerID, modelID: m.modelID };
      }
    }

    return undefined;
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

    if (config.channelType === 'slack' || config.channelType === 'telegram') {
      parts.push(
        `[Response format: You are responding in a ${config.channelType} channel. Keep responses short and concise — use brief paragraphs, short bullet points, and avoid verbose explanations. No headers unless truly needed. Aim for the minimum words that fully answer the question. When generating files, use the show_user tool to attach them.]`,
      );
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

  private async uploadToSupabaseStorage(
    fileName: string,
    content: Buffer,
    mimeType?: string,
  ): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabase();
      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `channel/${uniqueId}_${fileName}`;
      const contentType = mimeType || guessMimeType(fileName);

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, content, { contentType, upsert: false });

      if (error) {
        console.error(`[CHANNELS] Supabase upload failed for ${fileName}:`, error.message);
        return null;
      }

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      console.log(`[CHANNELS] Uploaded to Supabase: ${fileName} -> ${data.publicUrl}`);
      return data.publicUrl;
    } catch (err) {
      console.error(`[CHANNELS] Supabase upload error for ${fileName}:`, err);
      return null;
    }
  }

  cleanup(): void {
    this.sessionManager.cleanup();
    this.rateLimiter.cleanup();
  }
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimes: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', html: 'text/html',
    css: 'text/css', js: 'application/javascript', json: 'application/json',
    xml: 'application/xml', csv: 'text/csv', pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  };
  return mimes[ext] || 'application/octet-stream';
}
