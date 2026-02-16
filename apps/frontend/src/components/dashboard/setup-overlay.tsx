'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';

// ─── Epic Welcome Sound (Web Audio API) ──────────────────────────────────────
// Synthesizes a cinematic reveal: low rumble build-up → bright impact → shimmer

function playEpicRevealSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // --- Layer 1: Sub rumble build-up ---
    const rumbleOsc = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.setValueAtTime(40, ctx.currentTime);
    rumbleOsc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 1.8);
    rumbleGain.gain.setValueAtTime(0, ctx.currentTime);
    rumbleGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 1.5);
    rumbleGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5);
    rumbleOsc.connect(rumbleGain).connect(ctx.destination);
    rumbleOsc.start(ctx.currentTime);
    rumbleOsc.stop(ctx.currentTime + 2.5);

    // --- Layer 2: Rising sweep ---
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(100, ctx.currentTime + 0.5);
    sweepOsc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 2.0);
    sweepGain.gain.setValueAtTime(0, ctx.currentTime + 0.5);
    sweepGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1.5);
    sweepGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.2);
    sweepOsc.connect(sweepGain).connect(ctx.destination);
    sweepOsc.start(ctx.currentTime + 0.5);
    sweepOsc.stop(ctx.currentTime + 2.2);

    // --- Layer 3: Impact boom ---
    const impactOsc = ctx.createOscillator();
    const impactGain = ctx.createGain();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(150, ctx.currentTime + 2.0);
    impactOsc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 2.8);
    impactGain.gain.setValueAtTime(0.5, ctx.currentTime + 2.0);
    impactGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3.5);
    impactOsc.connect(impactGain).connect(ctx.destination);
    impactOsc.start(ctx.currentTime + 2.0);
    impactOsc.stop(ctx.currentTime + 3.5);

    // --- Layer 4: White noise burst for impact texture ---
    const bufferSize = ctx.sampleRate * 0.5;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noiseNode = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noiseNode.buffer = noiseBuffer;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 800;
    noiseGain.gain.setValueAtTime(0.25, ctx.currentTime + 2.0);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
    noiseNode.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    noiseNode.start(ctx.currentTime + 2.0);
    noiseNode.stop(ctx.currentTime + 2.5);

    // --- Layer 5: Shimmer / bright chime after impact ---
    const shimmerFreqs = [1200, 1800, 2400, 3000];
    shimmerFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + 2.1 + i * 0.05);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.2 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0 + i * 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + 2.1 + i * 0.05);
      osc.stop(ctx.currentTime + 4.0 + i * 0.1);
    });

    // Clean up context after all sounds done
    setTimeout(() => ctx.close(), 5000);
  } catch {
    // Audio not available — silent fallback
  }
}

// ─── SetupOverlay ───────────────────────────────────────────────────────────
// Epic multi-phase welcome: buildup → light beams → logo reveal → confetti

interface SetupOverlayProps {
  onComplete: () => void;
}

