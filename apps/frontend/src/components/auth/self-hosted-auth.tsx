'use client';

import { useState, useEffect, useCallback, useRef, FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ExternalLink, Loader2, Search, Globe, Image, Mic, BookOpen, Flame, Server, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { selfHostedSignIn, installOwner } from '@/app/auth/actions';
import { useProviderModalStore } from '@/stores/provider-modal-store';
import { GlobalProviderModal } from '@/components/providers/provider-modal';
import { useOpenCodeProviders } from '@/hooks/opencode/use-opencode-sessions';
import { useServerStore, getActiveOpenCodeUrl } from '@/stores/server-store';
import { resetClient } from '@/lib/opencode-sdk';
import { invalidateTokenCache, authenticatedFetch } from '@/lib/auth-token';
import { setBootstrapAuthToken } from '@/lib/auth-token';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getEnv } from '@/lib/env-config';

/* ─── Installer Form Component ─────────────────────────────────────────────── */

interface InstallerFormProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

function InstallerForm({ onSuccess, onError }: InstallerFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    onError('');

    if (password !== confirmPassword) {
      onError('Passwords do not match');
      setPending(false);
      return;
    }

    if (password.length < 6) {
      onError('Password must be at least 6 characters');
      setPending(false);
      return;
    }

    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    formData.append('confirmPassword', confirmPassword);

    try {
      const result = await installOwner(null, formData);
      if (result.success && result.accessToken) {
        setBootstrapAuthToken(result.accessToken);
        invalidateTokenCache();
        resetClient();
        onSuccess();
      } else {
        onError(result.message || 'Failed to create owner account');
      }
    } catch (err: any) {
      console.error('[InstallerForm] Error:', err);
      onError(err?.message || 'An unexpected error occurred');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        id="install-email"
        name="email"
        type="email"
        placeholder="Email address"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl shadow-none"
      />
      <Input
        id="install-password"
        name="password"
        type="password"
        placeholder="Password"
        required
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl shadow-none"
      />
      <Input
        id="install-confirm-password"
        name="confirmPassword"
        type="password"
        placeholder="Confirm password"
        required
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl shadow-none"
      />

      <Button
        type="submit"
        disabled={pending}
        className="w-full h-11 text-[13px] rounded-xl shadow-none"
      >
        {pending ? 'Creating account…' : 'Create owner account'}
      </Button>
    </form>
  );
}

/* ─── Install Status Hook ──────────────────────────────────────────────────── */

export type SandboxProviderName = 'local_docker' | 'daytona' | 'hetzner';

