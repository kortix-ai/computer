'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useAuth } from '@/components/AuthProvider';
import { isLocalMode } from '@/lib/config';
import { LightRays } from '@/components/ui/light-rays';
import { useCreateOpenCodeSession, useExecuteOpenCodeCommand } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { SecretsManager } from '@/components/secrets/secrets-manager';
import { SessionChat } from '@/components/session/session-chat';
import { Button } from '@/components/ui/button';

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

/** Get the sandbox instance URL (routed through backend at /v1/preview/{sandboxId}/8000) */
function getInstanceUrl() {
  return useServerStore.getState().getActiveServerUrl();
}

/* ─── Types ──────────────────────────────────────────────────── */

interface SetupOverlayProps {
  onComplete: () => void;
  /** If the backend already has an onboarding session ID, pass it to resume */
  existingSessionId?: string | null;
}

type BootPhase = 'power' | 'bios' | 'logo' | 'login' | 'credentials' | 'onboarding';

/* ─── Helpers ────────────────────────────────────────────────── */

/** Persist the onboarding session ID to the sandbox instance (fire-and-forget). */
function persistOnboardingSessionId(sessionId: string) {
  const instanceUrl = getInstanceUrl();
  fetch(`${instanceUrl}/env/ONBOARDING_SESSION_ID`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: sessionId }),
  }).catch(() => {}); // best effort
}

/* ─── Sub-components ─────────────────────────────────────────── */

function BrandmarkWallpaper() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/kortix-brandmark-bg.svg"
        alt=""
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vw] min-w-[700px] h-auto sm:w-[160vw] sm:min-w-[1000px] md:min-w-[1200px] lg:w-[162vw] lg:min-w-[1620px] object-contain select-none invert dark:invert-0"
        draggable={false}
      />
    </div>
  );
}

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

/* ─── Main component ─────────────────────────────────────────── */

