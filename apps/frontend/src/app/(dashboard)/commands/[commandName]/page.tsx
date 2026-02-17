'use client';

import { useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Terminal,
  ChevronRight,
  Bot,
  Cpu,
  Tag,
  FileText,
  Copy,
  Check,
  Lightbulb,
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
import { useOpenCodeCommands } from '@/hooks/opencode/use-opencode-sessions';
import { openTabAndNavigate } from '@/stores/tab-store';
import { getActiveOpenCodeUrl } from '@/stores/server-store';
import { getSupabaseAccessToken } from '@/lib/auth-token';
import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// File write helper (same pattern as skills/agents)
// ---------------------------------------------------------------------------

async function uploadToPath(filePath: string, content: string): Promise<void> {
  const baseUrl = getActiveOpenCodeUrl();
  if (!baseUrl) throw new Error('No OpenCode server URL configured');

  const blob = new Blob([content], { type: 'text/markdown' });
  const form = new FormData();
  const fileName = filePath.split('/').pop() || 'command.md';
  form.append(filePath, blob, fileName);

  const headers: Record<string, string> = {};
  const token = await getSupabaseAccessToken();
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
// Build command .md content (frontmatter + body)
// ---------------------------------------------------------------------------

function buildCommandFileContent(
  description: string,
  agent: string | undefined,
  body: string,
): string {
  const lines: string[] = ['---'];

  if (description) {
    const needsQuoting = /[:#{}[\],&*?|>!%@`]/.test(description) || description.includes('\n');
    lines.push(needsQuoting
      ? `description: "${description.replace(/"/g, '\\"')}"`
      : `description: ${description}`
    );
  }

  if (agent) {
    lines.push(`agent: ${agent}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(body);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Strip frontmatter from template to get the body
// ---------------------------------------------------------------------------

function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const endIndex = text.indexOf('---', 3);
  if (endIndex === -1) return text;
  return text.slice(endIndex + 3).trim();
}

// ---------------------------------------------------------------------------
// Command Detail Page
// ---------------------------------------------------------------------------

export default function CommandDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const commandName = decodeURIComponent(params.commandName as string);

  const { data: commands, isLoading, error } = useOpenCodeCommands();
  const [copied, setCopied] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editBody, setEditBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const command = useMemo(() => {
    if (!commands) return null;
    return commands.find((c) => c.name === commandName) ?? null;
  }, [commands, commandName]);

  // Only .opencode/commands/ source commands are editable
  const isEditable = command?.source === 'command' || !command?.source;

  const cleanTemplate = useMemo(() => {
    if (!command?.template) return null;
    return stripFrontmatter(command.template);
  }, [command?.template]);

  const handleCopyTemplate = async () => {
    if (!command?.template) return;
    await navigator.clipboard.writeText(command.template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing = useCallback(() => {
    if (!command) return;
    setEditDescription(command.description || '');
    setEditBody(cleanTemplate || command.template || '');
    setIsEditing(true);
  }, [command, cleanTemplate]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditDescription('');
    setEditBody('');
  }, []);

  const saveChanges = useCallback(async () => {
    if (!command) return;
    setIsSaving(true);
    try {
      const filePath = `.opencode/commands/${command.name}.md`;
      const content = buildCommandFileContent(editDescription, command.agent, editBody);
      await uploadToPath(filePath, content);

      // Force the server to rescan
      const client = getClient();
      await client.instance.dispose();

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['opencode', 'commands'] });

      setIsEditing(false);
      toast.success('Command saved successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save command');
    } finally {
      setIsSaving(false);
    }
  }, [command, editDescription, editBody, queryClient]);

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
            <p className="text-sm text-destructive">Failed to load commands</p>
          </div>
        </div>
      </div>
    );
  }

  if (!command) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Terminal className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Command &ldquo;/{commandName}&rdquo; not found
            </p>
            <Link
              href="/commands"
              className="text-xs text-muted-foreground/60 hover:text-foreground mt-2 inline-block underline underline-offset-2 transition-colors"
            >
              Back to commands
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sourceConfig: Record<string, { color: string; label: string }> = {
    command: { color: 'bg-green-500/10 text-green-500', label: 'Command' },
    mcp: { color: 'bg-cyan-500/10 text-cyan-500', label: 'MCP' },
    skill: { color: 'bg-amber-500/10 text-amber-500', label: 'Skill' },
  };

  const sourceCfg = sourceConfig[command.source || 'command'] || sourceConfig.command;

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
          <span className="text-foreground font-medium font-mono">/{command.name}</span>
        </nav>

        {/* Two-panel layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Main content */}
          <div className="flex-1 min-w-0">
            {/* Command header card */}
            <div className="rounded-xl border border-border/50 bg-card p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-14 w-14 rounded-2xl bg-green-500/10 text-green-500 flex items-center justify-center">
                  <Terminal className="h-7 w-7" />
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight font-mono">/{command.name}</h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn('inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider', sourceCfg.color)}>
                      {sourceCfg.label}
                    </span>
                    {command.subtask && (
                      <span className="inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                        Subtask
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit / Save / Cancel buttons */}
                {isEditable && (
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
                )}
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
                    rows={2}
                    className="text-sm resize-none"
                    placeholder="Command description..."
                  />
                </div>
              ) : command.description ? (
                <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                  {command.description}
                </p>
              ) : null}
            </div>

            {/* Command Template */}
            {isEditing ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    Command Template
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">Use $ARGUMENTS for user input</span>
                </div>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full min-h-[400px] border-0 rounded-none font-mono text-sm resize-y focus-visible:ring-0 focus-visible:ring-offset-0 p-5"
                  placeholder="Command template body...&#10;&#10;Use $ARGUMENTS to reference user input."
                />
              </div>
            ) : command.template ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    Command Template
                  </span>
                  <button
                    onClick={handleCopyTemplate}
                    className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="p-5">
                  <UnifiedMarkdown content={command.template} />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <p className="text-sm text-muted-foreground">No template defined</p>
                {isEditable && !isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditing}
                    className="mt-2 gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Add template
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Right: Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
            {/* Configuration */}
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/50">
                <h2 className="text-sm font-semibold">Configuration</h2>
              </div>

              <div className="p-4 space-y-4">
                {/* Agent */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Agent</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm">{command.agent || 'Default'}</p>
                  </div>
                </div>

                {/* Model override */}
                {command.model && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Model</span>
                    </div>
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-sm truncate">{command.model}</p>
                    </div>
                  </div>
                )}

                {/* Source */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Source</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm capitalize">{command.source || 'command'}</p>
                  </div>
                </div>

                {/* Usage */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Usage</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <code className="text-[11px] font-mono text-foreground/80">
                      /{command.name} {'<arguments>'}
                    </code>
                  </div>
                </div>

                {/* File path */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">File</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-[11px] font-mono text-muted-foreground break-all leading-relaxed">
                      .opencode/commands/{command.name}.md
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hints */}
            {command.hints && command.hints.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50">
                  <Lightbulb className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <h2 className="text-sm font-semibold">Hints</h2>
                  <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60 ml-auto">
                    {command.hints.length}
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  {command.hints.map((hint, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-muted/30 px-3 py-2"
                    >
                      <p className="text-xs font-mono text-foreground/80">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
