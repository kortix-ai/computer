'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

import { isLocalMode } from '@/lib/config';
import { getClient } from '@/lib/opencode-sdk';
import { useOpenCodeEventStream } from '@/hooks/opencode/use-opencode-events';
import { SessionChat } from '@/components/session/session-chat';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Button } from '@/components/ui/button';

// ─── SSE Provider (required for real-time chat updates) ─────────────────────

function OpenCodeEventStreamProvider() {
  useOpenCodeEventStream();
  return null;
}

// ─── Completion Celebration ─────────────────────────────────────────────────

function CompletionCelebration({ onContinue }: { onContinue: () => void }) {
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
        particleCount: 3,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
      });
      animationRef.current = requestAnimationFrame(frame);
    };
    frame();

    // Auto-redirect after 5s
    const timer = setTimeout(onContinue, 5000);

    return () => {
      clearTimeout(timer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      endTimeRef.current = 0;
    };
  }, [onContinue]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="flex flex-col items-center gap-6 text-center"
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
      >
        <KortixLogo size={48} variant="logomark" />
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">You&apos;re all set!</h2>
          <p className="text-muted-foreground">Your AI computer is ready to go.</p>
        </div>
        <Button size="lg" onClick={onContinue} className="gap-2 mt-2">
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Onboarding Page ───────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already onboarded
  useEffect(() => {
    if (!isLocalMode()) {
      router.replace('/dashboard');
      return;
    }

    const check = async () => {
      try {
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
        const res = await fetch(`${backendUrl}/setup/onboarding-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.complete) {
            router.replace('/dashboard');
            return;
          }
        }
      } catch {
        // Continue to onboarding
      }
    };
    check();
  }, [router]);

  // Create the onboarding session
  useEffect(() => {
    let cancelled = false;

    const createSession = async () => {
      // Wait for OpenCode to be ready (retry a few times)
      for (let i = 0; i < 15; i++) {
        try {
          const client = getClient();
          const session = await client.session.create({
            title: 'Kortix Onboarding',
          });
          if (!cancelled && session?.id) {
            setSessionId(session.id);
            setCreating(false);

            // Send initial prompt with the onboarding agent
            await client.session.promptAsync({
              sessionID: session.id,
              parts: [{ type: 'text', text: 'Hey! I just installed Kortix.' }],
              agent: 'kortix-onboarding',
            });
            return;
          }
        } catch {
          // OpenCode not ready yet, wait and retry
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!cancelled) {
        setError('Could not connect to the agent. Make sure Kortix services are running.');
        setCreating(false);
      }
    };

    createSession();
    return () => { cancelled = true; };
  }, []);

  // Poll for onboarding completion
  useEffect(() => {
    if (!sessionId || complete) return;

    const poll = setInterval(async () => {
      try {
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
        const res = await fetch(`${backendUrl}/setup/onboarding-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.complete) {
            setComplete(true);
            clearInterval(poll);
          }
        }
      } catch {
        // ignore
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [sessionId, complete]);

  const handleComplete = useCallback(() => {
    router.replace('/dashboard');
  }, [router]);

  // Loading state
  if (creating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Starting your onboarding session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
            Skip onboarding
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <KortixLogo size={24} variant="logomark" />
        <div>
          <h1 className="text-sm font-semibold">Kortix Onboarding</h1>
          <p className="text-xs text-muted-foreground">
            Chat with your AI agent to get started
          </p>
        </div>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => router.push('/dashboard')}
          >
            Skip
          </Button>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0 relative">
        <OpenCodeEventStreamProvider />
        {sessionId && <SessionChat sessionId={sessionId} />}
      </div>

      {/* Completion overlay */}
      <AnimatePresence>
        {complete && <CompletionCelebration onContinue={handleComplete} />}
      </AnimatePresence>
    </div>
  );
}
