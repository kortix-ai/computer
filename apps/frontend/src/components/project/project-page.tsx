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
  ChevronRight,
  Terminal,
  Plug,
  ScrollText,
  Slash,
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
  useOpenCodeMcpStatus,
} from '@/hooks/opencode/use-opencode-sessions';
import type { Session, Skill, Project, Agent, Command } from '@/hooks/opencode/use-opencode-sessions';
import { useOpenCodeConfig } from '@/hooks/opencode/use-opencode-config';
import type { Config } from '@/hooks/opencode/use-opencode-config';
import { useFileList } from '@/features/files/hooks/use-file-list';
import { SessionChatInput } from '@/components/session/session-chat-input';
import { useOpenCodeLocal } from '@/hooks/opencode/use-opencode-local';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        All Projects
      </Link>

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
// Agents Section
// ============================================================================

function AgentsSection({ agents }: { agents: Agent[] }) {
  const visible = useMemo(() => agents.filter((a) => !a.hidden), [agents]);

  return visible.length === 0 ? (
    <p className="text-xs text-muted-foreground py-2">No agents configured</p>
  ) : (
    <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
      {visible.map((agent) => (
        <AgentRow key={agent.name} agent={agent} />
      ))}
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/20 transition-colors cursor-default">
        <ChevronRight
          className={cn(
            'size-3 text-muted-foreground/40 transition-transform shrink-0',
            expanded && 'rotate-90',
          )}
        />
        <div
          className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{
            backgroundColor: (agent.color || '#666') + '18',
            color: agent.color || '#888',
          }}
        >
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium truncate">{agent.name}</span>
        {agent.mode !== 'primary' && (
          <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/50 shrink-0">
            {agent.mode}
          </span>
        )}
        {agent.model && (
          <span className="text-[11px] text-muted-foreground/50 truncate ml-auto">
            {agent.model.providerID}/{agent.model.modelID}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-2.5 pl-12 space-y-2 text-xs">
          {agent.description && (
            <p className="text-muted-foreground">{agent.description}</p>
          )}
          <div className="space-y-1">
            {agent.model && (
              <Row label="Model" value={`${agent.model.providerID}/${agent.model.modelID}`} />
            )}
            {agent.temperature !== undefined && (
              <Row label="Temperature" value={String(agent.temperature)} />
            )}
            {agent.topP !== undefined && (
              <Row label="Top P" value={String(agent.topP)} />
            )}
            {agent.steps !== undefined && (
              <Row label="Steps" value={String(agent.steps)} />
            )}
          </div>
          {agent.prompt && (
            <div className="space-y-1">
              <span className="text-muted-foreground">System prompt</span>
              <pre className="text-[11px] text-foreground/80 font-mono bg-muted/30 rounded-md p-2 max-h-40 overflow-auto whitespace-pre-wrap break-words border border-border/30">
                {agent.prompt}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Skills Section
// ============================================================================

function SkillsSection({ skills }: { skills: Skill[] }) {
  return skills.length === 0 ? (
    <p className="text-xs text-muted-foreground py-2">No skills configured</p>
  ) : (
    <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
      {skills.map((skill) => (
        <SkillRow key={skill.name} skill={skill} />
      ))}
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/20 transition-colors cursor-default">
        <ChevronRight
          className={cn(
            'size-3 text-muted-foreground/40 transition-transform shrink-0',
            expanded && 'rotate-90',
          )}
        />
        <span className="text-sm font-medium truncate">{skill.name}</span>
        {skill.description && (
          <span className="text-[11px] text-muted-foreground/50 truncate ml-auto max-w-[50%]">
            {skill.description}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-2.5 pl-9 space-y-2 text-xs">
          {skill.description && (
            <p className="text-muted-foreground">{skill.description}</p>
          )}
          {skill.location && (
            <Row label="Location" value={skill.location} mono />
          )}
          {skill.content && (
            <pre className="text-[11px] text-foreground/80 font-mono bg-muted/30 rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words border border-border/30">
              {skill.content}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// MCP Servers Section
// ============================================================================

function McpSection({ config }: { config: Config | undefined }) {
  const { data: mcpStatuses } = useOpenCodeMcpStatus();
  const mcpConfig = config?.mcp ?? {};

  const servers = useMemo(() => {
    const statusMap = mcpStatuses ?? {};
    const names = new Set([...Object.keys(statusMap), ...Object.keys(mcpConfig)]);
    return Array.from(names).map((name) => ({
      name,
      status: statusMap[name],
      config: mcpConfig[name],
    }));
  }, [mcpStatuses, mcpConfig]);

  return servers.length === 0 ? (
    <p className="text-xs text-muted-foreground py-2">No MCP servers configured</p>
  ) : (
    <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
      {servers.map((server) => (
        <McpRow key={server.name} server={server} />
      ))}
    </div>
  );
}

function StatusDot({ status }: { status?: string }) {
  return (
    <div
      className={cn(
        'size-2 rounded-full shrink-0',
        status === 'connected' && 'bg-emerald-500',
        status === 'failed' && 'bg-red-500',
        (status === 'needs_auth' || status === 'needs_client_registration') && 'bg-yellow-500',
        status === 'disabled' && 'bg-gray-400',
        !status && 'bg-gray-300',
      )}
    />
  );
}

function McpRow({ server }: { server: { name: string; status?: any; config?: any } }) {
  const [expanded, setExpanded] = useState(false);
  const statusText = server.status?.status ?? 'unknown';

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/20 transition-colors cursor-default">
        <ChevronRight
          className={cn(
            'size-3 text-muted-foreground/40 transition-transform shrink-0',
            expanded && 'rotate-90',
          )}
        />
        <StatusDot status={statusText} />
        <span className="text-sm font-medium truncate">{server.name}</span>
        <span className="text-[11px] text-muted-foreground/50 ml-auto shrink-0">
          {statusText}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-2.5 pl-9 space-y-1.5 text-xs">
          <Row label="Status" value={statusText} />
          {server.config?.type && (
            <Row label="Type" value={server.config.type} mono />
          )}
          {server.config?.command && (
            <Row label="Command" value={server.config.command.join(' ')} mono />
          )}
          {server.config?.url && (
            <Row label="URL" value={server.config.url} mono />
          )}
          {statusText === 'failed' && server.status?.error && (
            <div className="text-red-500 font-mono break-all mt-1">
              {server.status.error}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Instructions Section
// ============================================================================

function InstructionsSection({ instructions }: { instructions: string[] }) {
  return instructions.length === 0 ? (
    <p className="text-xs text-muted-foreground py-2">No instructions configured</p>
  ) : (
    <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
      {instructions.map((path) => (
        <div key={path} className="flex items-center gap-2 px-3 py-2">
          <FileText className="size-3.5 text-muted-foreground/40 shrink-0" />
          <span className="text-xs font-mono text-foreground/80 truncate">{path}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Commands Section
// ============================================================================

function CommandsSection({ commands }: { commands: Command[] }) {
  return commands.length === 0 ? (
    <p className="text-xs text-muted-foreground py-2">No commands configured</p>
  ) : (
    <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
      {commands.map((cmd) => (
        <div key={cmd.name} className="flex items-center gap-2 px-3 py-2 min-w-0">
          <Terminal className="size-3.5 text-muted-foreground/40 shrink-0" />
          <span className="text-xs font-mono font-medium text-foreground shrink-0">
            /{cmd.name}
          </span>
          {cmd.description && (
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {cmd.description}
            </span>
          )}
          {cmd.source && (
            <span className="text-[10px] text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/50 shrink-0 ml-auto">
              {cmd.source}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Shared Row Component
// ============================================================================

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className={cn('text-foreground/80 truncate', mono && 'font-mono')}>{value}</span>
    </div>
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
// Main Project Page
// ============================================================================

export function ProjectPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data hooks
  const { data: projects, isLoading: projectsLoading } = useOpenCodeProjects();
  const { data: sessions } = useOpenCodeSessions();
  const { data: skills } = useOpenCodeSkills();
  const { data: agents } = useOpenCodeAgents();
  const { data: providers } = useOpenCodeProviders();
  const { data: commands } = useOpenCodeCommands();
  const { data: config } = useOpenCodeConfig();
  const createSession = useCreateOpenCodeSession();

  // Unified model/agent/variant state
  const local = useOpenCodeLocal({ agents, providers, config });

  // Find the current project
  const project = useMemo(
    () => projects?.find((p) => p.id === projectId),
    [projects, projectId],
  );

  // File listing for project worktree
  const { data: files } = useFileList(project?.worktree || '');

  // Filter skills to this project
  const projectSkills = useMemo(() => skills ?? [], [skills]);

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

  // Instructions from config
  const instructions = useMemo(() => config?.instructions ?? [], [config]);

  // Visible agent count (non-hidden) for tab badge
  const visibleAgentCount = useMemo(() => (agents ?? []).filter((a) => !a.hidden).length, [agents]);

  // Chat input handler — create session scoped to this project's worktree
  const handleSend = useCallback(
    async (text: string, _files?: unknown) => {
      if (!text.trim() || isSubmitting || !project) return;
      setIsSubmitting(true);
      try {
        sessionStorage.setItem('opencode_pending_prompt', text);

        const options: Record<string, unknown> = {};
        if (local.agent.current) options.agent = local.agent.current.name;
        if (local.model.currentKey) options.model = local.model.currentKey;
        if (local.model.variant.current) options.variant = local.model.variant.current;
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
    [isSubmitting, createSession, router, project, local.agent.current, local.model.currentKey, local.model.variant.current],
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
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <ProjectHeader project={project} />

        {/* Chat Input */}
        <div className="relative">
          <SessionChatInput
            onSend={handleSend}
            disabled={isSubmitting}
            placeholder={`Start a session in ${projectName}...`}
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

        {/* Config Tabs */}
        <Tabs defaultValue="agents">
          <TabsList className="w-full">
            <TabsTrigger value="agents">
              <Bot className="size-3.5" />
              Agents
              <span className="text-[10px] text-muted-foreground/60 tabular-nums bg-muted/50 px-1 py-0.5 rounded">{visibleAgentCount}</span>
            </TabsTrigger>
            <TabsTrigger value="skills">
              <Sparkles className="size-3.5" />
              Skills
              <span className="text-[10px] text-muted-foreground/60 tabular-nums bg-muted/50 px-1 py-0.5 rounded">{projectSkills.length}</span>
            </TabsTrigger>
            <TabsTrigger value="mcp">
              <Plug className="size-3.5" />
              MCP
              <span className="text-[10px] text-muted-foreground/60 tabular-nums bg-muted/50 px-1 py-0.5 rounded">{Object.keys(config?.mcp ?? {}).length}</span>
            </TabsTrigger>
            <TabsTrigger value="instructions">
              <ScrollText className="size-3.5" />
              Instructions
              <span className="text-[10px] text-muted-foreground/60 tabular-nums bg-muted/50 px-1 py-0.5 rounded">{instructions.length}</span>
            </TabsTrigger>
            <TabsTrigger value="commands">
              <Slash className="size-3.5" />
              Commands
              <span className="text-[10px] text-muted-foreground/60 tabular-nums bg-muted/50 px-1 py-0.5 rounded">{(commands ?? []).length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="agents">
            <AgentsSection agents={agents ?? []} />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsSection skills={projectSkills} />
          </TabsContent>
          <TabsContent value="mcp">
            <McpSection config={config} />
          </TabsContent>
          <TabsContent value="instructions">
            <InstructionsSection instructions={instructions} />
          </TabsContent>
          <TabsContent value="commands">
            <CommandsSection commands={commands ?? []} />
          </TabsContent>
        </Tabs>

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
      </div>
    </div>
  );
}
