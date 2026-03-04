'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Settings,
  Shield,
  Zap,
  Loader2,
  Unplug,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Server,
  Plus,
  AlertCircle,
  Plug,
  Power,
  Wrench,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  useOpenCodeConfig,
  useUpdateOpenCodeConfig,
} from '@/hooks/opencode/use-opencode-config';
import type { Config } from '@/hooks/opencode/use-opencode-config';
import {
  useOpenCodeProviders,
  useOpenCodeToolIds,
} from '@/hooks/opencode/use-opencode-sessions';
import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
import { ConnectProviderContent } from '@/components/providers/connect-provider-content';
import {
  useOpenCodeMcpStatus,
  useAddMcpServer,
  useConnectMcpServer,
  useDisconnectMcpServer,
  useMcpAuthStart,
  useMcpAuthCallback,
} from '@/hooks/opencode/use-opencode-mcp';
import type { McpStatus } from '@/hooks/opencode/use-opencode-mcp';
import { toast } from '@/lib/toast';

// ============================================================================
// Constants
// ============================================================================

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
  opencode: 'OpenCode',
  kortix: 'Kortix',
  bedrock: 'AWS Bedrock',
  openrouter: 'OpenRouter',
  'github-copilot': 'GitHub Copilot',
  vercel: 'Vercel',
};

const PERMISSION_TYPES = [
  { key: 'read', label: 'Read', description: 'Read files in the project' },
  { key: 'edit', label: 'Edit', description: 'Edit files in the project' },
  { key: 'bash', label: 'Bash', description: 'Run shell commands' },
  { key: 'glob', label: 'Glob', description: 'Search files by pattern' },
  { key: 'grep', label: 'Grep', description: 'Search file contents' },
  { key: 'list', label: 'List', description: 'List directory contents' },
  { key: 'webfetch', label: 'Web Fetch', description: 'Fetch content from the web' },
  { key: 'task', label: 'Task', description: 'Run sub-agent tasks' },
  { key: 'external_directory', label: 'External Dir', description: 'Access outside project' },
  { key: 'doom_loop', label: 'Doom Loop', description: 'Re-prompt on failure loops' },
] as const;

const ACTIONS = ['allow', 'ask', 'deny'] as const;

// ============================================================================
// Props
// ============================================================================

interface OpenCodeSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// General Tab
// ============================================================================

