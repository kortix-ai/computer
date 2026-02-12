'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/utils';
import { toast } from '@/lib/toast';
import { useSidebar } from '@/components/ui/sidebar';
import {
  useCreateOpenCodeSession,
  useOpenCodeAgents,
  useOpenCodeProviders,
  useOpenCodeCommands,
  useOpenCodeProjects,
  useOpenCodeSessions,
} from '@/hooks/opencode/use-opencode-sessions';
import { useTabStore } from '@/stores/tab-store';
import { SessionChatInput, flattenModels } from '@/components/session/session-chat-input';
import { DynamicGreeting } from '@/components/ui/dynamic-greeting';
import {
  Menu,
  FolderOpen,
  MessageCircle,
  Clock,
  GitBranch,
  ArrowRight,
  ExternalLink,
  ChevronDown,
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
        'group flex flex-col gap-3 p-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm',
        'hover:border-border/80 hover:bg-card/80 transition-all duration-200',
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted/50 flex-shrink-0"
          style={project.icon?.color ? { backgroundColor: project.icon.color + '18', color: project.icon.color } : undefined}
        >
          <FolderOpen className="size-4" />
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-all duration-200 group-hover:translate-x-0.5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{getProjectDisplayName(project)}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground/50">
          {sessionCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-2.5" />
              {sessionCount} session{sessionCount !== 1 ? 's' : ''}
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
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left hover:bg-muted/30 transition-colors group cursor-pointer"
    >
      <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
        <MessageCircle className="size-3.5 text-muted-foreground/50" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {session.title || session.slug || 'Untitled'}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 mt-0.5">
          {project && project.id !== 'global' && (
            <>
              <span className="truncate max-w-[120px]">{getProjectDisplayName(project)}</span>
              <span>·</span>
            </>
          )}
          <span>{formatRelativeTime(session.time.updated)}</span>
          {session.summary && session.summary.files > 0 && (
            <>
              <span>·</span>
              <span>{session.summary.files} file{session.summary.files !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>
      <ExternalLink className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/30 transition-colors flex-shrink-0" />
    </button>
  );
}

// ============================================================================
// Dashboard Content
// ============================================================================

export function DashboardContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpen: setSidebarOpenState, setOpenMobile } = useSidebar();
  const createSession = useCreateOpenCodeSession();

  // Data
  const { data: agents } = useOpenCodeAgents();
  const { data: providers } = useOpenCodeProviders();
  const { data: commands } = useOpenCodeCommands();
  const { data: projects } = useOpenCodeProjects();
  const { data: sessions } = useOpenCodeSessions();

  const visibleAgents = useMemo(
    () => (agents || []).filter((a) => a.mode !== 'subagent' && !a.hidden),
    [agents],
  );

  const flatModels = useMemo(() => flattenModels(providers), [providers]);

  const currentVariants = useMemo(() => {
    if (!selectedModel) {
      const first = flatModels[0];
      return first?.variants ? Object.keys(first.variants) : [];
    }
    const model = flatModels.find(
      (m) => m.providerID === selectedModel.providerID && m.modelID === selectedModel.modelID,
    );
    return model?.variants ? Object.keys(model.variants) : [];
  }, [selectedModel, flatModels]);

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
        sessionStorage.setItem('opencode_pending_prompt', text);

        const options: Record<string, unknown> = {};
        if (selectedAgent) options.agent = selectedAgent;
        if (selectedModel) options.model = selectedModel;
        if (selectedVariant) options.variant = selectedVariant;
        if (Object.keys(options).length > 0) {
          sessionStorage.setItem('opencode_pending_options', JSON.stringify(options));
        }

        const session = await createSession.mutateAsync();
        useTabStore.getState().openTab({
          id: session.id,
          title: 'New session',
          type: 'session',
          href: `/sessions/${session.id}`,
        });
        router.push(`/sessions/${session.id}?new=true`);
      } catch (error) {
        sessionStorage.removeItem('opencode_pending_prompt');
        sessionStorage.removeItem('opencode_pending_options');
        setIsSubmitting(false);
        toast.warning('Failed to create session');
      }
    },
    [isSubmitting, createSession, router, selectedAgent, selectedModel, selectedVariant],
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
        {/* ====== Hero Section ====== */}
        <div className={cn(
          'relative flex flex-col items-center justify-center px-4',
          hasContent ? 'min-h-[55vh] pt-16 pb-8' : 'min-h-[70vh] pt-8 pb-8',
        )}>
          {/* Brandmark Background */}
          <div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <img
              src="/kortix-brandmark-bg.svg"
              alt=""
              className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[160vw] min-w-[1000px] md:min-w-[1200px] lg:w-[162vw] lg:min-w-[1620px] h-auto object-contain select-none invert dark:invert-0 opacity-80"
              draggable={false}
            />
          </div>

          {/* Centered content */}
          <div className="relative z-[1] w-full max-w-2xl mx-auto flex flex-col items-center text-center">
            {/* Greeting */}
            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
              <DynamicGreeting className="text-2xl sm:text-3xl md:text-4xl font-medium text-foreground tracking-tight" />
            </div>

            {/* Subtitle */}
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground/60 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
              {hasProjects
                ? 'Start a session or pick a project below'
                : 'Ask anything about your code'}
            </p>

            {/* Chat Input */}
            <div className="w-full mt-6 sm:mt-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
              <SessionChatInput
                onSend={handleSend}
                disabled={isSubmitting}
                placeholder="Ask anything..."
                agents={visibleAgents}
                selectedAgent={selectedAgent}
                onAgentChange={setSelectedAgent}
                models={flatModels}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                variants={currentVariants}
                selectedVariant={selectedVariant}
                onVariantChange={setSelectedVariant}
                commands={commands || []}
                onCommand={handleCommand}
              />
            </div>
          </div>

          {/* Scroll hint — only when there's content below */}
          {hasContent && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-in fade-in-0 duration-700 delay-500 fill-mode-both">
              <ChevronDown className="size-4 text-muted-foreground/30 animate-bounce" />
            </div>
          )}
        </div>

        {/* ====== Content Section ====== */}
        {hasContent && (
          <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pb-12 space-y-8">
            {/* Projects */}
            {hasProjects && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-6 duration-600 delay-200 fill-mode-both">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Projects
                  </h3>
                  <span className="text-[11px] text-muted-foreground/40">
                    {sortedProjects.length} project{sortedProjects.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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

            {/* Recent Sessions */}
            {hasSessions && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-6 duration-600 delay-300 fill-mode-both">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Recent Sessions
                  </h3>
                </div>
                <div className="rounded-xl border border-border/30 bg-card/30 divide-y divide-border/20 overflow-hidden">
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
          </div>
        )}

        {/* ====== Empty state ====== */}
        {!hasContent && (
          <div className="flex flex-col items-center text-center px-4 pb-16 animate-in fade-in-0 duration-500 delay-300 fill-mode-both">
            <FolderOpen className="size-8 text-muted-foreground/15 mb-2" />
            <p className="text-xs text-muted-foreground/40">
              Create a git repo in your workspace to see it here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
