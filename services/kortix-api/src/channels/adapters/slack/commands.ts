import type { Context } from 'hono';
import type { ChannelEngine } from '../adapter';
import type { ChannelConfig } from '@kortix/db';
import { channelConfigs, sandboxes, channelSessions } from '@kortix/db';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../shared/db';
import { verifySlackRequest, findConfigByTeamId } from './utils';
import { SlackApi } from './api';
import { SandboxConnector } from '../../core/sandbox-connector';
import type { NormalizedMessage, SandboxTarget } from '../../types';

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
  const ctx: CommandContext = { responseUrl, userId, userName, channelId, triggerId };

  if (subcommand.type === 'help') {
    return c.json({
      response_type: 'ephemeral',
      text: [
        '*Kortix Slash Commands*',
        '`/kortix <question>` — Ask anything',
        '`/kortix models` — List available models',
        '`/kortix agents` — List available agents',
        '`/kortix status` — Show current session info',
        '`/kortix share` — Generate a shareable session link',
        '`/kortix diff` — Show recent git changes',
        '`/kortix digest #channel` — Summarize recent channel activity',
        '`/kortix config prompt <text>` — Set a channel-specific system prompt',
        '`/kortix config prompt clear` — Clear channel prompt',
        '`/kortix config show` — Show current config for this channel',
        '`/kortix export` — Export last 24h of channel messages as markdown',
        '`/kortix help` — Show this help',
      ].join('\n'),
    }, 200);
  }

  if (subcommand.type === 'models') {
    handleModelsCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Models command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':mag: Fetching models...' }, 200);
  }

  if (subcommand.type === 'agents') {
    handleAgentsCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Agents command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':mag: Fetching agents...' }, 200);
  }

  if (subcommand.type === 'status') {
    handleStatusCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Status command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':bar_chart: Fetching status...' }, 200);
  }

  if (subcommand.type === 'share') {
    handleShareCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Share command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':link: Generating share link...' }, 200);
  }

  if (subcommand.type === 'diff') {
    handleDiffCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Diff command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':file_folder: Fetching diff...' }, 200);
  }

  if (subcommand.type === 'config') {
    handleConfigCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Config command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':gear: Processing...' }, 200);
  }

  if (subcommand.type === 'export') {
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
  type: 'help' | 'digest' | 'prompt' | 'config' | 'export' | 'models' | 'agents' | 'status' | 'share' | 'diff';
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

  if (lower === 'models') {
    return { type: 'models', prompt: '' };
  }

  if (lower === 'agents') {
    return { type: 'agents', prompt: '' };
  }

  if (lower === 'status') {
    return { type: 'status', prompt: '' };
  }

  if (lower === 'share') {
    return { type: 'share', prompt: '' };
  }

  if (lower === 'diff') {
    return { type: 'diff', prompt: '' };
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

async function resolveSandboxTarget(sandboxId: string): Promise<SandboxTarget | null> {
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

async function getConnector(channelConfig: ChannelConfig): Promise<SandboxConnector | null> {
  const target = await resolveSandboxTarget(channelConfig.sandboxId);
  if (!target) return null;
  return new SandboxConnector(target);
}

async function findActiveSessionId(channelConfig: ChannelConfig, userId: string): Promise<string | null> {
  const sessions = await db
    .select()
    .from(channelSessions)
    .where(eq(channelSessions.channelConfigId, channelConfig.channelConfigId));

  if (sessions.length === 0) return null;

  sessions.sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
  const userSession = sessions.find((s) => s.strategyKey.includes(userId));
  if (userSession) return userSession.sessionId;

  return sessions[0].sessionId;
}

async function handleModelsCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const connector = await getConnector(channelConfig);
  if (!connector) {
    await postToResponseUrl(ctx.responseUrl, ':x: Sandbox not found.', true);
    return;
  }

  const providers = await connector.listProviders();
  if (providers.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':x: No providers available.', true);
    return;
  }

  const meta = channelConfig.metadata as Record<string, unknown> | null;
  const currentModel = (meta?.model as Record<string, unknown>)?.modelID as string | undefined;

  const lines: string[] = ['*Available Models*\n'];
  for (const provider of providers) {
    lines.push(`*${provider.name || provider.id}*`);
    for (const model of provider.models) {
      const isCurrent = currentModel && model.id === currentModel;
      const marker = isCurrent ? ' :white_check_mark:' : '';
      lines.push(`  \`${model.id}\` — ${model.name}${marker}`);
    }
    lines.push('');
  }

  lines.push('_Switch with_ `use <model-name>` _in any channel message._');

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleAgentsCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const connector = await getConnector(channelConfig);
  if (!connector) {
    await postToResponseUrl(ctx.responseUrl, ':x: Sandbox not found.', true);
    return;
  }

  const agents = await connector.listAgents();
  if (agents.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':x: No agents available.', true);
    return;
  }

  const currentAgent = channelConfig.agentName || 'default';

  const lines: string[] = ['*Available Agents*\n'];
  for (const agent of agents) {
    const isCurrent = agent.name === currentAgent || (agent.isDefault && currentAgent === 'default');
    const marker = isCurrent ? ' :white_check_mark:' : '';
    const desc = agent.description ? ` — ${agent.description}` : '';
    lines.push(`\`${agent.name}\`${desc}${marker}`);
  }

  lines.push('\n_Switch with_ `use agent <name>` _in any channel message._');

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleStatusCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const meta = channelConfig.metadata as Record<string, unknown> | null;
  const currentModel = (meta?.model as Record<string, unknown>)?.modelID as string | undefined;
  const currentAgent = channelConfig.agentName || 'default';
  const strategy = channelConfig.sessionStrategy || 'per-user';

  const sessionId = await findActiveSessionId(channelConfig, ctx.userId);

  const lines: string[] = [
    '*Session Status*\n',
    `*Model:* \`${currentModel || 'claude-3-5-haiku-20241022'}\``,
    `*Agent:* \`${currentAgent}\``,
    `*Session strategy:* \`${strategy}\``,
    `*Session ID:* ${sessionId ? `\`${sessionId}\`` : '_none active_'}`,
  ];

  if (sessionId) {
    const platformConfig = channelConfig.platformConfig as Record<string, unknown> | null;
    const webUrl = platformConfig?.webBaseUrl as string | undefined;
    if (webUrl) {
      lines.push(`*Web UI:* ${webUrl}/session/${sessionId}`);
    }
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleShareCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const connector = await getConnector(channelConfig);
  if (!connector) {
    await postToResponseUrl(ctx.responseUrl, ':x: Sandbox not found.', true);
    return;
  }

  const sessionId = await findActiveSessionId(channelConfig, ctx.userId);
  if (!sessionId) {
    await postToResponseUrl(ctx.responseUrl, ':x: No active session to share.', true);
    return;
  }

  const result = await connector.shareSession(sessionId);
  if (!result) {
    await postToResponseUrl(ctx.responseUrl, ':x: Failed to generate share link.', true);
    return;
  }

  await postToResponseUrl(ctx.responseUrl, `:link: *Shared session:* ${result.shareUrl}`);
}

async function handleDiffCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const connector = await getConnector(channelConfig);
  if (!connector) {
    await postToResponseUrl(ctx.responseUrl, ':x: Sandbox not found.', true);
    return;
  }

  const sessionId = await findActiveSessionId(channelConfig, ctx.userId);
  if (!sessionId) {
    await postToResponseUrl(ctx.responseUrl, ':x: No active session found.', true);
    return;
  }

  const diff = await connector.getSessionDiff(sessionId);
  if (!diff) {
    await postToResponseUrl(ctx.responseUrl, ':white_check_mark: No changes detected.', true);
    return;
  }

  if (diff.length <= 3000) {
    await postToResponseUrl(ctx.responseUrl, `*Recent Changes*\n\`\`\`\n${diff}\n\`\`\``, true);
  } else {
    const credentials = channelConfig.credentials as Record<string, unknown>;
    const botToken = credentials?.botToken as string;
    if (!botToken) {
      await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token for file upload.', true);
      return;
    }
    const api = new SlackApi(botToken);
    await api.filesUploadV2({
      channel: ctx.channelId,
      filename: `diff-${sessionId.slice(0, 8)}.diff`,
      content: Buffer.from(diff, 'utf-8'),
      title: 'Session Diff',
    });
    await postToResponseUrl(ctx.responseUrl, ':white_check_mark: Diff uploaded as file.', true);
  }
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
