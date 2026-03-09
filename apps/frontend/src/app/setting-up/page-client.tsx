'use client';

import { useEffect, useState, Suspense, lazy, useRef, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { backendApi } from '@/lib/api-client';
import { configureAutoTopup } from '@/lib/api/billing';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useServerStore } from '@/stores/server-store';
import { useProviders } from '@/hooks/platform/use-sandbox';
import { getSandbox, getSandboxUrl } from '@/lib/platform-client';
import { authenticatedFetch } from '@/lib/auth-token';

// Lazy load heavy components
const AnimatedBg = lazy(() => import('@/components/ui/animated-bg').then(mod => ({ default: mod.AnimatedBg })));

type SetupStep = 'checking' | 'subscription' | 'sandbox' | 'connect' | 'auto_topup' | 'success' | 'error';

interface StepInfo {
  label: string;
  detail: string;
}

const STEP_INFO: Record<Exclude<SetupStep, 'success' | 'error'>, StepInfo> = {
  checking:     { label: 'Checking account',         detail: 'Verifying your account status...' },
  subscription: { label: 'Creating subscription',    detail: 'Setting up your plan...' },
  sandbox:      { label: 'Preparing workspace',      detail: 'Provisioning your cloud sandbox...' },
  connect:      { label: 'Connect instance',         detail: 'Add your own local/custom instance to continue.' },
  auto_topup:   { label: 'Auto-topup (optional)',    detail: 'Enable automatic credit reloads when balance is low.' },
};

interface SetupStatusResponse {
  subscription: 'ready' | 'pending';
  sandbox: 'none' | 'provisioning' | 'ready' | 'error';
}

