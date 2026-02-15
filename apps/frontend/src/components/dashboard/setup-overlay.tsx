'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Key, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { ProviderSettings } from '@/components/providers/provider-settings';
import { useProviders } from '@/hooks/providers/use-providers';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

// ─── Welcome Step (confetti celebration overlay) ────────────────────────────

function WelcomeStep({ onDone }: { onDone: () => void }) {
  const animationRef = useRef<number | null>(null);
  const endTimeRef = useRef<number>(0);

  useEffect(() => {
    const colors = ['#a786ff', '#fd8bbc', '#eca184', '#f8deb1'];
    endTimeRef.current = Date.now() + 3000;

    const frame = () => {
      if (Date.now() > endTimeRef.current) {
        animationRef.current = null;
        return;
      }
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
      });
      animationRef.current = requestAnimationFrame(frame);
    };
    frame();

    const timer = setTimeout(onDone, 4000);

    return () => {
      clearTimeout(timer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      endTimeRef.current = 0;
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="absolute inset-0 bg-background/60 backdrop-blur-[2px] cursor-pointer"
        onClick={onDone}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative flex flex-col items-center gap-4 pointer-events-none select-none"
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -10 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
      >
        <motion.p
          className="text-lg text-muted-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          Welcome to
        </motion.p>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5, type: 'spring', stiffness: 250, damping: 18 }}
        >
          <KortixLogo size={48} variant="logomark" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ─── Provider Setup Step ────────────────────────────────────────────────────
// Thin overlay shell — all provider UI comes from <ProviderSettings variant="setup" />

function ProviderSetupStep({ onDone }: { onDone: () => void }) {
  const { data: providers } = useProviders();

  const hasLLMProvider = providers?.some(
    (p) => p.category === 'llm' && p.connected,
  ) ?? false;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" />

      <motion.div
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-lg overflow-hidden"
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.35, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {hasLLMProvider ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Key className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Connect a Provider</h2>
            <p className="text-sm text-muted-foreground">
              Connect at least one LLM provider to power your AI agent.
            </p>
          </div>
        </div>

        {/* Provider list + Continue footer — all from ProviderSettings */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          <ProviderSettings variant="setup" onContinue={onDone} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main SetupOverlay ──────────────────────────────────────────────────────

interface SetupOverlayProps {
  onComplete: () => void;
}

export function SetupOverlay({ onComplete }: SetupOverlayProps) {
  const [step, setStep] = useState<'welcome' | 'providers'>('welcome');
  const createSession = useCreateOpenCodeSession();

  const handleWelcomeDone = useCallback(() => {
    setStep('providers');
  }, []);

  const handleProvidersDone = useCallback(async () => {
    // 1. Dismiss the overlay immediately
    onComplete();

    // 2. Create a regular onboarding session in the background
    try {
      const session = await createSession.mutateAsync({ title: 'Kortix Onboarding' });

      // 3. Open as a normal tab
      useTabStore.getState().openTab({
        id: session.id,
        title: 'Kortix Onboarding',
        type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });

      // 4. Store the initial prompt + agent so the session page sends it
      sessionStorage.setItem(
        `opencode_pending_prompt:${session.id}`,
        'Hey! I just installed Kortix.',
      );
      sessionStorage.setItem(
        `opencode_pending_options:${session.id}`,
        JSON.stringify({ agent: 'kortix-onboarding' }),
      );

      // 5. Navigate to the session tab
      window.history.pushState(null, '', `/sessions/${session.id}`);
    } catch {
      toast.warning('Failed to start onboarding session');
    }
  }, [onComplete, createSession]);

  return (
    <AnimatePresence mode="wait">
      {step === 'welcome' && (
        <WelcomeStep key="welcome" onDone={handleWelcomeDone} />
      )}
      {step === 'providers' && (
        <ProviderSetupStep key="providers" onDone={handleProvidersDone} />
      )}
    </AnimatePresence>
  );
}
