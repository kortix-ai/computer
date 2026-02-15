import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../shared/db';
import { channelConfigs } from '@kortix/db';
import type { ChannelConfig } from '@kortix/db';
import type { NormalizedMessage, ChatType, ThreadMessage } from '../../types';
import type { ChannelEngine } from '../adapter';
import { WebhookVerificationError } from '../../../errors';
import { config as appConfig } from '../../../config';
import { SlackApi } from './api';

interface SlackUrlVerification {
  type: 'url_verification';
  challenge: string;
  token: string;
}

interface SlackEventCallback {
  type: 'event_callback';
  token: string;
  team_id: string;
  event: SlackEvent;
  event_id: string;
  event_time: number;
}

interface SlackEvent {
  type: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  event_ts?: string;
}

type SlackPayload = SlackUrlVerification | SlackEventCallback | { type: string };

async function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const basestring = `v0:${timestamp}:${body}`;
  const key = new TextEncoder().encode(signingSecret);
  const message = new TextEncoder().encode(basestring);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const expected = `v0=${hex}`;

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function handleSlackWebhook(
  c: Context,
  engine: ChannelEngine,
): Promise<Response> {
  const rawBody = await c.req.text();

  const signingSecret = appConfig.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = c.req.header('X-Slack-Request-Timestamp') || '';
    const signature = c.req.header('X-Slack-Signature') || '';

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      throw new WebhookVerificationError('Slack request timestamp too old');
    }

    const valid = await verifySlackSignature(signingSecret, timestamp, rawBody, signature);
    if (!valid) {
      throw new WebhookVerificationError('Invalid Slack request signature');
    }
  }

  const payload = JSON.parse(rawBody) as SlackPayload;

  if (payload.type === 'url_verification') {
    const verification = payload as SlackUrlVerification;
    return c.json({ challenge: verification.challenge });
  }

  if (payload.type !== 'event_callback') {
    return c.json({ ok: true });
  }

  const eventPayload = payload as SlackEventCallback;
  const event = eventPayload.event;

  if (event.type !== 'message' && event.type !== 'app_mention') {
    return c.json({ ok: true });
  }

  if (event.bot_id || event.subtype === 'bot_message') {
    return c.json({ ok: true });
  }

  if (event.subtype) {
    return c.json({ ok: true });
  }

  let content = event.text || '';
  if (!content) {
    return c.json({ ok: true });
  }

  const channelConfig = await findConfigByTeamId(eventPayload.team_id);
  if (!channelConfig) {
    console.warn(`[SLACK] No channel config found for team_id=${eventPayload.team_id}`);
    return c.json({ ok: true });
  }

  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botUserId = credentials?.botUserId as string | undefined;

  const isMention = event.type === 'app_mention';

  if (botUserId) {
    content = content.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim();
  }

  const chatType = detectChatType(event.channel_type);

  if (chatType === 'group') {
    const platformConfig = channelConfig.platformConfig as Record<string, unknown> | null;
    const groupConfig = (platformConfig?.groups as Record<string, unknown>) ?? {};
    const requireMention = groupConfig.requireMention !== false;

    if (requireMention && !isMention) {
      return c.json({ ok: true });
    }
  }

  const normalized: NormalizedMessage = {
    externalId: event.ts || event.event_ts || '',
    channelType: 'slack',
    channelConfigId: channelConfig.channelConfigId,
    chatType,
    content,
    attachments: [],
    platformUser: {
      id: event.user || '',
      name: event.user || 'Unknown',
    },
    threadId: event.thread_ts,
    groupId: chatType !== 'dm' ? event.channel : undefined,
    isMention,
    raw: eventPayload,
  };

  // Fire-and-forget: fetch thread context (if in thread) then process
  (async () => {
    if (event.thread_ts && event.channel) {
      normalized.threadContext = await fetchThreadContext(
        channelConfig,
        event.channel,
        event.thread_ts,
        event.ts || '',
        botUserId,
      );
    }
    await engine.processMessage(normalized);
  })().catch((err) => {
    console.error('[SLACK] Failed to process message:', err);
  });

  return c.json({ ok: true });
}

async function findConfigByTeamId(teamId: string): Promise<ChannelConfig | null> {
  const configs = await db
    .select()
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.channelType, 'slack'),
        eq(channelConfigs.enabled, true),
      ),
    );

  for (const cfg of configs) {
    const creds = cfg.credentials as Record<string, unknown>;
    if (creds?.teamId === teamId) {
      return cfg;
    }
  }

  return null;
}

async function fetchThreadContext(
  channelConfig: ChannelConfig,
  channel: string,
  threadTs: string,
  currentTs: string,
  botUserId?: string,
): Promise<ThreadMessage[]> {
  try {
    const credentials = channelConfig.credentials as Record<string, unknown>;
    const botToken = credentials?.botToken as string | undefined;
    if (!botToken) return [];

    const api = new SlackApi(botToken);
    const result = await api.conversationsReplies(channel, threadTs, 30);
    if (!result.ok || !result.messages) return [];

    const context: ThreadMessage[] = [];
    for (const msg of result.messages) {
      // Skip the current message (will be sent as the main content)
      if (msg.ts === currentTs) continue;
      if (!msg.text) continue;

      const isBot = !!(msg.bot_id || msg.subtype === 'bot_message');
      const isSelf = isBot && botUserId && msg.user === botUserId;

      context.push({
        sender: isSelf ? 'assistant' : (msg.user || 'unknown'),
        text: msg.text,
        isBot,
      });
    }
    return context;
  } catch (err) {
    console.warn('[SLACK] Failed to fetch thread context:', err);
    return [];
  }
}

function detectChatType(channelType?: string): ChatType {
  switch (channelType) {
    case 'im':
      return 'dm';
    case 'channel':
    case 'group':
    case 'mpim':
      return 'group';
    default:
      return 'dm';
  }
}
