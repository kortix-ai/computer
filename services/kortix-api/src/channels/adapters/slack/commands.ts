import type { Context } from 'hono';
import type { ChannelEngine } from '../adapter';
import type { ChannelConfig } from '@kortix/db';
import { verifySlackRequest, findConfigByTeamId } from './utils';
import { SlackApi } from './api';
import type { NormalizedMessage } from '../../types';

export async function handleSlackCommand(
  c: Context,
  engine: ChannelEngine,
): Promise<Response> {
  const rawBody = await c.req.text();

  const timestamp = c.req.header('X-Slack-Request-Timestamp') || '';
  const signature = c.req.header('X-Slack-Signature') || '';
  const valid = await verifySlackRequest(rawBody, { timestamp, signature });
  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const params = new URLSearchParams(rawBody);
  const teamId = params.get('team_id') || '';
  const userId = params.get('user_id') || '';
  const userName = params.get('user_name') || userId;
  const text = (params.get('text') || '').trim();
  const responseUrl = params.get('response_url') || '';
  const channelId = params.get('channel_id') || '';
  const triggerId = params.get('trigger_id') || '';

  if (!responseUrl) {
    return c.json({ text: 'Missing response_url from Slack.' }, 200);
  }

  const channelConfig = await findConfigByTeamId(teamId);
  if (!channelConfig) {
    return c.json({ text: 'No Kortix workspace connected for this Slack team.' }, 200);
  }

  const subcommand = parseSubcommand(text);

  if (subcommand.type === 'help') {
    return c.json({
      response_type: 'ephemeral',
      text: [
        '*Kortix Slash Commands*',
        '`/kortix <question>` — Ask anything',
        '`/kortix digest #channel` — Summarize recent channel activity',
        '`/kortix help` — Show this help',
      ].join('\n'),
    }, 200);
  }

  if (!subcommand.prompt) {
    return c.json({
      response_type: 'ephemeral',
      text: 'Usage: `/kortix <question>` or `/kortix help`',
    }, 200);
  }

  const ctx: CommandContext = { responseUrl, userId, userName, channelId, triggerId };

  processCommandAsync(engine, channelConfig, subcommand, ctx).catch((err) => {
    console.error('[SLACK/COMMANDS] Async processing failed:', err);
    postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
  });

  return c.json({
    response_type: 'in_channel',
    text: ':hourglass_flowing_sand: Working on it...',
  }, 200);
}

interface Subcommand {
  type: 'help' | 'digest' | 'prompt';
  prompt: string;
  digestChannel?: string;
}

function parseSubcommand(text: string): Subcommand {
  const lower = text.toLowerCase().trim();

  if (lower === 'help' || lower === '') {
    return { type: 'help', prompt: '' };
  }

  const digestMatch = text.match(/^digest\s+(?:<#(\w+)\|[^>]*>|<?#?(\S+?)>?)\s*$/i);
  if (digestMatch) {
    const channelRef = digestMatch[1] || digestMatch[2];
    return {
      type: 'digest',
      prompt: text,
      digestChannel: channelRef,
    };
  }

  return { type: 'prompt', prompt: text };
}

interface CommandContext {
  responseUrl: string;
  userId: string;
  userName: string;
  channelId: string;
  triggerId: string;
}

async function processCommandAsync(
  engine: ChannelEngine,
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  let promptContent = subcommand.prompt;

  if (subcommand.type === 'digest' && subcommand.digestChannel) {
    promptContent = await buildDigestPrompt(channelConfig, subcommand.digestChannel);
  }

  const message: NormalizedMessage = {
    externalId: `cmd-${Date.now()}`,
    channelType: 'slack',
    channelConfigId: channelConfig.channelConfigId,
    chatType: 'dm',
    content: promptContent,
    attachments: [],
    platformUser: {
      id: ctx.userId,
      name: ctx.userName,
    },
    raw: {
      _slackCommand: true,
      responseUrl: ctx.responseUrl,
      channelId: ctx.channelId,
    },
  };

  await engine.processMessage(message);
}

async function buildDigestPrompt(
  channelConfig: ChannelConfig,
  channelId: string,
): Promise<string> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    return 'Unable to fetch channel history: missing bot token.';
  }

  const api = new SlackApi(botToken);

  const oneDayAgo = String(Math.floor(Date.now() / 1000) - 86400);
  const result = await api.conversationsHistory(channelId, oneDayAgo, 200);

  if (!result.ok || !result.messages || result.messages.length === 0) {
    return `Unable to fetch history for channel ${channelId}: ${result.error || 'no messages found'}`;
  }

  const lines = result.messages
    .reverse()
    .filter((m) => !m.subtype)
    .map((m) => `[${m.user || 'unknown'}]: ${m.text || '(no text)'}`)
    .join('\n');

  return [
    `Summarize the following Slack channel conversation from the last 24 hours.`,
    `Highlight key topics, decisions, action items, and important discussions.`,
    `Format the summary with clear sections and bullet points.`,
    '',
    `--- Channel messages (${result.messages.length} messages) ---`,
    lines,
    `--- End of messages ---`,
  ].join('\n');
}

export async function postToResponseUrl(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'in_channel',
      text,
    }),
  });
}
