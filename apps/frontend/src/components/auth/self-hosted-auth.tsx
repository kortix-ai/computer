'use client';

import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Search, Globe, Image, Mic, BookOpen, Flame } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { installOwner, selfHostedSignIn } from '@/app/auth/actions';
import { ProviderSettings } from '@/components/providers/provider-settings';
import { useServerStore, getActiveOpenCodeUrl } from '@/stores/server-store';
import { resetClient } from '@/lib/opencode-sdk';
import { invalidateTokenCache } from '@/lib/auth-token';

/* ─── Install Status Hook ──────────────────────────────────────────────────── */

export type SandboxProviderName = 'local_docker' | 'daytona';

export function useInstallStatus() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sandboxProviders, setSandboxProviders] = useState<SandboxProviderName[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<SandboxProviderName>('local_docker');

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';

    // Fetch both install-status and sandbox-providers in parallel
    Promise.all([
      fetch(`${backendUrl}/setup/install-status`)
        .then((res) => res.json())
        .catch(() => ({ installed: false })),
      fetch(`${backendUrl}/setup/sandbox-providers`)
        .then((res) => res.json())
        .catch(() => ({ providers: ['local_docker'], default: 'local_docker' })),
    ]).then(([statusData, providerData]) => {
      setInstalled(statusData.installed === true);
      setSandboxProviders(providerData.providers || ['local_docker']);
      setDefaultProvider(providerData.default || 'local_docker');
      setLoading(false);
    });
  }, []);

  return { installed, loading, sandboxProviders, defaultProvider };
}

