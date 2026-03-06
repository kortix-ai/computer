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
          <div className="flex justify-center pt-4 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>

          <div className="max-w-2xl mx-auto px-6 pt-12 sm:pt-20 pb-24 sm:pb-32">

            {/* ── Intro ── */}
            <p className="text-lg sm:text-xl font-medium text-foreground leading-relaxed mb-6">
              Kortix is a computer that runs itself.
            </p>
            <p className="text-sm text-muted-foreground/70 leading-relaxed mb-16">
              A full Linux machine — real filesystem, real bash, real Chromium
              browser — with an AI agent wired into every layer. All state lives
              on the machine itself: every session, every memory, every
              integration, every agent, every skill, every line of code, every
              project. Nothing is hidden in a cloud abstraction. Kortix
              orchestrates it all — memory, scheduling, integrations, agent
              lifecycle — powered by the OpenCode engine as the core agent
              framework. Connect your tools once. It runs from there.
            </p>

            {/* ── The Stack ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                The Stack
              </h2>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-relaxed overflow-x-auto">
                <div className="text-foreground/50 mb-1">{'┌─────────────────────────────────────────────────┐'}</div>
                <div>{'│'}  <span className="text-foreground">Agents</span>  {'·'}  Skills  {'·'}  Tools  {'·'}  MCP  {'·'}  Browser    {'│'}</div>
                <div>{'│'}  <span className="text-muted-foreground/40">your agents, community agents, 19 skill modules</span>  {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Kortix</span>  {'—'}  Orchestration                         {'│'}</div>
                <div>{'│'}  Memory  {'·'}  Integrations  {'·'}  Scheduling  {'·'}  Tunnels  {'│'}</div>
                <div>{'│'}  <span className="text-muted-foreground/40">OAuth, MCP servers, cron triggers, agent tunnel</span> {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">OpenCode Engine</span>  {'—'}  Agent Framework              {'│'}</div>
                <div>{'│'}  Sessions  {'·'}  Tool execution  {'·'}  Context  {'·'}  Recovery {'│'}</div>
                <div>{'│'}  <span className="text-muted-foreground/40">plugins: memory, pty, worktree, agent-tunnel</span>   {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Linux OS</span>  {'—'}  The Machine                          {'│'}</div>
                <div>{'│'}  Filesystem  {'·'}  Bash  {'·'}  Chromium  {'·'}  Git  {'·'}  SSH    {'│'}</div>
                <div>{'│'}  Node  {'·'}  Bun  {'·'}  Python  {'·'}  Docker                    {'│'}</div>
                <div>{'│'}  <span className="text-muted-foreground/40">all state persisted to /workspace — one volume</span> {'│'}</div>
                <div className="text-foreground/50">{'└─────────────────────────────────────────────────┘'}</div>
              </div>
            </div>

            {/* ── Everything Lives On The Machine ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                Everything Lives On The Machine
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Sessions, memories, agents, skills, integrations, code projects,
                credentials, browser profiles — all stored on the Linux filesystem.
                Human-readable, git-trackable, grep-searchable. No hidden state.
                No proprietary formats. One persistent volume.
              </p>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-loose overflow-x-auto">
                <div><span className="text-foreground">/workspace</span>                        <span className="text-muted-foreground/40"># persistent volume</span></div>
                <div>{'  ├── '}<span className="text-foreground">.local/share/opencode/</span></div>
                <div>{'  │   ├── storage/session/      '}<span className="text-muted-foreground/40"># every AI session</span></div>
                <div>{'  │   ├── storage/message/       '}<span className="text-muted-foreground/40"># full conversation history</span></div>
                <div>{'  │   └── storage/memory.db      '}<span className="text-muted-foreground/40"># observations + LTM (SQLite)</span></div>
                <div>{'  ├── '}<span className="text-foreground">.opencode/</span></div>
                <div>{'  │   ├── agents/                '}<span className="text-muted-foreground/40"># agent definitions (.md)</span></div>
                <div>{'  │   ├── skills/                '}<span className="text-muted-foreground/40"># skill modules</span></div>
                <div>{'  │   └── commands/              '}<span className="text-muted-foreground/40"># slash commands</span></div>
                <div>{'  ├── '}<span className="text-foreground">.secrets/</span>{'                   '}<span className="text-muted-foreground/40"># API keys, credentials</span></div>
                <div>{'  ├── '}<span className="text-foreground">.browser-profile/</span>{'           '}<span className="text-muted-foreground/40"># Chromium state</span></div>
                <div>{'  ├── '}<span className="text-foreground">.lss/</span>{'                       '}<span className="text-muted-foreground/40"># semantic search index</span></div>
                <div>{'  └── '}<span className="text-foreground">{'<'}your projects{'>'}</span>{'              '}<span className="text-muted-foreground/40"># code, data, anything</span></div>
              </div>
            </div>

            {/* ── Connected To Everything ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                Connected To Everything
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Connect all your data sources, password vaults, credentials, and
                SaaS tools. Kortix plugs in via OAuth, MCP servers, CLI tools,
                direct APIs, browser sessions, and the shell — so every agent
                operates across the full stack.
              </p>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-loose overflow-x-auto">
                <div><span className="text-muted-foreground/40">INTEGRATION       METHOD       STATUS</span></div>
                <div><span className="text-foreground">Gmail</span>             OAuth        <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">Slack</span>             OAuth        <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">Notion</span>            MCP          <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">Google Drive</span>      API          <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">GitHub</span>            CLI + API    <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">Stripe</span>            API          <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">HubSpot</span>           MCP          <span className="text-green-500/70">connected</span></div>
                <div><span className="text-foreground">Linear</span>            MCP          <span className="text-green-500/70">connected</span></div>
                <div className="mt-2"><span className="text-muted-foreground/40">+</span> passwords  {'·'}  env vars  {'·'}  SSH keys  {'·'}  private APIs  {'·'}  2000+ apps</div>
              </div>
            </div>

            {/* ── The Memory ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                The Memory
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Every tool call is recorded as an observation. Observations
                consolidate into long-term memories — episodic, semantic, and
                procedural. All stored in SQLite on the machine. Every session,
                every discovery, every bugfix, every decision. The agent remembers
                across sessions and gets better over time.
              </p>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-relaxed overflow-x-auto">
                <div className="text-foreground/50 mb-1">{'┌─────────────────────────────────────────────────┐'}</div>
                <div>{'│'}  <span className="text-foreground">Observations</span>  {'—'}  every tool execution            {'│'}</div>
                <div>{'│'}  <span className="text-muted-foreground/40">discovery, decision, bugfix, feature, refactor</span>   {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Long-Term Memory</span>  {'—'}  consolidated knowledge      {'│'}</div>
                <div>{'│'}  Episodic   <span className="text-muted-foreground/40">what happened, when, in what context</span>  {'│'}</div>
                <div>{'│'}  Semantic   <span className="text-muted-foreground/40">facts, patterns, architecture</span>       {'│'}</div>
                <div>{'│'}  Procedural <span className="text-muted-foreground/40">how to do things, workflows</span>         {'│'}</div>
                <div className="text-foreground/50">{'├─────────────────────────────────────────────────┤'}</div>
                <div>{'│'}  <span className="text-foreground">Sessions</span>  {'—'}  full history, searchable             {'│'}</div>
                <div>{'│'}  <span className="text-muted-foreground/40">every conversation, every output, resumable</span>     {'│'}</div>
                <div className="text-foreground/50">{'└─────────────────────────────────────────────────┘'}</div>
              </div>
            </div>

            {/* ── Always Running ── */}
            <div className="mb-16">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground/40 mb-4">
                Always Running
              </h2>
              <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4">
                Kortix doesn{"'"}t wait for you to type. Cron triggers, event
                webhooks, background workers — all continuous. You wake up to a
                scratchpad that says: here{"'"}s what happened.
              </p>
              <div className="font-mono text-xs text-muted-foreground/70 bg-muted/30 border border-border/50 rounded-lg p-5 leading-loose overflow-x-auto">
                <div><span className="text-muted-foreground/40">$</span> <span className="text-foreground">kortix status</span></div>
                <div className="mt-2"></div>
                <div><span className="text-muted-foreground/40">AGENT          STATUS    UPTIME    TASKS/24H</span></div>
                <div><span className="text-foreground">support</span>        running   14d       1,247</div>
                <div><span className="text-foreground">bookkeeper</span>     running   14d       89</div>
                <div><span className="text-foreground">recruiter</span>      running   6d        34</div>
                <div><span className="text-foreground">lead-gen</span>       running   6d        412</div>
                <div><span className="text-foreground">data-ops</span>       running   3d        1,891</div>
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

            {/* ── Closing line ── */}
            <p className="text-sm text-muted-foreground/40 text-center">
              A company in a computer. It grows with you.
            </p>

          </div>
        </motion.div>
      </div>

      {/* Launch modal */}
      <LaunchModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
    </BackgroundAALChecker>
  );
}
