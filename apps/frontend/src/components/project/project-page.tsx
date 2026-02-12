'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FolderOpen,
  GitBranch,
  Clock,
  MessageCircle,
  FileText,
  Sparkles,
  Bot,
  Plus,
  ExternalLink,
  FolderTree,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useOpenCodeProjects,
  useOpenCodeSessions,
  useOpenCodeSkills,
  useOpenCodeAgents,
  useCreateOpenCodeSession,
  useOpenCodeProviders,
  useOpenCodeCommands,
} from '@/hooks/opencode/use-opencode-sessions';
import type { Session, Skill, Project } from '@/hooks/opencode/use-opencode-sessions';
import { useFileList } from '@/features/files/hooks/use-file-list';
import { SessionChatInput, flattenModels } from '@/components/session/session-chat-input';
import { KortixLoader } from '@/components/ui/kortix-loader';
import type { Command } from '@/hooks/opencode/use-opencode-sessions';
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

function truncatePath(path: string, maxSegments = 3): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= maxSegments) return path;
  return '.../' + segments.slice(-maxSegments).join('/');
}

// ============================================================================
// Project Header
// ============================================================================

function ProjectHeader({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        All Projects
      </Link>

      {/* Project title + meta */}
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center bg-muted/60"
          style={project.icon?.color ? { backgroundColor: project.icon.color + '20', color: project.icon.color } : undefined}
        >
          <FolderOpen className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {getProjectDisplayName(project)}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {project.vcs === 'git' && (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3" />
                git
              </span>
            )}
            <span className="inline-flex items-center gap-1" title={project.worktree}>
              <FolderTree className="size-3" />
              {truncatePath(project.worktree)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              Updated {formatRelativeTime(project.time.updated)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Config Cards (Instructions, Files, Skills)
// ============================================================================

function ConfigCard({
  icon,
  title,
  subtitle,
  detail,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  detail?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 p-4 rounded-xl border border-border/50 bg-card',
        'hover:border-border hover:bg-muted/30 transition-all text-left',
        'cursor-pointer group',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <Plus className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
      {detail && (
        <p className="text-[11px] text-muted-foreground/60">{detail}</p>
      )}
    </button>
  );
}

// ============================================================================
// Session List (project-scoped)
// ============================================================================

function ProjectSessionList({
  sessions,
  projectId,
}: {
  sessions: Session[];
  projectId: string;
}) {
  const router = useRouter();

  const projectSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.projectID === projectId && !s.parentID && !s.time.archived)
        .sort((a, b) => b.time.updated - a.time.updated),
    [sessions, projectId],
  );

  if (projectSessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
        <MessageCircle className="size-8 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No sessions yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Start a chat above to create the first session in this project
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {projectSessions.map((session) => (
        <button
          key={session.id}
          onClick={() => router.push(`/sessions/${session.id}`)}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left',
            'hover:bg-muted/40 transition-colors group cursor-pointer',
          )}
        >
          <MessageCircle className="size-4 text-muted-foreground/60 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {session.title || session.slug || 'Untitled'}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              {formatRelativeTime(session.time.updated)}
              {session.summary && session.summary.files > 0 && (
                <span className="ml-2">
                  {session.summary.files} file{session.summary.files !== 1 ? 's' : ''} changed
                </span>
              )}
            </p>
          </div>
          <ExternalLink className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Agents Section
// ============================================================================

function ProjectAgents() {
  const { data: agents } = useOpenCodeAgents();

  const visibleAgents = useMemo(
    () => (agents || []).filter((a) => !a.hidden),
    [agents],
  );

  if (visibleAgents.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        Agents
        <span className="text-xs text-muted-foreground/60 font-normal">
          ({visibleAgents.length})
        </span>
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {visibleAgents.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/30 bg-card/50"
          >
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                backgroundColor: (agent.color || '#666') + '18',
                color: agent.color || '#888',
              }}
            >
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{agent.name}</p>
              <p className="text-[10px] text-muted-foreground/60 truncate">
                {agent.mode === 'subagent' ? 'Sub-agent' : 'Primary'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Project Page
// ============================================================================

export function ProjectPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  // Data hooks
  const { data: projects, isLoading: projectsLoading } = useOpenCodeProjects();
  const { data: sessions } = useOpenCodeSessions();
  const { data: skills } = useOpenCodeSkills();
  const { data: agents } = useOpenCodeAgents();
  const { data: providers } = useOpenCodeProviders();
  const { data: commands } = useOpenCodeCommands();
  const createSession = useCreateOpenCodeSession();

  // Find the current project
  const project = useMemo(
    () => projects?.find((p) => p.id === projectId),
    [projects, projectId],
  );

  // File listing for project worktree
  const { data: files } = useFileList(project?.worktree || '');

  // Filter skills to this project
  const projectSkills = useMemo(() => {
    if (!skills || !project) return [];
    return skills.filter((s) => s.location.startsWith(project.worktree));
  }, [skills, project]);

  // Count sessions for this project
  const sessionCount = useMemo(() => {
    if (!sessions) return 0;
    return sessions.filter((s) => s.projectID === projectId && !s.parentID && !s.time.archived).length;
  }, [sessions, projectId]);

  // File count
  const fileCount = useMemo(() => {
    if (!files) return 0;
    return files.filter((f) => f.type === 'file').length;
  }, [files]);

  // Models
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

  // Chat input handler — create session scoped to this project's worktree
  const handleSend = useCallback(
    async (text: string, _files?: unknown) => {
      if (!text.trim() || isSubmitting || !project) return;
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

        const session = await createSession.mutateAsync({
          directory: project.worktree,
        });
        router.push(`/sessions/${session.id}?new=true`);
      } catch {
        sessionStorage.removeItem('opencode_pending_prompt');
        sessionStorage.removeItem('opencode_pending_options');
        setIsSubmitting(false);
        toast.warning('Failed to create session');
      }
    },
    [isSubmitting, createSession, router, project, selectedAgent, selectedModel, selectedVariant],
  );

  const handleCommand = useCallback(() => {}, []);

  // Loading state
  if (projectsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <KortixLoader size="small" />
      </div>
    );
  }

  // Not found
  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <FolderOpen className="size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Project not found</p>
        <Link
          href="/dashboard"
          className="text-sm text-foreground hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const projectName = getProjectDisplayName(project);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <ProjectHeader project={project} />

        {/* Chat Input */}
        <div className="relative">
          <SessionChatInput
            onSend={handleSend}
            disabled={isSubmitting}
            placeholder={`Start a session in ${projectName}...`}
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

        {/* Config Cards — Instructions, Files, Skills */}
        <div className="grid grid-cols-3 gap-3">
          <ConfigCard
            icon={<FileText className="size-4 text-blue-500" />}
            title="Instructions"
            subtitle="Project-specific agent instructions"
            detail="AGENTS.md in project root"
            onClick={() => router.push('/files')}
          />
          <ConfigCard
            icon={<FolderTree className="size-4 text-emerald-500" />}
            title="Files"
            subtitle={fileCount > 0 ? `${fileCount} files in project` : 'Browse project files'}
            detail={truncatePath(project.worktree)}
            onClick={() => router.push('/files')}
          />
          <ConfigCard
            icon={<Sparkles className="size-4 text-amber-500" />}
            title="Skills"
            subtitle={projectSkills.length > 0 ? `${projectSkills.length} skills loaded` : 'No project skills'}
            detail={projectSkills.length > 0 ? `${projectSkills.filter(() => true).length} available` : 'Add to .opencode/skills/'}
            onClick={() => router.push('/skills')}
          />
        </div>

        {/* Sessions */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MessageCircle className="size-4 text-muted-foreground" />
            Sessions
            {sessionCount > 0 && (
              <span className="text-xs text-muted-foreground/60 font-normal">
                ({sessionCount})
              </span>
            )}
          </h3>
          <ProjectSessionList
            sessions={sessions || []}
            projectId={projectId}
          />
        </div>

        {/* Agents */}
        <ProjectAgents />
      </div>
    </div>
  );
}