/* ─── Step Indicator ───────────────────────────────────────────────────────── */

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  const steps = [
    { num: 1, label: 'Account' },
    { num: 2, label: 'LLM provider' },
    { num: 3, label: 'Tool keys' },
    { num: 4, label: 'Start using' },
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

/* ─── Tool Secrets Config ──────────────────────────────────────────────────── */

/** Tool API keys the agent uses — shown in wizard step 3. All optional. */
const TOOL_SECRETS = [
  {
    key: 'TAVILY_API_KEY',
    label: 'Tavily',
    description: 'Web search — lets the agent search the internet',
    icon: Search,
    signupUrl: 'https://tavily.com',
    recommended: true,
  },
  {
    key: 'FIRECRAWL_API_KEY',
    label: 'Firecrawl',
    description: 'Web scraping — read and extract web page content',
    icon: Flame,
    signupUrl: 'https://firecrawl.dev',
    recommended: true,
  },
  {
    key: 'SERPER_API_KEY',
    label: 'Serper',
    description: 'Google image search for finding visual content',
    icon: Image,
    signupUrl: 'https://serper.dev',
  },
  {
    key: 'REPLICATE_API_TOKEN',
    label: 'Replicate',
    description: 'AI image & video generation',
    icon: Image,
    signupUrl: 'https://replicate.com',
  },
  {
    key: 'CONTEXT7_API_KEY',
    label: 'Context7',
    description: 'Documentation search for coding libraries',
    icon: BookOpen,
    signupUrl: 'https://context7.com',
  },
  {
    key: 'ELEVENLABS_API_KEY',
    label: 'ElevenLabs',
    description: 'Text-to-speech and voice generation',
    icon: Mic,
    signupUrl: 'https://elevenlabs.io',
  },
] as const;

/* ─── Tool Secrets Step ───────────────────────────────────────────────────── */

function ToolSecretsStep({ onContinue, onSkip }: { onContinue: () => void; onSkip: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const filledCount = Object.values(values).filter((v) => v.trim()).length;

  const handleSave = useCallback(async () => {
    const toSave = Object.entries(values).filter(([, v]) => v.trim());
    if (toSave.length === 0) {
      onContinue();
      return;
    }

    setSaving(true);
    const baseUrl = getActiveOpenCodeUrl();

    try {
      for (const [key, value] of toSave) {
        const res = await fetch(`${baseUrl}/env/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: value.trim() }),
        });
        if (res.ok) {
          setSavedKeys((prev) => new Set([...prev, key]));
        }
      }
      onContinue();
    } catch (err) {
      console.warn('[Setup] Failed to save some secrets:', err);
      // Continue anyway — user can fix in Settings later
      onContinue();
    } finally {
      setSaving(false);
    }
  }, [values, onContinue]);

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {TOOL_SECRETS.map((secret) => {
          const Icon = secret.icon;
          const isSaved = savedKeys.has(secret.key);
          return (
            <div key={secret.key} className="flex items-start gap-3 p-2.5 rounded-lg border border-border/50 bg-card/50">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{secret.label}</span>
                  {'recommended' in secret && secret.recommended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      Recommended
                    </span>
                  )}
                  <a
                    href={secret.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                    title={`Get ${secret.label} API key`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{secret.description}</p>
                <Input
                  type="password"
                  placeholder={`${secret.key}`}
                  value={values[secret.key] || ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [secret.key]: e.target.value }))}
                  className="h-8 text-xs font-mono shadow-none"
                  autoComplete="off"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          onClick={onSkip}
          className="flex-1 h-10 text-sm"
          disabled={saving}
        >
          Skip for now
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-10 text-sm"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Saving...
            </>
          ) : filledCount > 0 ? (
            `Save ${filledCount} key${filledCount > 1 ? 's' : ''} & continue`
          ) : (
            'Continue'
          )}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        All keys are optional. You can add or change them later in Settings → Secrets Manager.
      </p>
    </div>
  );
}

/* ─── Self-Hosted Form Panel ───────────────────────────────────────────────── */

interface SelfHostedFormProps {
  returnUrl: string | null;
  installed: boolean | null;
  /** Available sandbox providers from the API. */
  sandboxProviders?: SandboxProviderName[];
  /** Default sandbox provider. */
  defaultProvider?: SandboxProviderName;
  /** Called when the wizard transitions between steps so the parent can suppress auto-redirects. */
  onWizardStepChange?: (step: number) => void;
}

export function SelfHostedForm({ returnUrl, installed, sandboxProviders = ['local_docker'], defaultProvider = 'local_docker', onWizardStepChange }: SelfHostedFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [sandboxReady, setSandboxReady] = useState(false);
  const [pullProgress, setPullProgress] = useState<{ progress: number; message: string } | null>(null);
  /** Which provider the user chose (or was auto-selected). null = not chosen yet. */
  const [chosenProvider, setChosenProvider] = useState<SandboxProviderName | null>(null);
  /** JWT stored after signup so we can provision later if user needs to pick a provider. */
  const jwtRef = useRef<string | null>(null);
  const router = useRouter();

  const hasMultipleProviders = sandboxProviders.length > 1;

  // ── Helpers (hooks must be before any early return) ──

  const registerSandbox = useCallback((sandbox: any) => {
    const store = useServerStore.getState();
    const isLocal = sandbox.provider === 'local_docker';

    // Clear stale non-default sandbox entries from previous sessions/users
    const staleIds = store.servers
      .filter((s: any) => s.provider && s.id !== 'default')
      .map((s: any) => s.id);
    for (const id of staleIds) store.removeServer(id);

    const registeredId = store.registerOrUpdateSandbox(
      {
        label: sandbox.name || (isLocal ? 'Local Sandbox' : 'Cloud Sandbox'),
        provider: sandbox.provider,
        sandboxId: sandbox.external_id,
        mappedPorts: sandbox.metadata?.mappedPorts,
      },
      { autoSwitch: true, isLocal },
    );

    // Force-switch to the registered sandbox — autoSwitch may be suppressed
    // if userSelected is true from a previous session.
    if (registeredId) {
      store.setActiveServer(registeredId, { auto: true });
    }
    resetClient();
  }, []);

  const pollLocalStatus = useCallback((jwt: string, backendUrl: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${backendUrl}/platform/init/local/status`, {
          headers: { 'Authorization': `Bearer ${jwt}` },
        });
        const data = await res.json();

        if (data.status === 'ready' && data.data) {
          registerSandbox(data.data);
          setSandboxReady(true);
          setPullProgress(null);
          return; // stop polling
        }

        if (data.status === 'error') {
          setPullProgress({ progress: 0, message: data.message || 'Failed to pull image' });
          return; // stop polling
        }

        // Still pulling
        setPullProgress({
          progress: data.progress || 0,
          message: data.message || 'Pulling sandbox image...',
        });

        // Poll again in 2s
        setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 3000);
      }
    };
    setTimeout(poll, 2000);
  }, [registerSandbox]);

  // ── Provision sandbox via generic /platform/init (works for any provider) ──
  const provisionSandbox = useCallback(async (jwt: string, backendUrl: string, provider: SandboxProviderName) => {
    if (provider === 'local_docker') {
      // Use the specialized local Docker init endpoint (supports async image pull)
      try {
        const initRes = await fetch(`${backendUrl}/platform/init/local`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const initData = await initRes.json();

        if (initData.status === 'ready' && initData.data) {
          registerSandbox(initData.data);
          setSandboxReady(true);
        } else if (initData.status === 'pulling') {
          setPullProgress({ progress: 0, message: initData.message || 'Pulling sandbox image...' });
          pollLocalStatus(jwt, backendUrl);
        } else if (!initData.success) {
          console.warn('[Setup] Local init failed:', initData.error);
          setSandboxReady(false);
        }
      } catch {
        setSandboxReady(false);
      }
    } else {
      // Daytona (or any non-local provider) — uses generic init, synchronous
      try {
        const initRes = await fetch(`${backendUrl}/platform/init`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        });
        const initData = await initRes.json();

        if (initData.success && initData.data) {
          registerSandbox(initData.data);
          setSandboxReady(true);
        } else {
          console.warn(`[Setup] ${provider} init failed:`, initData.error);
          setSandboxReady(false);
        }
      } catch {
        setSandboxReady(false);
      }
    }
  }, [registerSandbox, pollLocalStatus]);

  // ── User picks a sandbox provider (multi-provider flow) ──
  const handleSandboxProviderSelect = useCallback(async (provider: SandboxProviderName) => {
    setChosenProvider(provider);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
    const jwt = jwtRef.current;
    if (jwt) {
      await provisionSandbox(jwt, backendUrl, provider);
    }
  }, [provisionSandbox]);

  // ── Provider setup done (step 2 → step 3: tool keys) ──
  const handleProviderContinue = useCallback(() => {
    setWizardStep(3);
    onWizardStepChange?.(3);
  }, [onWizardStepChange]);

  // ── Tool keys done (step 3 → navigate to onboarding) ──
  const handleToolKeysContinue = useCallback(() => {
    router.push(returnUrl || '/onboarding');
  }, [router, returnUrl]);

  // ── Early return: loading state ──
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

    try {
      if (isInstaller) {
        const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
        if (password !== confirmPassword) {
          setErrorMessage('Passwords do not match');
          setPending(false);
          return;
        }

        // Use server action — runs server-side with runtime env vars,
        // bypassing the NEXT_PUBLIC_ baked-key issue in Docker deployments.
        const formData = new FormData();
        formData.set('email', email);
        formData.set('password', password);
        formData.set('confirmPassword', confirmPassword);

        const result = await installOwner(null, formData);

        if (result.message) {
          setErrorMessage(result.message);
          setPending(false);
          return;
        }

        // Server action succeeded — session cookies are set server-side.
        // Store the JWT for sandbox provisioning in subsequent steps.
        const jwt = result.accessToken;
        jwtRef.current = jwt || null;

        // Invalidate the token cache so subsequent calls (e.g. ProviderSettings)
        // pick up the fresh session instead of stale null.
        invalidateTokenCache();

        // Tell the parent we're entering step 2
        setWizardStep(2);
        onWizardStepChange?.(2);

        // Provision sandbox — if only one provider, auto-provision immediately.
        // If multiple providers, defer to step 2 where user picks.
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';

        if (!hasMultipleProviders && jwt) {
          const autoProvider = sandboxProviders[0] || 'local_docker';
          setChosenProvider(autoProvider);
          await provisionSandbox(jwt, backendUrl, autoProvider);
        }
        // else: multiple providers — step 2 will show the picker

        setPending(false);
      } else {
        // Returning user: use server action for sign-in
        const formData = new FormData();
        formData.set('email', email);
        formData.set('password', password);
        if (returnUrl) formData.set('returnUrl', returnUrl);

        const result = await selfHostedSignIn(null, formData);

        if (result.message) {
          setErrorMessage(result.message);
          setPending(false);
          return;
        }

        // Hard redirect — router.push() does a soft navigation that doesn't
        // re-run middleware, so the auth cookie set by the server action
        // wouldn't be picked up. A full page load ensures middleware sees it.
        window.location.href = result.redirectTo || returnUrl || '/dashboard';
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred');
      setPending(false);
    }
  };

  // ── Step 3: Tool API keys ──
   if (isInstaller && wizardStep === 3) {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-4 sm:mb-6 flex items-center flex-col gap-2 justify-center">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-foreground text-center leading-tight">
            Tool API Keys
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Add API keys for tools your agent can use — web search, image generation, and more.
          </p>
        </div>

        <StepIndicator currentStep={3} />

        <ToolSecretsStep
          onContinue={handleToolKeysContinue}
          onSkip={handleToolKeysContinue}
        />
      </div>
    );
  }

  // ── Step 2: Provider setup ──
  if (isInstaller && wizardStep === 2) {
    // ── Sub-state: multiple providers, user hasn't chosen yet ──
    if (hasMultipleProviders && !chosenProvider) {
      return (
        <div className="w-full max-w-sm">
          <div className="mb-4 sm:mb-6 flex items-center flex-col gap-2 justify-center">
            <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-foreground text-center leading-tight">
              Choose Sandbox Environment
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Where should your agent&apos;s sandbox run? You can change this later.
            </p>
          </div>

          <StepIndicator currentStep={2} />

          <div className="flex flex-col gap-3">
            {sandboxProviders.includes('local_docker') && (
              <button
                type="button"
                onClick={() => handleSandboxProviderSelect('local_docker')}
                className="flex items-start gap-3 p-4 rounded-lg border border-border/50 bg-card/50 hover:border-primary/40 hover:bg-card transition-all text-left"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <svg className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 3h-8l-2 4h12z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">Local Docker</span>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Run the sandbox on this machine using Docker. Best for development and full control.
                  </p>
                </div>
              </button>
            )}
            {sandboxProviders.includes('daytona') && (
              <button
                type="button"
                onClick={() => handleSandboxProviderSelect('daytona')}
                className="flex items-start gap-3 p-4 rounded-lg border border-border/50 bg-card/50 hover:border-primary/40 hover:bg-card transition-all text-left"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">Daytona (Cloud)</span>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Run the sandbox on Daytona cloud infrastructure. No local Docker required.
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      );
    }

    // ── Sub-state: provider chosen, sandbox provisioning / ready ──
    return (
      <div className="w-full max-w-sm">
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
            {pullProgress ? (
              <div className="w-full max-w-xs flex flex-col items-center gap-2">
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(pullProgress.progress, 2)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {pullProgress.message}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Preparing sandbox…</p>
            )}
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
            className="w-full h-10 sm:h-11 text-sm"
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
            className="w-full h-10 sm:h-11 text-sm"
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
