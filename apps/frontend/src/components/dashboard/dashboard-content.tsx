'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/utils';
import { toast } from '@/lib/toast';
import { useSidebar } from '@/components/ui/sidebar';
import {
  useCreateOpenCodeSession,
  useOpenCodeAgents,
  useOpenCodeProviders,
  useOpenCodeCommands,
} from '@/hooks/opencode/use-opencode-sessions';
import { SessionWelcome } from '@/components/session/session-welcome';
import { SessionChatInput, flattenModels } from '@/components/session/session-chat-input';
import { Menu } from 'lucide-react';
import type { Command } from '@/hooks/opencode/use-opencode-sessions';

export function DashboardContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpen: setSidebarOpenState, setOpenMobile } = useSidebar();
  const createSession = useCreateOpenCodeSession();

  // Fetch agents, providers, commands from OpenCode server
  const { data: agents } = useOpenCodeAgents();
  const { data: providers } = useOpenCodeProviders();
  const { data: commands } = useOpenCodeCommands();

  const visibleAgents = useMemo(
    () => (agents || []).filter((a) => a.mode !== 'subagent' && !a.hidden),
    [agents],
  );

  const flatModels = useMemo(() => flattenModels(providers), [providers]);

  const currentVariants = useMemo(() => {
    if (!selectedModel) {
      const first = flatModels[0];
      return first?.variants ? Object.keys(first.variants) : [];
    }
    const model = flatModels.find(
      (m) => m.providerID === selectedModel.providerID && m.modelID === selectedModel.modelID,
    );
    return model?.variants ? Object.keys(model.variants) : [];
  }, [selectedModel, flatModels]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isSubmitting) return;
      setIsSubmitting(true);
      try {
        sessionStorage.setItem('opencode_pending_prompt', text);

        // Store selected agent/model/variant so the session can use them
        const options: Record<string, unknown> = {};
        if (selectedAgent) options.agent = selectedAgent;
        if (selectedModel) options.model = selectedModel;
        if (selectedVariant) options.variant = selectedVariant;
        if (Object.keys(options).length > 0) {
          sessionStorage.setItem('opencode_pending_options', JSON.stringify(options));
        }

        const session = await createSession.mutateAsync();
        router.push(`/sessions/${session.id}?new=true`);
      } catch (error) {
        sessionStorage.removeItem('opencode_pending_prompt');
        sessionStorage.removeItem('opencode_pending_options');
        setIsSubmitting(false);
        toast.warning('Failed to create session');
      }
    },
    [isSubmitting, createSession, router, selectedAgent, selectedModel, selectedVariant],
  );

  const handleCommand = useCallback(
    (cmd: Command) => {
      // On dashboard, slash commands just pre-fill - no session to execute against yet
      // Could store for later, but for now just ignore
    },
    [],
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
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

      {/* Welcome hero (brandmark bg + greeting) */}
      <SessionWelcome />

      {/* Chat Input - fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-3 sm:px-4 pb-3 sm:pb-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-[1] animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <SessionChatInput
          onSend={handleSend}
          disabled={isSubmitting}
          placeholder="Ask anything..."
          agents={visibleAgents}
          selectedAgent={selectedAgent}
          onAgentChange={setSelectedAgent}
          models={flatModels}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          variants={currentVariants}
          selectedVariant={selectedVariant}
          onVariantChange={setSelectedVariant}
          commands={commands || []}
          onCommand={handleCommand}
        />
      </div>
    </div>
  );
}
