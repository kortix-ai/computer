'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/AuthProvider';

import {
  useCreateOpenCodeSession,
} from '@/hooks/opencode/use-opencode-sessions';
import { SessionChat } from '@/components/session/session-chat';
import { SidebarContext } from '@/components/ui/sidebar';
import { OpenCodeEventStreamProvider } from '@/hooks/opencode/use-opencode-events';
import { getClient } from '@/lib/opencode-sdk';
import { useServerStore } from '@/stores/server-store';
import { Button } from '@/components/ui/button';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import { authenticatedFetch } from '@/lib/auth-token';
import { useSandbox, useProviders } from '@/hooks/platform/use-sandbox';

/* ─── Constants ──────────────────────────────────────────────── */

const SYMBOL = "M25.5614 24.916H29.8268C29.8268 19.6306 26.9378 15.0039 22.6171 12.4587C26.9377 9.91355 29.8267 5.28685 29.8267 0.00146484H25.5613C25.5613 5.00287 21.8906 9.18692 17.0654 10.1679V0.00146484H12.8005V10.1679C7.9526 9.20401 4.3046 5.0186 4.3046 0.00146484H0.0391572C0.0391572 5.28685 2.92822 9.91355 7.24884 12.4587C2.92818 15.0039 0.0390625 19.6306 0.0390625 24.916H4.30451C4.30451 19.8989 7.95259 15.7135 12.8005 14.7496V24.9206H17.0654V14.7496C21.9133 15.7134 25.5614 19.8989 25.5614 24.916Z";

const BIOS_LINES: { text: string; bold?: boolean }[] = [
  { text: 'KORTIX BIOS v2.0.1', bold: true },
  { text: '' },
  { text: 'CPU: Kortix Inference Engine X1 @ 3.80 GHz' },
  { text: 'Memory test................. OK' },
  { text: 'Neural cores............... 8/8 online' },
  { text: 'Agent runtime.............. initialized' },
  { text: 'Tool registry.............. 47 tools loaded' },
  { text: 'Secure enclave............. active' },
  { text: 'Mounting workspace......... done' },
  { text: 'Connecting to services..... done' },
  { text: '' },
  { text: 'All systems nominal. Starting KORTIX OS...' },
];

/** No-op sidebar context so SessionChat's deep useSidebar() calls don't crash. */
const _noop = () => {};
const _sidebarStub = {
  state: 'collapsed' as const,
  open: false,
  setOpen: _noop as (open: boolean) => void,
  openMobile: false,
  setOpenMobile: _noop as (open: boolean) => void,
  isMobile: false,
  toggleSidebar: _noop,
};

/** Get the sandbox instance URL (routed through backend at /v1/p/{sandboxId}/8000) */
function getInstanceUrl() {
  return useServerStore.getState().getActiveServerUrl();
}

/* ─── Types ──────────────────────────────────────────────────── */

type BootPhase = 'bios' | 'logo' | 'onboarding' | 'session';

/* ─── Helpers ────────────────────────────────────────────────── */

/** Persist the onboarding session ID to the sandbox instance (fire-and-forget). */
function persistOnboardingSessionId(sessionId: string) {
  const instanceUrl = getInstanceUrl();
  authenticatedFetch(`${instanceUrl}/env/ONBOARDING_SESSION_ID`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: sessionId }),
  }).catch(() => {}); // best effort
}

/** Persist that the onboarding command has been fired (survives page refresh). */
function persistCommandFired() {
  const instanceUrl = getInstanceUrl();
  authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMMAND_FIRED`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'true' }),
  }).catch(() => {}); // best effort
}

/** Check if the onboarding command was already fired (persisted across refreshes). */
async function wasCommandFired(): Promise<boolean> {
  try {
    const instanceUrl = getInstanceUrl();
    const res = await authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMMAND_FIRED`);
    if (res.ok) {
      const data = await res.json();
      return data.ONBOARDING_COMMAND_FIRED === 'true';
    }
  } catch { /* ignore */ }
  return false;
}

/* ─── Sub-components ─────────────────────────────────────────── */

