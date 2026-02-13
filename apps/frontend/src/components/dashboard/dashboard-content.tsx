'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/utils';
import { toast } from '@/lib/toast';
import { useSidebar } from '@/components/ui/sidebar';
import {
  useCreateOpenCodeSession,
  useSendOpenCodeMessage,
  useOpenCodeAgents,
  useOpenCodeProviders,
  useOpenCodeCommands,
  useOpenCodeProjects,
  useOpenCodeSessions,
} from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { useServerStore } from '@/stores/server-store';
import { SessionChatInput } from '@/components/session/session-chat-input';
import { useOpenCodeLocal } from '@/hooks/opencode/use-opencode-local';
import { useOpenCodeConfig } from '@/hooks/opencode/use-opencode-config';
import { DynamicGreeting } from '@/components/ui/dynamic-greeting';
import {
  Menu,
  FolderOpen,
  MessageCircle,
  Clock,
  GitBranch,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Command, Project, Session } from '@/hooks/opencode/use-opencode-sessions';
import Link from 'next/link';

// ============================================================================
// Helpers
// ============================================================================

function getProjectDisplayName(project: Project): string {
  if (project.name) return project.name;
  if (project.worktree === '/' || project.id === 'global') return 'Global';
  const parts = project.worktree.split('/');
  return parts[parts.length - 1] || project.worktree;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ============================================================================
// Project Card
// ============================================================================

function ProjectCard({
  project,
  sessionCount,
}: {
  project: Project;
  sessionCount: number;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        'group flex flex-col gap-2.5 p-3.5 rounded-2xl border border-border/30',
        'bg-card/40 hover:bg-card/70 hover:border-border/60',
        'transition-all duration-200 ease-out',
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted/40 flex-shrink-0"
          style={project.icon?.color ? { backgroundColor: project.icon.color + '10', color: project.icon.color } : undefined}
        >
          <FolderOpen className="size-3.5" />
        </div>
        <ArrowRight className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium truncate">{getProjectDisplayName(project)}</p>
        <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground/40">
          {sessionCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-2.5" />
              {sessionCount}
            </span>
          )}
          {project.vcs === 'git' && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-2.5" />
              git
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-2.5" />
            {formatRelativeTime(project.time.updated)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// Recent Session Row
// ============================================================================

function RecentSessionRow({
  session,
  project,
}: {
  session: Session;
  project?: Project;
}) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/sessions/${session.id}`)}
      className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left hover:bg-muted/20 transition-colors group cursor-pointer"
    >
      <div className="h-7 w-7 rounded-md bg-muted/30 flex items-center justify-center flex-shrink-0">
        <MessageCircle className="size-3 text-muted-foreground/40" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] truncate text-foreground/80 group-hover:text-foreground transition-colors">
          {session.title || session.slug || 'Untitled'}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/35 mt-0.5">
          {project && project.id !== 'global' && (
            <>
              <span className="truncate max-w-[120px]">{getProjectDisplayName(project)}</span>
              <span>·</span>
            </>
          )}
          <span>{formatRelativeTime(session.time.updated)}</span>
        </div>
      </div>
      <ExternalLink className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/25 transition-colors flex-shrink-0" />
    </button>
  );
}

// ============================================================================
// Dashboard Content
// ============================================================================

export function DashboardContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpen: setSidebarOpenState, setOpenMobile } = useSidebar();
  const createSession = useCreateOpenCodeSession();
  const sendMessage = useSendOpenCodeMessage();

  // Data
  const { data: agents } = useOpenCodeAgents();
  const { data: providers } = useOpenCodeProviders();
  const { data: commands } = useOpenCodeCommands();
  const { data: projects } = useOpenCodeProjects();
  const { data: sessions } = useOpenCodeSessions();
  const { data: config } = useOpenCodeConfig();

  // Unified model/agent/variant state
  const local = useOpenCodeLocal({ agents, providers, config });

  // Session counts per project
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!sessions) return counts;
    for (const s of sessions) {
      if (s.parentID || s.time.archived) continue;
      counts.set(s.projectID, (counts.get(s.projectID) || 0) + 1);
    }
    return counts;
  }, [sessions]);

  // Non-global projects sorted by most recently updated
  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects]
      .filter((p) => p.id !== 'global')
      .sort((a, b) => b.time.updated - a.time.updated);
  }, [projects]);

  // Recent sessions (top-level, not archived)
  const recentSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .filter((s) => !s.parentID && !s.time.archived)
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 6);
  }, [sessions]);

  // Project lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of (projects || [])) map.set(p.id, p);
    return map;
  }, [projects]);

  const handleSend = useCallback(
    async (text: string, _files?: unknown) => {
      if (!text.trim() || isSubmitting) return;
      setIsSubmitting(true);
      try {
        // Build options from selections
        const options: Record<string, unknown> = {};
        if (local.agent.current) options.agent = local.agent.current.name;
        if (local.model.currentKey) options.model = local.model.currentKey;
        if (local.model.variant.current) options.variant = local.model.variant.current;

        // Step 1: Create the session
        const session = await createSession.mutateAsync();

        // Step 2: Open tab and navigate immediately (optimistic)
        useTabStore.getState().openTab({
          id: session.id,
          title: 'New session',
          type: 'session',
          href: `/sessions/${session.id}`,
          serverId: useServerStore.getState().activeServerId,
        });

        // Store the prompt text for optimistic display on the session page
        sessionStorage.setItem('opencode_pending_prompt', text);
        if (Object.keys(options).length > 0) {
          sessionStorage.setItem('opencode_pending_options', JSON.stringify(options));
        }

        // Step 3: Send the prompt directly from here (don't rely on session page to do it)
        sendMessage.mutateAsync({
          sessionId: session.id,
          parts: [{ type: 'text', text }],
          options: Object.keys(options).length > 0 ? options as any : undefined,
        }).catch(() => {
          // If send fails, the session page will show the error via SSE events
        });

        // Step 4: Navigate to session (prompt already sent, ?new=true for optimistic display only)
        router.push(`/sessions/${session.id}?new=true`);
      } catch (error) {
        sessionStorage.removeItem('opencode_pending_prompt');
        sessionStorage.removeItem('opencode_pending_options');
        setIsSubmitting(false);
        toast.warning('Failed to create session');
      }
    },
    [isSubmitting, createSession, sendMessage, router, local.agent.current, local.model.currentKey, local.model.variant.current],
  );

  const handleCommand = useCallback(
    (cmd: Command) => {},
    [],
  );

  const hasProjects = sortedProjects.length > 0;
  const hasSessions = recentSessions.length > 0;
  const hasContent = hasProjects || hasSessions;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Mobile menu button */}
      {isMobile && (
        <div className="absolute left-3 top-1.5 z-10">
          <button
            onClick={() => {
              setSidebarOpenState(true);
              setOpenMobile(true);
            }}
            className="flex items-center justify-center h-9 w-9 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent transition-colors touch-manipulation"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Scrollable container */}
      <div className="flex-1 overflow-y-auto">
        {/* ====== Hero Section — pushed down for direct engagement ====== */}
        <div className={cn(
          'relative flex flex-col items-center px-4',
          hasContent
            ? 'justify-end min-h-[50vh] pb-10 pt-20'
            : 'justify-center min-h-[65vh] pt-8 pb-8',
        )}>
          {/* Brandmark Background — subtler */}
          <div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <img
              src="/kortix-brandmark-bg.svg"
              alt=""
              className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[160vw] min-w-[1000px] md:min-w-[1200px] lg:w-[162vw] lg:min-w-[1620px] h-auto object-contain select-none invert dark:invert-0 opacity-60"
              draggable={false}
            />
          </div>

          {/* Centered content */}
          <div className="relative z-[1] w-full max-w-2xl mx-auto flex flex-col items-center text-center">
            {/* Greeting */}
            <div className="animate-in fade-in-0 slide-in-from-bottom-3 duration-500 fill-mode-both">
              <DynamicGreeting className="text-2xl sm:text-3xl md:text-4xl font-medium text-foreground tracking-tight" />
            </div>

            {/* Subtitle */}
            <p className="mt-2 text-sm text-muted-foreground/50 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-75 fill-mode-both">
              {hasProjects
                ? 'Start a session or pick a project below'
                : 'Ask anything about your code'}
            </p>

            {/* Chat Input */}
            <div className="w-full mt-6 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-100 fill-mode-both">
              <SessionChatInput
                onSend={handleSend}
                disabled={isSubmitting}
                placeholder="Ask anything..."
                agents={local.agent.list}
                selectedAgent={local.agent.current?.name ?? null}
                onAgentChange={local.agent.set}
                models={local.model.list}
                selectedModel={local.model.currentKey ?? null}
                onModelChange={(m) => local.model.set(m ?? undefined, { recent: true })}
                variants={local.model.variant.list}
                selectedVariant={local.model.variant.current ?? null}
                onVariantChange={(v) => local.model.variant.set(v ?? undefined)}
                commands={commands || []}
                onCommand={handleCommand}
              />
            </div>
          </div>
        </div>

        {/* ====== Content Section — flows directly below ====== */}
        {hasContent && (
          <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pb-16 space-y-10">
            {/* Recent Sessions — prominent, above projects */}
            {hasSessions && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
                <h3 className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest mb-2 px-1">
                  Recent
                </h3>
                <div className="rounded-2xl border border-border/20 bg-card/20 divide-y divide-border/10 overflow-hidden">
                  {recentSessions.map((session) => (
                    <RecentSessionRow
                      key={session.id}
                      session={session}
                      project={projectMap.get(session.projectID)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {hasProjects && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest">
                    Projects
                  </h3>
                  <span className="text-[11px] text-muted-foreground/30">
                    {sortedProjects.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {sortedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      sessionCount={sessionCounts.get(project.id) || 0}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== Empty state ====== */}
        {!hasContent && (
          <div className="flex flex-col items-center text-center px-4 pb-16 animate-in fade-in-0 duration-500 delay-300 fill-mode-both">
            <FolderOpen className="size-7 text-muted-foreground/10 mb-2" />
            <p className="text-xs text-muted-foreground/30">
              Create a git repo in your workspace to see it here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
