'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { createClient } from '@/lib/supabase/client';
import { ProviderSettings } from '@/components/providers/provider-settings';
import { getSandboxUrl } from '@/lib/platform-client';
import { useServerStore } from '@/stores/server-store';
import { resetClient } from '@/lib/opencode-sdk';
import { invalidateTokenCache } from '@/lib/auth-token';

/* ─── Install Status Hook ──────────────────────────────────────────────────── */

export function useInstallStatus() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
    fetch(`${backendUrl}/setup/install-status`)
      .then((res) => res.json())
      .then((data) => {
        setInstalled(data.installed === true);
        setLoading(false);
      })
      .catch(() => {
        setInstalled(false);
        setLoading(false);
      });
  }, []);

  return { installed, loading };
}

/* ─── Step Indicator ───────────────────────────────────────────────────────── */

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: 'Create account' },
    { num: 2, label: 'Connect provider' },
    { num: 3, label: 'Start using' },
  ];

  return (
    <div className="flex items-center gap-2 mb-6 px-1">
      {steps.map((step, i) => {
        const isDone = step.num < currentStep;
        const isActive = step.num === currentStep;
        return (
          <div key={step.num} className="contents">
            <div className="flex items-center gap-1.5 flex-1">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                  isDone
                    ? 'bg-primary/20 text-primary'
                    : isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.num}
              </div>
              <span
                className={`text-xs truncate ${
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <div className="h-px flex-1 bg-border max-w-8" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Self-Hosted Form Panel ───────────────────────────────────────────────── */

interface SelfHostedFormProps {
  returnUrl: string | null;
  installed: boolean | null;
  /** Called when the wizard transitions between steps so the parent can suppress auto-redirects. */
  onWizardStepChange?: (step: number) => void;
}

export function SelfHostedForm({ returnUrl, installed, onWizardStepChange }: SelfHostedFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [sandboxReady, setSandboxReady] = useState(false);
  const router = useRouter();

  if (installed === null) {
    return <KortixLoader size="medium" />;
  }

  const isInstaller = !installed;

  // ── Account creation handler (step 1) ──
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setPending(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      setPending(false);
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      setPending(false);
      return;
    }

    const supabase = createClient();

    try {
      if (isInstaller) {
        const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
        if (password !== confirmPassword) {
          setErrorMessage('Passwords do not match');
          setPending(false);
          return;
        }

        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setErrorMessage(signUpError.message);
          setPending(false);
          return;
        }

        // Tell the parent we're entering step 2 BEFORE signIn — because
        // signInWithPassword triggers AuthProvider.onAuthStateChange which
        // makes `user` truthy, and SelfHostedLoginContent auto-redirects
        // to /onboarding if wizardStep is still 1. The ref-based callback
        // is synchronous, so the parent sees step=2 immediately.
        setWizardStep(2);
        onWizardStepChange?.(2);

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          // Revert wizard step on sign-in failure
          setWizardStep(1);
          onWizardStepChange?.(1);
          setErrorMessage(signInError.message);
          setPending(false);
          return;
        }

        // We have the JWT right here — use it directly instead of going through
        // getSupabaseAccessToken() which may have a stale null cached from before signup.
        const jwt = signInData.session?.access_token;

        // Invalidate the token cache so subsequent calls (e.g. ProviderSettings)
        // pick up the fresh session instead of stale null.
        invalidateTokenCache();

        // Provision sandbox using the JWT we already have
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
        try {
          const initRes = await fetch(`${backendUrl}/platform/init`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          });
          const initData = await initRes.json();

          if (initData.success && initData.data) {
            const sandbox = initData.data;
            const url = getSandboxUrl(sandbox);
            const store = useServerStore.getState();
            // Clear stale sandbox entries from previous sessions/users
            const staleIds = store.servers.filter((s) => s.provider).map((s) => s.id);
            for (const id of staleIds) store.removeServer(id);
            store.registerOrUpdateSandbox(
              {
                url,
                label: sandbox.name || 'Local Sandbox',
                provider: sandbox.provider,
                sandboxId: sandbox.external_id,
                mappedPorts: sandbox.metadata?.mappedPorts,
              },
              { autoSwitch: true, isLocal: sandbox.provider === 'local_docker' },
            );
            resetClient();
            setSandboxReady(true);
          } else {
            console.warn('[Setup] Sandbox init failed:', initData.error);
            setSandboxReady(false);
          }
        } catch {
          // Sandbox provision failed — still show step 2, provider settings
          // will show a connection error but won't block the flow
          setSandboxReady(false);
        }

        setPending(false);
      } else {
        // Returning user: just sign in and go
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setErrorMessage(error.message);
          setPending(false);
          return;
        }
        router.push(returnUrl || '/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred');
      setPending(false);
    }
  };

  // ── Provider setup done (step 2 → navigate) ──
  const handleProviderContinue = useCallback(() => {
    router.push(returnUrl || '/onboarding');
  }, [router, returnUrl]);

  // ── Step 2: Provider setup ──
  if (isInstaller && wizardStep === 2) {
    return (
      <div className="w-full max-w-sm">
        {/* Wizard badge */}
        <div className="flex justify-center mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Setup Wizard
          </span>
        </div>

        <div className="mb-4 sm:mb-6 flex items-center flex-col gap-2 justify-center">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-foreground text-center leading-tight">
            Connect a Provider
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Connect an LLM provider so your agent can think. You can add more later in Settings.
          </p>
        </div>

        <StepIndicator currentStep={2} />

        {!sandboxReady ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <KortixLoader size="medium" />
            <p className="text-xs text-muted-foreground">Waiting for sandbox to start…</p>
          </div>
        ) : (
          <div className="h-[400px]">
            <ProviderSettings
              variant="setup"
              onContinue={handleProviderContinue}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Step 1: Account creation (installer) ──
  if (isInstaller) {
    return (
      <div className="w-full max-w-sm">
        {/* Wizard badge */}
        <div className="flex justify-center mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Setup Wizard
          </span>
        </div>

        <div className="mb-4 sm:mb-6 flex items-center flex-col gap-2 justify-center">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-foreground text-center leading-tight">
            Welcome to Kortix
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Create your admin account to complete the installation. You&apos;ll be the owner of this instance.
          </p>
        </div>

        <StepIndicator currentStep={1} />

        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="Email address"
            required
            autoComplete="email"
            className="h-10 sm:h-11 text-[16px] sm:text-sm"
          />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Password"
            required
            autoComplete="new-password"
            className="h-10 sm:h-11 text-[16px] sm:text-sm"
          />
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Confirm password"
            required
            autoComplete="new-password"
            className="h-10 sm:h-11 text-[16px] sm:text-sm"
          />

          <Button
            type="submit"
            disabled={pending}
            className="w-full h-10 sm:h-11 text-sm sm:text-base"
          >
            {pending ? 'Setting up...' : 'Create account & continue'}
          </Button>
        </form>

        <p className="text-[11px] sm:text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          This will be the owner account for this Kortix instance.
        </p>
      </div>
    );
  }

  // ── Returning user sign-in ──
  return (
    <div className="w-full max-w-sm">
      <div className="mb-4 sm:mb-6 flex items-center flex-col gap-2 sm:gap-4 justify-center">
        <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-foreground text-center leading-tight">
          Sign in to Kortix
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          Enter your credentials to continue.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Email address"
          required
          autoComplete="email"
          className="h-10 sm:h-11 text-[16px] sm:text-sm"
        />
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete="current-password"
          className="h-10 sm:h-11 text-[16px] sm:text-sm"
        />

        <Button
          type="submit"
          disabled={pending}
          className="w-full h-10 sm:h-11 text-sm sm:text-base"
        >
          {pending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-[11px] sm:text-xs text-muted-foreground text-center mt-6 leading-relaxed">
        Self-hosted Kortix instance
      </p>
    </div>
  );
}
