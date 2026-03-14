/**
 * BottomBar — Browser-like bottom toolbar.
 *
 * Shows: Back | Forward | + New Session | Tabs (count) | More (...)
 * The "More" menu shows session-specific actions when a session is active.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface BottomBarProps {
  /** Currently active session ID (null = on dashboard) */
  activeSessionId: string | null;
  /** Number of open session tabs */
  tabCount: number;
  /** Navigate to the previous session in history */
  onBack?: () => void;
  /** Navigate to the next session in history */
  onForward?: () => void;
  /** Create a new session */
  onNewSession: () => void;
  /** Open the tabs overview */
  onOpenTabs: () => void;
  /** Whether back navigation is available */
  canGoBack?: boolean;
  /** Whether forward navigation is available */
  canGoForward?: boolean;
  /** Session actions */
  onCompactSession?: () => void;
  onExportTranscript?: () => void;
  onViewChanges?: () => void;
  onDiagnostics?: () => void;
}

export function BottomBar({
  activeSessionId,
  tabCount,
  onBack,
  onForward,
  onNewSession,
  onOpenTabs,
  canGoBack = false,
  canGoForward = false,
  onCompactSession,
  onExportTranscript,
  onViewChanges,
  onDiagnostics,
}: BottomBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const [showMenu, setShowMenu] = useState(false);

  const hasActiveSession = !!activeSessionId;
  const iconColor = isDark ? '#F8F8F8' : '#121215';
  const disabledColor = isDark ? '#3a3a3a' : '#c8c8c8';

  const handleMore = useCallback(() => {
    if (!hasActiveSession) return;
    setShowMenu(true);
  }, [hasActiveSession]);

  const menuItems = [
    {
      icon: 'alert-circle-outline' as const,
      label: 'Diagnostics',
      onPress: () => { setShowMenu(false); onDiagnostics?.(); },
    },
    {
      icon: 'git-compare-outline' as const,
      label: 'View changes',
      onPress: () => { setShowMenu(false); onViewChanges?.(); },
    },
    {
      icon: 'download-outline' as const,
      label: 'Export transcript',
      onPress: () => { setShowMenu(false); onExportTranscript?.(); },
    },
    {
      icon: 'layers-outline' as const,
      label: 'Compact session',
      onPress: () => { setShowMenu(false); onCompactSession?.(); },
    },
  ];

  return (
    <>
      <View
        className="flex-row items-center justify-around bg-card border-t border-border px-2 pt-1.5"
        style={{ paddingBottom: insets.bottom + 2 }}
      >
        {/* Back */}
        <TouchableOpacity
          onPress={onBack}
          disabled={!canGoBack}
          className="items-center justify-center p-2"
          activeOpacity={0.6}
          hitSlop={6}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={canGoBack ? iconColor : disabledColor}
          />
        </TouchableOpacity>

        {/* Forward */}
        <TouchableOpacity
          onPress={onForward}
          disabled={!canGoForward}
          className="items-center justify-center p-2"
          activeOpacity={0.6}
          hitSlop={6}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={canGoForward ? iconColor : disabledColor}
          />
        </TouchableOpacity>

        {/* New Session (+) */}
        <TouchableOpacity
          onPress={onNewSession}
          className="items-center justify-center h-9 w-9 rounded-full bg-muted"
          activeOpacity={0.6}
        >
          <Ionicons name="add" size={24} color={iconColor} />
        </TouchableOpacity>

        {/* Tabs */}
        <TouchableOpacity
          onPress={onOpenTabs}
          className="items-center justify-center p-2"
          activeOpacity={0.6}
          hitSlop={6}
        >
          <View className="h-6 w-6 rounded border-[1.5px] items-center justify-center"
            style={{ borderColor: iconColor }}
          >
            <Text className="text-xs font-bold text-foreground" style={{ fontSize: 10, lineHeight: 12 }}>
              {tabCount > 99 ? '99' : tabCount}
            </Text>
          </View>
        </TouchableOpacity>

        {/* More (...) */}
        <TouchableOpacity
          onPress={handleMore}
          disabled={!hasActiveSession}
          className="items-center justify-center p-2"
          activeOpacity={0.6}
          hitSlop={6}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={hasActiveSession ? iconColor : disabledColor}
          />
        </TouchableOpacity>
      </View>

      {/* More menu modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          className="flex-1"
          onPress={() => setShowMenu(false)}
        >
          <View className="flex-1" />
        </Pressable>

        <View className="mx-4 mb-4 rounded-2xl bg-card border border-border overflow-hidden"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: isDark ? 0.4 : 0.1,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              className={`flex-row items-center px-5 py-3.5 ${
                idx < menuItems.length - 1 ? 'border-b border-border/50' : ''
              }`}
              activeOpacity={0.6}
            >
              <Ionicons name={item.icon} size={20} color={iconColor} />
              <Text className="text-sm ml-3 text-foreground">{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel */}
        <TouchableOpacity
          onPress={() => setShowMenu(false)}
          className="mx-4 mb-6 rounded-2xl bg-card border border-border py-3.5 items-center"
          activeOpacity={0.6}
        >
          <Text className="text-sm font-medium text-foreground">Cancel</Text>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
