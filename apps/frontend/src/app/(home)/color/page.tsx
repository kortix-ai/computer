'use client';

import { useEffect, useState, useCallback, useRef, Suspense, lazy } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { LaunchModal } from '@/components/home/launch-modal';

const PrismaticBurst = lazy(() => import('@/components/ui/prismatic-burst'));

const INSTALL_CMD = 'curl -fsSL https://get.kortix.ai/install | bash';
const KORTIX_GRADIENT = 'linear-gradient(90deg, #E100FF 0%, #F00 29.08%, #0015FF 55.29%, #FFB700 78.37%, #00FFD4 100%)';
const SPECTRUM = ['#E100FF', '#FF0000', '#0015FF', '#FFB700', '#00FFD4'];

export default function ColorPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  /* ── Boot sequence state ── */
  const [phase, setPhase] = useState<'burst' | 'landed'>('burst');
  const [burstSpeed, setBurstSpeed] = useState(0.1);
  const [burstIntensity, setBurstIntensity] = useState(0.4);
  const bootStartRef = useRef(0);

  const { scrollY } = useScroll();
  const drawerRadius = useTransform(scrollY, [200, 600], [24, 0]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  /* ── Boot acceleration sequence — smooth continuous RAF curve ── */
  useEffect(() => {
    if (phase !== 'burst') return;

    const DURATION = 1800; // total boot time in ms
    // Exponential easing: ramps quickly, peaks hard
    const easeBoot = (t: number) => {
      // Cubic ramp — punchy from the start, aggressive at end
      return t * t * (3 - 2 * t); // smoothstep: 0→1 with fast middle
    };

    bootStartRef.current = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - bootStartRef.current;
      const t = Math.min(elapsed / DURATION, 1);
      const e = easeBoot(t);

      // Map eased value to speed/intensity ranges
      const speed = 0.08 + e * 5.5;     // 0.08 → 5.58
      const intensity = 0.3 + e * 5.0;  // 0.3 → 5.3

      setBurstSpeed(speed);
      setBurstIntensity(intensity);

      if (t >= 1) {
        setPhase('landed');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (isLoading || user) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="size-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BackgroundAALChecker>
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* PRISMATIC BOOT — full screen, accelerates, then dissolves */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {phase === 'burst' && (
          <motion.div
            key="burst"
            className="fixed inset-0 z-[100]"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* White base layer */}
            <div className="absolute inset-0 bg-white" />
            {/* Burst layer */}
            <Suspense fallback={null}>
              <PrismaticBurst
                intensity={burstIntensity}
                speed={burstSpeed}
                animationType="rotate3d"
                colors={SPECTRUM}
                distort={burstSpeed > 2 ? 3 : 0}
                rayCount={0}
                mixBlendMode="none"
                hoverDampness={0.1}
                transparent
              />
            </Suspense>
            {/* White flash overlay — fades in at the peak to create whiteout transition */}
            <motion.div
              className="absolute inset-0 bg-white pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: burstIntensity > 4 ? 1 : 0 }}
              transition={{ duration: 0.5, ease: 'easeIn' }}
            />
            {/* Skip hint */}
            <motion.button
              className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] uppercase text-white/20 hover:text-white/40 transition-colors z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              onClick={() => setPhase('landed')}
            >
              Skip
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MAIN PAGE — same structure as homepage with prismatic      */}
      {/* accents woven in                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="relative bg-background">

        {/* ── HERO — sticky, fills viewport ── */}
        <div className="sticky top-0 h-dvh overflow-hidden z-0">
          <WallpaperBackground />

          <motion.div
            className="relative z-[1] flex flex-col h-full"
            style={{ opacity: heroOpacity, scale: heroScale }}
          >
            <div className="flex-1 flex items-center justify-center pt-40 pointer-events-none">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-foreground">
                The AI Computer
              </h1>
            </div>

            <div className="relative z-[1] pb-8 px-4 flex flex-col items-center gap-3">
              <Button
                size="lg"
                className="h-11 px-8 text-sm rounded-full shadow-none"
                onClick={() => {
                  trackCtaSignup();
                  setLaunchOpen(true);
                }}
              >
                Launch Your Kortix
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>

              <button
                onClick={handleCopy}
                className="group flex items-center gap-1.5 h-7 px-3 rounded-full text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors cursor-pointer"
              >
                <Terminal className="size-3 shrink-0" />
                <code className="text-[11px] font-mono hidden sm:block">
                  {INSTALL_CMD}
                </code>
                <code className="text-[11px] font-mono sm:hidden">
                  Install via terminal
                </code>
                {copied ? (
                  <Check className="size-3 text-green-500" />
                ) : (
                  <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>

              <motion.div
                className="mt-3"
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="w-5 h-8 rounded-full border-2 border-muted-foreground/20 flex items-start justify-center p-1">
                  <motion.div
                    className="w-1 h-1.5 rounded-full bg-muted-foreground/40"
                    animate={{ y: [0, 8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* ── DRAWER — slides up over hero ── */}
        <motion.div
          className="relative z-10 bg-background border-t border-border/50"
          style={{
            borderTopLeftRadius: drawerRadius,
            borderTopRightRadius: drawerRadius,
          }}
        >
          {/* Handle — prismatic gradient instead of grey */}
          <div className="flex justify-center pt-4 pb-2">
            <div
              className="w-10 h-1 rounded-full opacity-40"
              style={{ background: KORTIX_GRADIENT }}
            />
          </div>

          <div className="max-w-2xl mx-auto px-6 pt-12 sm:pt-20 pb-24 sm:pb-32">

            {/* ── Intro ── */}
            <p className="text-lg sm:text-xl font-medium text-foreground leading-relaxed mb-6">
              Kortix is a computer that runs itself.
            </p>
            <p className="text-sm text-muted-foreground/70 leading-relaxed mb-16">
              A full Linux machine — real filesystem, real shell, real tools — with an
              AI cortex wired into it. It connects to every system you use, remembers
              everything it learns, and runs autonomous workers around the clock. It
              writes its own code, builds its own tools, creates its own automations.
              The longer it runs, the smarter it gets.
            </p>

            {/* ── The Stack ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                The Stack
              </h2>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-relaxed overflow-x-auto">
                <div className="text-foreground/50 mb-1">{'┌─────────────────────────────────────────────┐'}</div>
                <div>{'│'}  <span className="text-foreground">Your Agents</span>  {'·'}  Community Agents  {'·'}  Integrations  {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Skills</span>  {'·'}  <span className="text-foreground">MCP</span>  {'·'}  Tools  {'·'}  Browser  {'·'}  Shell     {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">OpenCode Engine</span>                              {'│'}</div>
                <div>{'│'}  Planning  {'·'}  Execution  {'·'}  Memory  {'·'}  Recovery   {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Kortix Runtime</span>                               {'│'}</div>
                <div>{'│'}  Agent lifecycle  {'·'}  Context  {'·'}  Scheduling      {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Filesystem</span>  {'—'}  Your data, your systems         {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────┤'}</div>
                <div>{'│'}  Linux  {'·'}  Docker  {'·'}  Any machine                  {'│'}</div>
                <div className="text-foreground/50">{'└─────────────────────────────────────────────┘'}</div>
              </div>
            </div>

            {/* ── Everything Is Files ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                Everything Is Files
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Your entire business context lives in the filesystem. Agents read it,
                write to it, share it. Human-readable, git-trackable, grep-searchable.
                No hidden state. No proprietary formats.
              </p>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-loose overflow-x-auto">
                <div><span className="text-foreground">/kortix</span></div>
                <div>{'  ├── '}<span className="text-foreground">/context</span></div>
                <div>{'  │   ├── /company       '}<span className="text-muted-foreground/40"># org knowledge, docs, processes</span></div>
                <div>{'  │   ├── /customers     '}<span className="text-muted-foreground/40"># CRM data, conversations, history</span></div>
                <div>{'  │   ├── /finances      '}<span className="text-muted-foreground/40"># books, invoices, transactions</span></div>
                <div>{'  │   └── /comms         '}<span className="text-muted-foreground/40"># email, slack, messages</span></div>
                <div>{'  ├── '}<span className="text-foreground">/agents</span></div>
                <div>{'  │   ├── /support       '}<span className="text-muted-foreground/40"># support agent + state</span></div>
                <div>{'  │   ├── /bookkeeper    '}<span className="text-muted-foreground/40"># bookkeeping agent + state</span></div>
                <div>{'  │   └── /recruiter     '}<span className="text-muted-foreground/40"># recruiting agent + state</span></div>
                <div>{'  ├── '}<span className="text-foreground">/workflows</span></div>
                <div>{'  └── '}<span className="text-foreground">/logs</span></div>
              </div>
            </div>

            {/* ── Always Running ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                Always Running
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Kortix doesn{"'"}t wait for you to type. It runs. Scheduled triggers, event
                webhooks, background workers — all continuous. You wake up to a
                scratchpad that says: here{"'"}s what happened.
              </p>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-loose overflow-x-auto">
                <div><span className="text-muted-foreground/40">$</span> <span className="text-foreground">kortix status</span></div>
                <div className="mt-2"></div>
                <div><span className="text-muted-foreground/40">AGENT          STATUS    UPTIME    TASKS/24H</span></div>
                {/* Prismatic status dots — subtle color per agent */}
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full shrink-0" style={{ background: SPECTRUM[0] }} />
                  <span><span className="text-foreground">support</span>        running   14d       1,247</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full shrink-0" style={{ background: SPECTRUM[2] }} />
                  <span><span className="text-foreground">bookkeeper</span>     running   14d       89</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full shrink-0" style={{ background: SPECTRUM[3] }} />
                  <span><span className="text-foreground">recruiter</span>      running   6d        34</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full shrink-0" style={{ background: SPECTRUM[4] }} />
                  <span><span className="text-foreground">lead-gen</span>       running   6d        412</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full shrink-0" style={{ background: SPECTRUM[1] }} />
                  <span><span className="text-foreground">data-ops</span>       running   3d        1,891</span>
                </div>
              </div>
            </div>

            {/* ── The Computer Builds Itself ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                The Computer Builds Itself
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed">
                An agent can create other agents. Build new tools. Write new skills.
                Schedule automations. Modify its own instructions to get better at its
                job. Every agent extends the system it runs on. The workforce grows
                itself. Day one, it{"'"}s a capable machine. Day thirty, it understands
                your entire operation. Day three hundred, it knows things about your
                business you{"'"}ve forgotten.
              </p>
            </div>

            {/* ── Open Source ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                Open Source
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Apache 2.0. Self-host on any Linux machine. Full functionality, no
                feature gating. Or use Kortix Cloud — managed infrastructure, built-in
                LLM routing, full SSH access. Same Kortix, we run the servers.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="https://github.com/kortix-ai/suna"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 h-10 px-5 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors text-sm text-foreground"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  View on GitHub
                </a>
                <Button
                  className="h-10 px-5 text-sm rounded-lg shadow-none"
                  onClick={() => {
                    trackCtaSignup();
                    setLaunchOpen(true);
                  }}
                >
                  Try Kortix Cloud
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Button>
              </div>
            </div>

            {/* ── Closing line — gradient text ── */}
            <p className="text-sm text-center">
              <span
                className="bg-clip-text text-transparent font-medium"
                style={{ backgroundImage: KORTIX_GRADIENT }}
              >
                A company in a computer.
              </span>
              <span className="text-muted-foreground/40">{' '}It grows with you.</span>
            </p>

          </div>
        </motion.div>
      </div>

      <LaunchModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
    </BackgroundAALChecker>
  );
}
