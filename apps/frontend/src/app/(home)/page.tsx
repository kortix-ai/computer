'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { motion, useScroll, useTransform } from 'framer-motion';
import { LaunchModal } from '@/components/home/launch-modal';
import { TechStack } from '@/components/home/tech-stack';
import { FileSystemView } from '@/components/home/filesystem-view';
import { IntegrationsGrid } from '@/components/home/integrations-grid';
import { TerminalView } from '@/components/home/terminal-view';
import { CtaSection } from '@/components/home/cta-section';
import { OSSCard } from '@/app/(home)/oss-card';

const INSTALL_CMD = 'curl -fsSL https://get.kortix.ai/install | bash';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  const { scrollY } = useScroll();

  const drawerRadius = useTransform(scrollY, [200, 600], [24, 0]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

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

  if (isLoading || user) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="size-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BackgroundAALChecker>
      <div className="relative bg-background">
        {/* ============================================= */}
        {/* HERO — sticky, fills viewport                 */}
        {/* ============================================= */}
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
                className="h-12 px-8 text-sm rounded-full shadow-lg shadow-primary/5 hover:shadow-primary/10 transition-all"
                onClick={() => {
                  trackCtaSignup();
                  setLaunchOpen(true);
                }}
              >
                Launch Your Kortix
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>

              <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">
                  Or install locally
                </span>
                <button
                  onClick={handleCopy}
                  className="group flex items-center gap-3 h-10 px-4 rounded-xl bg-muted/40 backdrop-blur-md border border hover:bg-muted/60 transition-all cursor-pointer shadow-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground/60 select-none">$</span>
                  <code className="text-xs font-mono text-foreground/90">
                    {INSTALL_CMD}
                  </code>
                  <div className="pl-3 border-l border-foreground/10 text-muted-foreground">
                    {copied ? (
                      <Check className="size-3.5 text-green-500" />
                    ) : (
                      <Copy className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    )}
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

        {/* ============================================= */}
        {/* DRAWER — slides up over hero                  */}
        {/* ============================================= */}
        <motion.div
          className="relative z-10 bg-background border-t border-border/50"
          style={{
            borderTopLeftRadius: drawerRadius,
            borderTopRightRadius: drawerRadius,
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-5 pb-3">
            <div className="w-8 h-[3px] rounded-full bg-muted-foreground/15" />
          </div>

          <div className="max-w-3xl mx-auto px-6 pt-12 sm:pt-20 pb-24 sm:pb-32">

            {/* ── Intro ── */}
            <div className="mb-24">
              <p className="text-xl sm:text-2xl font-medium text-foreground leading-relaxed mb-6">
                Kortix is a computer that runs itself.
              </p>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
                A full Linux machine — real filesystem, real bash, real Chromium
                browser — with an AI agent wired into every layer. All state lives
                on the machine itself: every session, every memory, every
                integration, every agent. Nothing is hidden in a cloud abstraction.
              </p>
            </div>

            {/* ── The Stack ── */}
            <div className="mb-32">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground/60">
                  The Stack
                </h2>
              </div>
              <TechStack />
              <p className="mt-6 text-sm text-muted-foreground/60 max-w-xl">
                Powered by the OpenCode engine as the core agent framework. Connect your tools once. It runs from there.
              </p>
            </div>

            {/* ── Everything Lives On The Machine ── */}
            <div className="mb-32 grid md:grid-cols-2 gap-12 items-start">
              <div className="md:sticky md:top-32">
                <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground/60 mb-6">
                  Everything Lives On The Machine
                </h2>
                <h3 className="text-2xl font-medium text-foreground mb-4">
                  Filesystem First
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-6">
                  Sessions, memories, agents, skills, integrations, code projects,
                  credentials, browser profiles — all stored on the Linux filesystem.
                </p>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Human-readable, git-trackable, grep-searchable. No hidden state.
                  No proprietary formats. One persistent volume.
                </p>
              </div>
              <FileSystemView />
            </div>

            {/* ── Connected To Everything ── */}
            <div className="mb-32">
              <div className="max-w-xl mb-12">
                <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground/60 mb-6">
                  Connected To Everything
                </h2>
                <h3 className="text-2xl font-medium text-foreground mb-4">
                  Unified Context
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Connect all your data sources, password vaults, credentials, and
                  SaaS tools. Kortix plugs in via OAuth, MCP servers, CLI tools,
                  direct APIs, browser sessions, and the shell.
                </p>
              </div>
              <IntegrationsGrid />
            </div>

            {/* ── The Memory ── */}
            <div className="mb-32 grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground/60 mb-6">
                  The Memory
                </h2>
                <h3 className="text-2xl font-medium text-foreground mb-4">
                  Long-term Recall
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-6">
                  Every tool call is recorded as an observation. Observations
                  consolidate into long-term memories — episodic, semantic, and
                  procedural.
                </p>
                <div className="flex flex-col gap-3">
                  <div className="p-4 bg-card/30 rounded-2xl border border-border/50 hover:bg-muted/20 hover:border-border/80 transition-all duration-200">
                    <div className="text-sm font-medium text-foreground mb-1 tracking-tight">Episodic</div>
                    <div className="text-xs text-muted-foreground/50">what happened, when, in what context</div>
                  </div>
                  <div className="p-4 bg-card/30 rounded-2xl border border-border/50 hover:bg-muted/20 hover:border-border/80 transition-all duration-200">
                    <div className="text-sm font-medium text-foreground mb-1 tracking-tight">Semantic</div>
                    <div className="text-xs text-muted-foreground/50">facts, patterns, architecture</div>
                  </div>
                  <div className="p-4 bg-card/30 rounded-2xl border border-border/50 hover:bg-muted/20 hover:border-border/80 transition-all duration-200">
                    <div className="text-sm font-medium text-foreground mb-1 tracking-tight">Procedural</div>
                    <div className="text-xs text-muted-foreground/50">how to do things, workflows</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-full border border-border/50 rounded-2xl bg-card/30 shadow-sm p-8 sm:p-10 flex flex-col items-center justify-center text-center gap-2">
                  <div className="text-3xl font-mono font-medium text-foreground/15 tracking-tighter">SQLite</div>
                  <div className="text-[11px] text-muted-foreground/35 uppercase tracking-widest">Local Vector Store</div>
                  <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground/40">
                    <span>Observations</span>
                    <span>&rarr;</span>
                    <span>Embeddings</span>
                    <span>&rarr;</span>
                    <span>Recall</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Always Running ── */}
            <div className="mb-32">
              <div className="max-w-xl mb-12">
                <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground/60 mb-6">
                  Always Running
                </h2>
                <h3 className="text-2xl font-medium text-foreground mb-4">
                  Autonomous Operations
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Kortix doesn't wait for you to type. Cron triggers, event
                  webhooks, background workers — all continuous. You wake up to a
                  scratchpad that says: here's what happened.
                </p>
              </div>
              <TerminalView />
            </div>

            {/* ── The Computer Builds Itself ── */}
            <div className="mb-32 text-center max-w-2xl mx-auto">
              <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground/60 mb-6">
                Evolution
              </h2>
              <p className="text-xl sm:text-2xl font-medium text-foreground mb-6">
                The Computer Builds Itself
              </p>
              <p className="text-base text-muted-foreground leading-relaxed">
                An agent can create other agents. Build new tools. Write new skills.
                Schedule automations. Modify its own instructions to get better at its
                job. Every agent extends the system it runs on. The workforce grows
                itself.
              </p>
            </div>

            {/* ── Open Source ── */}
            <div className="mb-20">
              <OSSCard />
            </div>

            {/* ── CTA Section ── */}
            <CtaSection onLaunch={() => setLaunchOpen(true)} />
            
            {/* ── Closing line ── */}
            <div className="flex items-center gap-4 justify-center pb-8">
              <div className="h-px w-12 bg-border/30" />
              <p className="text-sm text-muted-foreground/40 text-center">
                A company in a computer. It grows with you.
              </p>
              <div className="h-px w-12 bg-border/30" />
            </div>

          </div>
        </motion.div>
      </div>

      {/* Launch modal */}
      <LaunchModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
    </BackgroundAALChecker>
  );
}
