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
  QuestionRequest,
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
  pendingQuestions?: QuestionRequest[];
}

export function SessionTurn({
  turn,
  allMessages,
  sessionStatus,
  isBusy,
  pendingQuestions = [],
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

  // Get tool parts — hide question tool when there's a pending question for it
  const toolParts = useMemo(() => {
    const pendingCallIDs = new Set(
      pendingQuestions.filter((q) => q.tool).map((q) => q.tool!.callID),
    );
    return allParts
      .filter(({ part }) => {
        if (!isToolPart(part)) return false;
        const tp = part as ToolPart;
        if (!shouldShowToolPart(tp)) return false;
        // Hide question tool parts that have a pending question
        if (tp.tool === 'question' && pendingCallIDs.has(tp.callID)) return false;
        return true;
      })
      .map(({ part }) => part as ToolPart);
  }, [allParts, pendingQuestions]);

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
        <View className="rounded-2xl rounded-br-md px-4 py-3 max-w-[85%] bg-card border border-border">
          <Text className="text-[15px] leading-[22px] text-foreground">
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
                    className="flex-row items-center rounded-lg px-3 py-2 mb-1 bg-muted/20 border border-border/40"
                  >
                    <Text className="text-xs mr-2">
                      {isRunning ? '⏳' : isError ? '❌' : '✅'}
                    </Text>
                    <Text
                      className="text-sm font-medium text-foreground"
                      numberOfLines={1}
                    >
                      {info.title}
                    </Text>
                    {info.subtitle && (
                      <Text
                        className="text-sm ml-1 flex-1 text-muted-foreground"
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
            <View className="rounded-lg px-3 py-2 mb-2 border-l-2 bg-muted/20 border-border/30">
              <Text
                className="text-xs italic text-muted-foreground/65"
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
              <View className="h-2 w-2 rounded-full bg-foreground mr-2 animate-pulse" />
              <Text className="text-sm text-muted-foreground">
                {statusText || 'Thinking...'}
              </Text>
            </View>
          )}

          {/* Working status with response */}
          {working && !!response && (
            <View className="flex-row items-center mt-1">
              <View className="h-1.5 w-1.5 rounded-full bg-foreground mr-1.5" />
              <Text className="text-xs text-muted-foreground">
                {statusText || 'Working...'}
              </Text>
            </View>
          )}

          {/* Error */}
          {!!turnError && !working && (
            <View className="mt-2 rounded-lg bg-destructive/10 px-3 py-2">
              <Text className="text-sm text-destructive">{turnError}</Text>
            </View>
          )}

          {/* Duration (when done) */}
          {!working && duration && duration > 0 && (
            <Text className="text-xs mt-1 text-muted-foreground/70">
              {formatDuration(duration)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
