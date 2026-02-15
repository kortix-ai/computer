import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../shared/db';
import { channelConfigs } from '@kortix/db';
import type { ChannelConfig } from '@kortix/db';
import type { NormalizedMessage, ChatType } from '../../types';
import type { ChannelEngine } from '../adapter';
import { WebhookVerificationError } from '../../../errors';

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
  };
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  message_thread_id?: number;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    user?: { id: number; username?: string };
  }>;
}

export async function handleTelegramWebhook(
  c: Context,
  engine: ChannelEngine,
): Promise<Response> {
  const configId = c.req.param('configId');
  if (!configId) {
    return c.json({ error: 'Missing config ID' }, 400);
  }

  const [config] = await db
    .select()
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.channelConfigId, configId),
        eq(channelConfigs.channelType, 'telegram'),
        eq(channelConfigs.enabled, true),
      ),
    );

  if (!config) {
    return c.json({ error: 'Channel not found or disabled' }, 404);
  }

  const secretToken = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  const expectedSecret = (config.credentials as Record<string, unknown>)?.webhookSecret as string;

  if (expectedSecret && secretToken !== expectedSecret) {
    throw new WebhookVerificationError('Invalid Telegram webhook secret token');
  }

  const update = (await c.req.json()) as TelegramUpdate;

  const telegramMsg = update.message || update.edited_message || update.channel_post;
  if (!telegramMsg) {
    return c.json({ ok: true });
  }

  if (telegramMsg.from?.is_bot) {
    return c.json({ ok: true });
  }

  const content = telegramMsg.text || telegramMsg.caption || '';
  if (!content) {
    return c.json({ ok: true });
  }

  const chatType = detectChatType(telegramMsg);

  if (chatType === 'group') {
    const botId = (config.credentials as Record<string, unknown>)?.botId as number | undefined;
    const botUsername = (config.credentials as Record<string, unknown>)?.botUsername as string | undefined;
    const isMention = detectMention(telegramMsg, botId, botUsername);

    const platformConfig = config.platformConfig as Record<string, unknown> | null;
    const groupConfig = (platformConfig?.groups as Record<string, unknown>) ?? {};
    const requireMention = groupConfig.requireMention !== false;

    if (requireMention && !isMention) {
      return c.json({ ok: true });
    }
  }

  const normalized: NormalizedMessage = {
    externalId: String(telegramMsg.message_id),
    channelType: 'telegram',
    channelConfigId: config.channelConfigId,
    chatType,
    content: stripBotMention(content, (config.credentials as Record<string, unknown>)?.botUsername as string),
    attachments: [],
    platformUser: {
      id: String(telegramMsg.from?.id ?? telegramMsg.chat.id),
      name: telegramMsg.from
        ? [telegramMsg.from.first_name, telegramMsg.from.last_name].filter(Boolean).join(' ')
        : telegramMsg.chat.title || 'Unknown',
      avatar: undefined,
    },
    threadId: telegramMsg.message_thread_id ? String(telegramMsg.message_thread_id) : undefined,
    groupId: chatType !== 'dm' ? String(telegramMsg.chat.id) : undefined,
    isMention: detectMention(
      telegramMsg,
      (config.credentials as Record<string, unknown>)?.botId as number | undefined,
      (config.credentials as Record<string, unknown>)?.botUsername as string | undefined,
    ),
    raw: update,
  };

  engine.processMessage(normalized).catch((err) => {
    console.error(`[TELEGRAM] Failed to process message:`, err);
  });

  return c.json({ ok: true });
}

function detectChatType(msg: TelegramMessage): ChatType {
  switch (msg.chat.type) {
    case 'private':
      return 'dm';
    case 'channel':
      return 'channel';
    case 'group':
    case 'supergroup':
      return 'group';
    default:
      return 'dm';
  }
}

function detectMention(
  msg: TelegramMessage,
  botId?: number,
  botUsername?: string,
): boolean {
  if (!msg.entities) return false;

  for (const entity of msg.entities) {
    if (entity.type === 'mention' && botUsername) {
      const mentionText = (msg.text || '').slice(entity.offset, entity.offset + entity.length);
      if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) {
        return true;
      }
    }
    if (entity.type === 'text_mention' && entity.user?.id === botId) {
      return true;
    }
  }

  if (msg.reply_to_message?.from?.id === botId) {
    return true;
  }

  return false;
}

function stripBotMention(text: string, botUsername?: string): string {
  if (!botUsername) return text;
  return text.replace(new RegExp(`@${botUsername}\\b`, 'gi'), '').trim();
}
