'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/utils';
import { toast } from '@/lib/toast';
import { useSidebar } from '@/components/ui/sidebar';
import {
  useCreateOpenCodeSession,
  useSendOpenCodeMessage,
  useOpenCodeAgents,
  useOpenCodeProviders,
  useOpenCodeCommands,
} from '@/hooks/opencode/use-opencode-sessions';
import { getClient } from '@/lib/opencode-sdk';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { SessionChatInput } from '@/components/session/session-chat-input';
import { SessionWelcome } from '@/components/session/session-welcome';
import { useOpenCodeLocal } from '@/hooks/opencode/use-opencode-local';
import { useOpenCodeConfig } from '@/hooks/opencode/use-opencode-config';
import { Menu } from 'lucide-react';
import type { Command } from '@/hooks/opencode/use-opencode-sessions';
import { playSound } from '@/lib/sounds';

// ============================================================================
// Dashboard Content — identical to the session empty state
// ============================================================================

export function DashboardContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpen: setSidebarOpenState, setOpenMobile } = useSidebar();
  const createSession = useCreateOpenCodeSession();
  const sendMessage = useSendOpenCodeMessage();

  // Data
  const { data: agents } = useOpenCodeAgents();
  const { data: providers } = useOpenCodeProviders();
  const { data: commands } = useOpenCodeCommands();
  const { data: config } = useOpenCodeConfig();

  // Unified model/agent/variant state
  const local = useOpenCodeLocal({ agents, providers, config });

  const handleSend = useCallback(
    async (text: string, _files?: unknown) => {
      if (!text.trim() || isSubmitting) return;
      playSound('send');
      setIsSubmitting(true);
      let createdSessionId: string | null = null;
      try {
        // Build options from selections
        const options: Record<string, unknown> = {};
        if (local.agent.current) options.agent = local.agent.current.name;
        if (local.model.currentKey) options.model = local.model.currentKey;
        if (local.model.variant.current) options.variant = local.model.variant.current;

        // Step 1: Create the session
        const session = await createSession.mutateAsync();
        createdSessionId = session.id;

        // Step 2: Open tab and navigate immediately (optimistic)
        openTabAndNavigate({
          id: session.id,
          title: 'New session',
          type: 'session',
          href: `/sessions/${session.id}`,
          serverId: useServerStore.getState().activeServerId,
        });

        // Store the prompt text so the session page can send it and display it
        // optimistically. Use session-specific keys so multiple sessions don't conflict.
        // The session page will handle actually sending the message — this avoids a
        // race condition where the send fires before the session page mounts its
        // SSE listeners and polling, causing missed responses.
        sessionStorage.setItem(`opencode_pending_prompt:${session.id}`, text);
        if (Object.keys(options).length > 0) {
          sessionStorage.setItem(`opencode_pending_options:${session.id}`, JSON.stringify(options));
        }
        // Reset submitting since the dashboard stays mounted (hidden) with pushState
        setIsSubmitting(false);
        // Focus the textarea in the newly visible session tab
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('focus-session-textarea'));
        });
      } catch {
        if (createdSessionId) {
          sessionStorage.removeItem(`opencode_pending_prompt:${createdSessionId}`);
          sessionStorage.removeItem(`opencode_pending_options:${createdSessionId}`);
        }
        setIsSubmitting(false);
        toast.warning('Failed to create session');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSubmitting, createSession, sendMessage, local.agent.current, local.model.currentKey, local.model.variant.current],
  );

  const handleCommand = useCallback(
    async (cmd: Command, args?: string) => {
      try {
        const session = await createSession.mutateAsync();
        openTabAndNavigate({
          id: session.id,
          title: cmd.name,
          type: 'session',
          href: `/sessions/${session.id}`,
          serverId: useServerStore.getState().activeServerId,
        });
        // Fire command directly via SDK — no TanStack Query, no retry.
        // Matches SolidJS reference (submit.ts:265-287).
        const client = getClient();
        void client.session.command({
          sessionID: session.id,
          command: cmd.name,
          arguments: args || '',
          ...(local.agent.current && { agent: local.agent.current.name }),
          ...(local.model.currentKey && { model: local.model.currentKey }),
          ...(local.model.variant.current && { variant: local.model.variant.current }),
        }).catch(() => {
          toast.warning('Failed to execute command');
        });
      } catch {
        toast.warning('Failed to create session');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createSession, local.agent.current, local.model.currentKey, local.model.variant.current],
  );

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Mobile menu button */}
      {isMobile && (
        <div className="absolute left-3 top-1.5 z-10">
          <button
            onClick={() => {
              setSidebarOpenState(true);
              setOpenMobile(true);
            }}
            className="flex items-center justify-center h-9 w-9 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent transition-colors touch-manipulation"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Welcome hero — identical to session empty state */}
      <SessionWelcome />

      {/* Chat Input — identical to session empty state */}
      <SessionChatInput
        onSend={handleSend}
        disabled={isSubmitting}
        placeholder="Ask anything..."
        agents={local.agent.list}
        selectedAgent={local.agent.current?.name ?? null}
        onAgentChange={(name) => local.agent.set(name ?? undefined)}
        models={local.model.list}
        selectedModel={local.model.currentKey ?? null}
        onModelChange={(m) => local.model.set(m ?? undefined, { recent: true })}
        variants={local.model.variant.list}
        selectedVariant={local.model.variant.current ?? null}
        onVariantChange={(v) => local.model.variant.set(v ?? undefined)}
        commands={commands || []}
        onCommand={handleCommand}
      />
    </div>
  );
}
