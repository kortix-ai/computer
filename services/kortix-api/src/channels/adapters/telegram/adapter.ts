import type { Hono } from 'hono';
import type { ChannelEngine } from '../adapter';
import { BaseAdapter } from '../adapter';
import type { ChannelCapabilities, NormalizedMessage, AgentResponse } from '../../types';
import type { ChannelConfig } from '@kortix/db';
import { TelegramApi } from './api';
import { handleTelegramWebhook } from './webhook';
import { splitMessage } from '../../lib/message-splitter';
import { config } from '../../../config';

export class TelegramAdapter extends BaseAdapter {
  readonly type = 'telegram' as const;
  readonly name = 'Telegram';
  readonly capabilities: ChannelCapabilities = {
    textChunkLimit: 4096,
    supportsRichText: true,
    supportsEditing: true,
    supportsTypingIndicator: true,
    supportsAttachments: true,
    connectionType: 'webhook',
  };

  registerRoutes(router: Hono, engine: ChannelEngine): void {
    router.post('/telegram/:configId', (c) => handleTelegramWebhook(c, engine));
  }

  async sendResponse(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
    response: AgentResponse,
  ): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) {
      console.error('[TELEGRAM] No bot token in credentials');
      return;
    }

    const api = new TelegramApi(botToken);
    const chatId = this.extractChatId(message);

    if (!chatId) {
      console.error('[TELEGRAM] Cannot determine chat ID from message');
      return;
    }

    const chunks = splitMessage(response.content, this.capabilities.textChunkLimit);

    for (const chunk of chunks) {
      const result = await api.sendMessage({
        chat_id: chatId,
        text: chunk,
        reply_to_message_id: message.chatType === 'group' ? Number(message.externalId) : undefined,
        message_thread_id: message.threadId ? Number(message.threadId) : undefined,
      });

      if (!result.ok) {
        console.error(`[TELEGRAM] sendMessage failed: ${result.description}`);
      }
    }
  }

  override async sendTypingIndicator(
    channelConfig: ChannelConfig,
    message: NormalizedMessage,
  ): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const api = new TelegramApi(botToken);
    const chatId = this.extractChatId(message);

    if (chatId) {
      await api.sendChatAction(chatId, 'typing');
    }
  }

  override async onChannelCreated(channelConfig: ChannelConfig): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const publicUrl = config.CHANNELS_PUBLIC_URL;
    if (!publicUrl) {
      console.warn('[TELEGRAM] CHANNELS_PUBLIC_URL not set, skipping webhook registration');
      return;
    }

    const api = new TelegramApi(botToken);

    const webhookSecret = crypto.randomUUID();
    const webhookUrl = `${publicUrl}/webhooks/telegram/${channelConfig.channelConfigId}`;

    const result = await api.setWebhook(webhookUrl, webhookSecret);
    if (!result.ok) {
      console.error(`[TELEGRAM] setWebhook failed: ${result.description}`);
      return;
    }

    const botInfo = await api.getMe();
    if (botInfo.ok && botInfo.result) {
      console.log(`[TELEGRAM] Webhook set for bot @${botInfo.result.username} → ${webhookUrl}`);
    }
  }

  override async onChannelRemoved(channelConfig: ChannelConfig): Promise<void> {
    const botToken = this.getBotToken(channelConfig);
    if (!botToken) return;

    const api = new TelegramApi(botToken);
    const result = await api.deleteWebhook();
    if (!result.ok) {
      console.error(`[TELEGRAM] deleteWebhook failed: ${result.description}`);
    }
  }

  override async validateCredentials(
    credentials: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const botToken = credentials.botToken as string;
    if (!botToken) {
      return { valid: false, error: 'botToken is required' };
    }

    try {
      const api = new TelegramApi(botToken);
      const result = await api.getMe();
      if (!result.ok) {
        return { valid: false, error: 'Invalid bot token' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Failed to validate bot token' };
    }
  }

  private extractChatId(message: NormalizedMessage): number | undefined {
    const rawUpdate = message.raw as Record<string, unknown>;
    const telegramMsg = (rawUpdate?.message || rawUpdate?.edited_message || rawUpdate?.channel_post) as Record<string, unknown> | undefined;
    const chat = telegramMsg?.chat as Record<string, unknown> | undefined;
    return chat?.id as number | undefined;
  }
}