function GeneralSection({
  draft,
  config,
  onDraft,
}: {
  draft: Record<string, unknown>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const { data: providers } = useOpenCodeProviders();

  const allModels = useMemo(() => {
    if (!providers?.all) return [];
    return providers.all.flatMap((p) =>
      Object.values(p.models).map((m) => ({
        label: `${p.id}/${m.id}`,
        name: m.name,
        providerName: PROVIDER_LABELS[p.id] || p.name || p.id,
      })),
    );
  }, [providers]);

  const model = (draft.model as string) ?? config.model ?? '';
  const instructions = (draft.instructions as string[]) ?? config.instructions ?? [];
  const instructionsText = instructions.join('\n');
  const snapshot = (draft.snapshot as boolean | undefined) ?? config.snapshot ?? false;

  return (
    <div className="space-y-6 overflow-y-auto pr-1">
      {/* Custom Instructions */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Custom Instructions
        </label>
        <p className="text-xs text-muted-foreground/60">
          Additional instruction file paths, one per line (e.g. docs/rules.md)
        </p>
        <Textarea
          value={instructionsText}
          onChange={(e) => {
            const lines = e.target.value
              .split('\n')
              .filter((l) => l.trim() !== '');
            onDraft('instructions', lines.length > 0 ? lines : undefined);
          }}
          placeholder="docs/rules.md&#10;.cursorrules&#10;AGENTS.md"
          rows={4}
          className="font-mono text-sm resize-none rounded-xl"
        />
      </div>

      {/* Default Model */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Default Model
        </label>
        <Select
          value={model || '__auto__'}
          onValueChange={(v) => onDraft('model', v === '__auto__' ? undefined : v)}
        >
          <SelectTrigger className="w-full font-mono text-sm rounded-xl">
            <SelectValue placeholder="Auto-detect" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">Auto-detect</SelectItem>
            {allModels.map((m) => (
              <SelectItem key={m.label} value={m.label}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Snapshots */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Snapshots
            </label>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Create a git snapshot at each agentic step for reviewing changes
            </p>
          </div>
          <Switch
            checked={snapshot}
            onCheckedChange={(v) => onDraft('snapshot', v)}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Providers Tab
// ============================================================================

function ProvidersSection({
  onDirty,
}: {
  onDirty: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: providers } = useOpenCodeProviders();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [connectView, setConnectView] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const allProviders = useMemo(() => providers?.all ?? [], [providers]);
  const connectedIds = useMemo(() => new Set(providers?.connected ?? []), [providers]);

  const connectedProviders = useMemo(
    () => allProviders.filter((p) => connectedIds.has(p.id)),
    [allProviders, connectedIds],
  );

  const handleDisconnect = useCallback(
    async (providerID: string) => {
      setDisconnecting(providerID);
      try {
        const client = getClient();
        await client.auth.set({
          providerID,
          auth: { type: 'api', key: '' },
        } as any);
        await client.global.dispose();
        queryClient.invalidateQueries({ queryKey: opencodeKeys.providers() });
        onDirty();
      } catch {
        // ignore
      } finally {
        setDisconnecting(null);
      }
    },
    [queryClient, onDirty],
  );

  if (connectView) {
    return (
      <div className="overflow-y-auto">
        <ConnectProviderContent
          providers={providers}
          onClose={() => setConnectView(false)}
          onProviderConnected={() => {
            setConnectView(false);
            onDirty();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
          Connected ({connectedProviders.length})
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs gap-1.5 rounded-lg"
          onClick={() => setConnectView(true)}
        >
          <Plus className="h-3 w-3" />
          Connect
        </Button>
      </div>

      {connectedProviders.length > 0 ? (
        <div className="space-y-2">
          {connectedProviders.map((p) => {
            const modelCount = Object.keys(p.models).length;
            const isExp = expanded === p.id;
            const isDisc = disconnecting === p.id;
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border/40 bg-card/50 overflow-hidden"
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {PROVIDER_LABELS[p.id] || p.name || p.id}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <span className="w-1 h-1 rounded-full bg-emerald-500" />
                        connected
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/60">
                      {modelCount} model{modelCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDisconnect(p.id)}
                    disabled={isDisc}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    title="Disconnect"
                  >
                    {isDisc ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unplug className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {modelCount > 0 && (
                  <button
                    onClick={() => setExpanded(isExp ? null : p.id)}
                    className="flex items-center gap-1 px-3 pb-2 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {isExp ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {isExp ? 'Hide models' : 'Show models'}
                  </button>
                )}

                {isExp && (
                  <div className="border-t border-border/20">
                    {Object.values(p.models).map((m: any) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 px-3 py-1 text-[11px] text-foreground/60 hover:bg-muted/20"
                      >
                        <span className="truncate">{m.name || m.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-xs text-muted-foreground/60">No providers connected</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">
            Connect a provider to use AI models
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Permissions Tab
// ============================================================================

function PermissionsSection({
  draft,
  config,
  onDraft,
}: {
  draft: Record<string, unknown>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const { data: toolIds } = useOpenCodeToolIds();

  const permission = (draft.permission ?? config.permission ?? {}) as Record<
    string,
    any
  >;
  const isGlobalMode = typeof permission === 'string';
  const globalAction = isGlobalMode ? (permission as string) : 'ask';
  // Resolve the wildcard fallback: permission["*"] acts as the default for all tools
  const wildcardAction = !isGlobalMode && typeof (permission as Record<string, any>)['*'] === 'string'
    ? (permission as Record<string, any>)['*']
    : 'ask';

  const getAction = (key: string): string => {
    if (isGlobalMode) return globalAction;
    const val = (permission as Record<string, any>)[key];
    if (typeof val === 'string') return val;
    return wildcardAction;
  };

  const setAction = (key: string, action: string) => {
    const base = isGlobalMode ? {} : { ...(permission as Record<string, any>) };
    onDraft('permission', { ...base, [key]: action });
  };

  const setGlobalMode = (action: string) => {
    onDraft('permission', action);
  };

  // Per-tool overrides from config.tools
  const tools = (draft.tools ?? config.tools ?? {}) as Record<string, boolean>;

  const builtinToolIds = useMemo(() => {
    if (!toolIds) return [];
    return toolIds.filter((id) => !id.includes('_mcp_') && !id.startsWith('mcp_')).sort();
  }, [toolIds]);

  const isToolEnabled = (id: string) => tools[id] !== false;

  const toggleTool = (id: string) => {
    const next = { ...tools };
    if (isToolEnabled(id)) {
      next[id] = false;
    } else {
      delete next[id];
    }
    const hasOverrides = Object.values(next).some((v) => v === false);
    onDraft('tools', hasOverrides ? next : undefined);
  };

  return (
    <div className="space-y-6 overflow-y-auto pr-1">
      {/* Global permission mode */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Global Permission Mode
        </label>
        <p className="text-xs text-muted-foreground/60">
          Set a blanket permission level, or configure per-tool below.
        </p>
        <div className="flex gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => setGlobalMode(a)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                isGlobalMode && globalAction === a
                  ? a === 'allow'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : a === 'deny'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent',
              )}
            >
              {a}
            </button>
          ))}
          <button
            onClick={() => {
              if (isGlobalMode) {
                onDraft('permission', {});
              }
            }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              !isGlobalMode
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent',
            )}
          >
            per-tool
          </button>
        </div>
      </div>

      {/* Per-tool permission overrides */}
      {!isGlobalMode && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Per-Tool Permissions
          </label>
          <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/30">
            {PERMISSION_TYPES.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <span className="text-sm text-foreground">{label}</span>
                  <p className="text-xs text-muted-foreground/60">{description}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {ACTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAction(key, a)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                        getAction(key) === a
                          ? a === 'allow'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : a === 'deny'
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent',
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tool enable/disable overrides */}
      {builtinToolIds.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tool Overrides
          </label>
          <p className="text-xs text-muted-foreground/60">
            Enable or disable individual tools.
          </p>
          <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/30 max-h-48 overflow-y-auto">
            {builtinToolIds.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
              >
                <span className="text-xs font-mono text-foreground/80 truncate">
                  {id}
                </span>
                <Switch
                  checked={isToolEnabled(id)}
                  onCheckedChange={() => toggleTool(id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MCP Servers Tab
// ============================================================================

type McpView = { type: 'list' } | { type: 'add' } | { type: 'auth'; name: string };

function StatusBadge({ status }: { status: McpStatus }) {
  const s = status.status;
  if (s === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        connected
      </span>
    );
  }
  if (s === 'disabled') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
        disconnected
      </span>
    );
  }
  if (s === 'needs_auth' || s === 'needs_client_registration') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        needs auth
      </span>
    );
  }
  // failed
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      error
    </span>
  );
}

function McpServersSection() {
  const { data: mcpStatus, isLoading } = useOpenCodeMcpStatus();
  const { data: toolIds } = useOpenCodeToolIds();
  const addMutation = useAddMcpServer();
  const connectMutation = useConnectMcpServer();
  const disconnectMutation = useDisconnectMcpServer();
  const authStartMutation = useMcpAuthStart();
  const authCallbackMutation = useMcpAuthCallback();

  const [view, setView] = useState<McpView>({ type: 'list' });
  const [expanded, setExpanded] = useState<string | null>(null);

  // Add form state
  const [addForm, setAddForm] = useState({
    name: '',
    transportType: 'stdio' as 'stdio' | 'http',
    command: '',
    url: '',
    envPairs: [] as Array<{ key: string; value: string }>,
  });
  const [addError, setAddError] = useState('');

  // Auth state
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authError, setAuthError] = useState('');

  const servers = useMemo(() => {
    if (!mcpStatus) return [];
    return Object.entries(mcpStatus).map(([name, status]) => ({ name, status }));
  }, [mcpStatus]);

  // Derive tools-per-server from tool IDs (tools prefixed with mcp_ or containing _mcp_)
  const serverTools = useMemo(() => {
    if (!toolIds) return {} as Record<string, string[]>;
    const result: Record<string, string[]> = {};
    for (const id of toolIds) {
      // MCP tool IDs follow the pattern: mcp_{serverName}_{toolName}
      const match = id.match(/^mcp_([^_]+)_(.+)$/);
      if (match) {
        const serverName = match[1];
        if (!result[serverName]) result[serverName] = [];
        result[serverName].push(match[2]);
      }
    }
    return result;
  }, [toolIds]);

  const handleAddServer = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAddError('');

    if (!addForm.name.trim()) {
      setAddError('Server name is required');
      return;
    }

    if (addForm.transportType === 'stdio' && !addForm.command.trim()) {
      setAddError('Command is required for stdio transport');
      return;
    }

    if (addForm.transportType === 'http' && !addForm.url.trim()) {
      setAddError('URL is required for HTTP transport');
      return;
    }

    if (addForm.transportType === 'http' && !/^https?:\/\//.test(addForm.url.trim())) {
      setAddError('URL must start with http:// or https://');
      return;
    }

    const envMap: Record<string, string> = {};
    for (const pair of addForm.envPairs) {
      if (pair.key.trim()) {
        envMap[pair.key.trim()] = pair.value;
      }
    }

    try {
      await addMutation.mutateAsync({
        name: addForm.name.trim(),
        type: addForm.transportType === 'stdio' ? 'local' : 'remote',
        ...(addForm.transportType === 'stdio'
          ? { command: addForm.command.trim().split(/\s+/), env: envMap }
          : { url: addForm.url.trim() }),
      });
      toast.info(`MCP server "${addForm.name.trim()}" added`);
      setAddForm({ name: '', transportType: 'stdio', command: '', url: '', envPairs: [] });
      setView({ type: 'list' });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  }, [addForm, addMutation]);

  const handleConnect = useCallback(async (name: string) => {
    try {
      await connectMutation.mutateAsync(name);
      toast.info(`MCP server "${name}" connected`);
    } catch (err) {
      toast.warning(`Failed to connect "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [connectMutation]);

  const handleDisconnect = useCallback(async (name: string) => {
    try {
      await disconnectMutation.mutateAsync(name);
      toast.info(`MCP server "${name}" disconnected`);
    } catch (err) {
      toast.warning(`Failed to disconnect "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [disconnectMutation]);

  const handleAuthStart = useCallback(async (name: string) => {
    setAuthError('');
    setAuthCode('');
    setAuthUrl('');
    setView({ type: 'auth', name });
    try {
      const result = await authStartMutation.mutateAsync(name);
      setAuthUrl(result.authorizationUrl);
      window.open(result.authorizationUrl, '_blank');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  }, [authStartMutation]);

  const handleAuthCallback = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (view.type !== 'auth') return;
    if (!authCode.trim()) {
      setAuthError('Authorization code is required');
      return;
    }
    try {
      await authCallbackMutation.mutateAsync({ name: view.name, code: authCode.trim() });
      toast.info(`MCP server "${view.name}" authorized`);
      setView({ type: 'list' });
      setAuthCode('');
      setAuthUrl('');
      setAuthError('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  }, [view, authCode, authCallbackMutation]);

  const addEnvPair = useCallback(() => {
    setAddForm((f) => ({ ...f, envPairs: [...f.envPairs, { key: '', value: '' }] }));
  }, []);

  const removeEnvPair = useCallback((index: number) => {
    setAddForm((f) => ({ ...f, envPairs: f.envPairs.filter((_, i) => i !== index) }));
  }, []);

  const updateEnvPair = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setAddForm((f) => ({
      ...f,
      envPairs: f.envPairs.map((p, i) => (i === index ? { ...p, [field]: val } : p)),
    }));
  }, []);

  // ---- Auth view ----
  if (view.type === 'auth') {
    return (
      <div className="space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setView({ type: 'list' }); setAuthError(''); }}
            className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <h3 className="text-sm font-semibold">Authorize: {view.name}</h3>
        </div>

        {authStartMutation.isPending && !authUrl && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Starting authorization...</span>
          </div>
        )}

        {authUrl && (
          <form onSubmit={handleAuthCallback} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Visit the{' '}
              <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                authorization page
              </a>{' '}
              and paste the code below.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Authorization Code</label>
              <Input
                placeholder="Paste code here..."
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                autoFocus
              />
            </div>
            {authError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {authError}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={authCallbackMutation.isPending}
              className="h-8 px-4 text-xs"
            >
              {authCallbackMutation.isPending ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Authorizing...</>
              ) : (
                'Submit'
              )}
            </Button>
          </form>
        )}

        {authError && !authUrl && (
          <div className="space-y-3">
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {authError}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAuthStart(view.name)}
              className="h-8 px-3 text-xs"
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ---- Add form view ----
  if (view.type === 'add') {
    return (
      <div className="space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setView({ type: 'list' }); setAddError(''); }}
            className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <h3 className="text-sm font-semibold">Add MCP Server</h3>
        </div>

        <form onSubmit={handleAddServer} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Server Name</label>
            <Input
              placeholder="my-server"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          {/* Transport Type */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground mb-1 block">Transport Type</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAddForm((f) => ({ ...f, transportType: 'stdio' }))}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                  addForm.transportType === 'stdio'
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent',
                )}
              >
                Stdio (command)
              </button>
              <button
                type="button"
                onClick={() => setAddForm((f) => ({ ...f, transportType: 'http' }))}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                  addForm.transportType === 'http'
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent',
                )}
              >
                HTTP (URL)
              </button>
            </div>
          </div>

          {/* Transport-specific fields */}
          {addForm.transportType === 'stdio' ? (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Command</label>
              <Input
                placeholder="npx -y @modelcontextprotocol/server-github"
                value={addForm.command}
                onChange={(e) => setAddForm((f) => ({ ...f, command: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Full command with arguments, space-separated
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL</label>
              <Input
                placeholder="https://mcp.example.com/sse"
                value={addForm.url}
                onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
          )}

          {/* Environment Variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Environment Variables</label>
              <button
                type="button"
                onClick={addEnvPair}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
            {addForm.envPairs.length > 0 && (
              <div className="space-y-2">
                {addForm.envPairs.map((pair, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="KEY"
                      value={pair.key}
                      onChange={(e) => updateEnvPair(i, 'key', e.target.value)}
                      className="flex-1 font-mono text-xs"
                    />
                    <Input
                      placeholder="value"
                      value={pair.value}
                      onChange={(e) => updateEnvPair(i, 'value', e.target.value)}
                      className="flex-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvPair(i)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer flex-shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {addError && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {addError}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={addMutation.isPending}
            className="h-8 px-4 text-xs"
          >
            {addMutation.isPending ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Adding...</>
            ) : (
              'Add Server'
            )}
          </Button>
        </form>
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="space-y-4 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Servers ({servers.length})
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs gap-1.5"
          onClick={() => { setView({ type: 'add' }); setAddError(''); }}
        >
          <Plus className="h-3 w-3" />
          Add Server
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : servers.length > 0 ? (
        <div className="space-y-2">
          {servers.map(({ name, status }) => {
            const isExp = expanded === name;
            const tools = serverTools[name] ?? [];
            const isConnected = status.status === 'connected';
            const needsAuth = status.status === 'needs_auth' || status.status === 'needs_client_registration';
            const isFailed = status.status === 'failed';
            const isToggling =
              (connectMutation.isPending && connectMutation.variables === name) ||
              (disconnectMutation.isPending && disconnectMutation.variables === name);

            return (
              <div
                key={name}
                className="rounded-xl border border-border/50 bg-card overflow-hidden"
              >
                {/* Server header */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/50 flex-shrink-0">
                    <Server className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {name}
                      </span>
                      <StatusBadge status={status} />
                    </div>
                    {tools.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {tools.length} tool{tools.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {isFailed && 'error' in status && (
                      <p className="text-xs text-red-500/80 truncate mt-0.5">
                        {(status as any).error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Auth button for servers needing authentication */}
                    {needsAuth && (
                      <button
                        onClick={() => handleAuthStart(name)}
                        disabled={authStartMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-50"
                        title="Authorize"
                      >
                        <Plug className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Connect / Disconnect toggle */}
                    <button
                      onClick={() => isConnected ? handleDisconnect(name) : handleConnect(name)}
                      disabled={isToggling}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50',
                        isConnected
                          ? 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'
                          : 'text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10',
                      )}
                      title={isConnected ? 'Disconnect' : 'Connect'}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isConnected ? (
                        <Power className="h-3.5 w-3.5" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Tools expand/collapse */}
                {tools.length > 0 && (
                  <>
                    <button
                      onClick={() => setExpanded(isExp ? null : name)}
                      className="flex items-center gap-1 px-3 pb-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {isExp ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {isExp ? 'Hide tools' : 'Show tools'}
                    </button>

                    {isExp && (
                      <div className="border-t border-border/30 max-h-40 overflow-y-auto">
                        {tools.map((tool) => (
                          <div
                            key={tool}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted/30"
                          >
                            <Wrench className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono truncate">{tool}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Server className="h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No MCP servers configured</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Add an MCP server to extend available tools
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Dialog
// ============================================================================

export function OpenCodeSettingsDialog({
  open,
  onOpenChange,
}: OpenCodeSettingsDialogProps) {
  const { data: config, isLoading } = useOpenCodeConfig();
  const updateMutation = useUpdateOpenCodeConfig();
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const onDraft = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasDraftChanges = Object.keys(draft).length > 0;

  const handleSave = useCallback(() => {
    if (!hasDraftChanges) return;
    updateMutation.mutate(draft as Partial<Config>, {
      onSuccess: () => {
        setDraft({});
      },
    });
  }, [draft, hasDraftChanges, updateMutation]);

  const handleDiscard = useCallback(() => setDraft({}), []);

  // Reset draft when dialog closes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setDraft({});
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0"
        aria-describedby="opencode-settings-desc"
      >
        <DialogHeader className="px-6 pt-5 pb-0 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Settings
          </DialogTitle>
          <DialogDescription id="opencode-settings-desc" className="sr-only">
            Configure OpenCode settings including general options, providers, and
            permissions.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !config ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3 flex-shrink-0">
              <TabsList className="w-full">
                <TabsTrigger value="general" className="flex-1 gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  General
                </TabsTrigger>
                <TabsTrigger value="providers" className="flex-1 gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Providers
                </TabsTrigger>
                <TabsTrigger value="permissions" className="flex-1 gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Permissions
                </TabsTrigger>
                <TabsTrigger value="mcp" className="flex-1 gap-1.5">
                  <Server className="h-3.5 w-3.5" />
                  MCP Servers
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              <TabsContent value="general" className="mt-0 h-full">
                <GeneralSection
                  draft={draft}
                  config={config}
                  onDraft={onDraft}
                />
              </TabsContent>

              <TabsContent value="providers" className="mt-0 h-full">
                <ProvidersSection onDirty={() => {}} />
              </TabsContent>

              <TabsContent value="permissions" className="mt-0 h-full">
                <PermissionsSection
                  draft={draft}
                  config={config}
                  onDraft={onDraft}
                />
              </TabsContent>

              <TabsContent value="mcp" className="mt-0 h-full">
                <McpServersSection />
              </TabsContent>
            </div>

            {/* Save / Discard footer */}
            {hasDraftChanges && (
              <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border/40 flex-shrink-0 bg-background">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  className="h-8 px-3 text-xs gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="h-8 px-4 text-xs gap-1.5"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save Changes
                </Button>
              </div>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
