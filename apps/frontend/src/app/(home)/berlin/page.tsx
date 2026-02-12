'use client';

import { useState, useCallback, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { AnimatedBg } from '@/components/ui/animated-bg';
import { useIsMobile } from '@/hooks/utils';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import {
  useCreateOpenCodeSession,
  useOpenCodeAgents,
  useOpenCodeProviders,
  useOpenCodeCommands,
} from '@/hooks/opencode/use-opencode-sessions';
import { SessionChatInput, flattenModels } from '@/components/session/session-chat-input';
import { toast } from '@/lib/toast';
import type { Command } from '@/hooks/opencode/use-opencode-sessions';

// Mobile users are redirected at the edge by middleware (hyper-fast)
// This page only renders for desktop users

export default function BerlinPage() {
  const isMobile = useIsMobile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const router = useRouter();
  const { user, isLoading } = useAuth();
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
    async (text: string, _files?: unknown) => {
      if (!text.trim() || isSubmitting) return;

      if (!user && !isLoading) {
        router.push('/auth');
        return;
      }

      setIsSubmitting(true);
      try {
        sessionStorage.setItem('opencode_pending_prompt', text);

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
        toast.error('Failed to create session');
      }
    },
    [isSubmitting, user, isLoading, createSession, router, selectedAgent, selectedModel, selectedVariant],
  );

  const handleCommand = useCallback((_cmd: Command) => {
    // On landing pages, slash commands are a no-op
  }, []);

  return (
    <main className="w-full">
      <section className="w-full relative overflow-hidden">
        <div className="relative flex flex-col items-center w-full px-4 sm:px-6 pb-8 sm:pb-10">
          <AnimatedBg
            variant="hero"
            sizeMultiplier={isMobile ? 0.7 : 1}
            blurMultiplier={isMobile ? 0.6 : 1}
          />

          <div className="relative z-10 pt-20 sm:pt-24 md:pt-32 mx-auto h-full w-full max-w-6xl flex flex-col items-center justify-center min-h-[60vh] sm:min-h-0">
            <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 pt-12 sm:pt-20 max-w-4xl mx-auto pb-6 sm:pb-7">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Berlin, Germany</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tighter text-balance text-center px-4 sm:px-2">
                Kortix.
              </h1>
              
              <div className="text-center space-y-2 max-w-3xl px-4">
                <h2 className="text-lg sm:text-xl md:text-2xl font-medium tracking-tight text-muted-foreground">
                  Dein Autonomer KI-Worker
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground/80 font-normal text-balance leading-relaxed">
                  Gebaut für komplexe Aufgaben, entwickelt für alles. Der ultimative KI-Assistent, der alles bewältigt—von einfachen Anfragen bis zu mega-komplexen Projekten.
                </p>
              </div>

              <div className="flex flex-col items-center w-full max-w-3xl mx-auto gap-2 flex-wrap justify-center px-4 sm:px-0">
                <div className="w-full relative">
                  <SessionChatInput
                    onSend={handleSend}
                    disabled={isSubmitting}
                    placeholder="Beschreibe deine Aufgabe..."
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
                    autoFocus={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
