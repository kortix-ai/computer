/**
 * SessionTurn — renders a single user + assistant turn.
 *
 * Mirrors the Computer frontend's SessionTurn component logic.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useColorScheme } from 'nativewind';
import { SelectableMarkdownText } from '@/components/ui/selectable-markdown';
import type {
  Turn,
  MessageWithParts,
  SessionStatus,
  TextPart,
  ToolPart,
  ReasoningPart,
} from '@/lib/opencode/types';
import {
  collectTurnParts,
  findLastTextPart,
  isTextPart,
  isToolPart,
  isReasoningPart,
  isLastUserMessage,
  getWorkingState,
  getTurnError,
  getTurnStatus,
  getToolInfo,
  shouldShowToolPart,
  formatDuration,
} from '@/lib/opencode/turns';

interface SessionTurnProps {
  turn: Turn;
  allMessages: MessageWithParts[];
  sessionStatus?: SessionStatus;
  isBusy: boolean;
}

export function SessionTurn({
  turn,
  allMessages,
  sessionStatus,
  isBusy,
}: SessionTurnProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const allParts = useMemo(() => collectTurnParts(turn), [turn]);

  const isLast = useMemo(
    () => isLastUserMessage(turn.userMessage.info.id, allMessages),
    [turn.userMessage.info.id, allMessages],
  );

  const working = useMemo(
    () => getWorkingState(sessionStatus, isLast) || (isLast && isBusy),
    [sessionStatus, isLast, isBusy],
  );

  // Get user message text
  const userText = useMemo(() => {
    return turn.userMessage.parts
      .filter(isTextPart)
      .map((p) => (p as TextPart).text)
      .join('\n');
  }, [turn.userMessage.parts]);

  // Get response text
  const response = useMemo(() => {
    if (working) {
      // While working, get streaming text from last assistant message
      const lastMsg = turn.assistantMessages[turn.assistantMessages.length - 1];
      if (lastMsg) {
        return lastMsg.parts
          .filter(isTextPart)
          .map((p) => (p as TextPart).text)
          .join('');
      }
      return '';
    }
    const lastText = findLastTextPart(allParts);
    return lastText?.text ?? '';
  }, [working, turn.assistantMessages, allParts]);

  // Get tool parts
  const toolParts = useMemo(() => {
    return allParts
      .filter(({ part }) => isToolPart(part) && shouldShowToolPart(part as ToolPart))
      .map(({ part }) => part as ToolPart);
  }, [allParts]);

  // Get reasoning
  const reasoningText = useMemo(() => {
    return allParts
      .filter(({ part }) => isReasoningPart(part) && !!(part as ReasoningPart).text?.trim())
      .map(({ part }) => (part as ReasoningPart).text)
      .join('\n');
  }, [allParts]);

  const turnError = useMemo(() => getTurnError(turn), [turn]);
  const statusText = useMemo(
    () => (working ? getTurnStatus(allParts) : undefined),
    [working, allParts],
  );

  // Duration
  const duration = useMemo(() => {
    if (turn.assistantMessages.length === 0) return undefined;
    const firstMsg = turn.assistantMessages[0];
    const lastMsg = turn.assistantMessages[turn.assistantMessages.length - 1];
    const start = firstMsg.info.time.created;
    const end = (lastMsg.info.time as any).completed || Date.now();
    if (!start) return undefined;
    return end - start;
  }, [turn.assistantMessages]);

  return (
    <View className="mb-4">
      {/* User message */}
      <View className="flex-row justify-end mb-2 px-4">
        <View
          className={`rounded-2xl rounded-br-md px-4 py-3 max-w-[85%] ${
            isDark ? 'bg-zinc-800' : 'bg-zinc-100'
          }`}
        >
          <Text
            className={`text-[15px] leading-[22px] ${
              isDark ? 'text-zinc-100' : 'text-zinc-900'
            }`}
          >
            {userText}
          </Text>
        </View>
      </View>

      {/* Assistant response */}
      {(turn.assistantMessages.length > 0 || working) && (
        <View className="px-4">
          {/* Tool calls */}
          {toolParts.length > 0 && (
            <View className="mb-2">
              {toolParts.map((tool) => {
                const info = getToolInfo(tool.tool, tool.input);
                const isRunning =
                  tool.state.status === 'pending' || tool.state.status === 'running';
                const isError = tool.state.status === 'error';

                return (
                  <View
                    key={tool.id}
                    className={`flex-row items-center rounded-lg px-3 py-2 mb-1 ${
                      isDark ? 'bg-zinc-900' : 'bg-zinc-50'
                    }`}
                  >
                    <Text className="text-xs mr-2">
                      {isRunning ? '⏳' : isError ? '❌' : '✅'}
                    </Text>
                    <Text
                      className={`text-sm font-medium ${
                        isDark ? 'text-zinc-300' : 'text-zinc-700'
                      }`}
                      numberOfLines={1}
                    >
                      {info.title}
                    </Text>
                    {info.subtitle && (
                      <Text
                        className={`text-sm ml-1 flex-1 ${
                          isDark ? 'text-zinc-500' : 'text-zinc-400'
                        }`}
                        numberOfLines={1}
                      >
                        {info.subtitle}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Reasoning */}
          {!!reasoningText && (
            <View
              className={`rounded-lg px-3 py-2 mb-2 border-l-2 ${
                isDark
                  ? 'bg-zinc-900/50 border-zinc-700'
                  : 'bg-zinc-50 border-zinc-300'
              }`}
            >
              <Text
                className={`text-xs italic ${
                  isDark ? 'text-zinc-500' : 'text-zinc-400'
                }`}
                numberOfLines={3}
              >
                {reasoningText}
              </Text>
            </View>
          )}

          {/* Response text (rendered as markdown) */}
          {!!response && (
            <SelectableMarkdownText isDark={isDark}>
              {response}
            </SelectableMarkdownText>
          )}

          {/* Working indicator */}
          {working && !response && (
            <View className="flex-row items-center py-2">
              <View className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
              <Text
                className={`text-sm ${
                  isDark ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                {statusText || 'Thinking...'}
              </Text>
            </View>
          )}

          {/* Working status with response */}
          {working && !!response && (
            <View className="flex-row items-center mt-1">
              <View className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5" />
              <Text
                className={`text-xs ${
                  isDark ? 'text-zinc-500' : 'text-zinc-400'
                }`}
              >
                {statusText || 'Working...'}
              </Text>
            </View>
          )}

          {/* Error */}
          {!!turnError && !working && (
            <View className="mt-2 rounded-lg bg-red-500/10 px-3 py-2">
              <Text className="text-sm text-red-500">{turnError}</Text>
            </View>
          )}

          {/* Duration (when done) */}
          {!working && duration && duration > 0 && (
            <Text
              className={`text-xs mt-1 ${
                isDark ? 'text-zinc-600' : 'text-zinc-400'
              }`}
            >
              {formatDuration(duration)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
