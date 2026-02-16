'use client';

import React, { useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

import { LightRays } from '@/components/ui/light-rays';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { SecretsManager } from '@/components/secrets/secrets-manager';
import { Button } from '@/components/ui/button';

interface SetupOverlayProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'credentials';

export function SetupOverlay({ onComplete }: SetupOverlayProps) {
  const createSession = useCreateOpenCodeSession();
  const completedRef = useRef(false);
  const [step, setStep] = useState<Step>('welcome');

  const finish = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();

    try {
      const session = await createSession.mutateAsync({ title: 'Kortix Onboarding' });
      openTabAndNavigate({
        id: session.id, title: 'Kortix Onboarding', type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });
      sessionStorage.setItem(`opencode_pending_prompt:${session.id}`, 'Hey! I just installed Kortix.');
      sessionStorage.setItem(`opencode_pending_options:${session.id}`, JSON.stringify({ agent: 'kortix-onboarding' }));
    } catch {
      toast.warning('Failed to start onboarding session');
    }
  }, [onComplete, createSession]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Shared background layers */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden="true"
      >
        <img
          src="/kortix-brandmark-bg.svg"
          alt=""
          className="w-[85%] max-w-[800px] h-auto object-contain select-none opacity-20"
          draggable={false}
        />
      </motion.div>

      <div className="absolute inset-0 z-[1] opacity-80">
        <LightRays
          raysColor="#ffffff"
          raysOrigin="top-center"
          lightSpread={1.5}
          raysSpeed={0.25}
          rayLength={2.5}
          pulsating
          fadeDistance={0.9}
          saturation={0.5}
        />
      </div>

      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Step content */}
      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
          >
            <motion.p
              className="text-[11px] sm:text-xs tracking-[0.4em] uppercase text-white/30 font-light mb-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.4, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              Welcome to your
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.6, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <img
                src="/logomark-white.svg"
                alt="Kortix"
                className="h-9 sm:h-11 w-auto"
                draggable={false}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 2.6 }}
            >
              <button
                className="mt-12 px-7 py-2 text-[11px] tracking-[0.15em] uppercase text-white/30 border border-white/[0.08] rounded-full backdrop-blur-sm hover:bg-white/[0.04] hover:text-white/60 hover:border-white/15 transition-all duration-500 cursor-pointer"
                onClick={() => setStep('credentials')}
              >
                Get started
              </button>
            </motion.div>
          </motion.div>
        )}

        {step === 'credentials' && (
          <motion.div
            key="credentials"
            className="absolute inset-0 z-10 flex items-center justify-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-full max-w-2xl mx-auto bg-background/95 backdrop-blur-xl rounded-xl border border-border/40 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => setStep('welcome')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h2 className="text-sm font-semibold">Configure your secrets</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Set up API keys so your Kortix agent can function. You can change these anytime in Settings.
                  </p>
                </div>
              </div>

              {/* Secrets manager */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <SecretsManager />
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-border/40 px-5 py-4">
                <Button onClick={finish} className="w-full">
                  Continue
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