export function useInstallStatus() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sandboxProviders, setSandboxProviders] = useState<SandboxProviderName[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<SandboxProviderName>('local_docker');

  useEffect(() => {
    const backendUrl = getEnv().BACKEND_URL || 'http://localhost:8008/v1';
    let retries = 0;
    const MAX_RETRIES = 3;

    const fetchStatus = async () => {
      try {
        const [statusRes, providerRes] = await Promise.all([
          fetch(`${backendUrl}/setup/install-status`),
          fetch(`${backendUrl}/setup/sandbox-providers`).catch(() => null),
        ]);

        // 503 = backend/Supabase not ready yet — retry
        if (statusRes.status === 503) {
          if (retries < MAX_RETRIES) {
            retries++;
            setTimeout(fetchStatus, 1500 * retries);
            return;
          }
          // Exhausted retries — assume installed=true (shows sign-in, not installer)
          setInstalled(true);
          setLoading(false);
          return;
        }

        // Any other non-2xx — same retry/fallback logic
        if (!statusRes.ok) {
          if (retries < MAX_RETRIES) {
            retries++;
            setTimeout(fetchStatus, 1500 * retries);
            return;
          }
          setInstalled(true);
          setLoading(false);
          return;
        }

        const statusData = await statusRes.json();

        // installed=null means the backend couldn't determine the state — retry
        if (statusData.installed === null || statusData.installed === undefined) {
          if (retries < MAX_RETRIES) {
            retries++;
            setTimeout(fetchStatus, 1500 * retries);
            return;
          }
          setInstalled(true);
          setLoading(false);
          return;
        }

        const providerData = providerRes?.ok
          ? await providerRes.json().catch(() => null)
          : null;

        setInstalled(statusData.installed === true);
        setSandboxProviders(providerData?.providers || ['local_docker']);
        setDefaultProvider(providerData?.default || 'local_docker');
        setLoading(false);
      } catch {
        // Network error — retry, don't flip installed to false
        if (retries < MAX_RETRIES) {
          retries++;
          setTimeout(fetchStatus, 1500 * retries);
          return;
        }
        // Exhausted retries — assume installed=true (shows sign-in, not installer)
        setInstalled(true);
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return { installed, loading, sandboxProviders, defaultProvider };
}

/* ─── Step Indicator ───────────────────────────────────────────────────────── */

function StepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: 1 | 2 | 3 | 4;
  onStepClick?: (step: number) => void;
}) {
  const steps = [1, 2, 3, 4];

  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {steps.map((step, i) => {
        const isDone = step < currentStep;
        const isActive = step === currentStep;
        const isClickable = isDone && !!onStepClick;
        return (
          <div key={step} className="contents">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step)}
              className={`rounded-full transition-all duration-300 ${
                isDone
                  ? 'w-1.5 h-1.5 bg-foreground/40'
                  : isActive
                    ? 'w-6 h-1.5 bg-foreground'
                    : 'w-1.5 h-1.5 bg-foreground/15'
              } ${isClickable ? 'cursor-pointer hover:bg-foreground/70 scale-125' : 'cursor-default'}`}
              aria-label={isClickable ? `Go to step ${step}` : undefined}
            />
            {i < steps.length - 1 && <div className="w-1" />}
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
  },
  {
    key: 'FIRECRAWL_API_KEY',
    label: 'Firecrawl',
    description: 'Web scraping — read and extract web page content',
    icon: Flame,
    signupUrl: 'https://firecrawl.dev',
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

function ToolSecretsStep({ onContinue, onSkip, completing }: { onContinue: () => void; onSkip: () => void; completing?: boolean }) {
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
        const res = await authenticatedFetch(`${baseUrl}/env/${encodeURIComponent(key)}`, {
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
      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 -mr-1">
        {TOOL_SECRETS.map((secret) => {
          const Icon = secret.icon;
          const isSaved = savedKeys.has(secret.key);
          return (
            <div key={secret.key} className="flex items-start gap-3 p-2.5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02]">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]">
                <Icon className="h-3.5 w-3.5 text-foreground/40" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground/80">{secret.label}</span>

                  <a
                    href={secret.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-foreground/20 hover:text-foreground/50 transition-colors"
                    title={`Get ${secret.label} API key`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-[11px] text-foreground/35 leading-relaxed">{secret.description}</p>
                <Input
                  type="password"
                  placeholder={`${secret.key}`}
                  value={values[secret.key] || ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [secret.key]: e.target.value }))}
                  className="h-8 text-xs font-mono shadow-none bg-foreground/[0.04] border-foreground/[0.08] rounded-lg"
                  autoComplete="off"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={onSkip}
          className="flex-1 h-10 text-[13px] rounded-xl shadow-none border-foreground/[0.08]"
          disabled={saving || completing}
        >
          {completing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Finishing…
            </>
          ) : (
            'Skip for now'
          )}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || completing}
          className="flex-1 h-10 text-[13px] rounded-xl shadow-none"
        >
          {saving || completing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {saving ? 'Saving…' : 'Finishing setup…'}
            </>
          ) : filledCount > 0 ? (
            `Save & continue`
          ) : (
            'Continue'
          )}
        </Button>
      </div>

      <p className="text-[11px] text-foreground/25 text-center">
        You can add or change keys later in Settings.
      </p>
    </div>
  );
}

/* ─── Self-Hosted Form Panel ───────────────────────────────────────────────── */

interface SelfHostedFormProps {
  returnUrl: string | null;
  installed: boolean | null;
  /** Preserve wizard progress across parent remounts. */
  initialStep?: 1 | 2 | 3;
  /** Available sandbox providers from the API. */
  sandboxProviders?: SandboxProviderName[];
  /** Default sandbox provider. */
  defaultProvider?: SandboxProviderName;
  /** Called when the wizard transitions between steps so the parent can suppress auto-redirects. */
  onWizardStepChange?: (step: number) => void;
}

export function SelfHostedForm({ returnUrl, installed, initialStep = 1, sandboxProviders = ['local_docker'], defaultProvider = 'local_docker', onWizardStepChange }: SelfHostedFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(initialStep);
  const [sandboxReady, setSandboxReady] = useState(false);
  const [pullProgress, setPullProgress] = useState<{ progress: number; message: string } | null>(null);
  /** Error from sandbox provisioning — shown with a retry button. */
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  /** Which provider the user chose (or was auto-selected). null = not chosen yet. */
  const [chosenProvider, setChosenProvider] = useState<SandboxProviderName | null>(null);
  /** JWT stored after signup so we can provision later if user needs to pick a provider. */
  const jwtRef = useRef<string | null>(null);
  const provisioningRef = useRef(false);
  const router = useRouter();

  const hasMultipleProviders = sandboxProviders.length > 1;

  // If the parent remounts this component while the wizard is in progress,
  // keep the furthest step reached instead of snapping back to step 1.
  useEffect(() => {
    setWizardStep((prev) => (initialStep > prev ? initialStep : prev));
  }, [initialStep]);

  // ── On step 2: if sandbox is already ready (e.g. after page refresh),
  //    skip "Preparing…" by fetching status immediately.
  useEffect(() => {
    if (wizardStep !== 2 || sandboxReady || provisioningRef.current) return;

    const checkExisting = async () => {
      try {
        const backendUrl = getEnv().BACKEND_URL || 'http://localhost:8008/v1';

        // Get current JWT — prefer jwtRef (just signed up), fall back to Supabase session (refresh)
        let jwt = jwtRef.current;
        if (!jwt) {
          const supabase = createBrowserSupabaseClient();
          const { data } = await supabase.auth.getSession();
          jwt = data.session?.access_token ?? null;
        }
        if (!jwt) return;

        const res = await fetch(`${backendUrl}/platform/init/local/status`, {
          headers: { 'Authorization': `Bearer ${jwt}` },
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'ready' && data.data) {
          registerSandbox(data.data);
          setSandboxReady(true);
          setPullProgress(null);
          provisioningRef.current = false;
          // Ensure chosenProvider is set so the correct sub-state renders
          setChosenProvider((prev) => prev ?? (data.data.provider as SandboxProviderName ?? 'local_docker'));
        } else if (data.status === 'pulling' || data.status === 'creating') {
          // Mid-pull on page refresh — resume polling
          setPullProgress({
            progress: data.progress || 0,
            message:
              data.status === 'creating'
                ? 'Creating sandbox container and waiting for Kortix to boot. First boot can take a few minutes...'
                : data.message || 'Pulling sandbox image. First boot can take a few minutes...',
          });
          provisioningRef.current = true;
          pollLocalStatus(jwt, backendUrl);
        } else if (data.status === 'error') {
          // Previous provision failed — show error with retry
          setChosenProvider((prev) => prev ?? 'local_docker');
          setSandboxError(data.message || 'Previous sandbox setup failed');
          provisioningRef.current = false;
        } else {
          // 'none' or unknown — re-provision
          setChosenProvider((prev) => prev ?? 'local_docker');
          provisioningRef.current = true;
          provisionSandbox(jwt, backendUrl, 'local_docker');
        }
      } catch {
        // Ignore — if status check fails, the normal provision flow handles it
      }
    };

    checkExisting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep]);

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
        label: sandbox.name || (isLocal ? 'Local Sandbox' : sandbox.provider === 'hetzner' ? 'Hetzner VPS' : 'Cloud Sandbox'),
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
          provisioningRef.current = false;
          return; // stop polling
        }

        if (data.status === 'error') {
          setSandboxError(data.message || 'Failed to set up sandbox');
          setPullProgress(null);
          provisioningRef.current = false;
          return; // stop polling
        }

        // No sandbox row in DB (e.g. after a nuke + API restart) — re-trigger provision
        if (data.status === 'none') {
          // Inline the POST rather than calling provisionSandbox to avoid circular dep
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
              setPullProgress(null);
              provisioningRef.current = false;
              return;
            }
            // Still provisioning — update message and keep polling
            setPullProgress({
              progress: initData.progress || 0,
              message: initData.message || 'Preparing sandbox…',
            });
          } catch {
            // network error — keep polling
          }
          setTimeout(poll, 2000);
          return;
        }

        // Still pulling or creating container — keep polling
        setPullProgress({
          progress: data.progress || 0,
          message: data.status === 'creating'
            ? 'Creating sandbox container and waiting for Kortix to boot. First boot can take a few minutes...'
            : data.message || 'Pulling sandbox image. First boot can take a few minutes...',
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
    // Clear any previous error before retrying
    provisioningRef.current = true;
    setSandboxError(null);
    setPullProgress(null);

    if (provider === 'local_docker') {
      // Use the specialized local Docker init endpoint (supports async image pull)
      try {
        const initRes = await fetch(`${backendUrl}/platform/init/local`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const initData = await initRes.json();
        const isDuplicateCreateRace = typeof initData.error === 'string' && initData.error.includes('already in use');

        if (initData.status === 'ready' && initData.data) {
          // Sandbox already active or just created synchronously
          registerSandbox(initData.data);
          setSandboxReady(true);
          setPullProgress(null);
          provisioningRef.current = false;
        } else if (initData.status === 'pulling' || initData.status === 'creating') {
          // Image pull in progress OR container being created — poll for completion
          setPullProgress({
            progress: initData.progress || 0,
            message: initData.status === 'creating'
              ? 'Creating sandbox container and waiting for Kortix to boot. First boot can take a few minutes...'
              : initData.message || 'Pulling sandbox image. First boot can take a few minutes...',
          });
          pollLocalStatus(jwt, backendUrl);
        } else if (isDuplicateCreateRace) {
          setPullProgress({
            progress: 95,
            message: 'Sandbox container already exists, waiting for it to finish booting...',
          });
          pollLocalStatus(jwt, backendUrl);
        } else if (initData.success && initData.data) {
          // Fallback: success response with data but no explicit status
          registerSandbox(initData.data);
          setSandboxReady(true);
          provisioningRef.current = false;
        } else {
          // Init returned a failure — surface the error to the user
          const errMsg = initData.error || initData.message || 'Failed to initialize sandbox';
          console.warn('[Setup] Local init failed:', errMsg);
          setSandboxError(errMsg);
          provisioningRef.current = false;
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Network error while initializing sandbox';
        console.warn('[Setup] Local init error:', err);
        if (typeof errMsg === 'string' && errMsg.includes('already in use')) {
          setPullProgress({
            progress: 95,
            message: 'Sandbox container already exists, waiting for it to finish booting...',
          });
          pollLocalStatus(jwt, backendUrl);
        } else {
          setSandboxError(errMsg);
          provisioningRef.current = false;
        }
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
          provisioningRef.current = false;
        } else {
          const errMsg = initData.error || initData.message || `Failed to initialize ${provider} sandbox`;
          console.warn(`[Setup] ${provider} init failed:`, errMsg);
          setSandboxError(errMsg);
          provisioningRef.current = false;
        }
      } catch (err: any) {
        setSandboxError(err?.message || `Network error while initializing ${provider} sandbox`);
        provisioningRef.current = false;
      }
    }
  }, [registerSandbox, pollLocalStatus]);

  // ── Retry sandbox provisioning after an error ──
  const handleRetryProvision = useCallback(async () => {
    const provider = chosenProvider || defaultProvider || 'local_docker';
    const backendUrl = getEnv().BACKEND_URL || 'http://localhost:8008/v1';

    // Get current JWT — prefer jwtRef (just signed up), fall back to Supabase session
    let jwt = jwtRef.current;
    if (!jwt) {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      jwt = data.session?.access_token ?? null;
    }
    if (!jwt) {
      setSandboxError('Authentication expired. Please refresh and sign in again.');
      return;
    }
    await provisionSandbox(jwt, backendUrl, provider);
  }, [chosenProvider, defaultProvider, provisionSandbox]);

  // ── User picks a sandbox provider (multi-provider flow) ──
  const handleSandboxProviderSelect = useCallback(async (provider: SandboxProviderName) => {
    setChosenProvider(provider);
    const backendUrl = getEnv().BACKEND_URL || 'http://localhost:8008/v1';
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

  // ── Step click: navigate back to any completed step ──
  const handleStepClick = useCallback((step: number) => {
    if (step >= wizardStep) return; // can only go back
    setWizardStep(step as 1 | 2 | 3);
    onWizardStepChange?.(step);
  }, [wizardStep, onWizardStepChange]);

  // ── Tool keys done (step 3 → navigate to onboarding) ──
  const handleToolKeysContinue = useCallback(async () => {
    setCompleting(true);
    // Setup wizard complete — mark in DB
    sessionStorage.setItem('setup_complete', 'true');

    // Mark setup complete in the backend (fire-and-forget)
    const backendUrl = getEnv().BACKEND_URL || 'http://localhost:8008/v1';
    try {
      const { authenticatedFetch: authFetch } = await import('@/lib/auth-token');
      await authFetch(`${backendUrl}/setup/setup-complete`, { method: 'POST' });
    } catch {
      // Best effort — dashboard guard will catch incomplete state
    }

    const target = returnUrl || '/onboarding';

    // IMPORTANT: Use window.location.href instead of router.push() to force a
    // full page navigation. During the wizard, the middleware may have refreshed
    // the Supabase session (consuming the single-use refresh token) and set an
    // updated cookie on the response. Client-side navigation via router.push()
    // may not process Set-Cookie headers from middleware responses, leaving the
    // browser with a stale (revoked) refresh token. A full navigation ensures
    // the browser properly receives and stores any updated auth cookies.
    window.location.href = target;
  }, [returnUrl]);

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
      if (!isInstaller) {
        // Returning user: prefer direct client sign-in so session state is
        // immediately available to middleware + AuthProvider.
        let signedInJwt: string | null = null;
        try {
          const supabase = createBrowserSupabaseClient();
          await supabase.auth.signOut({ scope: 'local' });
          const { data: clientSignInData, error: clientSignInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (!clientSignInError && clientSignInData.session) {
            invalidateTokenCache();
            setBootstrapAuthToken(clientSignInData.session.access_token);
            signedInJwt = clientSignInData.session.access_token;
          }
        } catch {
          // Best-effort cleanup of stale local auth state.
        }

        // Fallback: server action sign-in (runtime env on server)
        if (!signedInJwt) {
          invalidateTokenCache();
          setBootstrapAuthToken(null);

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

          if (result.accessToken) {
            signedInJwt = result.accessToken;
          }

          // Ensure browser session is established immediately in addition to
          // server-set cookies. This avoids rare cases where middleware doesn't
          // see a fresh session on the first navigation after login.
          if (result.accessToken && result.refreshToken) {
            try {
              const supabase = createBrowserSupabaseClient();
              await supabase.auth.setSession({
                access_token: result.accessToken,
                refresh_token: result.refreshToken,
              });
            } catch {
              // Fallback to server cookies + full reload below.
            }
          }

          // If we still don't have a JWT, fall back to the original redirect
          if (!signedInJwt) {
            window.location.href = result.redirectTo || returnUrl || '/dashboard';
            return;
          }
        }

        // Self-hosted logins should always land in the local setup flow first.
        // The auth page/load effects will later redirect completed accounts to
        // onboarding or dashboard once backend setup state is confirmed.
        setWizardStep(2);
        onWizardStepChange?.(2);
        setPending(false);
        return;
      } else {
        setErrorMessage('This instance still needs its initial owner account. Run the Kortix installer/CLI bootstrap first.');
        setPending(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred');
      setPending(false);
    }
  };

  // ── Step 3: Tool API keys ──
   if (wizardStep === 3) {
    return (
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-5">
          <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
            Add tool keys
          </h1>
          <p className="text-[13px] text-foreground/40 mt-0.5">
            Optional API keys for agent capabilities
          </p>
        </div>

        <StepIndicator currentStep={3} onStepClick={handleStepClick} />

        <ToolSecretsStep
          onContinue={handleToolKeysContinue}
          onSkip={handleToolKeysContinue}
          completing={completing}
        />
      </div>
    );
  }

  // ── Step 2: Provider setup ──
  if (wizardStep === 2) {
    // ── Sub-state: multiple providers, user hasn't chosen yet ──
    if (hasMultipleProviders && !chosenProvider) {
      return (
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-5">
            <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
              Sandbox environment
            </h1>
            <p className="text-[13px] text-foreground/40 mt-0.5">
              Where should your agent run?
            </p>
          </div>

          <StepIndicator currentStep={2} onStepClick={handleStepClick} />

          <div className="flex flex-col gap-2.5">
            {sandboxProviders.includes('local_docker') && (
              <button
                type="button"
                onClick={() => handleSandboxProviderSelect('local_docker')}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/[0.15] hover:bg-foreground/[0.04] transition-all text-left"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]">
                  <svg className="h-4 w-4 text-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 3h-8l-2 4h12z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground/80">Local Docker</span>
                  <p className="text-[11px] text-foreground/35 mt-0.5 leading-relaxed">
                    Run on this machine. Best for development.
                  </p>
                </div>
              </button>
            )}
            {sandboxProviders.includes('daytona') && (
              <button
                type="button"
                onClick={() => handleSandboxProviderSelect('daytona')}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/[0.15] hover:bg-foreground/[0.04] transition-all text-left"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]">
                  <Globe className="h-4 w-4 text-foreground/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground/80">Daytona</span>
                  <p className="text-[11px] text-foreground/35 mt-0.5 leading-relaxed">
                    Cloud infrastructure. No local Docker needed.
                  </p>
                </div>
              </button>
            )}
            {sandboxProviders.includes('hetzner') && (
              <button
                type="button"
                onClick={() => handleSandboxProviderSelect('hetzner')}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/[0.15] hover:bg-foreground/[0.04] transition-all text-left"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]">
                  <Server className="h-4 w-4 text-foreground/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground/80">Hetzner VPS</span>
                  <p className="text-[11px] text-foreground/35 mt-0.5 leading-relaxed">
                    Dedicated VPS with full isolation.
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
        <div className="flex flex-col items-center mb-5">
          <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
            Connect a provider
          </h1>
          <p className="text-[13px] text-foreground/40 mt-0.5">
            Add an LLM so your agent can think
          </p>
        </div>

        <StepIndicator currentStep={2} onStepClick={handleStepClick} />

        {!sandboxReady ? (
          sandboxError ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="w-full max-w-xs space-y-2 text-center">
                <p className="text-[13px] font-medium text-foreground/80">Sandbox setup failed</p>
                <p className="text-[11px] text-foreground/40 leading-relaxed break-words">
                  {sandboxError}
                </p>
              </div>
              <Button
                onClick={handleRetryProvision}
                className="h-9 px-5 text-[13px] rounded-xl shadow-none"
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <KortixLoader size="medium" />
              {pullProgress ? (
                <div className="w-full max-w-xs flex flex-col items-center gap-2">
                  <div className="w-full bg-foreground/[0.06] rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-foreground h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pullProgress.progress, 2)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-foreground/35 text-center">
                    {pullProgress.message}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-foreground/35">Preparing sandbox…</p>
              )}
            </div>
          )
        ) : (
          <ConnectedProviderSection 
            onContinue={() => setWizardStep(3)}
          />
        )}

        <GlobalProviderModal />
      </div>
    );
  }

  // ── Step 1: Account creation (installer) ──
  if (isInstaller) {
    return (
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
            Create owner account
          </h1>
          <p className="text-[13px] text-foreground/40 mt-0.5">
            Set up the first admin account for this instance
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-[13px]">{errorMessage}</span>
          </div>
        )}

        <InstallerForm 
          onSuccess={() => setWizardStep(2)} 
          onError={setErrorMessage} 
        />
      </div>
    );
  }

  // ── Returning user sign-in ──
  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center mb-6">
        <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
          Sign in to Kortix
        </h1>
        <p className="text-[13px] text-foreground/40 mt-0.5">
          Your AI Computer
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-[13px]">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Email address"
          required
          autoComplete="email"
          className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl shadow-none"
        />
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete="current-password"
          className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl shadow-none"
        />

        <Button
          type="submit"
          disabled={pending}
          className="w-full h-11 text-[13px] rounded-xl shadow-none"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

/* ─── Connected Provider Section Component ─────────────────────────────────── */

interface ConnectedProviderSectionProps {
  onContinue: () => void;
}

function ConnectedProviderSection({ onContinue }: ConnectedProviderSectionProps) {
  const { data: providersData, isLoading } = useOpenCodeProviders();
  const openProviderModal = useProviderModalStore((s) => s.openProviderModal);

  const connectedProviders = useMemo(() => {
    if (!providersData) return [];
    const connectedIds = new Set(providersData.connected ?? []);
    return (providersData.all ?? []).filter((p) => connectedIds.has(p.id));
  }, [providersData]);

  const hasLLMProvider = connectedProviders.some((p) => 
    ['anthropic', 'openai', 'openrouter', 'google', 'groq', 'xai'].includes(p.id)
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-8 space-y-4">
        <KortixLoader size="small" />
        <p className="text-[11px] text-foreground/35">Checking providers…</p>
      </div>
    );
  }

  if (hasLLMProvider) {
    return (
      <div className="flex flex-col items-center py-6 space-y-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
          <svg className="h-6 w-6 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <p className="text-[13px] font-medium text-foreground/80">
            {connectedProviders.length} provider{connectedProviders.length > 1 ? 's' : ''} connected
          </p>
          <p className="text-[11px] text-foreground/40">
            Ready to start using your agent
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={() => openProviderModal('providers')}
            variant="outline"
            className="h-10 px-6 text-[13px] rounded-xl shadow-none"
          >
            Configure LLM Provider
          </Button>
          <Button
            onClick={onContinue}
            className="h-10 px-6 text-[13px] rounded-xl shadow-none"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-8 space-y-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Settings2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-[13px] font-medium text-foreground/80">
          Configure your LLM provider
        </p>
        <p className="text-[11px] text-foreground/40">
          Connect an AI provider to start using your agent
        </p>
      </div>
      <Button
        onClick={() => openProviderModal('providers')}
        className="h-10 px-6 text-[13px] rounded-xl shadow-none"
      >
        Configure LLM Provider
      </Button>
    </div>
  );
}
