'use client';

import { useEffect, useState, Suspense, lazy, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { billingApi } from '@/lib/api/billing';
import { backendApi } from '@/lib/api-client';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProviders } from '@/hooks/platform/use-sandbox';
import { getSandbox, getSandboxUrl } from '@/lib/platform-client';
import { authenticatedFetch } from '@/lib/auth-token';

// Lazy load heavy components
const AnimatedBg = lazy(() => import('@/components/ui/animated-bg').then(mod => ({ default: mod.AnimatedBg })));

type SetupStep = 'checking' | 'subscription' | 'sandbox' | 'success' | 'error';

interface StepInfo {
  label: string;
  detail: string;
}

const STEP_INFO: Record<Exclude<SetupStep, 'success' | 'error'>, StepInfo> = {
  checking:     { label: 'Checking account',         detail: 'Verifying your account status...' },
  subscription: { label: 'Creating subscription',    detail: 'Setting up your free plan...' },
  sandbox:      { label: 'Preparing workspace',      detail: 'Provisioning your cloud sandbox...' },
};

export default function SettingUpPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: providersInfo } = useProviders();
  const [step, setStep] = useState<SetupStep>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sandboxProgress, setSandboxProgress] = useState(0);
  const isRunning = useRef(false);
  const runSeqRef = useRef(0);
  const autoStartedRef = useRef(false);

  const isHetznerDefault = providersInfo?.default === 'hetzner';
  const stepInfo = {
    ...STEP_INFO,
    sandbox: {
      label: isHetznerDefault ? 'Preparing Hetzner VPS' : STEP_INFO.sandbox.label,
      detail: isHetznerDefault
        ? 'Provisioning from snapshot (cold starts usually 2-3 minutes)...'
        : STEP_INFO.sandbox.detail,
    },
  };

  const getHetznerProvisioningProgress = useCallback((elapsedSec: number): number => {
    if (elapsedSec < 20) return 8 + (elapsedSec / 20) * 12;
    if (elapsedSec < 90) return 20 + ((elapsedSec - 20) / 70) * 35;
    if (elapsedSec < 150) return 55 + ((elapsedSec - 90) / 60) * 30;
    return Math.min(96, 85 + ((elapsedSec - 150) / 120) * 11);
  }, []);

  const waitForHetznerSandboxReady = useCallback(async (timeoutMs = 240000): Promise<string | null> => {
    const started = Date.now();
    const deadline = started + timeoutMs;

    while (Date.now() < deadline) {
      const elapsedSec = Math.floor((Date.now() - started) / 1000);
      setSandboxProgress(Math.max(2, Math.min(96, getHetznerProvisioningProgress(elapsedSec))));

      try {
        const sandbox = await getSandbox();
        if (sandbox?.external_id) {
          const sandboxUrl = getSandboxUrl(sandbox);
          const res = await authenticatedFetch(
            `${sandboxUrl}/kortix/health`,
            { signal: AbortSignal.timeout(5000) },
            { retryOnAuthError: false },
          );
          if (res.ok) {
            const health = await res.json().catch(() => null) as { version?: string } | null;
            const version = typeof health?.version === 'string' ? health.version : '';
            if (version && version !== '0.0.0') {
              setSandboxProgress(100);
              return version;
            }
          }
        }
      } catch {
        // Keep polling while sandbox is provisioning.
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    return null;
  }, [getHetznerProvisioningProgress]);

  const runSetup = useCallback(async () => {
    if (!user || isRunning.current) return;
    isRunning.current = true;
    const runSeq = ++runSeqRef.current;
    const isCurrentRun = () => runSeqRef.current === runSeq;
    setErrorMessage('');
    let sandboxStepTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      let providerIsHetzner = isHetznerDefault;

      if (!providerIsHetzner) {
        const providersRes = await backendApi.get<{ providers: string[]; default: string }>(
          '/platform/providers',
          { showErrors: false, timeout: 10000 },
        );
        providerIsHetzner = providersRes.success && providersRes.data?.default === 'hetzner';
      }

      // Step 1: Check account status
      if (!isCurrentRun()) return;
      setStep('checking');
      await billingApi.getAccountState(true);

      // Step 2: Initialize subscription + sandbox (one-shot backend call)
      if (!isCurrentRun()) return;
      setStep('subscription');
      sandboxStepTimer = setTimeout(() => setStep('sandbox'), 1200);
      setSandboxProgress(0);
      const initializeSetup = async () => backendApi.post<{
        status: string;
        tier: string;
        sandbox: 'created' | 'exists' | 'skipped' | 'failed';
        sandbox_error?: string;
      }>('/billing/setup/initialize', undefined, {
        // Hetzner provisioning can take 2-3 minutes on first create.
        timeout: 240000,
      });

      let response = await initializeSetup();
      // Handle transient edge/network failures (common with cold starts + proxies)
      for (let attempt = 1; attempt <= 2 && !response.success; attempt++) {
        const status = (response.error as any)?.status;
        const message = (response.error as any)?.message || '';
        const isRetriable = status === 502 || /failed to fetch|network|gateway/i.test(String(message));
        if (!isRetriable) break;
        await new Promise((r) => setTimeout(r, attempt * 1200));
        response = await initializeSetup();
      }

      if (!isCurrentRun()) return;

      if (sandboxStepTimer) {
        clearTimeout(sandboxStepTimer);
        sandboxStepTimer = null;
      }

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to initialize account');
      }

      const data = response.data!;

      // Step 3: Show sandbox status
      if (data.sandbox === 'created' || data.sandbox === 'exists' || (providerIsHetzner && data.sandbox === 'skipped')) {
        setStep('sandbox');
        if (providerIsHetzner) {
          const version = await waitForHetznerSandboxReady(240000);
          if (!version) {
            throw new Error('Hetzner sandbox is still provisioning. Please wait and try again.');
          }
        } else {
          // Brief pause so user sees the step
          await new Promise(r => setTimeout(r, 800));
        }
      } else if (data.sandbox === 'failed') {
        if (providerIsHetzner) {
          throw new Error(data.sandbox_error || 'Failed to create Hetzner sandbox');
        }
        // Non-Hetzner fallback: let dashboard auto-retry.
        console.warn('[setting-up] Sandbox creation failed, will retry on dashboard:', data.sandbox_error);
      }

      // Done — redirect to dashboard
      if (!isCurrentRun()) return;
      setStep('success');
      setTimeout(() => {
        if (isCurrentRun()) router.push('/dashboard');
      }, 1000);
    } catch (err) {
      if (sandboxStepTimer) {
        clearTimeout(sandboxStepTimer);
      }
      if (!isCurrentRun()) return;
      console.error('[setting-up] Setup error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStep('error');
    } finally {
      if (isCurrentRun()) {
        isRunning.current = false;
      }
    }
  }, [user, router, isHetznerDefault, waitForHetznerSandboxReady]);

  useEffect(() => {
    if (!user || autoStartedRef.current) return;
    autoStartedRef.current = true;
    runSetup();
  }, [user, runSetup]);

  const handleRetry = () => {
    setStep('checking');
    runSetup();
  };

  return (
    <div className="w-full relative overflow-hidden min-h-screen">
      <div className="relative flex flex-col items-center w-full px-4 sm:px-6 min-h-screen justify-center">
        <Suspense fallback={null}>
          <AnimatedBg variant="hero" />
        </Suspense>

        <div className="relative z-10 w-full max-w-[456px] flex flex-col items-center gap-8">
          <KortixLogo size={32} />

          {step !== 'success' && step !== 'error' && (
            <>
              <h1 className="text-[43px] font-normal tracking-tight text-foreground leading-none text-center">
                Setting Up Your Account
              </h1>

              <p className="text-[16px] text-foreground/60 text-center leading-relaxed">
                We're creating your workspace and preparing everything you need to get started.
              </p>

              <Card className="w-full bg-card border border-border">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4">
                    {(['checking', 'subscription', 'sandbox'] as const).map((s) => {
                      const info = stepInfo[s];
                      const isActive = s === step;
                      const isDone = getStepOrder(step) > getStepOrder(s);

                      return (
                        <div key={s} className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {isDone ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : isActive ? (
                              <div className="h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <div className="h-3 w-3 rounded-full bg-foreground/15" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-sm font-medium ${isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-foreground/30'}`}>
                              {info.label}
                            </span>
                            {isActive && (
                              <span className="text-xs text-foreground/40">
                                {s === 'sandbox' && isHetznerDefault
                                  ? `${info.detail} ${Math.round(sandboxProgress)}%`
                                  : info.detail}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {step === 'sandbox' && isHetznerDefault && (
                      <div className="pt-1">
                        <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500/90 transition-all duration-1000 ease-out"
                            style={{ width: `${Math.max(sandboxProgress, 2)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {step === 'success' && (
            <>
              <h1 className="text-[43px] font-normal tracking-tight text-foreground leading-none text-center">
                You're All Set!
              </h1>

              <p className="text-[16px] text-foreground/60 text-center leading-relaxed">
                Your account is ready. Redirecting you to the dashboard...
              </p>

              <Card className="w-full h-24 bg-card border border-border">
                <CardContent className="p-6 h-full">
                  <div className="flex items-center justify-between h-full">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <div className='flex items-center gap-2'>
                          <div className="h-2.5 w-2.5 bg-green-500 rounded-full"></div>
                          <span className="text-base font-medium text-green-400">Ready</span>
                        </div>
                        <p className="text-base text-gray-400">Welcome to your workspace!</p>
                      </div>
                    </div>
                    <div className="h-12 w-12 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {step === 'error' && (
            <>
              <h1 className="text-[43px] font-normal tracking-tight text-foreground leading-none text-center">
                Setup Issue
              </h1>

              <p className="text-[16px] text-foreground/60 text-center leading-relaxed">
                {errorMessage || 'An error occurred during setup.'}
              </p>

              <Card className="w-full min-h-24 bg-card border border-border">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <div className='flex items-center gap-2'>
                          <div className="h-2.5 w-2.5 bg-red-500 rounded-full"></div>
                          <span className="text-base font-medium text-red-400">Setup Error</span>
                        </div>
                        <p className="text-base text-gray-400">Please try again or choose a plan manually.</p>
                      </div>
                    </div>
                    <div className="h-12 w-12 flex items-center justify-center">
                      <AlertCircle className="h-6 w-6 text-red-500" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button
                      onClick={handleRetry}
                      className="flex-1"
                      variant="default"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                    <Button
                      onClick={() => router.push('/subscription')}
                      className="flex-1"
                      variant="outline"
                    >
                      Choose a Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div
          className="absolute inset-0 opacity-[0.15] pointer-events-none z-50"
          style={{
            backgroundImage: 'url(/grain-texture.png)',
            backgroundRepeat: 'repeat',
            mixBlendMode: 'overlay'
          }}
        />
      </div>
    </div>
  );
}

/** Order for step-completion checks. */
function getStepOrder(s: SetupStep): number {
  switch (s) {
    case 'checking': return 0;
    case 'subscription': return 1;
    case 'sandbox': return 2;
    case 'success': return 3;
    case 'error': return -1;
    default: return -1;
  }
}