export default function SettingUpPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: providersInfo } = useProviders();
  const [step, setStep] = useState<SetupStep>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sandboxProgress, setSandboxProgress] = useState(0);
  const [planTier, setPlanTier] = useState<'free' | 'pro' | 'none'>('none');
  const [instanceUrl, setInstanceUrl] = useState('http://localhost:8008/v1/p/kortix-sandbox/8000');
  const [instanceLabel, setInstanceLabel] = useState('Local Instance');
  const [isConnectingInstance, setIsConnectingInstance] = useState(false);
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(false);
  const [autoTopupThreshold, setAutoTopupThreshold] = useState(5);
  const [autoTopupAmount, setAutoTopupAmount] = useState(15);
  const [isSavingAutoTopup, setIsSavingAutoTopup] = useState(false);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const isRunning = useRef(false);
  const runSeqRef = useRef(0);
  const autoStartedRef = useRef(false);
  const idBase = useId();
  const instanceUrlInputId = `${idBase}-instance-url`;
  const instanceLabelInputId = `${idBase}-instance-label`;
  const autoTopupThresholdInputId = `${idBase}-auto-topup-threshold`;
  const autoTopupAmountInputId = `${idBase}-auto-topup-amount`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setSubscriptionSuccess(params.get('subscription') === 'success');
    setCheckoutSessionId(params.get('session_id'));
  }, []);

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

        if (statusRes.success && statusRes.data?.sandbox === 'error') {
          throw new Error('Cloud instance provisioning failed. Please try again.');
        }

        if (statusRes.success && statusRes.data?.sandbox === 'ready') {
          // Sandbox is ready in DB — get it via platform API and health-check via proxy route
          try {
            const sandbox = await getSandbox();
            if (sandbox?.external_id) {
              const sandboxUrl = getSandboxUrl(sandbox);
              const healthRes = await authenticatedFetch(
                `${sandboxUrl}/kortix/health`,
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
            }
          } catch {
            // Sandbox not reachable yet — keep polling
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('provisioning failed')) {
          throw err;
        }
        // Network error polling status — keep trying
      }

      await new Promise((r) => setTimeout(r, 2500));
    }

    return false;
  }, [isHetznerDefault, getHetznerProvisioningProgress]);

  const waitForPaidActivation = useCallback(async (isCurrentRun: () => boolean, timeoutMs = 60000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    let reconcileAttempted = false;

    while (Date.now() < deadline && isCurrentRun()) {
      try {
        const res = await backendApi.get<any>('/billing/account-state', { showErrors: false, timeout: 10000 });
        if (res.success) {
          const tierKey = res.data?.subscription?.tier_key || res.data?.tier?.name;
          if (tierKey === 'pro') {
            setPlanTier('pro');
            return true;
          }

          if (!reconcileAttempted && checkoutSessionId && tierKey !== 'pro') {
            reconcileAttempted = true;
            await backendApi.post('/billing/confirm-checkout-session', {
              session_id: checkoutSessionId,
            }, { showErrors: false, timeout: 15000 });
          }
        }
      } catch {
        // Keep polling.
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    return false;
  }, [checkoutSessionId]);

  const continueToDashboard = useCallback(() => {
    setStep('success');
    setTimeout(() => {
      router.push('/dashboard');
    }, 500);
  }, [router]);

  const handleConnectInstance = useCallback(async () => {
    const trimmedUrl = instanceUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setErrorMessage('Instance URL must start with http:// or https://');
      return;
    }

    setIsConnectingInstance(true);
    setErrorMessage('');
    try {
      const id = (globalThis.crypto?.randomUUID?.() ?? `server_${Date.now()}`) as string;
      const label = instanceLabel.trim() || trimmedUrl.replace(/^https?:\/\//, '');

      await backendApi.post('/servers', {
        id,
        label,
        url: trimmedUrl,
        isDefault: false,
      });

      // Update local store immediately for smooth first dashboard load.
      useServerStore.setState((state) => ({
        servers: state.servers.some((s) => s.id === id)
          ? state.servers
          : [...state.servers, { id, label, url: trimmedUrl, isDefault: false }],
        activeServerId: id,
        userSelected: true,
      }));

      continueToDashboard();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect instance');
    } finally {
      setIsConnectingInstance(false);
    }
  }, [instanceUrl, instanceLabel, continueToDashboard]);

  const saveAutoTopupSettings = useCallback(async (): Promise<boolean> => {
    if (!autoTopupEnabled) return true;
    if (autoTopupThreshold < 5) {
      setErrorMessage('Auto-topup threshold must be at least $5.');
      return false;
    }
    if (autoTopupAmount < 15) {
      setErrorMessage('Auto-topup amount must be at least $15.');
      return false;
    }
    if (autoTopupAmount < autoTopupThreshold * 2) {
      setErrorMessage('Auto-topup amount must be at least 2x the threshold.');
      return false;
    }

    try {
      await configureAutoTopup({
        enabled: true,
        threshold: autoTopupThreshold,
        amount: autoTopupAmount,
      });
      return true;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save auto-topup settings');
      return false;
    }
  }, [autoTopupEnabled, autoTopupThreshold, autoTopupAmount]);

  const handleAutoTopupContinue = useCallback(async () => {
    setIsSavingAutoTopup(true);
    setErrorMessage('');
    try {
      const ok = await saveAutoTopupSettings();
      if (ok) continueToDashboard();
    } finally {
      setIsSavingAutoTopup(false);
    }
  }, [saveAutoTopupSettings, continueToDashboard]);

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

      // Checkout success redirects can arrive before webhooks finish.
      // Wait for the paid tier to be reflected before running initialize,
      // otherwise we'd accidentally initialize as free.
      if (subscriptionSuccess) {
        const activated = await waitForPaidActivation(isCurrentRun, 90000);
        if (!activated && isCurrentRun()) {
          throw new Error('Payment is still processing. Please wait a few seconds and try again.');
        }
      }

      // Step 2: Call initialize — returns fast, kicks off sandbox in background
      if (!isCurrentRun()) return;
      setStep('subscription');

      const initResponse = await backendApi.post<{
        status: string;
        tier: string;
        sandbox: 'created' | 'exists' | 'provisioning' | 'failed' | 'none';
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
            sandbox: 'created' | 'exists' | 'provisioning' | 'failed' | 'none';
          }>('/billing/setup/initialize', undefined, { timeout: 30000 });
        }
      }

      if (!isCurrentRun()) return;

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to initialize account');
      }

      const data = response.data!;
      const tier = data.tier === 'pro' ? 'pro' : 'free';
      setPlanTier(tier);

      // Free tier: require at least one connected custom/local instance.
      if (data.sandbox === 'none' || !data.sandbox) {
        if (!isCurrentRun()) return;

        const serversRes = await backendApi.get<Array<{ id: string }>>('/servers', {
          showErrors: false,
          timeout: 10000,
        });

        if (serversRes.success && Array.isArray(serversRes.data) && serversRes.data.length > 0) {
          continueToDashboard();
          return;
        }

        setStep('connect');
        return;
      }

      // Step 3: Poll for sandbox readiness (Pro users)
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
        const ready = await pollSandboxReady(isCurrentRun, 660000);
        if (!ready && isCurrentRun()) {
          throw new Error(
            isHetznerDefault
              ? 'Hetzner sandbox is still provisioning. It can take up to ~10 minutes on first boot. Please wait and try again.'
              : 'Sandbox is still being prepared. Please wait and try again.'
          );
        }
      } else if (data.sandbox === 'failed') {
        throw new Error('Failed to create sandbox. Please try again.');
      }

      if (!isCurrentRun()) return;

      // Pro users get optional auto-topup setup before entering dashboard.
      if (tier === 'pro') {
        setStep('auto_topup');
        return;
      }

      continueToDashboard();
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
  }, [user, isHetznerDefault, pollSandboxReady, continueToDashboard, subscriptionSuccess, waitForPaidActivation]);

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
                {step === 'connect'
                  ? 'Connect Your Instance'
                  : step === 'auto_topup'
                    ? 'Optional Auto-Topup'
                    : 'Setting Up Your Account'}
              </h1>

              <p className="text-[16px] text-foreground/60 text-center leading-relaxed">
                {step === 'connect'
                  ? 'Free plan users bring their own compute. Add one instance to continue.'
                  : step === 'auto_topup'
                    ? 'Configure automatic credit reloads now, or skip and do it later in billing settings.'
                    : 'We\'re creating your workspace and preparing everything you need to get started.'}
              </p>

              {(step === 'connect' || step === 'auto_topup') && errorMessage && (
                <p className="text-sm text-red-400 text-center">{errorMessage}</p>
              )}

              <Card className="w-full bg-card border border-border">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4">
                    {(
                      planTier === 'pro'
                        ? (['checking', 'subscription', 'sandbox', 'auto_topup'] as const)
                        : planTier === 'free'
                          ? (['checking', 'subscription', 'connect'] as const)
                          : (['checking', 'subscription', 'sandbox'] as const)
                    ).map((s) => {
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

              {step === 'connect' && (
                <Card className="w-full bg-card border border-border py-0 gap-0">
                  <CardContent className="p-6 space-y-3">
                    <div className="space-y-1">
                      <label htmlFor={instanceUrlInputId} className="text-xs text-foreground/70">Instance URL</label>
                      <input
                        id={instanceUrlInputId}
                        value={instanceUrl}
                        onChange={(e) => setInstanceUrl(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                        placeholder="http://localhost:8008/v1/p/kortix-sandbox/8000"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={instanceLabelInputId} className="text-xs text-foreground/70">Label (optional)</label>
                      <input
                        id={instanceLabelInputId}
                        value={instanceLabel}
                        onChange={(e) => setInstanceLabel(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                        placeholder="My local instance"
                      />
                    </div>
                    <Button onClick={handleConnectInstance} disabled={isConnectingInstance} className="w-full">
                      {isConnectingInstance ? 'Connecting...' : 'Connect Instance & Continue'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === 'auto_topup' && (
                <Card className="w-full bg-card border border-border py-0 gap-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Credit Auto-topup</p>
                      <span className="text-[11px] text-foreground/50">Optional</span>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={autoTopupEnabled}
                        onChange={(e) => setAutoTopupEnabled(e.target.checked)}
                      />
                      Enable auto-topup
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label htmlFor={autoTopupThresholdInputId} className="text-xs text-foreground/70">Threshold ($)</label>
                        <input
                          id={autoTopupThresholdInputId}
                          type="number"
                          min={5}
                          value={autoTopupThreshold}
                          onChange={(e) => setAutoTopupThreshold(Number(e.target.value || 0))}
                          disabled={!autoTopupEnabled}
                          className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={autoTopupAmountInputId} className="text-xs text-foreground/70">Reload amount ($)</label>
                        <input
                          id={autoTopupAmountInputId}
                          type="number"
                          min={15}
                          value={autoTopupAmount}
                          onChange={(e) => setAutoTopupAmount(Number(e.target.value || 0))}
                          disabled={!autoTopupEnabled}
                          className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={continueToDashboard}>
                        Skip for now
                      </Button>
                      <Button className="flex-1" onClick={handleAutoTopupContinue} disabled={isSavingAutoTopup}>
                        {autoTopupEnabled ? (isSavingAutoTopup ? 'Saving...' : 'Save & Continue') : 'Continue'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'sandbox' && planTier === 'pro' && (
                <Card className="w-full bg-card border border-border py-0 gap-0">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Credit Auto-topup</p>
                      <label className="flex items-center gap-2 text-xs text-foreground/80 whitespace-nowrap">
                        <span>Enable</span>
                        <input
                          type="checkbox"
                          checked={autoTopupEnabled}
                          onChange={(e) => setAutoTopupEnabled(e.target.checked)}
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label htmlFor={autoTopupThresholdInputId} className="space-y-1">
                        <span className="text-[11px] text-foreground/70">Threshold ($)</span>
                        <input
                          id={autoTopupThresholdInputId}
                          type="number"
                          min={5}
                          value={autoTopupThreshold}
                          onChange={(e) => setAutoTopupThreshold(Number(e.target.value || 0))}
                          disabled={!autoTopupEnabled}
                          className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm"
                        />
                      </label>
                      <label htmlFor={autoTopupAmountInputId} className="space-y-1">
                        <span className="text-[11px] text-foreground/70">Reload amount ($)</span>
                        <input
                          id={autoTopupAmountInputId}
                          type="number"
                          min={15}
                          value={autoTopupAmount}
                          onChange={(e) => setAutoTopupAmount(Number(e.target.value || 0))}
                          disabled={!autoTopupEnabled}
                          className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-foreground/55">Optional, can be changed later in Billing</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        disabled={isSavingAutoTopup}
                        onClick={async () => {
                          setIsSavingAutoTopup(true);
                          setErrorMessage('');
                          try {
                            await saveAutoTopupSettings();
                          } finally {
                            setIsSavingAutoTopup(false);
                          }
                        }}
                      >
                        {isSavingAutoTopup ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
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
    case 'connect': return 3;
    case 'auto_topup': return 4;
    case 'success': return 5;
    case 'error': return -1;
    default: return -1;
  }
}
