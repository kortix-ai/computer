import type { Context } from 'hono';
import type { ChannelEngine } from '../adapter';
import { verifySlackRequest, findConfigByTeamId } from './utils';
import { replyPermissionRequest } from '../../core/pending-permissions';
import { SlackApi } from './api';
import { exportThreadAsMarkdown } from './export';
import type { NormalizedMessage } from '../../types';

export async function handleSlackInteractivity(
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
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    return c.json({ error: 'Missing payload' }, 400);
  }

  let payload: InteractivityPayload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return c.json({ error: 'Invalid payload JSON' }, 400);
  }

  switch (payload.type) {
    case 'block_actions':
      handleBlockActions(payload).catch((err) => {
        console.error('[SLACK/INTERACTIVITY] block_actions handler failed:', err);
      });
      return c.json({ ok: true }, 200);

    case 'message_action':
      if (payload.callback_id === 'export_thread') {
        handleExportThread(payload).catch((err) => {
          console.error('[SLACK/INTERACTIVITY] export_thread handler failed:', err);
        });
      } else {
        handleMessageAction(payload, engine).catch((err) => {
          console.error('[SLACK/INTERACTIVITY] message_action handler failed:', err);
        });
      }
      return c.json({ ok: true }, 200);

    default:
      console.warn(`[SLACK/INTERACTIVITY] Unhandled payload type: ${payload.type}`);
      return c.json({ ok: true }, 200);
  }
}

interface InteractivityPayload {
  type: string;
  team?: { id: string };
  user?: { id: string; username?: string; name?: string };
  channel?: { id: string };
  message?: {
    ts: string;
    thread_ts?: string;
    text?: string;
  };
  actions?: Array<{
    action_id: string;
    value?: string;
    block_id?: string;
  }>;
  callback_id?: string;
  trigger_id?: string;
  response_url?: string;
}

async function handleBlockActions(payload: InteractivityPayload): Promise<void> {
  const actions = payload.actions || [];

  for (const action of actions) {
    if (action.action_id === 'permission_approve' || action.action_id === 'permission_reject') {
      const approved = action.action_id === 'permission_approve';
      const permissionId = action.value || '';

      if (!permissionId) {
        console.warn('[SLACK/INTERACTIVITY] Permission action missing value (permissionId)');
        continue;
      }

      const found = replyPermissionRequest(permissionId, approved);

      if (payload.response_url) {
        const statusText = approved ? ':white_check_mark: *Approved*' : ':x: *Rejected*';
        const userName = payload.user?.username || payload.user?.name || 'User';

        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: true,
            text: `${statusText} by ${userName}${!found ? ' (request expired)' : ''}`,
          }),
        });
      }
    }
  }
}

async function handleMessageAction(
  payload: InteractivityPayload,
  engine: ChannelEngine,
): Promise<void> {
  if (payload.callback_id !== 'ask_kortix') {
    console.warn(`[SLACK/INTERACTIVITY] Unknown callback_id: ${payload.callback_id}`);
    return;
  }

  const teamId = payload.team?.id;
  if (!teamId) return;

  const channelConfig = await findConfigByTeamId(teamId);
  if (!channelConfig) {
    console.warn(`[SLACK/INTERACTIVITY] No config for team: ${teamId}`);
    return;
  }

  const messageText = payload.message?.text || '';
  if (!messageText) return;

  const channelId = payload.channel?.id || '';
  const messageTs = payload.message?.ts || '';
  const threadTs = payload.message?.thread_ts || messageTs;

  const normalized: NormalizedMessage = {
    externalId: messageTs,
    channelType: 'slack',
    channelConfigId: channelConfig.channelConfigId,
    chatType: 'group',
    content: `Analyze this message and provide insights:\n\n${messageText}`,
    attachments: [],
    platformUser: {
      id: payload.user?.id || '',
      name: payload.user?.username || payload.user?.name || 'Unknown',
    },
    threadId: threadTs,
    groupId: channelId,
    raw: {
      event: { channel: channelId },
      _messageAction: true,
    },
  };

  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (botToken) {
    const api = new SlackApi(botToken);
    await api.postMessage({
      channel: channelId,
      text: ':brain: Analyzing message...',
      thread_ts: threadTs,
    });
  }

  await engine.processMessage(normalized);
}

async function handleExportThread(payload: InteractivityPayload): Promise<void> {
  const teamId = payload.team?.id;
  if (!teamId) return;

  const channelConfig = await findConfigByTeamId(teamId);
  if (!channelConfig) {
    console.warn(`[SLACK/INTERACTIVITY] No config for team: ${teamId}`);
    return;
  }

  const credentials = channelConfig.credentials as Record<string, unknown>;
  const botToken = credentials?.botToken as string;
  if (!botToken) return;

  const api = new SlackApi(botToken);
  const channelId = payload.channel?.id || '';
  const messageTs = payload.message?.ts || '';
  const threadTs = payload.message?.thread_ts || messageTs;

  if (!channelId || !threadTs) return;

  const markdown = await exportThreadAsMarkdown({
    channel: channelId,
    threadTs,
    api,
  });

  const fileBuffer = Buffer.from(markdown, 'utf-8');
  const filename = `thread-export-${threadTs}.md`;

  await api.filesUploadV2({
    channel: channelId,
    threadTs,
    filename,
    content: fileBuffer,
    title: `Thread Export — ${new Date().toISOString().slice(0, 10)}`,
  });
}
