/**
 * Home — Main app screen for Kortix Computer Mobile.
 *
 * Uses a drawer layout:
 * - Drawer: Session list + "New Session" button
 * - Main: Either SessionPage (active session) or DashboardHome (new chat input)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Stack, useRouter } from 'expo-router';
import { StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Drawer } from 'react-native-drawer-layout';
import { Ionicons } from '@expo/vector-icons';

import { useAuthContext } from '@/contexts';
import { useSandboxContext } from '@/contexts/SandboxContext';
import { useSessions, useCreateSession } from '@/lib/platform/hooks';
import { useSyncStore } from '@/lib/opencode/sync-store';
import { getAuthToken } from '@/api/config';
import type { Session } from '@/lib/opencode/types';
import { SessionPage } from '@/components/session/SessionPage';
import { SessionChatInput, type PromptOptions } from '@/components/session/SessionChatInput';
import {
  useOpenCodeAgents,
  useOpenCodeModels,
  useOpenCodeConfig,
} from '@/lib/opencode/hooks/use-opencode-data';
import { useResolvedConfig } from '@/lib/opencode/hooks/use-local-config';
import { log } from '@/lib/logger';

// ─── Session list item (extracted to avoid re-renders) ──────────────────────

function SessionListItem({
  item,
  isActive,
  onPress,
}: {
  item: Session;
  isActive: boolean;
  onPress: (s: Session) => void;
}) {
  const status = useSyncStore((s) => s.sessionStatus[item.id]);
  const isSessionBusy = status?.type === 'busy';

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      className={`rounded-lg px-3 py-2.5 mb-0.5 ${isActive ? 'bg-accent' : ''}`}
      activeOpacity={0.6}
    >
      <View className="flex-row items-center">
        {isSessionBusy && (
          <View className="h-2 w-2 rounded-full bg-primary mr-2" />
        )}
        <Text
          className={`flex-1 text-sm ${
            isActive ? 'text-foreground font-semibold' : 'text-foreground'
          }`}
          numberOfLines={1}
        >
          {item.title || 'New Session'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { sandboxUrl, isLoading: sandboxLoading, error: sandboxError } =
    useSandboxContext();

  // State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Data
  const { data: sessions = [], isLoading: sessionsLoading } =
    useSessions(sandboxUrl);
  const createSession = useCreateSession(sandboxUrl);

  // Agent/model/variant for dashboard input
  const { data: agents = [] } = useOpenCodeAgents(sandboxUrl);
  const { data: dashVisibleModels = [], allModels: dashAllModels = [], defaults: dashDefaults } = useOpenCodeModels(sandboxUrl);
  const { data: dashConfig } = useOpenCodeConfig(sandboxUrl);
  const resolved = useResolvedConfig(agents, dashAllModels, dashConfig, dashDefaults);

  // Stable error message (prevents re-render loops from error object identity)
  const sandboxErrorMsg = sandboxError?.message || null;

  // ── Handlers (all useCallback for stable refs) ──

  const handleDrawerOpen = useCallback(() => setDrawerOpen(true), []);
  const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);

  const handleNewSession = useCallback(async () => {
    if (!sandboxUrl) return;
    try {
      log.log('➕ [Home] Creating new session...');
      const session = await createSession.mutateAsync({});
      log.log('✅ [Home] Session created:', session.id);
      setActiveSessionId(session.id);
      setDrawerOpen(false);
    } catch (err: any) {
      log.error('❌ [Home] Failed to create session:', err?.message || err);
    }
  }, [sandboxUrl, createSession]);

  const handleSessionPress = useCallback((session: Session) => {
    setActiveSessionId(session.id);
    setDrawerOpen(false);
  }, []);

  const handleBack = useCallback(() => setActiveSessionId(null), []);

  const handleDashboardSend = useCallback(
    async (text: string, options: PromptOptions) => {
      if (!sandboxUrl) return;
      try {
        const session = await createSession.mutateAsync({});
        setActiveSessionId(session.id);

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const partId = `prt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        useSyncStore.getState().addOptimisticMessage(session.id, {
          info: {
            id: messageId,
            role: 'user',
            sessionID: session.id,
            time: { created: Date.now() },
          },
          parts: [{ type: 'text', id: partId, text }],
        });
        useSyncStore.getState().setStatus(session.id, { type: 'busy' });

        const payload: Record<string, any> = {
          parts: [{ type: 'text', text }],
        };
        if (options.model) payload.model = options.model;
        if (options.agent) payload.agent = options.agent;
        if (options.variant) payload.variant = options.variant;

        const token = await getAuthToken();
        fetch(`${sandboxUrl}/session/${session.id}/prompt_async`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        }).catch((err) => {
          log.error('❌ [Home] Dashboard prompt failed:', err);
          useSyncStore.getState().setStatus(session.id, { type: 'idle' });
        });
      } catch (err: any) {
        log.error('❌ [Home] Dashboard send failed:', err?.message || err);
      }
    },
    [sandboxUrl, createSession],
  );

  const handleGoToSettings = useCallback(() => {
    setDrawerOpen(false);
    router.push('/(settings)');
  }, [router]);

  // ── Drawer content ──

  const { user } = useAuthContext();
  const userEmail = user?.email || '';
  const userDisplayName = userEmail.split('@')[0] || 'User';

  const renderDrawerContent = useCallback(() => {
    const iconColor = isDark ? '#F8F8F8' : '#121215';
    const mutedColor = isDark ? '#999999' : '#6e6e6e';

    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top }}
      >
        {/* Logo + close */}
        <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
          <Text className="text-lg font-bold text-foreground">
            Kortix
          </Text>
          <TouchableOpacity
            onPress={handleDrawerClose}
            className="p-1"
            hitSlop={8}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={20} color={mutedColor} />
          </TouchableOpacity>
        </View>

        {/* Nav items */}
        <View className="px-2 pb-2">
          {/* New session */}
          <TouchableOpacity
            onPress={handleNewSession}
            className="flex-row items-center rounded-lg px-3 py-2.5 mb-0.5"
            activeOpacity={0.6}
          >
            <Ionicons name="create-outline" size={20} color={iconColor} />
            <Text className="text-sm ml-3 text-foreground">New session</Text>
          </TouchableOpacity>

          {/* Search */}
          <TouchableOpacity
            className="flex-row items-center rounded-lg px-3 py-2.5 mb-0.5"
            activeOpacity={0.6}
          >
            <Ionicons name="search-outline" size={20} color={iconColor} />
            <Text className="text-sm ml-3 text-foreground">Search</Text>
          </TouchableOpacity>

          {/* Marketplace */}
          <TouchableOpacity
            className="flex-row items-center rounded-lg px-3 py-2.5 mb-0.5"
            activeOpacity={0.6}
          >
            <Ionicons name="sparkles-outline" size={20} color={iconColor} />
            <Text className="text-sm ml-3 text-foreground">Marketplace</Text>
          </TouchableOpacity>
        </View>

        {/* Sessions header */}
        <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
          <View className="flex-row items-center">
            <Ionicons name="list-outline" size={18} color={iconColor} />
            <Text className="text-sm font-medium ml-2 text-foreground">Sessions</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={mutedColor} />
        </View>

        {/* Session list */}
        {sessionsLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color={mutedColor} />
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20 }}
            renderItem={({ item }) => (
              <SessionListItem
                item={item}
                isActive={item.id === activeSessionId}
                onPress={handleSessionPress}
              />
            )}
            ListEmptyComponent={
              <View className="items-center py-8">
                <Text className="text-sm text-muted-foreground">
                  No sessions yet
                </Text>
              </View>
            }
          />
        )}

        {/* Bottom: user info */}
        <View
          className="border-t border-border px-4 py-3"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <View className="flex-row items-center">
            {/* Avatar initial */}
            <View className="h-8 w-8 rounded-full bg-muted items-center justify-center mr-3">
              <Text className="text-xs font-semibold text-muted-foreground uppercase">
                {userDisplayName.charAt(0)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-foreground" numberOfLines={1}>
                {userDisplayName}
              </Text>
              <Text className="text-xs text-muted-foreground">Self-Hosted</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }, [
    isDark,
    insets,
    sessions,
    sessionsLoading,
    activeSessionId,
    userDisplayName,
    handleNewSession,
    handleSessionPress,
    handleDrawerClose,
  ]);

  // ── Render ──

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RNStatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <Drawer
        open={drawerOpen}
        onOpen={handleDrawerOpen}
        onClose={handleDrawerClose}
        drawerType="slide"
        drawerStyle={{ width: '80%', backgroundColor: 'transparent' }}
        overlayStyle={{
          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.2)',
        }}
        swipeEnabled={!activeSessionId}
        swipeEdgeWidth={80}
        swipeMinDistance={30}
        renderDrawerContent={renderDrawerContent}
      >
        <View className="flex-1 bg-background">
          {/* Loading sandbox */}
          {sandboxLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={isDark ? '#999999' : '#6e6e6e'} />
              <Text className="text-sm mt-3 text-muted-foreground">
                Connecting to sandbox...
              </Text>
            </View>

          /* Sandbox error */
          ) : sandboxErrorMsg ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-base font-medium mb-2 text-foreground">
                Connection Error
              </Text>
              <Text className="text-sm text-center text-muted-foreground">
                {sandboxErrorMsg}
              </Text>
            </View>

          /* Active session */
          ) : activeSessionId ? (
            <SessionPage sessionId={activeSessionId} onBack={handleBack} />

          /* Dashboard */
          ) : (
            <View className="flex-1 bg-background">
              <View
                style={{ paddingTop: insets.top }}
                className="px-4 pb-3 bg-background"
              >
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={handleDrawerOpen}
                    className="mr-3 p-1"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="menu" size={24} color={isDark ? '#F8F8F8' : '#121215'} />
                  </TouchableOpacity>
                  <Text className="text-lg font-bold text-foreground">
                    Kortix
                  </Text>
                </View>
              </View>

              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-2xl font-bold mb-2 text-foreground">
                  What can I help with?
                </Text>
                <Text className="text-sm text-center text-muted-foreground">
                  Start a conversation or select a session from the menu.
                </Text>
              </View>

              <View style={{ paddingBottom: insets.bottom }}>
                <SessionChatInput
                  onSend={handleDashboardSend}
                  placeholder="Ask anything..."
                  disabled={!sandboxUrl}
                  agent={resolved.agent}
                  agents={resolved.agents}
                  model={resolved.model}
                  models={dashVisibleModels}
                  modelKey={resolved.modelKey}
                  variant={resolved.variant}
                  variants={resolved.variants}
                  onAgentChange={resolved.setAgent}
                  onModelChange={resolved.setModel}
                  onVariantCycle={resolved.cycleVariant}
                />
              </View>
            </View>
          )}
        </View>
      </Drawer>
    </>
  );
}
