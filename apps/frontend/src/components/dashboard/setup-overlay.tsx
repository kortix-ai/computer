'use client';

import React, { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { LightRays } from '@/components/ui/light-rays';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

interface SetupOverlayProps {
  onComplete: () => void;
}

export function SetupOverlay({ onComplete }: SetupOverlayProps) {
  const createSession = useCreateOpenCodeSession();
  const completedRef = useRef(false);

  const finish = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();

    try {
      const session = await createSession.mutateAsync({ title: 'Kortix Onboarding' });
      useTabStore.getState().openTab({
        id: session.id, title: 'Kortix Onboarding', type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });
      sessionStorage.setItem(`opencode_pending_prompt:${session.id}`, 'Hey! I just installed Kortix.');
      sessionStorage.setItem(`opencode_pending_options:${session.id}`, JSON.stringify({ agent: 'kortix-onboarding' }));
      window.history.pushState(null, '', `/sessions/${session.id}`);
    } catch {
      toast.warning('Failed to start onboarding session');
    }
  }, [onComplete, createSession]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Brandmark — cinematic scale, slow reveal with zoom */}
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

      {/* Light rays — atmospheric layer */}
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

      {/* Radial vignette — depth */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Content — centered, staggered cinematic reveal */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center select-none">
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
            onClick={finish}
          >
            Get started
          </button>
        </motion.div>
      </div>
    </div>
  );
}
