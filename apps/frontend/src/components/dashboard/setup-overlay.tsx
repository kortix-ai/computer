'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

// ─── SetupOverlay ───────────────────────────────────────────────────────────
// Shows a brief "Welcome to Kortix" celebration, then auto-completes onboarding
// and kicks off the onboarding agent session. No provider/API-key gating.

interface SetupOverlayProps {
  onComplete: () => void;
}

export function SetupOverlay({ onComplete }: SetupOverlayProps) {
  const animationRef = useRef<number | null>(null);
  const endTimeRef = useRef<number>(0);
  const createSession = useCreateOpenCodeSession();
  const completedRef = useRef(false);

  useEffect(() => {
    // Confetti burst
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

    // After 4s, dismiss and start onboarding session
    const timer = setTimeout(() => finish(), 4000);

    return () => {
      clearTimeout(timer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      endTimeRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    if (completedRef.current) return;
    completedRef.current = true;

    onComplete();

    try {
      const session = await createSession.mutateAsync({ title: 'Kortix Onboarding' });

      useTabStore.getState().openTab({
        id: session.id,
        title: 'Kortix Onboarding',
        type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });

      sessionStorage.setItem(
        `opencode_pending_prompt:${session.id}`,
        'Hey! I just installed Kortix.',
      );
      sessionStorage.setItem(
        `opencode_pending_options:${session.id}`,
        JSON.stringify({ agent: 'kortix-onboarding' }),
      );

      window.history.pushState(null, '', `/sessions/${session.id}`);
    } catch {
      toast.warning('Failed to start onboarding session');
    }
  };

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
        onClick={finish}
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
