/**
 * SessionPage — the full session chat view.
 *
 * Uses the sync store (hydrated by useSessionSync, kept live by SSE)
 * as the single source of truth for messages.
 *
 * Sends messages via fire-and-forget promptAsync with agent/model/variant.
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useSyncStore } from '@/lib/opencode/sync-store';
import { useSessionSync } from '@/lib/opencode/session-sync';
import { groupMessagesIntoTurns } from '@/lib/opencode/turns';
import type { Turn } from '@/lib/opencode/types';
import { useSession } from '@/lib/platform/hooks';
import { useSandboxContext } from '@/contexts/SandboxContext';
import {
  useOpenCodeAgents,
  useOpenCodeModels,
  useOpenCodeConfig,
} from '@/lib/opencode/hooks/use-opencode-data';
import { useResolvedConfig } from '@/lib/opencode/hooks/use-local-config';
import { getAuthToken } from '@/api/config';
import { log } from '@/lib/logger';

import { SessionChatInput, type PromptOptions } from './SessionChatInput';
import { SessionTurn } from './SessionTurn';

interface SessionPageProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionPage({ sessionId, onBack }: SessionPageProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { sandboxUrl } = useSandboxContext();
  const flatListRef = useRef<FlatList>(null);

  // Session metadata
  const { data: session } = useSession(sandboxUrl, sessionId);

  // Hydrate messages from REST on mount; SSE keeps store updated after
  useSessionSync(sandboxUrl, sessionId);

  // Read messages from sync store
  const messages = useSyncStore((s) => s.messages[sessionId]);
  const sessionStatus = useSyncStore((s) => s.sessionStatus[sessionId]);
  const safeMessages = useMemo(() => messages ?? [], [messages]);

  const isBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';

  // Agent/model/variant config
  const { data: agents = [] } = useOpenCodeAgents(sandboxUrl);
  const { data: visibleModels = [], allModels = [], defaults } = useOpenCodeModels(sandboxUrl);
  const { data: config } = useOpenCodeConfig(sandboxUrl);

  // Resolution uses ALL models (fallback chain); selector shows only visible
  const resolved = useResolvedConfig(agents, allModels, config, defaults);

  // Group messages into turns
  const turns = useMemo(() => groupMessagesIntoTurns(safeMessages), [safeMessages]);

  // When a new turn appears, scroll so the latest user bubble is at the top
  const prevTurnCount = useRef(turns.length);
  useEffect(() => {
    if (turns.length > prevTurnCount.current) {
      // New turn added — scroll it to the top of the viewport
      const targetIndex = turns.length - 1;
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            viewPosition: 0,
            viewOffset: 0,
            animated: true,
          });
        } catch {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 150);
    }
    prevTurnCount.current = turns.length;
  }, [turns.length]);

  // Send handler
  const handleSend = useCallback(
    async (text: string, options: PromptOptions) => {
      if (!sandboxUrl) return;

      // Optimistic user message
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const partId = `prt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      useSyncStore.getState().addOptimisticMessage(sessionId, {
        info: {
          id: messageId,
          role: 'user',
          sessionID: sessionId,
          time: { created: Date.now() },
        },
        parts: [{ type: 'text', id: partId, text }],
      });
      useSyncStore.getState().setStatus(sessionId, { type: 'busy' });
      // Scroll is handled by the useEffect watching turns.length

      // Build prompt payload (matches frontend POST /session/{id}/message)
      const payload: Record<string, any> = {
        parts: [{ type: 'text', text }],
      };
      if (options.model) payload.model = options.model;
      if (options.agent) payload.agent = options.agent;
      if (options.variant) payload.variant = options.variant;

      // Use prompt_async — returns immediately, SSE handles updates.
      // The blocking /session/{id}/message endpoint hangs until AI finishes,
      // which causes RN fetch to stall/timeout.
      try {
        const token = await getAuthToken();
        const res = await fetch(`${sandboxUrl}/session/${sessionId}/prompt_async`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          log.error('❌ [SessionPage] Prompt failed:', res.status, errorText);
          useSyncStore.getState().setStatus(sessionId, { type: 'idle' });
        } else {
          log.log('✅ [SessionPage] Prompt sent (async)');
        }
      } catch (err: any) {
        log.error('❌ [SessionPage] Prompt error:', err?.message || err);
        useSyncStore.getState().setStatus(sessionId, { type: 'idle' });
      }
    },
    [sandboxUrl, sessionId],
  );

  // Stop handler
  const handleStop = useCallback(async () => {
    if (!sandboxUrl) return;
    useSyncStore.getState().setStatus(sessionId, { type: 'idle' });
    try {
      const token = await getAuthToken();
      await fetch(`${sandboxUrl}/session/${sessionId}/abort`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (err: any) {
      log.error('❌ [SessionPage] Abort error:', err?.message || err);
    }
  }, [sandboxUrl, sessionId]);

  // Track last turn height for footer sizing
  const turnHeights = useRef<Record<string, number>>({});
  const [lastTurnHeight, setLastTurnHeight] = useState(80);

  const renderTurn = useCallback(
    ({ item, index }: { item: Turn; index: number }) => (
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          turnHeights.current[item.userMessage.info.id] = h;
          // Update footer when the last turn's height changes
          if (index === turns.length - 1) {
            setLastTurnHeight(h);
          }
        }}
      >
        <SessionTurn
          turn={item}
          allMessages={safeMessages}
          sessionStatus={sessionStatus}
          isBusy={isBusy}
        />
      </View>
    ),
    [safeMessages, sessionStatus, isBusy, turns.length],
  );

  const title = session?.title || 'New Session';

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        style={{ paddingTop: insets.top }}
        className="border-b border-border bg-background px-4 pb-3"
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={onBack}
            className="mr-3 p-1"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color={isDark ? '#F8F8F8' : '#121215'} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {title}
            </Text>
            {isBusy && (
              <View className="flex-row items-center mt-0.5">
                <View className="h-1.5 w-1.5 rounded-full bg-muted-foreground mr-1" />
                <Text className="text-xs text-muted-foreground">Working</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={turns}
        renderItem={renderTurn}
        keyExtractor={(item) => item.userMessage.info.id}
        contentContainerStyle={{ paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View
            style={{
              // Fill remaining viewport so the last turn's user bubble
              // sits at the top. Subtract: header (~60+insets), input (~120+insets),
              // and the actual measured last turn height.
              height: Math.max(0, windowHeight - insets.top - insets.bottom - 160 - lastTurnHeight),
            }}
          />
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              viewPosition: 0,
              viewOffset: 0,
              animated: true,
            });
          }, 200);
        }}
      />

      {/* Chat input with toolbar */}
      <View style={{ paddingBottom: insets.bottom }}>
        <SessionChatInput
          onSend={handleSend}
          onStop={handleStop}
          isBusy={isBusy}
          agent={resolved.agent}
          agents={resolved.agents}
          model={resolved.model}
          models={visibleModels}
          modelKey={resolved.modelKey}
          variant={resolved.variant}
          variants={resolved.variants}
          onAgentChange={resolved.setAgent}
          onModelChange={resolved.setModel}
          onVariantCycle={resolved.cycleVariant}
        />
      </View>
    </View>
  );
}
