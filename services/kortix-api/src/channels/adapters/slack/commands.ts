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
import { config as appConfig } from '../../../config';

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

  // Auto-join the channel so the bot can read/write like a workspace member
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string | undefined;
  if (botToken && channelId) {
    const joinApi = new SlackApi(botToken);
    joinApi.conversationsJoin(channelId).catch((err) => {
      console.warn(`[SLACK/COMMANDS] Auto-join channel ${channelId} failed:`, err);
    });
  }

  const subcommand = parseSubcommand(text);
  const ctx: CommandContext = { responseUrl, userId, userName, channelId, triggerId };

  if (subcommand.type === 'help') {
    return c.json({
      response_type: 'ephemeral',
      text: [
        '*Kortix Slash Commands*',
        '',
        '*General*',
        '`/kortix <question>` — Ask anything',
        '`/kortix models` — List available models',
        '`/kortix agents` — List available agents',
        '`/kortix status` — Show current session info',
        '`/kortix share` — Generate a shareable session link',
        '`/kortix diff` — Show recent git changes',
        '`/kortix digest #channel` — Summarize recent channel activity',
        '`/kortix export` — Export last 24h of channel messages as markdown',
        '`/kortix link` — Link or change the connected instance',
        '',
        '*Search*',
        '`/kortix search <query>` — Search messages across the workspace',
        '`/kortix find <query>` — Search files across the workspace',
        '`/kortix whois <query>` — Search users in the workspace',
        '',
        '*Channels*',
        '`/kortix channel create <name>` — Create a new channel',
        '`/kortix channel topic <text>` — Set channel topic',
        '`/kortix channel archive` — Archive current channel',
        '',
        '*Messaging*',
        '`/kortix dm @user <message>` — Send a DM to a user',
        '',
        '*Pins*',
        '`/kortix pin` — Pin the most recent message',
        '`/kortix unpin` — Unpin the most recent message',
        '`/kortix pins` — List pinned items in this channel',
        '',
        '*Teams*',
        '`/kortix team <handle>` — List members of a user group',
        '',
        '*Bookmarks*',
        '`/kortix bookmark <url> [title]` — Add a channel bookmark',
        '`/kortix bookmarks` — List channel bookmarks',
        '',
        '*Reminders*',
        '`/kortix remind [@user] <time>: <message>` — Set a reminder',
        '',
        '*Config*',
        '`/kortix config prompt <text>` — Set a channel-specific system prompt',
        '`/kortix config prompt clear` — Clear channel prompt',
        '`/kortix config show` — Show current config for this channel',
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

  if (subcommand.type === 'link') {
    handleLinkCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Link command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':link: Fetching instances...' }, 200);
  }

  if (subcommand.type === 'export') {
    handleExportCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Export command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':hourglass_flowing_sand: Exporting...' }, 200);
  }

  if (subcommand.type === 'search') {
    handleSearchCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Search command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':mag: Searching messages...' }, 200);
  }

  if (subcommand.type === 'find') {
    handleFindCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Find command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':mag: Searching files...' }, 200);
  }

  if (subcommand.type === 'whois') {
    handleWhoisCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Whois command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':mag: Searching users...' }, 200);
  }

  if (subcommand.type === 'channel') {
    handleChannelCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Channel command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':hash: Processing...' }, 200);
  }

  if (subcommand.type === 'dm') {
    handleDmCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] DM command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':envelope: Sending DM...' }, 200);
  }

  if (subcommand.type === 'pin') {
    handlePinCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Pin command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':pushpin: Pinning...' }, 200);
  }

  if (subcommand.type === 'unpin') {
    handleUnpinCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Unpin command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':pushpin: Unpinning...' }, 200);
  }

  if (subcommand.type === 'pins') {
    handlePinsListCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Pins command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':pushpin: Fetching pins...' }, 200);
  }

  if (subcommand.type === 'team') {
    handleTeamCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Team command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':busts_in_silhouette: Fetching team...' }, 200);
  }

  if (subcommand.type === 'bookmark') {
    handleBookmarkCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Bookmark command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':bookmark: Adding bookmark...' }, 200);
  }

  if (subcommand.type === 'bookmarks') {
    handleBookmarksListCommand(channelConfig, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Bookmarks command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':bookmark: Fetching bookmarks...' }, 200);
  }

  if (subcommand.type === 'remind') {
    handleRemindCommand(channelConfig, subcommand, ctx).catch((err) => {
      console.error('[SLACK/COMMANDS] Remind command failed:', err);
      postToResponseUrl(responseUrl, `:x: Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
    });
    return c.json({ response_type: 'ephemeral', text: ':bell: Setting reminder...' }, 200);
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
  type: 'help' | 'digest' | 'prompt' | 'config' | 'export' | 'models' | 'agents' | 'status' | 'share' | 'diff' | 'link'
    | 'search' | 'find' | 'whois' | 'channel' | 'dm' | 'pin' | 'unpin' | 'pins' | 'team' | 'bookmark' | 'bookmarks' | 'remind';
  prompt: string;
  digestChannel?: string;
  configAction?: 'set' | 'clear' | 'show';
  configPromptText?: string;
  searchQuery?: string;
  channelAction?: 'create' | 'topic' | 'archive';
  channelName?: string;
  channelText?: string;
  dmTarget?: string;
  dmMessage?: string;
  teamHandle?: string;
  bookmarkUrl?: string;
  bookmarkTitle?: string;
  reminderTarget?: string;
  reminderTime?: string;
  reminderText?: string;
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

  if (lower === 'link') {
    return { type: 'link', prompt: '' };
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

  // search <query>
  if (lower.startsWith('search ')) {
    const query = text.slice(7).trim();
    if (query) return { type: 'search', prompt: '', searchQuery: query };
    return { type: 'help', prompt: '' };
  }

  // find <query>
  if (lower.startsWith('find ')) {
    const query = text.slice(5).trim();
    if (query) return { type: 'find', prompt: '', searchQuery: query };
    return { type: 'help', prompt: '' };
  }

  // whois <query>
  if (lower.startsWith('whois ')) {
    const query = text.slice(6).trim();
    if (query) return { type: 'whois', prompt: '', searchQuery: query };
    return { type: 'help', prompt: '' };
  }

  // channel create <name> | channel topic <text> | channel archive
  if (lower.startsWith('channel ')) {
    const rest = text.slice(8).trim();
    const restLower = rest.toLowerCase();
    if (restLower.startsWith('create ')) {
      const name = rest.slice(7).trim();
      if (name) return { type: 'channel', prompt: '', channelAction: 'create', channelName: name };
    }
    if (restLower.startsWith('topic ')) {
      const topic = rest.slice(6).trim();
      if (topic) return { type: 'channel', prompt: '', channelAction: 'topic', channelText: topic };
    }
    if (restLower === 'archive') {
      return { type: 'channel', prompt: '', channelAction: 'archive' };
    }
    return { type: 'help', prompt: '' };
  }

  // dm @user <message>
  if (lower.startsWith('dm ')) {
    const rest = text.slice(3).trim();
    const mentionMatch = rest.match(/^<@(\w+)(?:\|[^>]*)?>?\s+([\s\S]*)/);
    if (mentionMatch && mentionMatch[2].trim()) {
      return { type: 'dm', prompt: '', dmTarget: mentionMatch[1], dmMessage: mentionMatch[2].trim() };
    }
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx > 0) {
      return { type: 'dm', prompt: '', dmTarget: rest.slice(0, spaceIdx), dmMessage: rest.slice(spaceIdx + 1).trim() };
    }
    return { type: 'help', prompt: '' };
  }

  // pin / unpin / pins
  if (lower === 'pin') return { type: 'pin', prompt: '' };
  if (lower === 'unpin') return { type: 'unpin', prompt: '' };
  if (lower === 'pins') return { type: 'pins', prompt: '' };

  // team <handle>
  if (lower.startsWith('team ')) {
    const handle = text.slice(5).trim();
    if (handle) return { type: 'team', prompt: '', teamHandle: handle };
    return { type: 'help', prompt: '' };
  }

  // bookmark <url> [title]
  if (lower.startsWith('bookmark ')) {
    const rest = text.slice(9).trim();
    const urlMatch = rest.match(/^(<[^>]+>|\S+)\s*(.*)/);
    if (urlMatch) {
      const url = urlMatch[1].replace(/^<|>$/g, '');
      const title = urlMatch[2].trim() || url;
      return { type: 'bookmark', prompt: '', bookmarkUrl: url, bookmarkTitle: title };
    }
    return { type: 'help', prompt: '' };
  }
  if (lower === 'bookmarks') return { type: 'bookmarks', prompt: '' };

  // remind [@user] <time>: <message>
  if (lower.startsWith('remind ')) {
    const rest = text.slice(7).trim();
    let target: string | undefined;
    let remaining = rest;

    const userMatch = remaining.match(/^<@(\w+)(?:\|[^>]*)?>?\s+/);
    if (userMatch) {
      target = userMatch[1];
      remaining = remaining.slice(userMatch[0].length);
    }

    const colonIdx = remaining.indexOf(':');
    if (colonIdx !== -1) {
      const time = remaining.slice(0, colonIdx).trim();
      const msg = remaining.slice(colonIdx + 1).trim();
      if (time && msg) return { type: 'remind', prompt: '', reminderTarget: target, reminderTime: time, reminderText: msg };
    }

    // Fallback: try "in X unit" pattern
    const inMatch = remaining.match(/^(in\s+\d+\s+\w+)\s+([\s\S]*)/i);
    if (inMatch) {
      return { type: 'remind', prompt: '', reminderTarget: target, reminderTime: inMatch[1], reminderText: inMatch[2].trim() };
    }

    // Last resort: first token is time, rest is message
    const spaceIdx = remaining.indexOf(' ');
    if (spaceIdx > 0) {
      return { type: 'remind', prompt: '', reminderTarget: target, reminderTime: remaining.slice(0, spaceIdx), reminderText: remaining.slice(spaceIdx + 1).trim() };
    }
    return { type: 'help', prompt: '' };
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
  if (!channelConfig.sandboxId) return null;
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

  const allAgents = await connector.listAgents();
  // Filter out subagents — only show primary and "all" mode agents
  const agents = allAgents.filter((a) => a.mode !== 'subagent');
  if (agents.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':x: No agents available.', true);
    return;
  }

  const currentAgent = channelConfig.agentName || 'default';

  const lines: string[] = ['*Available Agents*\n'];
  for (const agent of agents) {
    const isCurrent = agent.name === currentAgent;
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
    `*Model:* \`${currentModel || 'kortix/power'}\``,
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

async function handleLinkCommand(
  channelConfig: ChannelConfig,
  ctx: CommandContext,
): Promise<void> {
  const instances = await db
    .select({ sandboxId: sandboxes.sandboxId, name: sandboxes.name, status: sandboxes.status })
    .from(sandboxes)
    .where(eq(sandboxes.accountId, channelConfig.accountId));

  if (instances.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':x: No instances found for your account.', true);
    return;
  }

  const currentSandboxId = channelConfig.sandboxId;
  const frontendUrl = appConfig.FRONTEND_URL;

  const lines: string[] = ['*Available Instances*\n'];
  for (const inst of instances) {
    const isCurrent = currentSandboxId && inst.sandboxId === currentSandboxId;
    const marker = isCurrent ? ' :white_check_mark: _(current)_' : '';
    lines.push(`\`${inst.name}\` — ${inst.status}${marker}`);
  }

  lines.push(`\n<${frontendUrl}/channels|Link an instance in the dashboard>`);

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
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

  // Auto-join the target channel so we can read its history
  await api.conversationsJoin(channelId).catch(() => {});

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

async function handleSearchCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const result = await api.searchMessages(subcommand.searchQuery!, { count: 5 });

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Search failed: ${result.error}`, true);
    return;
  }

  const matches = result.messages?.matches || [];
  if (matches.length === 0) {
    await postToResponseUrl(ctx.responseUrl, `:mag: No results found for "${subcommand.searchQuery}".`, true);
    return;
  }

  const lines = [`*Search results for "${subcommand.searchQuery}"* (${result.messages?.total || 0} total)\n`];
  for (const match of matches.slice(0, 5)) {
    const snippet = (match.text || '').slice(0, 150).replace(/\n/g, ' ');
    lines.push(`> ${snippet}`);
    lines.push(`_#${match.channel?.name || 'unknown'}_ — <${match.permalink}|View message>\n`);
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleFindCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const result = await api.searchFiles(subcommand.searchQuery!, { count: 5 });

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: File search failed: ${result.error}`, true);
    return;
  }

  const matches = result.files?.matches || [];
  if (matches.length === 0) {
    await postToResponseUrl(ctx.responseUrl, `:mag: No files found for "${subcommand.searchQuery}".`, true);
    return;
  }

  const lines = [`*File results for "${subcommand.searchQuery}"* (${result.files?.total || 0} total)\n`];
  for (const match of matches.slice(0, 5)) {
    lines.push(`\`${match.name}\` (${match.filetype}) — <${match.permalink}|View file>`);
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleWhoisCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const result = await api.searchUsers(subcommand.searchQuery!, { count: 5 });

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: User search failed: ${result.error}`, true);
    return;
  }

  const matches = result.users?.matches || [];
  if (matches.length === 0) {
    await postToResponseUrl(ctx.responseUrl, `:mag: No users found for "${subcommand.searchQuery}".`, true);
    return;
  }

  const lines = [`*User results for "${subcommand.searchQuery}"* (${result.users?.total || 0} total)\n`];
  for (const match of matches.slice(0, 5)) {
    const displayName = match.profile?.display_name || match.real_name || match.name;
    const email = match.profile?.email ? ` — ${match.profile.email}` : '';
    lines.push(`<@${match.id}> *${displayName}*${email}`);
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleChannelCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);

  if (subcommand.channelAction === 'create') {
    const result = await api.conversationsCreate(subcommand.channelName!);
    if (!result.ok) {
      await postToResponseUrl(ctx.responseUrl, `:x: Failed to create channel: ${result.error}`, true);
      return;
    }
    await postToResponseUrl(ctx.responseUrl, `:white_check_mark: Channel <#${result.channel?.id}> created.`);
    return;
  }

  if (subcommand.channelAction === 'topic') {
    const result = await api.conversationsSetTopic(ctx.channelId, subcommand.channelText!);
    if (!result.ok) {
      await postToResponseUrl(ctx.responseUrl, `:x: Failed to set topic: ${result.error}`, true);
      return;
    }
    await postToResponseUrl(ctx.responseUrl, ':white_check_mark: Channel topic updated.', true);
    return;
  }

  if (subcommand.channelAction === 'archive') {
    const result = await api.conversationsArchive(ctx.channelId);
    if (!result.ok) {
      await postToResponseUrl(ctx.responseUrl, `:x: Failed to archive channel: ${result.error}`, true);
      return;
    }
    await postToResponseUrl(ctx.responseUrl, ':white_check_mark: Channel archived.', true);
  }
}

async function handleDmCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const openResult = await api.conversationsOpen(subcommand.dmTarget!);
  if (!openResult.ok || !openResult.channel?.id) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to open DM: ${openResult.error}`, true);
    return;
  }

  const result = await api.postMessage({
    channel: openResult.channel.id,
    text: subcommand.dmMessage || '',
  });

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to send DM: ${result.error}`, true);
    return;
  }

  await postToResponseUrl(ctx.responseUrl, `:white_check_mark: DM sent to <@${subcommand.dmTarget}>.`, true);
}

