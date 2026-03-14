'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { motion, useScroll, useTransform } from 'framer-motion';
import { PlanSelectionModal } from '@/components/billing/pricing/plan-selection-modal';
import { CtaSection } from '@/components/home/cta-section';
import { OSSCard } from '@/app/(home)/oss-card';
import Image from 'next/image';

const INSTALL_CMD = 'curl -fsSL https://kortix.com/install | bash';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  const { scrollY } = useScroll();

  const drawerRadius = useTransform(scrollY, [200, 600], [24, 0]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

  // Primary redirect is handled by middleware (instant 302, no white screen).
  // This is a safety net for edge cases (e.g. auth state change while on page).
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
      <div className="relative bg-background">
        {/* HERO */}
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
            <div className="relative z-[1] pb-8 px-4 flex flex-col items-center gap-6">
              <Button
                size="lg"
                className="h-12 px-8 text-sm rounded-full transition-all"
                onClick={() => { trackCtaSignup(); setLaunchOpen(true); }}
              >
                Launch Your Kortix
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
              <div className="flex flex-col items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/30 font-medium">
                  -- or install on your machine
                </span>
                <button
                  onClick={handleCopy}
                  className="group flex items-center gap-2.5 h-9 px-4 rounded-lg bg-foreground/[0.04] border border-foreground/[0.08] hover:bg-foreground/[0.07] hover:border-foreground/[0.13] transition-colors cursor-pointer"
                >
                  <span className="font-mono text-[11px] text-muted-foreground/35 select-none">$</span>
                  <code className="text-[11px] font-mono text-foreground/70 tracking-tight">{INSTALL_CMD}</code>
                  <div className="pl-2.5 border-l border-foreground/[0.08]">
                    {copied
                      ? <Check className="size-3 text-green-500" />
                      : <Copy className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                    }
                  </div>
                </button>
              </div>
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

        {/* DRAWER */}
        <motion.div
          className="relative z-10 bg-background border-t border-border/50"
          style={{ borderTopLeftRadius: drawerRadius, borderTopRightRadius: drawerRadius }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-5 pb-3">
            <div className="w-8 h-[3px] rounded-full bg-muted-foreground/15" />
          </div>

          {/* ─────────────────────────────────────────── */}
          {/* SECTION: The shift                          */}
          {/* ─────────────────────────────────────────── */}
          <div className="max-w-3xl mx-auto px-6 pt-16 sm:pt-24 pb-20 sm:pb-28">
            <p className="text-2xl sm:text-3xl font-medium text-foreground leading-snug mb-8 tracking-tight">
              A 24/7 computer for your agents.<br />
              <span className="text-muted-foreground/50">Not a chat interface.</span>
            </p>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mb-10">
              Kortix is a persistent Linux machine you own. Add agents, skills, tools, and full projects. Connect all your data sources. Then let your agents run continuously — triggered by schedules, webhooks, or events — while you focus on what matters.
            </p>
            {/* Powered by OpenCode */}
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-muted-foreground/40">Powered by</span>
              <a
                href="https://opencode.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity"
              >
                <Image
                  src="/provider-icons/opencode.svg"
                  alt="OpenCode"
                  width={14}
                  height={14}
                  className="size-3.5"
                />
                <span className="text-[11px] font-medium text-foreground tracking-tight">OpenCode</span>
              </a>
            </div>
          </div>

          {/* ─────────────────────────────────────────── */}
          {/* SECTION: What it produces (proof wall)      */}
          {/* ─────────────────────────────────────────── */}
          <div className="border-t border-border/30 py-20 sm:py-28 overflow-hidden">
            <div className="max-w-3xl mx-auto px-6 mb-12">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 font-medium">What it makes</span>
              <h2 className="mt-4 text-2xl sm:text-3xl font-medium text-foreground tracking-tight">
                Real outputs. Not suggestions.
              </h2>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-xl">
                Give the agent a goal. It figures out the steps, executes them, and delivers a finished result — not a draft, not a plan, not a prompt for you to run yourself.
              </p>
            </div>

            {/* Output screenshots */}
            <div className="flex gap-5 px-6 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
              {[
                {
                  src: '/showcase/data/dashboard.png',
                  width: 1386, height: 836,
                  label: 'Company Performance Dashboard',
                  prompt: '"Analyse all sales data and build me a dashboard"',
                },
                {
                  src: '/showcase/presentation/slide1.png',
                  width: 1512, height: 756,
                  label: 'Research Presentation',
                  prompt: '"Create a deck on neural networks for the team"',
                },
                {
                  src: '/showcase/presentation/slide2.png',
                  width: 1512, height: 756,
                  label: 'Slide with Diagrams',
                  prompt: '"Add a technical deep-dive slide"',
                },
                {
                  src: '/showcase/image/mockup-board.png',
                  width: 874, height: 1312,
                  label: 'Brand Identity Mockup',
                  prompt: '"Design a logo and brand kit for Luxy"',
                },
              ].map(({ src, width, height, label, prompt }) => (
                <div key={src} className="flex-none w-[320px] sm:w-[380px]">
                  <div className="rounded-xl overflow-hidden border border-border/40 bg-card/20">
                    <div className="bg-muted/10 border-b border-border/20 px-3 py-2 flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="size-1.5 rounded-full bg-muted-foreground/15" />
                        <div className="size-1.5 rounded-full bg-muted-foreground/15" />
                        <div className="size-1.5 rounded-full bg-muted-foreground/15" />
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground/30 ml-1">output</span>
                    </div>
                    <div className="relative overflow-hidden" style={{ aspectRatio: `${width}/${height}` }}>
                      <Image
                        src={src}
                        alt={label}
                        width={width}
                        height={height}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <div className="text-sm font-medium text-foreground/65 tracking-tight">{label}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground/35 font-mono">{prompt}</div>
                  </div>
                </div>
              ))}
              <div className="flex-none w-6" />
            </div>
          </div>

          {/* ─────────────────────────────────────────── */}
          {/* SECTION: How it works (execution engine)    */}
          {/* ─────────────────────────────────────────── */}
          <div className="border-t border-border/30">
            <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 font-medium">How it works</span>
                <h2 className="mt-4 text-2xl sm:text-3xl font-medium text-foreground tracking-tight mb-5">
                  You give the goal.<br />The agent handles everything else.
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed mb-10">
                  Kortix runs a full execution loop: plan, execute, observe, adapt. It has access to every tool a developer does — and uses them the same way.
                </p>
                <div className="flex flex-col gap-4">
                  {[
                    ['Shell & code', 'Runs bash, Python, Node — any language, any command'],
                    ['Real browser', 'Navigates, clicks, scrapes, fills forms with your own logged-in sessions'],
                    ['Your integrations', 'Calls Gmail, Slack, GitHub, Stripe, Notion, or any API you connect'],
                    ['Filesystem', 'Reads and writes files, git commits, exports PDFs, sends emails'],
                    ['Persistent memory', 'Remembers past sessions, decisions, and context across every run'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className="mt-[7px] size-1 rounded-full bg-foreground/25 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-foreground/75">{title}</span>
                        <span className="text-sm text-muted-foreground/55"> — {desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent execution mock */}
              <div className="rounded-2xl overflow-hidden border border-border/40 bg-card/20 font-mono text-[11px]">
                <div className="bg-muted/10 border-b border-border/30 px-4 py-3 flex items-center gap-2.5">
                  <div className="flex gap-1.5">
                    <div className="size-2.5 rounded-full bg-muted-foreground/15" />
                    <div className="size-2.5 rounded-full bg-muted-foreground/15" />
                    <div className="size-2.5 rounded-full bg-muted-foreground/15" />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/40 ml-1">kortix — session</span>
                </div>
                <div className="p-5 space-y-5">
                  {/* User message */}
                  <div className="space-y-1">
                    <div className="text-muted-foreground/35 text-[9px] uppercase tracking-widest">You</div>
                    <div className="text-foreground/65 leading-relaxed">
                      Research our top 3 competitors, summarise their pricing, and send a Slack report to #strategy.
                    </div>
                  </div>
                  {/* Agent steps */}
                  <div className="space-y-2 pl-3 border-l border-border/25">
                    <div className="text-muted-foreground/35 text-[9px] uppercase tracking-widest mb-3">Kortix</div>
                    {[
                      { done: true,  text: 'Browsing competitor sites via Chromium...' },
                      { done: true,  text: 'Extracting pricing pages (3 sites)...' },
                      { done: true,  text: 'Writing analysis to /workspace/research/competitors.md' },
                      { done: true,  text: 'Formatting Slack message...' },
                      { done: false, text: 'Sending to #strategy via Slack OAuth...' },
                    ].map(({ done, text }, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`mt-[3px] size-1.5 rounded-full shrink-0 ${done ? 'bg-foreground/20' : 'bg-foreground/50 animate-pulse'}`} />
                        <span className={done ? 'text-muted-foreground/40 line-through decoration-muted-foreground/25' : 'text-foreground/70'}>
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Result */}
                  <div className="pt-1 border-t border-border/20 text-foreground/60 leading-relaxed">
                    Done. Report delivered. Saved to workspace for future reference.
                  </div>
                  {/* Cursor */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground/30">$</span>
                    <span className="w-1.5 h-3.5 bg-muted-foreground/25 animate-pulse inline-block" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────── */}
          {/* SECTION: Autonomous — runs 24/7             */}
          {/* ─────────────────────────────────────────── */}
          <div className="border-t border-border/30">
            <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              {/* Process list mock */}
              <div className="rounded-2xl overflow-hidden border border-border/40 bg-card/20 font-mono">
                <div className="bg-muted/10 border-b border-border/30 px-4 py-3 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="size-2.5 rounded-full bg-muted-foreground/15" />
                    <div className="size-2.5 rounded-full bg-muted-foreground/15" />
                    <div className="size-2.5 rounded-full bg-muted-foreground/15" />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">root@kortix ~ kortix status</span>
                  <div className="size-2.5 opacity-0" />
                </div>
                <div className="p-5 space-y-1 text-[11px]">
                  <div className="grid grid-cols-12 gap-2 text-[9px] text-muted-foreground/30 uppercase tracking-widest pb-2 border-b border-border/20 mb-3">
                    <div className="col-span-5">Agent</div>
                    <div className="col-span-3">Uptime</div>
                    <div className="col-span-4">Last action</div>
                  </div>
                  {[
                    { name: 'support-agent',    uptime: '14d 02:11', last: 'Replied to 3 tickets', running: true },
                    { name: 'bookkeeping',       uptime: '14d 02:10', last: 'Reconciled March invoices', running: true },
                    { name: 'recruiter',         uptime: '6d 14:45',  last: 'Screened 12 applicants', running: true },
                    { name: 'data-pipeline',     uptime: '3d 08:20',  last: 'Refreshed dashboard data', running: true },
                    { name: 'cron-weekly',       uptime: '—',         last: 'Next run: Monday 08:00', running: false },
                  ].map(({ name, uptime, last, running }) => (
                    <div key={name} className="grid grid-cols-12 gap-2 py-1.5 items-center">
                      <div className="col-span-5 flex items-center gap-2">
                        <div className={`size-1.5 rounded-full shrink-0 ${running ? 'bg-foreground/40 animate-pulse' : 'bg-muted-foreground/20'}`} />
                        <span className={running ? 'text-foreground/65' : 'text-muted-foreground/35'}>{name}</span>
                      </div>
                      <div className="col-span-3 text-muted-foreground/35">{uptime}</div>
                      <div className="col-span-4 text-muted-foreground/40 truncate">{last}</div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 pt-3 border-t border-border/20 mt-2">
                    <span className="text-foreground/30">$</span>
                    <span className="w-1.5 h-3.5 bg-muted-foreground/25 animate-pulse inline-block" />
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 font-medium">Always on</span>
                <h2 className="mt-4 text-2xl sm:text-3xl font-medium text-foreground tracking-tight mb-5">
                  A workforce, not a tool.
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed mb-10">
                  You don&apos;t open Kortix to ask it things. You deploy agents that run continuously — handling support tickets, monitoring data, sending reports, recruiting candidates. You check in when you want.
                </p>
                <div className="flex flex-col gap-4">
                  {[
                    ['Cron triggers',    'Schedule any task at any interval — hourly, daily, weekly'],
                    ['Event webhooks',   'React to external events the moment they happen'],
                    ['Parallel agents',  'Multiple agents working simultaneously, independently'],
                    ['Morning briefings','Wake up to a summary of what happened overnight'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className="mt-[7px] size-1 rounded-full bg-foreground/25 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-foreground/75">{title}</span>
                        <span className="text-sm text-muted-foreground/55"> — {desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────── */}
          {/* SECTION: Your context, your machine         */}
          {/* ─────────────────────────────────────────── */}
          <div className="border-t border-border/30">
            <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 font-medium">Ownership</span>
              <h2 className="mt-4 text-2xl sm:text-3xl font-medium text-foreground tracking-tight mb-5">
                Your data. Your machine. Your agents.
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-14 max-w-2xl">
                Everything lives on the filesystem you own — sessions, memories, credentials, agent configs, browser profiles. Human-readable, git-trackable, SSH-accessible. No vendor lock-in. No hidden cloud state. One persistent volume.
              </p>

              {/* Two columns: integrations + filesystem */}
              <div className="grid sm:grid-cols-2 gap-8">
                {/* Connections */}
                <div className="rounded-2xl border border-border/40 bg-card/20 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/25">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/35 font-medium">Connected</div>
                  </div>
                  <div className="p-4 flex flex-col gap-2">
                    {[
                      { name: 'Gmail',    tag: 'OAuth' },
                      { name: 'Slack',    tag: 'OAuth' },
                      { name: 'GitHub',   tag: 'CLI + API' },
                      { name: 'Notion',   tag: 'MCP' },
                      { name: 'Stripe',   tag: 'API' },
                      { name: 'Linear',   tag: 'MCP' },
                    ].map(({ name, tag }) => (
                      <div key={name} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-foreground/65 font-medium">{name}</span>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/35 bg-muted/20 px-2 py-0.5 rounded-md">{tag}</span>
                      </div>
                    ))}
                    <div className="pt-2 text-[10px] text-muted-foreground/30 text-center border-t border-border/20">
                      + 500 apps via OAuth · MCP servers · SSH keys · env vars
                    </div>
                  </div>
                </div>

                {/* Filesystem */}
                <div className="rounded-2xl border border-border/40 bg-card/20 overflow-hidden font-mono text-[11px]">
                  <div className="px-5 py-4 border-b border-border/25">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/35 font-medium">~/workspace</div>
                  </div>
                  <div className="p-4 flex flex-col gap-0.5">
                    {[
                      { d: 0, n: '.opencode/',            f: false },
                      { d: 1, n: 'agents/',               f: false },
                      { d: 1, n: 'skills/',               f: false },
                      { d: 1, n: 'storage/memory.db',     f: true  },
                      { d: 0, n: '.secrets/',             f: false },
                      { d: 0, n: '.browser-profile/',     f: false },
                      { d: 0, n: 'projects/',             f: false },
                    ].map(({ d, n, f }, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/15 transition-colors"
                        style={{ paddingLeft: `${d * 1.25 + 0.25}rem` }}
                      >
                        <span className="text-muted-foreground/25 text-[10px]">{f ? '·' : '▸'}</span>
                        <span className="text-foreground/55">{n}</span>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-border/20 text-muted-foreground/25 pl-1">
                      SSH · git-trackable · grep-searchable
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Open Source + CTA ── */}
          <div className="border-t border-border/30">
            <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28 space-y-12">
              <OSSCard />
              <CtaSection onLaunch={() => setLaunchOpen(true)} />
              <div className="flex items-center gap-4 justify-center pb-4">
                <div className="h-px w-12 bg-border/30" />
                <p className="text-sm text-muted-foreground/40 text-center">
                  A company in a computer. It grows with you.
                </p>
                <div className="h-px w-12 bg-border/30" />
              </div>
            </div>
          </div>

        </motion.div>
      </div>

      <PlanSelectionModal open={launchOpen} onOpenChange={(open) => !open && setLaunchOpen(false)} />
    </BackgroundAALChecker>
  );
}
