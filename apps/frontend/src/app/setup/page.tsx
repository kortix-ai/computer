'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Loader2,
  Terminal,
  Settings,
} from 'lucide-react';
import { isLocalMode } from '@/lib/config';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnvData {
  configured: Record<string, boolean>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasLLMKey, setHasLLMKey] = useState(false);
  const [configuredCount, setConfiguredCount] = useState(0);

  const LLM_KEYS = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'XAI_API_KEY',
  ];

  // Redirect cloud users
  useEffect(() => {
    if (!isLocalMode()) {
      router.replace('/dashboard');
    }
  }, [router]);

  // Check configuration status
  const checkConfig = useCallback(async () => {
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
      const res = await fetch(`${backendUrl}/setup/env`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data: EnvData = await res.json();

      const llmConfigured = LLM_KEYS.some((k) => data.configured[k]);
      const totalConfigured = Object.values(data.configured).filter(Boolean).length;

      setHasLLMKey(llmConfigured);
      setConfiguredCount(totalConfigured);

      // If at least one LLM key is configured, redirect to dashboard
      if (llmConfigured) {
        router.replace('/dashboard');
        return;
      }
    } catch {
      // API not reachable — show the notice anyway
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    checkConfig();
  }, [checkConfig]);

  if (!isLocalMode()) return null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If we get here, no LLM key is configured — show notice
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-xl">Configuration Required</CardTitle>
          <CardDescription className="text-sm">
            Kortix needs at least one LLM provider API key to function.
            {configuredCount > 0 && (
              <span className="block mt-1 text-muted-foreground">
                {configuredCount} key(s) configured, but no LLM provider found.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Option 1: Open Settings */}
          <Button
            className="w-full"
            onClick={() => router.push('/dashboard?settings=env-manager')}
          >
            <Settings className="mr-2 h-4 w-4" />
            Open Settings
            <ArrowRight className="ml-auto h-4 w-4" />
          </Button>

          {/* Option 2: CLI */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Configure via CLI</span>
            </div>
            <code className="block rounded bg-background px-3 py-2 text-xs font-mono text-muted-foreground">
              kortix setup
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Run this command in your terminal to configure API keys interactively.
            </p>
          </div>

          {/* Skip anyway */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => router.push('/dashboard')}
          >
            Continue to dashboard without configuration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
