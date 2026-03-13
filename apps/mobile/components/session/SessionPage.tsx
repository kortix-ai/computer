/**
 * SessionPage — the full session chat view.
 *
 * Uses the sync store (hydrated by useSessionSync, kept live by SSE)
 * as the single source of truth for messages.
 *
 * Sends messages via fire-and-forget promptAsync.
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useSyncStore } from '@/lib/opencode/sync-store';
import { useSessionSync } from '@/lib/opencode/session-sync';
import { groupMessagesIntoTurns } from '@/lib/opencode/turns';
import type { Turn, SessionStatus, Session } from '@/lib/opencode/types';
import { useSession } from '@/lib/platform/hooks';
import { useSandboxContext } from '@/contexts/SandboxContext';
import { getAuthToken } from '@/api/config';
import { log } from '@/lib/logger';

import { SessionChatInput } from './SessionChatInput';
import { SessionTurn } from './SessionTurn';

interface SessionPageProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionPage({ sessionId, onBack }: SessionPageProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { sandboxUrl } = useSandboxContext();
  const flatListRef = useRef<FlatList>(null);

  // Session metadata
  const { data: session } = useSession(sandboxUrl, sessionId);

  // Hydrate messages from REST on mount; SSE keeps store updated after
  useSessionSync(sandboxUrl, sessionId);

  // Read messages from sync store (single source of truth)
  // IMPORTANT: don't use `|| []` — creates new array ref each render → infinite loop
  const messages = useSyncStore((s) => s.messages[sessionId]);
  const sessionStatus = useSyncStore((s) => s.sessionStatus[sessionId]);
  const safeMessages = useMemo(() => messages ?? [], [messages]);

  // Derive busy state
  const isBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';

  // Group messages into turns
  const turns = useMemo(() => groupMessagesIntoTurns(safeMessages), [safeMessages]);

  // Auto-scroll to bottom on new messages
  const messageCount = safeMessages.length;
  useEffect(() => {
    if (turns.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [turns.length, messageCount]);

  // Send handler — fire-and-forget promptAsync
  const handleSend = useCallback(
    async (text: string) => {
      if (!sandboxUrl) return;

      // Optimistic: add user message to sync store immediately
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

      // Set status to busy
      useSyncStore.getState().setStatus(sessionId, { type: 'busy' });

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);

      // Fire-and-forget: POST /session/{id}/prompt
      try {
        const token = await getAuthToken();
        const res = await fetch(`${sandboxUrl}/session/${sessionId}/prompt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            parts: [{ type: 'text', text }],
          }),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          log.error('❌ [SessionPage] Prompt failed:', res.status, errorText);
          // Reset to idle on error
          useSyncStore.getState().setStatus(sessionId, { type: 'idle' });
        }
      } catch (err) {
        log.error('❌ [SessionPage] Prompt error:', err);
        useSyncStore.getState().setStatus(sessionId, { type: 'idle' });
      }
    },
    [sandboxUrl, sessionId],
  );

  // Stop handler
  const handleStop = useCallback(async () => {
    if (!sandboxUrl) return;

    // Optimistic: set idle
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
    } catch (err) {
      log.error('❌ [SessionPage] Abort error:', err);
    }
  }, [sandboxUrl, sessionId]);

  const renderTurn = useCallback(
    ({ item }: { item: Turn }) => (
      <SessionTurn
        turn={item}
        allMessages={safeMessages}
        sessionStatus={sessionStatus}
        isBusy={isBusy}
      />
    ),
    [safeMessages, sessionStatus, isBusy],
  );

  const title = session?.title || 'Session';

  return (
    <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
      {/* Header */}
      <View
        style={{ paddingTop: insets.top }}
        className={`border-b px-4 pb-3 ${
          isDark ? 'border-zinc-800 bg-black' : 'border-zinc-200 bg-white'
        }`}
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={onBack}
            className="mr-3 p-1"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={isDark ? '#fafafa' : '#18181b'}
            />
          </TouchableOpacity>

          <View className="flex-1">
            <Text
              className={`text-base font-semibold ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
              numberOfLines={1}
            >
              {title}
            </Text>
            {isBusy && (
              <View className="flex-row items-center mt-0.5">
                <View className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1" />
                <Text className="text-xs text-green-500">Working</Text>
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
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 16,
        }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />

      {/* Chat input */}
      <View style={{ paddingBottom: insets.bottom }}>
        <SessionChatInput
          onSend={handleSend}
          onStop={handleStop}
          isBusy={isBusy}
        />
      </View>
    </View>
  );
}
