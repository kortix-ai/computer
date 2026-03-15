'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { ArrowRight, Check, Copy, Terminal, Cpu, Shield, Globe, Layers, Zap, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { PlanSelectionModal } from '@/components/billing/pricing/plan-selection-modal';
import { CtaSection } from '@/components/home/cta-section';
import { OSSCard } from '@/app/(home)/oss-card';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const KortixBoxScene = dynamic(() => import('@/components/landing/KortixBoxScene'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-white/5 w-full h-full rounded-full blur-3xl opacity-20" />
});

const INSTALL_CMD = 'curl -fsSL https://kortix.com/install | bash';

// ─── Reusable Components ────────────────────────────────

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
      animate={visible ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
      transition={{ duration: 1.0, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">{children}</span>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [isMachineOn, setIsMachineOn] = useState(false);

  // Track scroll progress within the hero for the 3D scene
  const heroRef = useRef<HTMLDivElement>(null);
  const sceneProgressRef = useRef(0);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  // Smooth out the scroll value for the 3D scene
  const smoothProgress = useSpring(heroProgress, { damping: 20, stiffness: 100 });

  useEffect(() => {
    const unsub = smoothProgress.on('change', (v) => {
      sceneProgressRef.current = v;
    });
    return unsub;
  }, [smoothProgress]);

  const heroOpacity = useTransform(heroProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(heroProgress, [0, 0.5], [1, 0.9]);
  const sceneOpacity = useTransform(heroProgress, [0, 0.4, 0.8], [1, 1, 0]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <BackgroundAALChecker>
      <div className="relative bg-[#050505] text-white selection:bg-white/20">

        {/* 3D Scene — fixed, fades via CSS opacity */}
        <motion.div
          className="fixed inset-0 z-10 pointer-events-none"
          style={{ opacity: sceneOpacity }}
        >
          <KortixBoxScene 
            scrollProgressRef={sceneProgressRef} 
            isOn={isMachineOn}
            setIsOn={setIsMachineOn}
          />
        </motion.div>

        {/* ═══════════════ HERO ═══════════════ */}
        <div ref={heroRef} className="relative h-[250vh]">
          <motion.section
            className="sticky top-0 h-screen flex flex-col items-center justify-between px-6 z-20 pb-32 pt-32"
            style={{ opacity: heroOpacity, scale: heroScale }}
          >
            {/* Top Content: Headline */}
            <motion.div
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-center max-w-4xl mx-auto relative z-30 mt-12"
            >
              <h1 className="text-5xl sm:text-7xl md:text-8xl font-medium tracking-tighter leading-[0.9] pb-4 bg-gradient-to-b from-white to-white/30 text-transparent bg-clip-text">
                The AI Computer.
              </h1>
            </motion.div>

            {/* Bottom Content: CTA */}
            <motion.div
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-center w-full max-w-md mx-auto relative z-30 flex flex-col items-center gap-6 mb-12"
            >
              <Button
                size="lg"
                className="h-14 px-10 text-base rounded-full bg-white text-black hover:bg-white/90 transition-all"
                onClick={() => { trackCtaSignup(); setLaunchOpen(true); }}
              >
                Launch Kortix
                <ArrowRight className="ml-2 size-4" />
              </Button>

              <div className="flex flex-col items-center gap-3 w-full">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">
                  -- or self-host
                </span>
                <button
                  onClick={handleCopy}
                  className="group flex items-center justify-between w-full max-w-sm h-10 px-4 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer backdrop-blur-md"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="font-mono text-xs text-white/30 select-none">$</span>
                    <code className="text-xs font-mono text-white/70 tracking-tight group-hover:text-white transition-colors truncate">{INSTALL_CMD}</code>
                  </div>
                  <div className="pl-3 border-l border-white/[0.08] shrink-0">
                    {copied
                      ? <Check className="size-3.5 text-green-400" />
                      : <Copy className="size-3.5 text-white/20 group-hover:text-white/50 transition-colors" />}
                  </div>
                </button>
              </div>
            </motion.div>
            
            <motion.div 
              className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
            >
              <span className="text-[10px] uppercase tracking-widest text-white/20">Scroll to explore</span>
              <div className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent" />
            </motion.div>
          </motion.section>
        </div>

        {/* ═══════════════ CONTENT — below the hero ═══════════════ */}
        <div className="relative z-20 bg-[#050505]">

          {/* ── The Shift ── */}
          <div className="max-w-3xl mx-auto px-6 pt-24 sm:pt-32 pb-20 sm:pb-28">
            <Reveal>
              <p className="text-2xl sm:text-3xl md:text-4xl font-medium leading-snug tracking-tight">
                A 24/7 computer for your agents.
                <br />
                <span className="text-white/30">Not a chat interface.</span>
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 text-base sm:text-lg text-white/35 leading-relaxed max-w-2xl">
                Kortix is a persistent Linux machine you own. Add agents, skills, tools, and full projects. Connect all your data sources. Then let your agents run continuously — triggered by schedules, webhooks, or events — while you focus on what matters.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 flex items-center gap-2.5">
                <span className="text-[11px] text-white/25">Powered by</span>
                <a
                  href="https://opencode.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity"
                >
                  <Image src="/provider-icons/opencode.svg" alt="OpenCode" width={14} height={14} className="size-3.5 invert" />
                  <span className="text-[11px] font-medium text-white tracking-tight">OpenCode</span>
                </a>
              </div>
            </Reveal>
          </div>

          {/* ── Showcase ── */}
          <div className="border-t border-white/[0.04] py-20 sm:py-28 overflow-hidden">
            <div className="max-w-3xl mx-auto px-6 mb-12">
              <Reveal>
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium">What it makes</span>
                <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight">
                  Real outputs. <span className="text-white/30">Not suggestions.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-4 text-base text-white/30 leading-relaxed max-w-xl">
                  Give the agent a goal. It figures out the steps, executes them, and delivers a finished result — not a draft, not a plan, not a prompt for you to run yourself.
                </p>
              </Reveal>
            </div>

            <div className="flex gap-5 px-6 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
              {[
                { src: '/showcase/data/dashboard.png', width: 1386, height: 836, label: 'Company Performance Dashboard', prompt: '"Analyse all sales data and build me a dashboard"' },
                { src: '/showcase/presentation/slide1.png', width: 1512, height: 756, label: 'Research Presentation', prompt: '"Create a deck on neural networks for the team"' },
                { src: '/showcase/presentation/slide2.png', width: 1512, height: 756, label: 'Slide with Diagrams', prompt: '"Add a technical deep-dive slide"' },
                { src: '/showcase/image/mockup-board.png', width: 874, height: 1312, label: 'Brand Identity Mockup', prompt: '"Design a logo and brand kit for Luxy"' },
              ].map(({ src, width, height, label, prompt }) => (
                <Reveal key={src} className="flex-none w-[320px] sm:w-[380px]">
                  <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
                    <div className="bg-white/[0.02] border-b border-white/[0.04] px-3 py-2 flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="size-1.5 rounded-full bg-white/10" />
                        <div className="size-1.5 rounded-full bg-white/10" />
                        <div className="size-1.5 rounded-full bg-white/10" />
                      </div>
                      <span className="text-[9px] font-mono text-white/15 ml-1">output</span>
                    </div>
                    <div className="relative overflow-hidden" style={{ aspectRatio: `${width}/${height}` }}>
                      <Image src={src} alt={label} width={width} height={height} className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <div className="text-sm font-medium text-white/50 tracking-tight">{label}</div>
                    <div className="mt-1 text-[10px] text-white/20 font-mono">{prompt}</div>
                  </div>
                </Reveal>
              ))}
              <div className="flex-none w-6" />
            </div>
          </div>

          {/* ── How it works ── */}
          <div className="border-t border-white/[0.04]">
            <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <div>
                <Reveal>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium">How it works</span>
                  <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight mb-5">
                    You give the goal.
                    <br />
                    <span className="text-white/30">The agent handles everything else.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.1}>
                  <p className="text-base text-white/30 leading-relaxed mb-10">
                    Kortix runs a full execution loop: plan, execute, observe, adapt. It has access to every tool a developer does — and uses them the same way.
                  </p>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex flex-col gap-4">
                    {[
                      ['Shell & code', 'Runs bash, Python, Node — any language, any command'],
                      ['Real browser', 'Navigates, clicks, scrapes, fills forms with your own logged-in sessions'],
                      ['Your integrations', 'Calls Gmail, Slack, GitHub, Stripe, Notion, or any API you connect'],
                      ['Filesystem', 'Reads and writes files, git commits, exports PDFs, sends emails'],
                      ['Persistent memory', 'Remembers past sessions, decisions, and context across every run'],
                    ].map(([title, desc]) => (
                      <div key={title} className="flex items-start gap-3">
                        <div className="mt-[7px] size-1 rounded-full bg-white/20 shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-white/60">{title}</span>
                          <span className="text-sm text-white/25"> — {desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Reveal>
              </div>

              <Reveal delay={0.15}>
                <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] font-mono text-[11px]">
                  <div className="bg-white/[0.02] border-b border-white/[0.04] px-4 py-3 flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <div className="size-2.5 rounded-full bg-white/10" />
                      <div className="size-2.5 rounded-full bg-white/10" />
                      <div className="size-2.5 rounded-full bg-white/10" />
                    </div>
                    <span className="text-[10px] font-mono text-white/20 ml-1">kortix — session</span>
                  </div>
                  <div className="p-5 space-y-5">
                    <div className="space-y-1">
                      <div className="text-white/20 text-[9px] uppercase tracking-widest">You</div>
                      <div className="text-white/50 leading-relaxed">
                        Research our top 3 competitors, summarise their pricing, and send a Slack report to #strategy.
                      </div>
                    </div>
                    <div className="space-y-2 pl-3 border-l border-white/[0.06]">
                      <div className="text-white/20 text-[9px] uppercase tracking-widest mb-3">Kortix</div>
                      {[
                        { done: true, text: 'Browsing competitor sites via Chromium...' },
                        { done: true, text: 'Extracting pricing pages (3 sites)...' },
                        { done: true, text: 'Writing analysis to /workspace/research/competitors.md' },
                        { done: true, text: 'Formatting Slack message...' },
                        { done: false, text: 'Sending to #strategy via Slack OAuth...' },
                      ].map(({ done, text }, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={`mt-[3px] size-1.5 rounded-full shrink-0 ${done ? 'bg-white/15' : 'bg-white/40 animate-pulse'}`} />
                          <span className={done ? 'text-white/25 line-through decoration-white/10' : 'text-white/55'}>
                            {text}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1 border-t border-white/[0.04] text-white/40 leading-relaxed">
                      Done. Report delivered. Saved to workspace for future reference.
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-white/20">$</span>
                      <span className="w-1.5 h-3.5 bg-white/15 animate-pulse inline-block" />
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>

          {/* ── Always on ── */}
          <div className="border-t border-white/[0.04]">
            <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <Reveal>
                <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] font-mono">
                  <div className="bg-white/[0.02] border-b border-white/[0.04] px-4 py-3 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="size-2.5 rounded-full bg-white/10" />
                      <div className="size-2.5 rounded-full bg-white/10" />
                      <div className="size-2.5 rounded-full bg-white/10" />
                    </div>
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">root@kortix ~ kortix status</span>
                    <div className="size-2.5 opacity-0" />
                  </div>
                  <div className="p-5 space-y-1 text-[11px]">
                    <div className="grid grid-cols-12 gap-2 text-[9px] text-white/15 uppercase tracking-widest pb-2 border-b border-white/[0.04] mb-3">
                      <div className="col-span-5">Agent</div>
                      <div className="col-span-3">Uptime</div>
                      <div className="col-span-4">Last action</div>
                    </div>
                    {[
                      { name: 'support-agent', uptime: '14d 02:11', last: 'Replied to 3 tickets', running: true },
                      { name: 'bookkeeping', uptime: '14d 02:10', last: 'Reconciled March invoices', running: true },
                      { name: 'recruiter', uptime: '6d 14:45', last: 'Screened 12 applicants', running: true },
                      { name: 'data-pipeline', uptime: '3d 08:20', last: 'Refreshed dashboard data', running: true },
                      { name: 'cron-weekly', uptime: '—', last: 'Next run: Monday 08:00', running: false },
                    ].map(({ name, uptime, last, running }) => (
                      <div key={name} className="grid grid-cols-12 gap-2 py-1.5 items-center">
                        <div className="col-span-5 flex items-center gap-2">
                          <div className={`size-1.5 rounded-full shrink-0 ${running ? 'bg-white/30 animate-pulse' : 'bg-white/10'}`} />
                          <span className={running ? 'text-white/50' : 'text-white/20'}>{name}</span>
                        </div>
                        <div className="col-span-3 text-white/20">{uptime}</div>
                        <div className="col-span-4 text-white/25 truncate">{last}</div>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 pt-3 border-t border-white/[0.04] mt-2">
                      <span className="text-white/20">$</span>
                      <span className="w-1.5 h-3.5 bg-white/15 animate-pulse inline-block" />
                    </div>
                  </div>
                </div>
              </Reveal>

              <div>
                <Reveal>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium">Always on</span>
                  <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight mb-5">
                    A workforce, <span className="text-white/30">not a tool.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.1}>
                  <p className="text-base text-white/30 leading-relaxed mb-10">
                    You don&apos;t open Kortix to ask it things. You deploy agents that run continuously — handling support tickets, monitoring data, sending reports, recruiting candidates. You check in when you want.
                  </p>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex flex-col gap-4">
                    {[
                      ['Cron triggers', 'Schedule any task at any interval — hourly, daily, weekly'],
                      ['Event webhooks', 'React to external events the moment they happen'],
                      ['Parallel agents', 'Multiple agents working simultaneously, independently'],
                      ['Morning briefings', 'Wake up to a summary of what happened overnight'],
                    ].map(([title, desc]) => (
                      <div key={title} className="flex items-start gap-3">
                        <div className="mt-[7px] size-1 rounded-full bg-white/20 shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-white/60">{title}</span>
                          <span className="text-sm text-white/25"> — {desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Reveal>
              </div>
            </div>
          </div>

          {/* ── Ownership ── */}
          <div className="border-t border-white/[0.04]">
            <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
              <Reveal>
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium">Ownership</span>
                <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight mb-5">
                  Your data. Your machine. <span className="text-white/30">Your agents.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="text-base text-white/30 leading-relaxed mb-14 max-w-2xl">
                  Everything lives on the filesystem you own — sessions, memories, credentials, agent configs, browser profiles. Human-readable, git-trackable, SSH-accessible. No vendor lock-in. No hidden cloud state. One persistent volume.
                </p>
              </Reveal>

              <div className="grid sm:grid-cols-2 gap-8">
                <Reveal delay={0.15}>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/[0.04]">
                      <div className="text-[10px] uppercase tracking-widest text-white/20 font-medium">Connected</div>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      {[
                        { name: 'Gmail', tag: 'OAuth' },
                        { name: 'Slack', tag: 'OAuth' },
                        { name: 'GitHub', tag: 'CLI + API' },
                        { name: 'Notion', tag: 'MCP' },
                        { name: 'Stripe', tag: 'API' },
                        { name: 'Linear', tag: 'MCP' },
                      ].map(({ name, tag }) => (
                        <div key={name} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-white/50 font-medium">{name}</span>
                          <span className="text-[9px] font-mono uppercase tracking-widest text-white/20 bg-white/[0.04] px-2 py-0.5 rounded-md">{tag}</span>
                        </div>
                      ))}
                      <div className="pt-2 text-[10px] text-white/15 text-center border-t border-white/[0.04]">
                        + 500 apps via OAuth · MCP servers · SSH keys · env vars
                      </div>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={0.25}>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden font-mono text-[11px]">
                    <div className="px-5 py-4 border-b border-white/[0.04]">
                      <div className="text-[10px] uppercase tracking-widest text-white/20 font-medium">~/workspace</div>
                    </div>
                    <div className="p-4 flex flex-col gap-0.5">
                      {[
                        { d: 0, n: '.opencode/', f: false },
                        { d: 1, n: 'agents/', f: false },
                        { d: 1, n: 'skills/', f: false },
                        { d: 1, n: 'storage/memory.db', f: true },
                        { d: 0, n: '.secrets/', f: false },
                        { d: 0, n: '.browser-profile/', f: false },
                        { d: 0, n: 'projects/', f: false },
                      ].map(({ d, n, f }, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/[0.03] transition-colors"
                          style={{ paddingLeft: `${d * 1.25 + 0.25}rem` }}
                        >
                          <span className="text-white/15 text-[10px]">{f ? '·' : '▸'}</span>
                          <span className="text-white/40">{n}</span>
                        </div>
                      ))}
                      <div className="mt-2 pt-2 border-t border-white/[0.04] text-white/15 pl-1">
                        SSH · git-trackable · grep-searchable
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>

          {/* ── Open Source + CTA ── */}
          <div className="border-t border-white/[0.04]">
            <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28 space-y-12">
              <Reveal>
                <OSSCard />
              </Reveal>
              <Reveal delay={0.1}>
                <CtaSection onLaunch={() => setLaunchOpen(true)} />
              </Reveal>
              <Reveal delay={0.2}>
                <div className="flex items-center gap-4 justify-center pb-4">
                  <div className="h-px w-12 bg-white/[0.06]" />
                  <p className="text-sm text-white/20 text-center">
                    A company in a computer. It grows with you.
                  </p>
                  <div className="h-px w-12 bg-white/[0.06]" />
                </div>
              </Reveal>
            </div>
          </div>

        </div>
      </div>

      <PlanSelectionModal open={launchOpen} onOpenChange={(open) => !open && setLaunchOpen(false)} />
    </BackgroundAALChecker>
  );
}