export function SetupOverlay({ onComplete, existingSessionId }: SetupOverlayProps) {
  const createSession = useCreateOpenCodeSession();
  const executeCommand = useExecuteOpenCodeCommand();
  const completedRef = useRef(false);
  const creatingRef = useRef(false); // guard against double-creation
  const retriesRef = useRef(0);
  const { resolvedTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<BootPhase>('power');
  const [visibleLines, setVisibleLines] = useState(0);
  const [progressFill, setProgressFill] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(existingSessionId ?? null);
  const [sessionError, setSessionError] = useState(false); // permanent error after max retries
  const [retryTick, setRetryTick] = useState(0); // bumped to re-trigger creation effect
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bootTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Stable refs for mutation functions — prevents useEffect re-triggers
  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;
  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  useEffect(() => setMounted(true), []);
  const isDark = !mounted || resolvedTheme !== 'light';
  const raysColor = isDark ? '#ffffff' : '#000000';

  // ── Onboarding session lifecycle ──────────────────────────────
  //
  // When we enter the onboarding phase:
  //   - If we have an existing session ID (from backend), just mount SessionChat
  //   - If not, create a new session, persist its ID, then run /onboarding command
  //
  // This guarantees exactly ONE onboarding session across page reloads.
  // Uses refs for mutation objects to avoid re-trigger loops.
  // Retries up to MAX_RETRIES with exponential backoff before giving up.

  const MAX_RETRIES = 3;

  useEffect(() => {
    if (phase !== 'onboarding') return;
    if (sessionId) return;          // already have one — just render it
    if (sessionError) return;       // gave up after max retries
    if (creatingRef.current) return; // already creating (React strict mode)
    creatingRef.current = true;

    let retryTimer: ReturnType<typeof setTimeout>;

    (async () => {
      try {
        const session = await createSessionRef.current.mutateAsync({ title: 'Kortix Onboarding' });
        setSessionId(session.id);
        persistOnboardingSessionId(session.id);
        executeCommandRef.current.mutate({ sessionId: session.id, command: 'onboarding' });
        retriesRef.current = 0;
      } catch {
        creatingRef.current = false;
        retriesRef.current += 1;
        if (retriesRef.current >= MAX_RETRIES) {
          setSessionError(true);
          toast.error('Could not start onboarding. The sandbox may not be ready — try refreshing.');
        } else {
          // Exponential backoff: 2s, 4s, 8s …
          const delay = Math.pow(2, retriesRef.current) * 1000;
          toast.warning(`Retrying onboarding session (${retriesRef.current}/${MAX_RETRIES})…`);
          retryTimer = setTimeout(() => {
            // Allow the effect to re-attempt on next cycle
            creatingRef.current = false;
            setRetryTick((t) => t + 1); // force re-trigger
          }, delay);
        }
      }
    })();

    return () => clearTimeout(retryTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionId, sessionError, retryTick]);

  // ── Poll sandbox instance for onboarding completion to auto-dismiss ──
  useEffect(() => {
    if (phase !== 'onboarding') return;
    if (completedRef.current) return;

    const poll = setInterval(async () => {
      try {
        const instanceUrl = getInstanceUrl();
        const res = await fetch(`${instanceUrl}/env/ONBOARDING_COMPLETE`);
        if (res.ok) {
          const data = await res.json();
          if (data.ONBOARDING_COMPLETE === 'true') {
            clearInterval(poll);
            // Small delay so the user sees the final message
            setTimeout(() => {
              if (!completedRef.current) {
                completedRef.current = true;
                onComplete();
                if (sessionId) {
                  openTabAndNavigate({
                    id: sessionId,
                    title: 'Kortix Onboarding',
                    type: 'session',
                    href: `/sessions/${sessionId}`,
                    serverId: useServerStore.getState().activeServerId,
                  });
                }
              }
            }, 1500);
          }
        }
      } catch {
        // ignore — sandbox may not be reachable yet
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [phase, sessionId, onComplete]);

  // ── Finish: dismiss overlay & navigate to session ─────────────

  const finishSetup = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
    if (sessionId) {
      openTabAndNavigate({
        id: sessionId,
        title: 'Kortix Onboarding',
        type: 'session',
        href: `/sessions/${sessionId}`,
        serverId: useServerStore.getState().activeServerId,
      });
    }
  }, [onComplete, sessionId]);

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
    // Prime audio context with a silent play
    const audio = audioRef.current;
    if (audio) {
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    }
    setPhase('bios');
    const t = bootTimers.current;
    // BIOS lines — fast typewriter
    BIOS_LINES.forEach((_, i) => {
      t.push(setTimeout(() => setVisibleLines(i + 1), 50 + i * 90));
    });
    // Logo phase + play bootup sound (3s audio clip)
    t.push(setTimeout(() => {
      setPhase('logo');
      audioRef.current?.play().catch(() => {});
    }, 900));
    t.push(setTimeout(() => setProgressFill(true), 1100));
    // Transition to login exactly when audio ends
    t.push(setTimeout(() => setPhase('login'), 3900));
  }, [phase]);

  // ── Phase routing helper ──────────────────────────────────────

  const nextAfterLogin = isLocalMode() ? 'credentials' : 'onboarding';

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
            <BrandmarkWallpaper />
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

        {/* ═══ CREDENTIALS (local mode only) ═══ */}
        {phase === 'credentials' && (
          <motion.div
            key="credentials"
            className="absolute inset-0 z-10 flex items-center justify-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <BrandmarkWallpaper />
            <div className="relative z-10 w-full max-w-2xl mx-auto bg-background/95 backdrop-blur-xl rounded-xl border border-border/40 overflow-hidden flex flex-col max-h-[85vh]">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => setPhase('login')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h2 className="text-sm font-semibold">Configure your secrets</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Set up API keys so your Kortix agent can function. You can change these anytime in Settings.
                  </p>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <SecretsManager />
              </div>
              <div className="flex-shrink-0 border-t border-border/40 px-5 py-4">
                <Button onClick={() => setPhase('onboarding')} className="w-full">
                  Continue
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ ONBOARDING — embedded chat session ═══ */}
        {phase === 'onboarding' && (
          <motion.div
            key="onboarding"
            className="absolute inset-0 z-10 flex items-center justify-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <BrandmarkWallpaper />
            <div className="relative z-10 w-full max-w-4xl mx-4 bg-background/95 backdrop-blur-xl rounded-xl border border-border/40 overflow-hidden flex flex-col h-[90vh]">
              <div className="flex-1 min-h-0 overflow-hidden">
                {sessionId ? (
                  <SessionChat sessionId={sessionId} hideHeader />
                ) : sessionError ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
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
                  <LoadingDots />
                )}
              </div>
            </div>

            {/* debug exit */}
            <button
              onClick={finishSetup}
              className="absolute bottom-4 right-4 z-20 px-3 py-1 text-[10px] text-foreground/20 hover:text-foreground/40 transition-colors"
            >
              [debug] skip
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Sign out (cloud only) */}
      {(phase === 'login' || phase === 'credentials' || phase === 'onboarding') && !isLocalMode() && (
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