function LoadingDots() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1 h-1 rounded-full bg-foreground/30"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const createSession = useCreateOpenCodeSession();
  const creatingRef = useRef(false);
  const commandFiredRef = useRef(false);
  const commandRetryRef = useRef(false);
  const retriesRef = useRef(0);
  const { user, session, isLoading, signOut, supabase } = useAuth();

  // Ensure sandbox is registered in server store (same as dashboard layout).
  // This makes getInstanceUrl() return the correct sandbox URL.
  const { sandbox, refetch: refetchSandbox } = useSandbox();
  const { data: providersInfo } = useProviders();
  const [phase, setPhase] = useState<BootPhase>('bios');
  const [visibleLines, setVisibleLines] = useState(0);
  const [progressFill, setProgressFill] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [onboardingWaitSec, setOnboardingWaitSec] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bootTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [biosReady, setBiosReady] = useState(false);

  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  const isHetznerOnboarding =
    sandbox?.provider === 'hetzner' || (!sandbox && providersInfo?.default === 'hetzner');

  const getHetznerProvisioningMessage = useCallback((elapsedSec: number) => {
    if (elapsedSec < 20) return 'Allocating Hetzner VPS...';
    if (elapsedSec < 90) return 'Provisioning from snapshot...';
    if (elapsedSec < 150) return 'Booting sandbox services...';
    return 'Running health checks...';
  }, []);

  const waitForSandboxHealthVersion = useCallback(async (timeoutMs = 180_000): Promise<string | null> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const instanceUrl = getInstanceUrl();
      if (instanceUrl) {
        try {
          const res = await authenticatedFetch(
            `${instanceUrl}/kortix/health`,
            { signal: AbortSignal.timeout(5000) },
            { retryOnAuthError: false },
          );
          if (res.ok) {
            const health = await res.json().catch(() => null) as { version?: string } | null;
            const version = typeof health?.version === 'string' ? health.version : '';
            if (version && version !== '0.0.0') return version;
          }
        } catch {
          // keep waiting; service may still be starting
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  }, []);

  const isSandboxAuthError = useCallback((err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /not authorized to access this sandbox/i.test(msg);
  }, []);

  const refreshSandboxRouting = useCallback(async () => {
    // Allow auto-switch to the sandbox after refetch/register.
    useServerStore.setState({ activeServerId: '', userSelected: false });
    try {
      await refetchSandbox();
    } catch {
      // best effort
    }
  }, [refetchSandbox]);

  // ── Query param controls ───────────────────────────────────────
  // ?skip_onboarding → mark complete & go to dashboard
  // ?redo            → clear ONBOARDING_COMPLETE so the flow reruns
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instanceUrl = getInstanceUrl();

    if (params.has('skip_onboarding')) {
      // Directly mark complete and redirect — only allowed via query param
      authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'true' }),
      }).catch(() => {}).finally(() => router.replace('/dashboard'));
      return;
    }

    if (params.has('redo')) {
      // Reset onboarding flags so the full flow runs again
      authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'false' }),
      }).catch(() => {});
      authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMMAND_FIRED`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'false' }),
      }).catch(() => {});
      authenticatedFetch(`${instanceUrl}/env/ONBOARDING_SESSION_ID`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      }).catch(() => {});
      // Strip ?redo from URL so it doesn't loop on refresh
      const clean = new URL(window.location.href);
      clean.searchParams.delete('redo');
      window.history.replaceState({}, '', clean.pathname + clean.search);
    }
  }, [router]);

  // ── Redirect if already onboarded ─────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('skip_onboarding') || params.has('redo')) return; // handled above
    const check = async () => {
      try {
        const instanceUrl = getInstanceUrl();
        const res = await authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`);
        if (res.ok) {
          const data = await res.json();
          if (data.ONBOARDING_COMPLETE === 'true') {
            router.replace('/dashboard');
          }
        }
      } catch {
        // Sandbox not reachable yet — stay on onboarding
      }
    };
    check();
  }, [router]);

  // ── Onboarding wait timer (for Hetzner-specific provisioning copy) ──
  useEffect(() => {
    if (phase !== 'onboarding') {
      setOnboardingWaitSec(0);
      return;
    }

    setOnboardingWaitSec(0);
    const id = setInterval(() => setOnboardingWaitSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── Redirect to auth if not logged in ─────────────────────────
  useEffect(() => {
    if (isLoading || user || session?.user) return;

    let cancelled = false;

    const verifyAndRedirect = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user) return;
      } catch {
        if (cancelled) return;
      }

      router.replace('/auth?redirect=%2Fonboarding');
    };

    void verifyAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [user, session, isLoading, router, supabase]);

  // ── Onboarding session lifecycle ──────────────────────────────
  // When we reach the 'onboarding' phase:
  // 1. Resume existing session or create a new one
  // 2. Fire /onboarding command (fire-and-forget via mutation .mutate())
  // 3. Transition to 'session' phase — renders SessionChat full-page
  // 4. Poll ONBOARDING_COMPLETE — the onboarding AGENT sets it when done
  // 5. When complete → redirect to /dashboard
  const MAX_RETRIES = 3;
  const [onboardingSessionId, setOnboardingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'onboarding') return;
    if (sessionError) return;
    if (creatingRef.current) return;
    creatingRef.current = true;

    let retryTimer: ReturnType<typeof setTimeout>;
    const instanceUrl = getInstanceUrl();

    (async () => {
      try {
        let finalSessionId: string | null = null;
        let needsCommand = false;

        // Guard against stale local routing: if we already know the sandbox ID,
        // only continue once the active instance URL points to that sandbox.
        if (sandbox?.external_id) {
          const instanceUrl = getInstanceUrl();
          const expectedSegment = `/p/${sandbox.external_id}/`;
          if (!instanceUrl || !instanceUrl.includes(expectedSegment)) {
            throw new Error('Sandbox route is still syncing');
          }
        }

        // Hetzner cold starts can take 2-3 minutes; wait for real health/version
        // before starting onboarding session flow.
        if (isHetznerOnboarding) {
          const version = await waitForSandboxHealthVersion(180_000);
          if (!version) {
            throw new Error('Hetzner sandbox is still provisioning. Please wait and retry.');
          }
        }

        // 1. Check if the command was already fired (persisted flag survives
        //    page refresh, unlike the in-memory commandFiredRef).
        const alreadyFired = await wasCommandFired();
        if (alreadyFired) {
          commandFiredRef.current = true;
        }

        // 2. Try to resume an existing onboarding session
        const res = await authenticatedFetch(`${instanceUrl}/env/ONBOARDING_SESSION_ID`).catch(() => null);
        const existingId = res?.ok ? (await res.json()).ONBOARDING_SESSION_ID : null;

        if (existingId && existingId !== '' && existingId !== null) {
          try {
            const client = getClient();
            const result = await client.session.get({ sessionID: existingId });
            if (result.data) {
              finalSessionId = existingId;
              // Always inspect messages for liveness. A stale persisted
              // ONBOARDING_COMMAND_FIRED=true can exist even if the command
              // never actually started (network/proxy failure). In that case,
              // re-fire the onboarding command to guarantee progress.
              const msgs = await client.session.messages({ sessionID: existingId });
              const hasAssistantMessage = (msgs.data ?? []).some(
                (m) => m.info?.role === 'assistant',
              );
              if (!hasAssistantMessage) {
                needsCommand = true;
              }
            }
          } catch {
            authenticatedFetch(`${instanceUrl}/env/ONBOARDING_SESSION_ID`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: '' }),
            }).catch(() => {});
          }
        }

        // 3. No valid session — create + persist
        if (!finalSessionId) {
          const session = await createSessionRef.current.mutateAsync({ title: 'Kortix Onboarding' });
          persistOnboardingSessionId(session.id);
          finalSessionId = session.id;
          needsCommand = true;
        }

        // 4. Fire /onboarding command if needed.
        //    - commandFiredRef guards within this component lifecycle
        //    - wasCommandFired() guards across page refreshes
        //    - Fire-and-forget via SDK directly (NOT through TanStack Query)
        //      to avoid mutation retry on proxy timeouts. The /command endpoint
        //      blocks until the agent finishes, which can take minutes.
        if (needsCommand && !commandFiredRef.current) {
          commandFiredRef.current = true;
          persistCommandFired(); // persist to sandbox env — survives refresh
          const client = getClient();
          void client.session.command({
            sessionID: finalSessionId,
            command: 'onboarding',
            arguments: '',
          }).catch(() => {
            // Command POST failed or timed out — the agent may still be
            // processing server-side. Do NOT retry; the SSE stream will
            // deliver updates if processing is underway.
            commandFiredRef.current = false;
          });
        }

        // 5. Show the session chat full-page
        commandRetryRef.current = false;
        setOnboardingSessionId(finalSessionId);
        setPhase('session');
      } catch (err) {
        if (isSandboxAuthError(err)) {
          creatingRef.current = false;
          toast.warning('Refreshing sandbox connection…');
          await refreshSandboxRouting();
          retryTimer = setTimeout(() => {
            creatingRef.current = false;
            setRetryTick((t) => t + 1);
          }, 600);
          return;
        }

        creatingRef.current = false;
        retriesRef.current += 1;
        if (retriesRef.current >= MAX_RETRIES) {
          setSessionError(true);
          toast.error('Could not start onboarding. The sandbox may not be ready — try refreshing.');
        } else {
          const delay = Math.pow(2, retriesRef.current) * 1000;
          toast.warning(`Retrying onboarding session (${retriesRef.current}/${MAX_RETRIES})…`);
          retryTimer = setTimeout(() => {
            creatingRef.current = false;
            setRetryTick((t) => t + 1);
          }, delay);
        }
      }
    })();

    return () => clearTimeout(retryTimer);
  }, [phase, sessionError, retryTick, router, isHetznerOnboarding, waitForSandboxHealthVersion, sandbox?.external_id, isSandboxAuthError, refreshSandboxRouting]);

  // ── Liveness fallback: if session is mounted but assistant never starts ──
  // This recovers from transient command delivery failures that can leave the
  // chat blank (input visible, but no onboarding messages/questions).
  useEffect(() => {
    if (phase !== 'session') return;
    if (!onboardingSessionId) return;

    const timer = setTimeout(async () => {
      try {
        const client = getClient();
        const msgs = await client.session.messages({ sessionID: onboardingSessionId });
        const hasAssistantMessage = (msgs.data ?? []).some(
          (m) => m.info?.role === 'assistant',
        );
        if (hasAssistantMessage || commandRetryRef.current) return;

        commandRetryRef.current = true;
        commandFiredRef.current = true;
        persistCommandFired();
        void client.session.command({
          sessionID: onboardingSessionId,
          command: 'onboarding',
          arguments: '',
        }).catch(() => {
          commandFiredRef.current = false;
        });
      } catch {
        // ignore — normal session startup flow/polling continues
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [phase, onboardingSessionId]);

  // ── Poll ONBOARDING_COMPLETE while in session phase ──────────
  // The onboarding agent marks this true when it finishes.
  useEffect(() => {
    if (phase !== 'session') return;
    const instanceUrl = getInstanceUrl();
    const interval = setInterval(async () => {
      try {
        const res = await authenticatedFetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`);
        if (res.ok) {
          const data = await res.json();
          if (data.ONBOARDING_COMPLETE === 'true') {
            clearInterval(interval);
            router.replace('/dashboard');
          }
        }
      } catch { /* sandbox not reachable — keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, router]);

  // ── Boot sequence audio ───────────────────────────────────────
  useEffect(() => {
    const audio = new Audio('/sounds/kortix/bootup.wav');
    audio.volume = 0.6;
    audio.preload = 'auto';
    audioRef.current = audio;
    const timers = bootTimers.current;
    return () => {
      audio.pause();
      audioRef.current = null;
      timers.forEach(clearTimeout);
    };
  }, []);

  const startBoot = useCallback(() => {
    const t = bootTimers.current;
    BIOS_LINES.forEach((_, i) => {
      t.push(setTimeout(() => setVisibleLines(i + 1), 100 + i * 160));
    });
    // After all lines appear, show the "Press Enter" prompt
    const allLinesMs = 100 + (BIOS_LINES.length - 1) * 160 + 300;
    t.push(setTimeout(() => setBiosReady(true), allLinesMs));
  }, []);

  const continueBoot = useCallback(() => {
    if (phase !== 'bios' || !biosReady) return;
    audioRef.current?.play().catch(() => {});
    setPhase('logo');
    const t = bootTimers.current;
    t.push(setTimeout(() => setProgressFill(true), 200));
    t.push(setTimeout(() => setPhase('onboarding'), 3400));
  }, [phase, biosReady]);

  // Enter key triggers continueBoot during bios phase
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      continueBoot();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [continueBoot]);

  // Auto-start boot on mount — no click needed
  useEffect(() => {
    startBoot();
  }, [startBoot]);

  const activeUser = user || session?.user || null;

  if (isLoading) return null;
  if (!activeUser) return null;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      <AnimatePresence mode="wait">

        {/* ═══ BIOS POST ═══ */}
        {phase === 'bios' && (
          <motion.div
            key="bios"
            className="absolute inset-0 p-8 sm:p-12"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <div className="font-mono text-[13px] sm:text-sm leading-relaxed">
              {BIOS_LINES.slice(0, visibleLines).map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.04 }}
                  className={
                    line.bold
                      ? 'text-foreground font-bold mb-2 tracking-wide'
                      : line.text === ''
                        ? 'h-3'
                        : 'text-foreground/70'
                  }
                >
                  {line.text}
                </motion.div>
              ))}
              {visibleLines > 0 && !biosReady && (
                <motion.span
                  className="inline-block w-2 h-[14px] bg-foreground/70 ml-0.5 mt-0.5"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}
              {biosReady && (
                <motion.div
                  className="mt-5 cursor-pointer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  onClick={continueBoot}
                >
                  <motion.span
                    className="font-mono text-[13px] sm:text-sm text-foreground/90"
                    animate={{ opacity: [1, 0.3] }}
                    transition={{ duration: 0.7, repeat: Infinity, repeatType: 'reverse' }}
                  >
                    Press Enter to boot...
                  </motion.span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ LOGO + PROGRESS ═══ */}
        {phase === 'logo' && (
          <motion.div
            key="logo"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="relative z-10 flex flex-col items-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <svg viewBox="0 0 30 25" className="h-11 sm:h-[52px] w-auto text-foreground">
                <path d={SYMBOL} fill="currentColor" />
              </svg>
              <div className="mt-10 w-44 sm:w-52 h-px bg-foreground/[0.06] overflow-hidden">
                <div
                  className="h-full bg-foreground/30"
                  style={{
                    width: progressFill ? '100%' : '0%',
                    transition: progressFill ? 'width 2.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ ONBOARDING — creating session, loading spinner ═══ */}
        {phase === 'onboarding' && (
          <motion.div
            key="onboarding"
            className="absolute inset-0 z-10 flex items-center justify-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <WallpaperBackground />
            <div className="relative z-10 flex flex-col items-center gap-4">
              {sessionError ? (
                <div className="flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-xl rounded-xl border border-border/40 p-8">
                  <p className="text-sm text-muted-foreground">Could not connect to the sandbox.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      retriesRef.current = 0;
                      setSessionError(false);
                      setRetryTick((t) => t + 1);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <LoadingDots />
                  {isHetznerOnboarding ? (
                    <>
                      <p className="text-xs text-muted-foreground">{getHetznerProvisioningMessage(onboardingWaitSec)}</p>
                      <p className="text-[11px] text-muted-foreground/70">Provisioning Hetzner sandbox... Connected when health is ready.</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Setting up your workspace…</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ SESSION — full-screen chat with the onboarding agent ═══ */}
        {phase === 'session' && onboardingSessionId && (
          <motion.div
            key="session"
            className="absolute inset-0 z-10 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {/* Floating KORTIX logo — absolutely positioned, no layout impact */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logomark-white.svg"
              alt="Kortix"
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none invert dark:invert-0"
              style={{ height: '16px', width: 'auto' }}
            />
            {/* SSE event stream — must be mounted for messages/questions to flow */}
            <OpenCodeEventStreamProvider />
            {/* Bare sidebar context (no wrapping div) so useSidebar() doesn't crash */}
            <SidebarContext.Provider value={_sidebarStub}>
              <SessionChat sessionId={onboardingSessionId} hideHeader />
            </SidebarContext.Provider>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Sign out (cloud only) */}
      {(phase === 'login' || phase === 'onboarding') && (
        <button
          onClick={() => signOut()}
          className="absolute bottom-4 left-4 z-30 px-3 py-1 text-[10px] text-foreground/20 hover:text-foreground/40 transition-colors"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
