'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/AuthProvider';

import { LightRays } from '@/components/ui/light-rays';
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
import { useSandbox } from '@/hooks/platform/use-sandbox';

/* ─── Constants ──────────────────────────────────────────────── */

const SYMBOL = "M25.5614 24.916H29.8268C29.8268 19.6306 26.9378 15.0039 22.6171 12.4587C26.9377 9.91355 29.8267 5.28685 29.8267 0.00146484H25.5613C25.5613 5.00287 21.8906 9.18692 17.0654 10.1679V0.00146484H12.8005V10.1679C7.9526 9.20401 4.3046 5.0186 4.3046 0.00146484H0.0391572C0.0391572 5.28685 2.92822 9.91355 7.24884 12.4587C2.92818 15.0039 0.0390625 19.6306 0.0390625 24.916H4.30451C4.30451 19.8989 7.95259 15.7135 12.8005 14.7496V24.9206H17.0654V14.7496C21.9133 15.7134 25.5614 19.8989 25.5614 24.916Z";

const BIOS_LINES: { text: string; bold?: boolean }[] = [
  { text: 'KORTIX SYSTEM v2.0', bold: true },
  { text: '' },
  { text: 'Memory check............... 128 GB OK' },
  { text: 'Neural cores............... 8/8 online' },
  { text: 'Agent runtime.............. initialized' },
  { text: 'Mounting filesystem........ done' },
  { text: '' },
  { text: 'Starting KORTIX OS...' },
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

type BootPhase = 'power' | 'bios' | 'logo' | 'login' | 'onboarding' | 'session';

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

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const date = now.getDate();
  const h = now.getHours() % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, '0');
  return (
    <div className="flex flex-col items-center">
      <p className="text-foreground/35 text-[13px] font-light tracking-widest">
        {day} {month} {date}
      </p>
      <p
        className="text-foreground/80 text-[80px] sm:text-[104px] font-extralight leading-none -tracking-[0.02em]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {h}:{m}
      </p>
    </div>
  );
}

function LoginKeyListener({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onEnter();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEnter]);
  return null;
}

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
  const retriesRef = useRef(0);
  const { resolvedTheme } = useTheme();
  const { user, isLoading, signOut } = useAuth();

  // Ensure sandbox is registered in server store (same as dashboard layout).
  // This makes getInstanceUrl() return the correct sandbox URL.
  useSandbox();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<BootPhase>('power');
  const [visibleLines, setVisibleLines] = useState(0);
  const [progressFill, setProgressFill] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bootTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  useEffect(() => setMounted(true), []);
  const isDark = !mounted || resolvedTheme !== 'light';
  const raysColor = isDark ? '#ffffff' : '#000000';

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

  // ── Redirect to auth if not logged in ─────────────────────────
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/auth');
    }
  }, [user, isLoading, router]);

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
              // Only check messages if the command was never fired. If the
              // persisted flag says it was fired, trust that — the messages
              // might just not have arrived yet (race condition).
              if (!commandFiredRef.current) {
                const msgs = await client.session.messages({ sessionID: existingId });
                if (!msgs.data || msgs.data.length === 0) {
                  needsCommand = true;
                }
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
          });
        }

        // 5. Show the session chat full-page
        setOnboardingSessionId(finalSessionId);
        setPhase('session');
      } catch {
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
  }, [phase, sessionError, retryTick, router]);

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
    return () => {
      audio.pause();
      audioRef.current = null;
      bootTimers.current.forEach(clearTimeout);
    };
  }, []);

  const startBoot = useCallback(() => {
    if (phase !== 'power') return;
    const audio = audioRef.current;
    if (audio) {
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    }
    setPhase('bios');
    const t = bootTimers.current;
    BIOS_LINES.forEach((_, i) => {
      t.push(setTimeout(() => setVisibleLines(i + 1), 50 + i * 90));
    });
    t.push(setTimeout(() => {
      setPhase('logo');
      audioRef.current?.play().catch(() => {});
    }, 900));
    t.push(setTimeout(() => setProgressFill(true), 1100));
    t.push(setTimeout(() => setPhase('login'), 3900));
  }, [phase]);

  const nextAfterLogin = 'onboarding';

  if (isLoading) return null;
  if (!user) return null;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      <AnimatePresence mode="wait">

        {/* ═══ POWER ═══ */}
        {phase === 'power' && (
          <motion.div
            key="power"
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
            transition={{ duration: 0.5 }}
            onClick={startBoot}
          >
            <motion.p
              className="text-[10px] tracking-[0.35em] uppercase text-foreground/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Click anywhere to start
            </motion.p>
          </motion.div>
        )}

        {/* ═══ BIOS POST ═══ */}
        {phase === 'bios' && (
          <motion.div
            key="bios"
            className="absolute inset-0 p-8 sm:p-12"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <div className="font-mono text-[11px] sm:text-xs leading-relaxed">
              {BIOS_LINES.slice(0, visibleLines).map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.04 }}
                  className={
                    line.bold
                      ? 'text-foreground/60 font-bold mb-2'
                      : line.text === ''
                        ? 'h-3'
                        : 'text-foreground/25'
                  }
                >
                  {line.text}
                </motion.div>
              ))}
              {visibleLines > 0 && (
                <motion.span
                  className="inline-block w-1.5 h-3 bg-foreground/40 ml-0.5 mt-0.5"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
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
            <div className="absolute inset-0 z-0 opacity-25">
              <LightRays
                raysColor={raysColor}
                raysOrigin="top-center"
                lightSpread={1.5}
                raysSpeed={0.15}
                rayLength={2.5}
                pulsating
                fadeDistance={0.9}
                saturation={0}
              />
            </div>
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

        {/* ═══ LOGIN ═══ */}
        {phase === 'login' && (
          <motion.div
            key="login"
            className="absolute inset-0 select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.7 }}
          >
            <WallpaperBackground />
            <motion.div
              className="relative z-10 flex justify-center pt-[12vh] sm:pt-[14vh]"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <LiveClock />
            </motion.div>
            <motion.div
              className="absolute z-10 bottom-[8vh] sm:bottom-[10vh] left-0 right-0 flex flex-col items-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {(() => {
                const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
                return (
                  <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full flex items-center justify-center mb-2.5 bg-foreground/[0.04] border border-foreground/[0.06] overflow-hidden">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <svg viewBox="0 0 30 25" className="h-6 sm:h-7 w-auto text-foreground">
                        <path d={SYMBOL} fill="currentColor" />
                      </svg>
                    )}
                  </div>
                );
              })()}
              <p className="text-foreground/80 text-[15px] sm:text-[16px] font-medium tracking-wide mb-1">
                {user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
              </p>
              <button
                className="text-foreground/30 text-[12px] tracking-wide cursor-pointer hover:text-foreground/50 transition-colors duration-200"
                onClick={() => setPhase(nextAfterLogin)}
              >
                Press Enter or click to continue
              </button>
            </motion.div>
          </motion.div>
        )}
        {phase === 'login' && <LoginKeyListener onEnter={() => setPhase(nextAfterLogin)} />}

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
                  <p className="text-xs text-muted-foreground">Setting up your workspace…</p>
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
