import type {
  LegacyMessage,
  LegacyAssistantContent,
  LegacyToolContent,
  LegacyReasoningContent,
  LegacyImageContent,
  TransformedSession,
  TransformedMessage,
  TransformedPart,
} from './types';
import { sessionId, messageId, partId } from './id-generator';

const SKIPPED_TYPES = new Set([
  'status',
  'llm_response_start',
  'llm_response_end',
]);

export function transformThread(
  threadName: string,
  createdAt: string,
  updatedAt: string,
): TransformedSession {
  return {
    id: sessionId(),
    title: threadName || 'Untitled Chat',
    createdAt: new Date(createdAt).getTime(),
    updatedAt: new Date(updatedAt).getTime(),
  };
}

export function transformMessages(
  session: TransformedSession,
  legacyMessages: LegacyMessage[],
): { messages: TransformedMessage[]; parts: TransformedPart[] } {
  const messages: TransformedMessage[] = [];
  const parts: TransformedPart[] = [];

  const pendingToolResults = new Map<string, LegacyToolContent>();
  let lastAssistantMsgId: string | null = null;
  let lastUserMsgId: string | null = null;

  const sorted = legacyMessages
    .filter((m) => !SKIPPED_TYPES.has(m.type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const legacy of sorted) {
    switch (legacy.type) {
      case 'user':
      case 'image_context': {
        const result = transformUserMessage(session, legacy, lastAssistantMsgId);
        messages.push(result.message);
        parts.push(...result.parts);
        lastUserMsgId = result.message.id;
        break;
      }

      case 'assistant': {
        const result = transformAssistantMessage(
          session,
          legacy,
          lastUserMsgId,
          pendingToolResults,
        );
        messages.push(result.message);
        parts.push(...result.parts);
        lastAssistantMsgId = result.message.id;
        break;
      }

      case 'tool': {
        const content = legacy.content as LegacyToolContent;
        if (content.tool_call_id) {
          pendingToolResults.set(content.tool_call_id, content);
        }
        break;
      }

      case 'reasoning': {
        if (lastAssistantMsgId) {
          const part = transformReasoningPart(session, lastAssistantMsgId, legacy);
          parts.push(part);
        }
        break;
      }
    }
  }

  return { messages, parts };
}

function transformUserMessage(
  session: TransformedSession,
  legacy: LegacyMessage,
  _lastAssistantId: string | null,
): { message: TransformedMessage; parts: TransformedPart[] } {
  const msgId = messageId();
  const createdAt = new Date(legacy.created_at).getTime();

  const message: TransformedMessage = {
    id: msgId,
    sessionID: session.id,
    role: 'user',
    createdAt,
  };

  const textContent = extractUserText(legacy);

  const parts: TransformedPart[] = [
    {
      id: partId(),
      sessionID: session.id,
      messageID: msgId,
      type: 'text',
      data: {
        text: textContent,
        time: { start: createdAt, end: createdAt },
      },
    },
  ];

  return { message, parts };
}

function transformAssistantMessage(
  session: TransformedSession,
  legacy: LegacyMessage,
  parentUserMsgId: string | null,
  toolResults: Map<string, LegacyToolContent>,
): { message: TransformedMessage; parts: TransformedPart[] } {
  const msgId = messageId();
  const createdAt = new Date(legacy.created_at).getTime();
  const content = legacy.content as LegacyAssistantContent;

  const message: TransformedMessage = {
    id: msgId,
    sessionID: session.id,
    role: 'assistant',
    createdAt,
    parentID: parentUserMsgId ?? undefined,
  };

  const parts: TransformedPart[] = [];

  if (content.content) {
    parts.push({
      id: partId(),
      sessionID: session.id,
      messageID: msgId,
      type: 'text',
      data: {
        text: content.content,
        time: { start: createdAt, end: createdAt },
      },
    });
  }

  if (content.tool_calls) {
    for (const tc of content.tool_calls) {
      const toolResult = toolResults.get(tc.id);
      const toolPart = transformToolPart(session, msgId, tc, toolResult, createdAt);
      parts.push(toolPart);
      if (toolResult) {
        toolResults.delete(tc.id);
      }
    }
  }

  return { message, parts };
}

function transformToolPart(
  session: TransformedSession,
  assistantMsgId: string,
  toolCall: { id: string; function: { name: string; arguments: string } },
  toolResult: LegacyToolContent | undefined,
  createdAt: number,
): TransformedPart {
  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(toolCall.function.arguments);
  } catch {
    input = { raw: toolCall.function.arguments };
  }

  const state: Record<string, unknown> = toolResult
    ? {
        status: 'completed',
        input,
        output: toolResult.content || '',
        title: toolCall.function.name,
        metadata: {},
        time: { start: createdAt, end: createdAt },
      }
    : {
        status: 'completed',
        input,
        output: '',
        title: toolCall.function.name,
        metadata: {},
        time: { start: createdAt, end: createdAt },
      };

  return {
    id: partId(),
    sessionID: session.id,
    messageID: assistantMsgId,
    type: 'tool',
    data: {
      callID: toolCall.id,
      tool: toolCall.function.name,
      state,
    },
  };
}

function transformReasoningPart(
  session: TransformedSession,
  assistantMsgId: string,
  legacy: LegacyMessage,
): TransformedPart {
  const content = legacy.content as LegacyReasoningContent;
  const createdAt = new Date(legacy.created_at).getTime();

  return {
    id: partId(),
    sessionID: session.id,
    messageID: assistantMsgId,
    type: 'reasoning',
    data: {
      text: content.reasoning_content || '',
      time: { start: createdAt, end: createdAt },
    },
  };
}

function extractUserText(legacy: LegacyMessage): string {
  const content = legacy.content;

  if (typeof content === 'string') return content;

  if (legacy.type === 'image_context') {
    const imgContent = content as LegacyImageContent;
    if (Array.isArray(imgContent.content)) {
      return imgContent.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n') || '[Image]';
    }
  }

  if ('content' in content && typeof content.content === 'string') {
    return content.content;
  }

  return JSON.stringify(content);
}
