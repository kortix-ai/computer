'use client';

import { useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bot,
  ChevronRight,
  EyeOff,
  Eye,
  Cpu,
  Thermometer,
  Hash,
  Blocks,
  Pencil,
  X,
  Save,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { UnifiedMarkdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useOpenCodeAgents } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { getAuthToken } from '@/lib/auth-token';
import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// File write helper (same pattern as skills API)
// ---------------------------------------------------------------------------

async function uploadToPath(filePath: string, content: string): Promise<void> {
  const baseUrl = getActiveOpenCodeUrl();
  if (!baseUrl) throw new Error('No OpenCode server URL configured');

  const blob = new Blob([content], { type: 'text/markdown' });
  const form = new FormData();
  const fileName = filePath.split('/').pop() || 'agent.md';
  form.append(filePath, blob, fileName);

  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}/file/upload`, {
    method: 'POST',
    body: form,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to write file (${res.status}): ${text || res.statusText}`);
  }
}

// ---------------------------------------------------------------------------
// Build agent .md content (frontmatter + body)
// ---------------------------------------------------------------------------

function buildAgentFileContent(agent: any, newDescription: string, newBody: string): string {
  const lines: string[] = ['---'];

  // Description
  if (newDescription) {
    // Quote the description if it contains special YAML chars
    const needsQuoting = /[:#{}[\],&*?|>!%@`]/.test(newDescription) || newDescription.includes('\n');
    lines.push(needsQuoting
      ? `description: "${newDescription.replace(/"/g, '\\"')}"`
      : `description: ${newDescription}`
    );
  }

  // Model
  if (agent.model?.modelID) {
    lines.push(`model: ${agent.model.providerID ? `${agent.model.providerID}/${agent.model.modelID}` : agent.model.modelID}`);
  }

  // Mode
  if (agent.mode) {
    lines.push(`mode: ${agent.mode}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(newBody);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parse frontmatter from raw prompt to get the body only
// ---------------------------------------------------------------------------

function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const endIndex = text.indexOf('---', 3);
  if (endIndex === -1) return text;
  return text.slice(endIndex + 3).trim();
}

function getAgentFilePath(agentName: string): string {
  return `.opencode/agents/${agentName}.md`;
}

// ---------------------------------------------------------------------------
// Agent Detail Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const agentName = decodeURIComponent(params.agentName as string);

  const { data: agents, isLoading, error } = useOpenCodeAgents();

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editBody, setEditBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const agent = useMemo(() => {
    if (!agents) return null;
    return agents.find((a) => a.name === agentName) ?? null;
  }, [agents, agentName]);

  const cleanPrompt = useMemo(() => {
    if (!agent?.prompt) return null;
    return stripFrontmatter(agent.prompt);
  }, [agent?.prompt]);

  const startEditing = useCallback(() => {
    if (!agent) return;
    setEditDescription(agent.description || '');
    setEditBody(cleanPrompt || '');
    setIsEditing(true);
  }, [agent, cleanPrompt]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditDescription('');
    setEditBody('');
  }, []);

  const saveChanges = useCallback(async () => {
    if (!agent) return;
    setIsSaving(true);
    try {
      const filePath = getAgentFilePath(agent.name);
      const content = buildAgentFileContent(agent, editDescription, editBody);
      await uploadToPath(filePath, content);

      // Force the server to rescan
      const client = getClient();
      await client.instance.dispose();

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['opencode', 'agents'] });

      setIsEditing(false);
      toast.success('Agent saved successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save agent');
    } finally {
      setIsSaving(false);
    }
  }, [agent, editDescription, editBody, queryClient]);

  const modeConfig = {
    primary: { color: 'bg-blue-500/10 text-blue-500', label: 'Primary' },
    subagent: { color: 'bg-violet-500/10 text-violet-500', label: 'Subagent' },
    all: { color: 'bg-emerald-500/10 text-emerald-500', label: 'All' },
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <KortixLoader size="medium" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load agent</p>
            <p className="text-xs text-muted-foreground mt-1">Could not connect to the OpenCode server</p>
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Agent &ldquo;{agentName}&rdquo; not found</p>
            <Link
              href="/agents"
              className="text-xs text-muted-foreground/60 hover:text-foreground mt-2 inline-block underline underline-offset-2 transition-colors"
            >
              Back to agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const mode = agent.mode as keyof typeof modeConfig;
  const cfg = modeConfig[mode] || modeConfig.all;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
          <button
            onClick={() => {
              openTabAndNavigate({
                id: 'page:/workspace',
                title: 'Workspace',
                type: 'page',
                href: '/workspace',
              }, router);
            }}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Workspace
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium truncate max-w-[300px]">{agent.name}</span>
        </nav>

        {/* Two-panel layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Main content */}
          <div className="flex-1 min-w-0">
            {/* Agent header card */}
            <div className="rounded-xl border border-border/50 bg-card p-6 mb-6">
              <div className="flex items-start gap-4">
                <div
                  className="flex-shrink-0 h-14 w-14 rounded-2xl flex items-center justify-center"
                  style={{
                    backgroundColor: agent.color ? `${agent.color}15` : 'var(--muted)',
                    color: agent.color || 'var(--muted-foreground)',
                  }}
                >
                  <Bot className="h-7 w-7" />
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight">{agent.name}</h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn('inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider', cfg.color)}>
                      {cfg.label}
                    </span>
                    {agent.hidden && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                        <EyeOff className="h-3 w-3" /> Hidden
                      </span>
                    )}
                    {agent.native && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                        Built-in
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit / Save / Cancel buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveChanges}
                        disabled={isSaving}
                        className="gap-1.5"
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startEditing}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {/* Description */}
              {isEditing ? (
                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">
                    Description
                  </label>
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                    placeholder="Agent description..."
                  />
                </div>
              ) : agent.description ? (
                <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                  {agent.description}
                </p>
              ) : null}
            </div>

            {/* System Prompt */}
            {isEditing ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <Blocks className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    System Prompt
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">Markdown supported</span>
                </div>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full min-h-[500px] border-0 rounded-none font-mono text-sm resize-y focus-visible:ring-0 focus-visible:ring-offset-0 p-5"
                  placeholder="# Agent System Prompt&#10;&#10;Write the agent's instructions here..."
                />
              </div>
            ) : cleanPrompt ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <Blocks className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    System Prompt
                  </span>
                </div>
                <div className="p-5">
                  <UnifiedMarkdown content={cleanPrompt} />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <p className="text-sm text-muted-foreground">No system prompt defined</p>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditing}
                    className="mt-2 gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Add system prompt
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Right: Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
            {/* Overview header */}
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/50">
                <h2 className="text-sm font-semibold">Configuration</h2>
              </div>

              <div className="p-4 space-y-4">
                {/* Model */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Model</span>
                  </div>
                  {agent.model ? (
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-sm font-medium truncate">{agent.model.modelID}</p>
                      <p className="text-[11px] text-muted-foreground/60 truncate">{agent.model.providerID}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic px-1">Default model</p>
                  )}
                </div>

                {/* Temperature / TopP */}
                {(agent.temperature !== undefined || agent.topP !== undefined) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Thermometer className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Sampling</span>
                    </div>
                    <div className="flex gap-2">
                      {agent.temperature !== undefined && (
                        <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Temp</p>
                          <p className="text-sm font-medium tabular-nums">{agent.temperature}</p>
                        </div>
                      )}
                      {agent.topP !== undefined && (
                        <div className="flex-1 rounded-lg bg-muted/30 px-3 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Top P</p>
                          <p className="text-sm font-medium tabular-nums">{agent.topP}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Steps */}
                {agent.steps !== undefined && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Max Steps</span>
                    </div>
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-sm font-medium tabular-nums">{agent.steps}</p>
                    </div>
                  </div>
                )}

                {/* Visibility */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {agent.hidden ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground/60" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground/60" />}
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Visibility</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm">{agent.hidden ? 'Hidden' : 'Visible'}</p>
                  </div>
                </div>

                {/* File path */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Blocks className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">File</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-[11px] font-mono text-muted-foreground break-all leading-relaxed">
                      .opencode/agents/{agent.name}.md
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
