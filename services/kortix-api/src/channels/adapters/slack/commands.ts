import type { Context } from 'hono';
import type { ChannelEngine } from '../adapter';
import type { ChannelConfig } from '@kortix/db';
import { channelConfigs } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { db } from '../../../shared/db';
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
        '`/kortix config prompt <text>` — Set a channel-specific system prompt',
        '`/kortix config prompt clear` — Clear channel prompt',
        '`/kortix config show` — Show current config for this channel',
        '`/kortix export` — Export last 24h of channel messages as markdown',
        '`/kortix help` — Show this help',
      ].join('\n'),
    }, 200);
  }

  if (subcommand.type === 'config') {
    const ctx: CommandContext = { responseUrl, userId, userName, channelId, triggerId };
    handleConfigCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Config command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':gear: Processing...' }, 200);
  }

  if (subcommand.type === 'export') {
    const ctx: CommandContext = { responseUrl, userId, userName, channelId, triggerId };
    handleExportCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Export command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':hourglass_flowing_sand: Exporting...' }, 200);
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
  type: 'help' | 'digest' | 'prompt' | 'config' | 'export';
  prompt: string;
  digestChannel?: string;
  configAction?: 'set' | 'clear' | 'show';
  configPromptText?: string;
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

  if (lower.startsWith('config ')) {
    const configText = text.slice(7).trim();
    const configLower = configText.toLowerCase();

    if (configLower === 'show') {
      return { type: 'config', prompt: '', configAction: 'show' };
    }

    if (configLower.startsWith('prompt')) {
      const promptText = configText.slice(6).trim();
      if (!promptText || promptText.toLowerCase() === 'clear') {
        return { type: 'config', prompt: '', configAction: 'clear' };
      }
      return { type: 'config', prompt: '', configAction: 'set', configPromptText: promptText };
    }

    return { type: 'help', prompt: '' };
  }

  if (lower === 'export') {
    return { type: 'export', prompt: '' };
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

async function handleConfigCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const platformConfig = (channelConfig.platformConfig as Record<string, unknown>) ?? {};
  const channelPrompts = (platformConfig.channelPrompts as Record<string, string>) ?? {};

  if (subcommand.configAction === 'show') {
    const currentPrompt = channelPrompts[ctx.channelId];
    const lines = [
      '*Current Config*',
      `*System prompt:* ${channelConfig.systemPrompt ? `\`${channelConfig.systemPrompt.slice(0, 100)}${channelConfig.systemPrompt.length > 100 ? '...' : ''}\`` : '_none_'}`,
      `*Channel prompt:* ${currentPrompt ? `\`${currentPrompt.slice(0, 100)}${currentPrompt.length > 100 ? '...' : ''}\`` : '_none_'}`,
      `*Session strategy:* \`${channelConfig.sessionStrategy}\``,
      `*Agent:* \`${channelConfig.agentName || 'default'}\``,
    ];
    await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
    return;
  }

  if (subcommand.configAction === 'clear') {
    delete channelPrompts[ctx.channelId];
    platformConfig.channelPrompts = channelPrompts;
    await db
      .update(channelConfigs)
      .set({ platformConfig })
      .where(eq(channelConfigs.channelConfigId, channelConfig.channelConfigId));
    await postToResponseUrl(ctx.responseUrl, ':white_check_mark: Channel prompt cleared.', true);
    return;
  }

  if (subcommand.configAction === 'set' && subcommand.configPromptText) {
    channelPrompts[ctx.channelId] = subcommand.configPromptText;
    platformConfig.channelPrompts = channelPrompts;
    await db
      .update(channelConfigs)
      .set({ platformConfig })
      .where(eq(channelConfigs.channelConfigId, channelConfig.channelConfigId));
    await postToResponseUrl(
      ctx.responseUrl,
      `:white_check_mark: Channel prompt set to: \`${subcommand.configPromptText.slice(0, 100)}${subcommand.configPromptText.length > 100 ? '...' : ''}\``,
      true,
    );
  }
}

async function handleExportCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const { exportChannelAsMarkdown } = await import('./export');

  const oneDayAgo = String(Math.floor(Date.now() / 1000) - 86400);
  const result = await api.conversationsHistory(ctx.channelId, oneDayAgo, 200);

  if (!result.ok || !result.messages || result.messages.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':x: No messages found in the last 24 hours.', true);
    return;
  }

  const markdown = await exportChannelAsMarkdown({
    messages: result.messages.reverse(),
    api,
    channelId: ctx.channelId,
  });

  const fileBuffer = Buffer.from(markdown, 'utf-8');
  const filename = `channel-export-${ctx.channelId}-${new Date().toISOString().slice(0, 10)}.md`;

  await api.filesUploadV2({
    channel: ctx.channelId,
    filename,
    content: fileBuffer,
    title: `Channel Export — ${new Date().toISOString().slice(0, 10)}`,
  });

  await postToResponseUrl(ctx.responseUrl, ':white_check_mark: Channel export uploaded.', true);
}

export async function postToResponseUrl(responseUrl: string, text: string, ephemeral = false): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: ephemeral ? 'ephemeral' : 'in_channel',
      text,
    }),
  });
}
