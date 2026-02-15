'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { isLocalMode } from '@/lib/config';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LocalEnvManager } from '@/components/env-manager/local-env-manager';
import { KortixLogo } from '@/components/sidebar/kortix-logo';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnvData {
  configured: Record<string, boolean>;
}

const LLM_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'XAI_API_KEY',
];

// ─── Welcome Step ───────────────────────────────────────────────────────────

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
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

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      endTimeRef.current = 0;
    };
  }, []);

  return (
    <motion.div
      className="flex min-h-screen items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
        >
          <KortixLogo size={64} variant="logomark" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="space-y-2"
        >
          <h1 className="text-4xl font-bold tracking-tight">Welcome to Kortix</h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Your AI computer is ready. Let&apos;s get you set up.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <Button size="lg" onClick={onContinue} className="gap-2 mt-4">
            <Sparkles className="h-4 w-4" />
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── API Keys Step ──────────────────────────────────────────────────────────

function ApiKeysStep({ onContinue }: { onContinue: () => void }) {
  const [hasLLMKey, setHasLLMKey] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkKeys = useCallback(async () => {
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
      const res = await fetch(`${backendUrl}/setup/env`);
      if (!res.ok) throw new Error('Failed');
      const data: EnvData = await res.json();
      setHasLLMKey(LLM_KEYS.some((k) => data.configured[k]));
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkKeys();
    const interval = setInterval(checkKeys, 3000);
    return () => clearInterval(interval);
  }, [checkKeys]);

  return (
    <motion.div
      className="flex min-h-screen items-center justify-center bg-background p-4"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full max-w-2xl space-y-6">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              {hasLLMKey ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <Sparkles className="h-6 w-6 text-primary" />
              )}
            </div>
            <CardTitle className="text-xl">Configure API Keys</CardTitle>
            <CardDescription>
              Add at least one LLM provider key to power your AI agent.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <LocalEnvManager />
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={onContinue}
            disabled={!hasLLMKey && checking}
            className="gap-2"
          >
            {hasLLMKey ? (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Skip for now
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Setup Page ────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'welcome' | 'keys'>('welcome');
  const [loading, setLoading] = useState(true);

  // Check if already onboarded
  useEffect(() => {
    const checkOnboarding = async () => {
      // Cloud users skip setup entirely
      if (!isLocalMode()) {
        router.replace('/dashboard');
        return;
      }

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
        // Backend not ready yet, show setup
      }
      setLoading(false);
    };
    checkOnboarding();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {step === 'welcome' && (
        <WelcomeStep
          key="welcome"
          onContinue={() => {
            if (isLocalMode()) {
              setStep('keys');
            } else {
              router.push('/onboarding');
            }
          }}
        />
      )}
      {step === 'keys' && (
        <ApiKeysStep
          key="keys"
          onContinue={() => router.push('/onboarding')}
        />
      )}
    </AnimatePresence>
  );
}