export function SetupOverlay({ onComplete }: SetupOverlayProps) {
  const [phase, setPhase] = useState<'buildup' | 'beams' | 'reveal' | 'text' | 'done'>('buildup');
  const animationRef = useRef<number | null>(null);
  const endTimeRef = useRef<number>(0);
  const createSession = useCreateOpenCodeSession();
  const completedRef = useRef(false);

  const finish = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;

    onComplete();

    try {
      const session = await createSession.mutateAsync({ title: 'Kortix Onboarding' });

      useTabStore.getState().openTab({
        id: session.id,
        title: 'Kortix Onboarding',
        type: 'session',
        href: `/sessions/${session.id}`,
        serverId: useServerStore.getState().activeServerId,
      });

      sessionStorage.setItem(
        `opencode_pending_prompt:${session.id}`,
        'Hey! I just installed Kortix.',
      );
      sessionStorage.setItem(
        `opencode_pending_options:${session.id}`,
        JSON.stringify({ agent: 'kortix-onboarding' }),
      );

      window.history.pushState(null, '', `/sessions/${session.id}`);
    } catch {
      toast.warning('Failed to start onboarding session');
    }
  }, [onComplete, createSession]);

  useEffect(() => {
    // Play the epic sound
    playEpicRevealSound();

    // Phase timeline:
    // 0.0s - buildup (dark, particles gather)
    // 2.0s - beams (light beams shoot out)
    // 2.5s - reveal (logo slams in)
    // 3.2s - text (WELCOME TO YOUR appears)
    // 6.5s - done (auto-dismiss)

    const timers = [
      setTimeout(() => setPhase('beams'), 2000),
      setTimeout(() => setPhase('reveal'), 2500),
      setTimeout(() => setPhase('text'), 3200),
      setTimeout(() => {
        setPhase('done');
        // Epic confetti explosion
        const colors = ['#a786ff', '#fd8bbc', '#eca184', '#f8deb1', '#ffffff'];
        endTimeRef.current = Date.now() + 3000;

        const frame = () => {
          if (Date.now() > endTimeRef.current) {
            animationRef.current = null;
            return;
          }
          confetti({
            particleCount: 4,
            angle: 60,
            spread: 70,
            startVelocity: 80,
            origin: { x: 0, y: 0.5 },
            colors,
          });
          confetti({
            particleCount: 4,
            angle: 120,
            spread: 70,
            startVelocity: 80,
            origin: { x: 1, y: 0.5 },
            colors,
          });
          confetti({
            particleCount: 3,
            angle: 90,
            spread: 120,
            startVelocity: 60,
            origin: { x: 0.5, y: 0.6 },
            colors,
          });
          animationRef.current = requestAnimationFrame(frame);
        };
        frame();
      }, 3500),
      setTimeout(() => finish(), 7000),
    ];

    return () => {
      timers.forEach(clearTimeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      endTimeRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden cursor-pointer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      onClick={() => {
        if (phase === 'done' || phase === 'text') finish();
      }}
    >
      {/* Background: starts pitch black, brightens on reveal */}
      <motion.div
        className="absolute inset-0"
        initial={{ backgroundColor: 'rgba(0,0,0,1)' }}
        animate={{
          backgroundColor:
            phase === 'buildup'
              ? 'rgba(0,0,0,1)'
              : phase === 'beams'
                ? 'rgba(0,0,0,0.95)'
                : 'rgba(0,0,0,0.75)',
        }}
        transition={{ duration: 0.8 }}
      />

      {/* Particle field during buildup - tiny dots converging to center */}
      <AnimatePresence>
        {(phase === 'buildup' || phase === 'beams') && (
          <>
            {Array.from({ length: 40 }).map((_, i) => {
              const angle = (i / 40) * Math.PI * 2;
              const radius = 300 + Math.random() * 200;
              const startX = Math.cos(angle) * radius;
              const startY = Math.sin(angle) * radius;
              return (
                <motion.div
                  key={`particle-${i}`}
                  className="absolute rounded-full"
                  style={{
                    width: 2 + Math.random() * 3,
                    height: 2 + Math.random() * 3,
                    background: `rgba(167, 134, 255, ${0.3 + Math.random() * 0.5})`,
                  }}
                  initial={{ x: startX, y: startY, opacity: 0 }}
                  animate={{ x: 0, y: 0, opacity: [0, 0.8, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 2 + Math.random(),
                    delay: Math.random() * 1.5,
                    ease: 'easeIn',
                  }}
                />
              );
            })}
          </>
        )}
      </AnimatePresence>

      {/* Light beams radiating from center */}
      <AnimatePresence>
        {(phase === 'beams' || phase === 'reveal' || phase === 'text' || phase === 'done') && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'beams' ? 1 : phase === 'reveal' ? 0.8 : 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Radial light beams via conic gradient */}
            <motion.div
              className="absolute"
              style={{
                width: '200vmax',
                height: '200vmax',
                background:
                  'conic-gradient(from 0deg, transparent 0deg, rgba(167,134,255,0.15) 2deg, transparent 4deg, transparent 15deg, rgba(253,139,188,0.1) 17deg, transparent 19deg, transparent 30deg, rgba(236,161,132,0.12) 32deg, transparent 34deg, transparent 45deg, rgba(167,134,255,0.15) 47deg, transparent 49deg, transparent 60deg, rgba(248,222,177,0.1) 62deg, transparent 64deg, transparent 75deg, rgba(253,139,188,0.12) 77deg, transparent 79deg, transparent 90deg, rgba(167,134,255,0.15) 92deg, transparent 94deg, transparent 105deg, rgba(236,161,132,0.1) 107deg, transparent 109deg, transparent 120deg, rgba(248,222,177,0.12) 122deg, transparent 124deg, transparent 135deg, rgba(167,134,255,0.15) 137deg, transparent 139deg, transparent 150deg, rgba(253,139,188,0.1) 152deg, transparent 154deg, transparent 165deg, rgba(236,161,132,0.12) 167deg, transparent 169deg, transparent 180deg, rgba(167,134,255,0.15) 182deg, transparent 184deg, transparent 195deg, rgba(248,222,177,0.1) 197deg, transparent 199deg, transparent 210deg, rgba(253,139,188,0.12) 212deg, transparent 214deg, transparent 225deg, rgba(167,134,255,0.15) 227deg, transparent 229deg, transparent 240deg, rgba(236,161,132,0.1) 242deg, transparent 244deg, transparent 255deg, rgba(248,222,177,0.12) 257deg, transparent 259deg, transparent 270deg, rgba(167,134,255,0.15) 272deg, transparent 274deg, transparent 285deg, rgba(253,139,188,0.1) 287deg, transparent 289deg, transparent 300deg, rgba(236,161,132,0.12) 302deg, transparent 304deg, transparent 315deg, rgba(167,134,255,0.15) 317deg, transparent 319deg, transparent 330deg, rgba(248,222,177,0.1) 332deg, transparent 334deg, transparent 345deg, rgba(253,139,188,0.12) 347deg, transparent 349deg, transparent 360deg)',
              }}
              initial={{ scale: 0, rotate: 0, opacity: 0 }}
              animate={{ scale: 1, rotate: 180, opacity: 1 }}
              transition={{ duration: 3, ease: 'easeOut' }}
            />

            {/* Central glow */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 400,
                height: 400,
                background:
                  'radial-gradient(circle, rgba(167,134,255,0.4) 0%, rgba(167,134,255,0.1) 40%, transparent 70%)',
                filter: 'blur(30px)',
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 2, 1.5], opacity: [0, 1, 0.6] }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bright flash on impact */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Main content: Logo + Text */}
      <div className="relative z-10 flex flex-col items-center gap-6 pointer-events-none select-none">
        {/* "WELCOME TO YOUR" text - appears in text phase */}
        <AnimatePresence>
          {(phase === 'text' || phase === 'done') && (
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <motion.p
                className="text-sm font-medium tracking-[0.4em] uppercase text-white/60"
                initial={{ opacity: 0, letterSpacing: '0.8em' }}
                animate={{ opacity: 1, letterSpacing: '0.4em' }}
                transition={{ duration: 0.8, delay: 0.1 }}
              >
                Welcome to your
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logo - slams in during reveal phase */}
        <AnimatePresence>
          {(phase === 'reveal' || phase === 'text' || phase === 'done') && (
            <motion.div
              className="relative"
              initial={{ scale: 3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 0.5,
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
            >
              {/* Glow behind logo */}
              <motion.div
                className="absolute inset-0 -m-8"
                style={{
                  background:
                    'radial-gradient(circle, rgba(167,134,255,0.3) 0%, transparent 70%)',
                  filter: 'blur(20px)',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.5] }}
                transition={{ duration: 1.5, delay: 0.2 }}
              />
              <KortixLogo size={72} variant="logomark" className="relative z-10 drop-shadow-[0_0_30px_rgba(167,134,255,0.5)]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tagline under logo */}
        <AnimatePresence>
          {phase === 'done' && (
            <motion.p
              className="text-base text-white/40 font-light tracking-wide"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              Your AI is ready.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Animated ring burst on reveal */}
      <AnimatePresence>
        {(phase === 'reveal' || phase === 'text') && (
          <motion.div
            className="absolute rounded-full border border-white/20"
            style={{ width: 100, height: 100 }}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 15, opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Second ring, slightly delayed */}
      <AnimatePresence>
        {(phase === 'reveal' || phase === 'text') && (
          <motion.div
            className="absolute rounded-full border border-purple-400/15"
            style={{ width: 80, height: 80 }}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 20, opacity: 0 }}
            transition={{ duration: 2, delay: 0.2, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Skip hint */}
      <AnimatePresence>
        {(phase === 'text' || phase === 'done') && (
          <motion.p
            className="absolute bottom-8 text-xs text-white/20 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            Click anywhere to continue
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