async function handlePinCommand(
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
  const history = await api.conversationsHistory(ctx.channelId, undefined, 1);
  if (!history.ok || !history.messages?.[0]) {
    await postToResponseUrl(ctx.responseUrl, ':x: No recent message to pin.', true);
    return;
  }

  const result = await api.pinsAdd(ctx.channelId, history.messages[0].ts);
  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to pin: ${result.error}`, true);
    return;
  }

  await postToResponseUrl(ctx.responseUrl, ':pushpin: Message pinned.', true);
}

async function handleUnpinCommand(
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
  const history = await api.conversationsHistory(ctx.channelId, undefined, 1);
  if (!history.ok || !history.messages?.[0]) {
    await postToResponseUrl(ctx.responseUrl, ':x: No recent message to unpin.', true);
    return;
  }

  const result = await api.pinsRemove(ctx.channelId, history.messages[0].ts);
  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to unpin: ${result.error}`, true);
    return;
  }

  await postToResponseUrl(ctx.responseUrl, ':pushpin: Message unpinned.', true);
}

async function handlePinsListCommand(
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
  const result = await api.pinsList(ctx.channelId);

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to list pins: ${result.error}`, true);
    return;
  }

  const items = result.items || [];
  if (items.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':pushpin: No pinned items in this channel.', true);
    return;
  }

  const lines = [`*Pinned items* (${items.length})\n`];
  for (const item of items.slice(0, 10)) {
    if (item.message) {
      const snippet = (item.message.text || '').slice(0, 100).replace(/\n/g, ' ');
      lines.push(`> ${snippet} — <${item.message.permalink}|View>`);
    } else if (item.file) {
      lines.push(`\`${item.file.name}\` — <${item.file.permalink}|View>`);
    }
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleTeamCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const groupsResult = await api.usergroupsList();

  if (!groupsResult.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to list groups: ${groupsResult.error}`, true);
    return;
  }

  const handle = subcommand.teamHandle!.replace(/^@/, '');
  const group = groupsResult.usergroups?.find(
    (g) => g.handle === handle || g.name.toLowerCase() === handle.toLowerCase(),
  );

  if (!group) {
    await postToResponseUrl(ctx.responseUrl, `:x: User group "${handle}" not found.`, true);
    return;
  }

  const usersResult = await api.usergroupsUsersList(group.id);
  if (!usersResult.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to list group members: ${usersResult.error}`, true);
    return;
  }

  const userIds = usersResult.users || [];
  const lines = [`*${group.name}* (@${group.handle}) — ${userIds.length} members\n`];

  for (const uid of userIds.slice(0, 20)) {
    lines.push(`<@${uid}>`);
  }

  if (userIds.length > 20) {
    lines.push(`_...and ${userIds.length - 20} more_`);
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleBookmarkCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const result = await api.bookmarksAdd(
    ctx.channelId,
    subcommand.bookmarkTitle || subcommand.bookmarkUrl!,
    'link',
    subcommand.bookmarkUrl,
  );

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to add bookmark: ${result.error}`, true);
    return;
  }

  await postToResponseUrl(ctx.responseUrl, `:bookmark: Bookmark added: ${subcommand.bookmarkUrl}`, true);
}

async function handleBookmarksListCommand(
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
  const result = await api.bookmarksList(ctx.channelId);

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to list bookmarks: ${result.error}`, true);
    return;
  }

  const bookmarks = result.bookmarks || [];
  if (bookmarks.length === 0) {
    await postToResponseUrl(ctx.responseUrl, ':bookmark: No bookmarks in this channel.', true);
    return;
  }

  const lines = [`*Channel Bookmarks* (${bookmarks.length})\n`];
  for (const bm of bookmarks) {
    lines.push(`<${bm.link}|${bm.title}>`);
  }

  await postToResponseUrl(ctx.responseUrl, lines.join('\n'), true);
}

async function handleRemindCommand(
  channelConfig: ChannelConfig,
  subcommand: Subcommand,
  ctx: CommandContext,
): Promise<void> {
  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) {
    await postToResponseUrl(ctx.responseUrl, ':x: Missing bot token.', true);
    return;
  }

  const api = new SlackApi(botToken);
  const result = await api.remindersAdd(
    subcommand.reminderText || 'Reminder',
    subcommand.reminderTime || 'in 1 hour',
    subcommand.reminderTarget,
  );

  if (!result.ok) {
    await postToResponseUrl(ctx.responseUrl, `:x: Failed to set reminder: ${result.error}`, true);
    return;
  }

  const target = subcommand.reminderTarget ? `<@${subcommand.reminderTarget}>` : 'you';
  await postToResponseUrl(ctx.responseUrl, `:bell: Reminder set for ${target}: "${subcommand.reminderText}"`, true);
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
