/**
 * SessionChatInput — chat input with agent/model/variant toolbar.
 *
 * Matches the Computer frontend's chat input:
 * - Left toolbar: Agent selector, Model selector, Variant (thinking) toggle
 * - Right toolbar: Send / Stop buttons
 * - Multiline text input
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';

import type { Agent, FlatModel } from '@/lib/opencode/hooks/use-opencode-data';
import { AgentSelector } from './AgentSelector';
import { ModelSelector } from './ModelSelector';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromptOptions {
  agent?: string;
  model?: { providerID: string; modelID: string };
  variant?: string;
}

interface SessionChatInputProps {
  onSend: (text: string, options: PromptOptions) => void;
  onStop?: () => void;
  isBusy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Agent/model/variant config */
  agent?: Agent | null;
  agents?: Agent[];
  model?: FlatModel | null;
  models?: FlatModel[];
  modelKey?: { providerID: string; modelID: string } | null;
  variant?: string | null;
  variants?: string[];
  onAgentChange?: (name: string) => void;
  onModelChange?: (providerID: string, modelID: string) => void;
  onVariantCycle?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SessionChatInput({
  onSend,
  onStop,
  isBusy = false,
  disabled = false,
  placeholder = 'Ask anything...',
  agent,
  agents = [],
  model,
  models = [],
  modelKey,
  variant,
  variants = [],
  onAgentChange,
  onModelChange,
  onVariantCycle,
}: SessionChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Selector modals
  const [showAgentSheet, setShowAgentSheet] = useState(false);
  const [showModelSheet, setShowModelSheet] = useState(false);

  const canSend = text.trim().length > 0 && !disabled;
  const hasToolbar = agents.length > 0 || models.length > 0;

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    const options: PromptOptions = {};
    if (agent?.name) options.agent = agent.name;
    if (modelKey) options.model = modelKey;
    if (variant) options.variant = variant;

    onSend(trimmed, options);
    setText('');
  }, [text, disabled, onSend, agent, modelKey, variant]);

  // Variant display
  const variantLabel = variant
    ? variant.charAt(0).toUpperCase() + variant.slice(1)
    : 'Default';

  return (
    <>
      <View
        className={`border-t ${isDark ? 'border-zinc-800 bg-black' : 'border-zinc-200 bg-white'}`}
      >
        {/* Text input area */}
        <View className="px-4 pt-2">
          <View
            className={`rounded-2xl px-4 pt-2 pb-1 ${
              isDark ? 'bg-zinc-900' : 'bg-zinc-100'
            }`}
          >
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
              multiline
              maxLength={10000}
              style={{
                maxHeight: 120,
                fontSize: 16,
                lineHeight: 22,
                color: isDark ? '#fafafa' : '#18181b',
                paddingTop: Platform.OS === 'ios' ? 6 : 4,
                paddingBottom: Platform.OS === 'ios' ? 6 : 4,
                minHeight: 36,
              }}
              onSubmitEditing={handleSubmit}
              blurOnSubmit={false}
              returnKeyType="default"
              editable={!disabled}
            />

            {/* Toolbar row — inside the input card */}
            <View className="flex-row items-center justify-between py-1.5">
              {/* Left: selectors */}
              <View className="flex-row items-center flex-1 mr-2" style={{ overflow: 'hidden' }}>
                {/* Agent */}
                {agents.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowAgentSheet(true)}
                    className={`flex-row items-center rounded-lg px-2 py-1 mr-1.5 ${
                      isDark ? 'bg-zinc-800' : 'bg-zinc-200/70'
                    }`}
                    activeOpacity={0.6}
                    hitSlop={4}
                  >
                    <Text
                      className={`text-xs font-medium capitalize ${
                        isDark ? 'text-zinc-300' : 'text-zinc-600'
                      }`}
                    >
                      {agent?.name || 'Agent'}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={11}
                      color={isDark ? '#a1a1aa' : '#71717a'}
                      style={{ marginLeft: 2 }}
                    />
                  </TouchableOpacity>
                )}

                {/* Model */}
                {models.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowModelSheet(true)}
                    className={`flex-row items-center rounded-lg px-2 py-1 mr-1.5 ${
                      isDark ? 'bg-zinc-800' : 'bg-zinc-200/70'
                    }`}
                    activeOpacity={0.6}
                    hitSlop={4}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        isDark ? 'text-zinc-300' : 'text-zinc-600'
                      }`}
                      numberOfLines={1}
                      style={{ maxWidth: 130 }}
                    >
                      {model?.modelName || 'Model'}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={11}
                      color={isDark ? '#a1a1aa' : '#71717a'}
                      style={{ marginLeft: 2 }}
                    />
                  </TouchableOpacity>
                )}

                {/* Variant (thinking) toggle */}
                {variants.length > 0 && (
                  <TouchableOpacity
                    onPress={onVariantCycle}
                    className={`rounded-lg px-2 py-1 ${
                      variant
                        ? isDark ? 'bg-blue-500/20' : 'bg-blue-50'
                        : isDark ? 'bg-zinc-800' : 'bg-zinc-200/70'
                    }`}
                    activeOpacity={0.6}
                    hitSlop={4}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        variant
                          ? isDark ? 'text-blue-400' : 'text-blue-600'
                          : isDark ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {variantLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Right: send/stop */}
              <View className="flex-row items-center">
                {isBusy ? (
                  <TouchableOpacity
                    onPress={onStop}
                    className="h-7 w-7 items-center justify-center rounded-full bg-red-500"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="stop" size={14} color="white" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={!canSend}
                    className={`h-7 w-7 items-center justify-center rounded-full ${
                      canSend
                        ? 'bg-zinc-900 dark:bg-white'
                        : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="arrow-up"
                      size={16}
                      color={canSend ? (isDark ? '#18181b' : 'white') : '#a1a1aa'}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 4 }} />
      </View>

      {/* Agent bottom sheet */}
      <Modal
        visible={showAgentSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAgentSheet(false)}
      >
        <Pressable className="flex-1" onPress={() => setShowAgentSheet(false)}>
          <View className="flex-1" />
        </Pressable>
        <AgentSelector
          agents={agents}
          selected={agent || null}
          onSelect={(name) => onAgentChange?.(name)}
          onClose={() => setShowAgentSheet(false)}
        />
      </Modal>

      {/* Model bottom sheet */}
      <Modal
        visible={showModelSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModelSheet(false)}
      >
        <Pressable className="flex-1" onPress={() => setShowModelSheet(false)}>
          <View className="flex-1" />
        </Pressable>
        <ModelSelector
          models={models}
          selected={model || null}
          onSelect={(pid, mid) => onModelChange?.(pid, mid)}
          onClose={() => setShowModelSheet(false)}
        />
      </Modal>
    </>
  );
}
