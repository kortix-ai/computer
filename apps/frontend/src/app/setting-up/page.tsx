'use client';

import { useEffect, useState, Suspense, lazy, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { backendApi } from '@/lib/api-client';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProviders } from '@/hooks/platform/use-sandbox';
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

interface SetupStatusResponse {
  subscription: 'ready' | 'pending';
  sandbox: 'none' | 'provisioning' | 'ready';
  sandbox_url?: string;
}

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

  /** Poll GET /billing/setup/status until sandbox is ready, then health-check it. */
  const pollSandboxReady = useCallback(async (
    isCurrentRun: () => boolean,
    timeoutMs = 240000,
  ): Promise<boolean> => {
    const started = Date.now();
    const deadline = started + timeoutMs;

    while (Date.now() < deadline && isCurrentRun()) {
      const elapsedSec = Math.floor((Date.now() - started) / 1000);
      if (isHetznerDefault) {
        setSandboxProgress(Math.max(2, Math.min(96, getHetznerProvisioningProgress(elapsedSec))));
      } else {
        // For non-Hetzner, use a simple indeterminate progress
        setSandboxProgress(Math.min(90, 10 + elapsedSec * 2));
      }

      try {
        const statusRes = await backendApi.get<SetupStatusResponse>(
          '/billing/setup/status',
          { showErrors: false, timeout: 10000 },
        );

        if (statusRes.success && statusRes.data?.sandbox === 'ready' && statusRes.data.sandbox_url) {
          // Sandbox is ready in DB — verify it's actually responding
          try {
            const healthRes = await authenticatedFetch(
              `${statusRes.data.sandbox_url}/kortix/health`,
              { signal: AbortSignal.timeout(5000) },
              { retryOnAuthError: false },
            );
            if (healthRes.ok) {
              const health = await healthRes.json().catch(() => null) as { version?: string } | null;
              const version = typeof health?.version === 'string' ? health.version : '';
              if (version && version !== '0.0.0') {
                setSandboxProgress(100);
                return true;
              }
            }
          } catch {
            // Sandbox URL not reachable yet — keep polling
          }
        }
      } catch {
        // Network error polling status — keep trying
      }

      await new Promise((r) => setTimeout(r, 2500));
    }

    return false;
  }, [isHetznerDefault, getHetznerProvisioningProgress]);

  const runSetup = useCallback(async () => {
    if (!user || isRunning.current) return;
    isRunning.current = true;
    const runSeq = ++runSeqRef.current;
    const isCurrentRun = () => runSeqRef.current === runSeq;
    setErrorMessage('');

    try {
      // Step 1: Check account status
      if (!isCurrentRun()) return;
      setStep('checking');

      // Step 2: Call initialize — returns fast, kicks off sandbox in background
      if (!isCurrentRun()) return;
      setStep('subscription');

      const initResponse = await backendApi.post<{
        status: string;
        tier: string;
        sandbox: 'created' | 'exists' | 'provisioning' | 'failed';
      }>('/billing/setup/initialize', undefined, {
        timeout: 30000, // Should return in <2s now, but generous timeout
      });

      // Retry once on transient failure
      let response = initResponse;
      if (!response.success) {
        const status = (response.error as any)?.status;
        const message = (response.error as any)?.message || '';
        const isRetriable = status === 502 || /failed to fetch|network|gateway/i.test(String(message));
        if (isRetriable) {
          await new Promise((r) => setTimeout(r, 1500));
          response = await backendApi.post<{
            status: string;
            tier: string;
            sandbox: 'created' | 'exists' | 'provisioning' | 'failed';
          }>('/billing/setup/initialize', undefined, { timeout: 30000 });
        }
      }

      if (!isCurrentRun()) return;

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to initialize account');
      }

      const data = response.data!;

      // Step 3: Poll for sandbox readiness
      if (!isCurrentRun()) return;
      setStep('sandbox');
      setSandboxProgress(0);

      if (data.sandbox === 'exists') {
        // Sandbox already existed — just verify it's healthy
        setSandboxProgress(80);
        const ready = await pollSandboxReady(isCurrentRun, 30000);
        if (!ready && isCurrentRun()) {
          // Already exists but not responding — let dashboard handle it
          console.warn('[setting-up] Existing sandbox not responding, proceeding to dashboard');
        }
      } else if (data.sandbox === 'provisioning' || data.sandbox === 'created') {
        // Provisioning in progress — poll until ready
        const ready = await pollSandboxReady(isCurrentRun, 240000);
        if (!ready && isCurrentRun()) {
          throw new Error(
            isHetznerDefault
              ? 'Hetzner sandbox is still provisioning. Please wait and try again.'
              : 'Sandbox is still being prepared. Please wait and try again.'
          );
        }
      } else if (data.sandbox === 'failed') {
        throw new Error('Failed to create sandbox. Please try again.');
      }

      // Done — redirect to dashboard
      if (!isCurrentRun()) return;
      setStep('success');
      setTimeout(() => {
        if (isCurrentRun()) router.push('/dashboard');
      }, 1000);
    } catch (err) {
      if (!isCurrentRun()) return;
      console.error('[setting-up] Setup error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStep('error');
    } finally {
      if (isCurrentRun()) {
        isRunning.current = false;
      }
    }
  }, [user, router, isHetznerDefault, pollSandboxReady]);

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
