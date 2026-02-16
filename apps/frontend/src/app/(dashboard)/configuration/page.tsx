'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Settings,
  BookOpen,
  Server,
  Shield,
  Wrench,
  Cog,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  Globe,
  X,
  Unplug,
  Loader2,
  Brain,
  Eye,
  Paperclip,
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { CodeEditor } from '@/components/file-editors/code-editor';
import { useOpenCodeConfig, useUpdateOpenCodeConfig } from '@/hooks/opencode/use-opencode-config';
import type { Config } from '@/hooks/opencode/use-opencode-config';
import {
  useOpenCodeProviders,
  useOpenCodeAgents,
  useOpenCodeToolIds,
  useOpenCodeMcpStatus,
} from '@/hooks/opencode/use-opencode-sessions';
import { readFile, uploadFile } from '@/features/files/api/opencode-files';
import { ManageModelsDialog, ConnectProviderDialog } from '@/components/session/model-selector';
import { flattenModels } from '@/components/session/session-chat-input';
import { useModelStore } from '@/hooks/opencode/use-model-store';
import { ModelProviderIcon } from '@/lib/model-provider-icons';
import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';

// ============================================================================
// Types
// ============================================================================

type ConfigTab = 'general' | 'rules' | 'providers' | 'mcp' | 'permissions' | 'tools' | 'advanced';

// ============================================================================
// Shared UI components
// ============================================================================

function Row({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground w-36 flex-shrink-0 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <div className="text-sm text-foreground flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
        checked ? 'bg-emerald-500' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

function ArrayEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button variant="ghost" size="sm" onClick={add} className="h-8 px-2">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-muted border border-border">
              {v}
              <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// General Tab
// ============================================================================

function GeneralTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const { data: providers } = useOpenCodeProviders();
  const { data: agents } = useOpenCodeAgents();

  const allModels = useMemo(() => {
    if (!providers?.all) return [];
    return providers.all.flatMap((p) =>
      Object.values(p.models).map((m) => ({
        label: `${p.id}/${m.id}`,
      }))
    );
  }, [providers]);

  const agentNames = useMemo(() => {
    if (!agents) return [];
    return agents.map((a) => a.name);
  }, [agents]);

  const model = (draft.model as string) ?? config.model ?? '';
  const smallModel = (draft.small_model as string) ?? config.small_model ?? '';
  const username = (draft.username as string) ?? config.username ?? '';
  const share = (draft.share as string) ?? config.share ?? 'manual';
  const autoupdate = draft.autoupdate ?? config.autoupdate;
  const snapshot = draft.snapshot ?? config.snapshot;

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Models</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Default Model">
            {allModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => onDraft('model', e.target.value || undefined)}
                className="w-full max-w-sm h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Auto-detect</option>
                {allModels.map((m) => (
                  <option key={m.label} value={m.label}>{m.label}</option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[13px]">{model || <span className="text-muted-foreground/40 italic font-sans text-sm">Auto-detect</span>}</span>
            )}
          </Row>
          <Row label="Small Model">
            {allModels.length > 0 ? (
              <select
                value={smallModel}
                onChange={(e) => onDraft('small_model', e.target.value || undefined)}
                className="w-full max-w-sm h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Auto-detect</option>
                {allModels.map((m) => (
                  <option key={m.label} value={m.label}>{m.label}</option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[13px]">{smallModel || <span className="text-muted-foreground/40 italic font-sans text-sm">Auto-detect</span>}</span>
            )}
          </Row>
        </div>
      </SpotlightCard>

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Agent</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Default Agent">
            {agentNames.length > 0 ? (
              <select
                value={(draft.agent as any)?.general?.model ?? ''}
                onChange={(e) => {
                  const current = (draft.agent ?? config.agent ?? {}) as Record<string, unknown>;
                  onDraft('agent', { ...current, general: { ...(current.general as any), model: e.target.value || undefined } });
                }}
                className="w-full max-w-sm h-8 px-2 rounded-lg text-sm bg-muted border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Default</option>
                {agentNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            ) : (
              <span className="text-muted-foreground/40 italic text-sm">Default</span>
            )}
          </Row>
        </div>
      </SpotlightCard>

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Preferences</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Username">
            <input
              type="text"
              value={username}
              onChange={(e) => onDraft('username', e.target.value || undefined)}
              placeholder="System username"
              className="w-full max-w-sm h-8 px-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Row>
          <Row label="Sharing">
            <select
              value={share}
              onChange={(e) => onDraft('share', e.target.value)}
              className="h-8 px-2 rounded-lg text-sm bg-muted border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
              <option value="disabled">Disabled</option>
            </select>
          </Row>
          <Row label="Auto-update">
            <select
              value={autoupdate === true ? 'true' : autoupdate === 'notify' ? 'notify' : 'false'}
              onChange={(e) => {
                const v = e.target.value;
                onDraft('autoupdate', v === 'true' ? true : v === 'notify' ? 'notify' : false);
              }}
              className="h-8 px-2 rounded-lg text-sm bg-muted border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="true">Enabled</option>
              <option value="notify">Notify only</option>
              <option value="false">Disabled</option>
            </select>
          </Row>
          <Row label="Snapshots">
            <Toggle
              checked={snapshot ?? false}
              onChange={(v) => onDraft('snapshot', v)}
            />
          </Row>
        </div>
      </SpotlightCard>
    </div>
  );
}

// ============================================================================
// Rules Tab
// ============================================================================

function RulesTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const [agentsMd, setAgentsMd] = useState<string | null>(null);
  const [agentsMdDraft, setAgentsMdDraft] = useState<string | null>(null);
  const [loadingMd, setLoadingMd] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingMd(true);
    readFile('AGENTS.md')
      .then((result) => {
        if (!cancelled) {
          setAgentsMd(result.content);
          setLoadingMd(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentsMd('');
          setLoadingMd(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleSaveMd = useCallback(async () => {
    const content = agentsMdDraft ?? agentsMd ?? '';
    const blob = new File([content], 'AGENTS.md', { type: 'text/markdown' });
    await uploadFile(blob, '');
    setAgentsMd(content);
    setAgentsMdDraft(null);
  }, [agentsMd, agentsMdDraft]);

  const instructions = (draft.instructions as string[]) ?? config.instructions ?? [];

  const hasMdChanges = agentsMdDraft != null && agentsMdDraft !== agentsMd;

  return (
    <div className="flex-1 flex flex-col overflow-hidden pb-24">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">AGENTS.md</h3>
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border/50 mb-4" style={{ minHeight: 300 }}>
        {loadingMd ? (
          <div className="flex items-center justify-center h-full">
            <KortixLoader size="large" />
          </div>
        ) : (
          <CodeEditor
            content={agentsMdDraft ?? agentsMd ?? ''}
            fileName="AGENTS.md"
            language="markdown"
            readOnly={false}
            showLineNumbers={true}
            onChange={(content) => setAgentsMdDraft(content)}
          />
        )}
      </div>
      {hasMdChanges && (
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAgentsMdDraft(null)}
            className="h-7 px-2.5 text-xs gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            Discard AGENTS.md changes
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSaveMd}
            className="h-7 px-3 text-xs gap-1.5"
          >
            <Save className="h-3 w-3" />
            Save AGENTS.md
          </Button>
        </div>
      )}

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Additional Instruction Files</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <ArrayEditor
            values={instructions}
            onChange={(v) => onDraft('instructions', v.length > 0 ? v : undefined)}
            placeholder="Path or glob pattern (e.g. docs/rules.md)"
          />
        </div>
      </SpotlightCard>
    </div>
  );
}

// ============================================================================
// Providers Tab
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

function ProviderModelGrid({ models }: { models: Record<string, any> }) {
  const entries = Object.values(models);
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30 rounded-xl overflow-hidden border border-border/40">
      {entries.map((m: any) => (
        <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 bg-card hover:bg-muted/30 transition-colors">
          <span className="text-[13px] text-foreground/90 truncate flex-1">{m.name || m.id}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {m.reasoning && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-500 text-[10px] font-medium">
                <Brain className="h-2.5 w-2.5" />
                reasoning
              </span>
            )}
            {m.attachment && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-500 text-[10px] font-medium">
                <Paperclip className="h-2.5 w-2.5" />
                files
              </span>
            )}
            {(m as any).capabilities?.input?.image && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-medium">
                <Eye className="h-2.5 w-2.5" />
                vision
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProvidersTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const { data: providers } = useOpenCodeProviders();
  const disabledProviders = (draft.disabled_providers as string[]) ?? config.disabled_providers ?? [];
  const enabledProviders = (draft.enabled_providers as string[]) ?? config.enabled_providers;
  const customProviders = (draft.provider ?? config.provider ?? {}) as Record<string, any>;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [connectProviderOpen, setConnectProviderOpen] = useState(false);
  const [manageModelsOpen, setManageModelsOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const allProviders = useMemo(() => providers?.all ?? [], [providers]);
  const connectedIds = useMemo(() => new Set(providers?.connected ?? []), [providers]);

  const flatModels = useMemo(() => flattenModels(providers), [providers]);
  const modelStore = useModelStore(flatModels);

  const connectedProviders = useMemo(
    () => allProviders.filter((p) => connectedIds.has(p.id)),
    [allProviders, connectedIds],
  );
  const disconnectedProviders = useMemo(
    () => allProviders.filter((p) => !connectedIds.has(p.id)),
    [allProviders, connectedIds],
  );

  const isDisabled = (id: string) => disabledProviders.includes(id);

  const toggleProvider = (id: string) => {
    if (isDisabled(id)) {
      onDraft('disabled_providers', disabledProviders.filter((p) => p !== id));
    } else {
      onDraft('disabled_providers', [...disabledProviders, id]);
    }
  };

  const handleDisconnect = useCallback(async (providerID: string) => {
    setDisconnecting(providerID);
    try {
      const client = getClient();
      await client.auth.set({
        providerID,
        auth: { type: 'api', key: '' },
      } as any);
      await client.global.dispose();
      queryClient.invalidateQueries({ queryKey: opencodeKeys.providers() });
    } catch {
      // ignore errors
    } finally {
      setDisconnecting(null);
    }
  }, [queryClient]);

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-5">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setConnectProviderOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Connect Provider
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setManageModelsOpen(true)}
        >
          <Settings className="h-3.5 w-3.5" />
          Manage Models
        </Button>
      </div>

      {/* Connected providers */}
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Connected Providers
        <span className="ml-2 text-muted-foreground/60 font-normal normal-case">({connectedProviders.length})</span>
      </h3>
      <div className="space-y-3 mb-6">
        {connectedProviders.length > 0 ? (
          connectedProviders.map((p) => {
            const modelCount = Object.keys(p.models).length;
            const isExp = expanded === p.id;
            const isDisc = disconnecting === p.id;
            return (
              <SpotlightCard key={p.id} className="bg-card">
                <div className="p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-muted/50 border border-border/50 flex-shrink-0">
                      <ModelProviderIcon modelId={p.id} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{PROVIDER_LABELS[p.id] || p.name || p.id}</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          connected
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{modelCount} model{modelCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Toggle checked={!isDisabled(p.id)} onChange={() => toggleProvider(p.id)} />
                      <button
                        onClick={() => handleDisconnect(p.id)}
                        disabled={isDisc}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                        title="Disconnect provider"
                      >
                        {isDisc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expand/collapse models */}
                  <button
                    onClick={() => setExpanded(isExp ? null : p.id)}
                    className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {isExp ? 'Hide models' : 'Show models'}
                  </button>

                  {isExp && <ProviderModelGrid models={p.models} />}
                </div>
              </SpotlightCard>
            );
          })
        ) : (
          <SpotlightCard className="bg-card">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
                <Zap className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No providers connected yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1 mb-3">Connect a provider to start using AI models</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConnectProviderOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Connect Provider
              </Button>
            </div>
          </SpotlightCard>
        )}
      </div>

      {/* Available (disconnected) providers */}
      {disconnectedProviders.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Available Providers
            <span className="ml-2 text-muted-foreground/60 font-normal normal-case">({disconnectedProviders.length})</span>
          </h3>
          <div className="space-y-2 mb-6">
            {disconnectedProviders.map((p) => {
              const modelCount = Object.keys(p.models).length;
              const isExp = expanded === p.id;
              return (
                <SpotlightCard key={p.id} className="bg-card">
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/30 flex-shrink-0 opacity-60">
                        <ModelProviderIcon modelId={p.id} size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground/70">{PROVIDER_LABELS[p.id] || p.name || p.id}</span>
                        <span className="text-xs text-muted-foreground/50 ml-2">{modelCount} model{modelCount !== 1 ? 's' : ''}</span>
                      </div>
                      <button
                        onClick={() => setExpanded(isExp ? null : p.id)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                      >
                        {isExp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>
                    </div>
                    {isExp && <ProviderModelGrid models={p.models} />}
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        </>
      )}

      {/* Enabled providers allowlist */}
      {enabledProviders && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Enabled Providers (allowlist)</h3>
          <SpotlightCard className="bg-card mb-4">
            <div className="p-4 sm:p-5">
              <ArrayEditor
                values={enabledProviders}
                onChange={(v) => onDraft('enabled_providers', v.length > 0 ? v : undefined)}
                placeholder="Provider ID"
              />
            </div>
          </SpotlightCard>
        </>
      )}

      {/* Custom provider overrides */}
      {Object.keys(customProviders).length > 0 && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Custom Provider Overrides</h3>
          <SpotlightCard className="bg-card">
            <div className="p-4 sm:p-5">
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {JSON.stringify(customProviders, null, 2)}
              </pre>
            </div>
          </SpotlightCard>
        </>
      )}

      {/* Dialogs */}
      <ConnectProviderDialog
        open={connectProviderOpen}
        onOpenChange={setConnectProviderOpen}
        providers={providers}
      />
      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={flatModels}
        modelStore={modelStore}
        onConnectProvider={() => {
          setManageModelsOpen(false);
          setConnectProviderOpen(true);
        }}
      />
    </div>
  );
}

// ============================================================================
// MCP Tab
// ============================================================================

function McpTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const { data: mcpStatusData } = useOpenCodeMcpStatus();
  const mcpConfig = (draft.mcp ?? config.mcp ?? {}) as Record<string, any>;

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'local' | 'remote'>('local');
  const [newCommand, setNewCommand] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const entry = newType === 'local'
      ? { type: 'local' as const, command: newCommand.split(/\s+/).filter(Boolean), enabled: true }
      : { type: 'remote' as const, url: newUrl.trim(), enabled: true };
    onDraft('mcp', { ...mcpConfig, [name]: entry });
    setNewName('');
    setNewCommand('');
    setNewUrl('');
    setShowAdd(false);
  };

  const handleRemove = (name: string) => {
    const next = { ...mcpConfig };
    delete next[name];
    onDraft('mcp', Object.keys(next).length > 0 ? next : undefined);
  };

  const toggleServer = (name: string) => {
    const entry = mcpConfig[name];
    if (!entry) return;
    onDraft('mcp', { ...mcpConfig, [name]: { ...entry, enabled: !entry.enabled } });
  };

  const statusBadge = (name: string) => {
    const status = mcpStatusData?.[name];
    if (!status) return null;
    const colors: Record<string, string> = {
      connected: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      disabled: 'bg-muted text-muted-foreground',
      failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
      needs_auth: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      needs_client_registration: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    };
    return (
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', colors[status.status] ?? 'bg-muted text-muted-foreground')}>
        {status.status}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MCP Servers</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)} className="h-7 px-2.5 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {showAdd && (
        <SpotlightCard className="bg-card mb-4">
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Server name"
                className="flex-1 h-8 px-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'local' | 'remote')}
                className="h-8 px-2 rounded-lg text-sm bg-muted border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="local">Local</option>
                <option value="remote">Remote</option>
              </select>
            </div>
            {newType === 'local' ? (
              <input
                type="text"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                placeholder="Command (e.g. npx -y @modelcontextprotocol/server-filesystem)"
                className="w-full h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : (
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URL (e.g. https://mcp.example.com/sse)"
                className="w-full h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="h-7 px-2.5 text-xs">Cancel</Button>
              <Button variant="default" size="sm" onClick={handleAdd} disabled={!newName.trim()} className="h-7 px-3 text-xs">Add Server</Button>
            </div>
          </div>
        </SpotlightCard>
      )}

      <div className="space-y-2">
        {Object.entries(mcpConfig).map(([name, entry]) => {
          const cfg = entry as any;
          return (
            <SpotlightCard key={name} className="bg-card">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{cfg.type}</span>
                    {statusBadge(name)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={cfg.enabled !== false} onChange={() => toggleServer(name)} />
                    <button onClick={() => handleRemove(name)} className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                  {cfg.type === 'local' ? (cfg.command ?? []).join(' ') : cfg.url}
                </div>
              </div>
            </SpotlightCard>
          );
        })}
        {Object.keys(mcpConfig).length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
              <Server className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No MCP servers configured</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add a server to connect external tools</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Permissions Tab
// ============================================================================

function PermissionsTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const permission = (draft.permission ?? config.permission ?? {}) as Record<string, any>;

  const permissionTypes = [
    { key: 'edit', label: 'File Edit', description: 'Allow editing files in the project' },
    { key: 'webfetch', label: 'Web Fetch', description: 'Allow fetching content from the web' },
    { key: 'doom_loop', label: 'Doom Loop', description: 'Allow re-prompting on failure loops' },
    { key: 'external_directory', label: 'External Directory', description: 'Allow access outside project directory' },
  ];

  const actions = ['allow', 'ask', 'deny'] as const;

  // Resolve the wildcard fallback: permission["*"] acts as the default for all tools
  const wildcardAction = typeof permission['*'] === 'string' ? permission['*'] : 'ask';

  const getAction = (key: string): string => {
    const val = permission[key];
    if (typeof val === 'string') return val;
    return wildcardAction;
  };

  const setAction = (key: string, action: string) => {
    onDraft('permission', { ...permission, [key]: action });
  };

  // Bash is special — can be a string or a map
  const bashPermission = permission.bash;
  const bashIsSimple = typeof bashPermission === 'string' || bashPermission == null;
  const bashAction = bashIsSimple ? (bashPermission ?? wildcardAction) : 'custom';

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Permission Rules</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          {permissionTypes.map(({ key, label, description }) => (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 border-b border-border/50 last:border-0">
              <div className="w-40 flex-shrink-0">
                <span className="text-sm text-foreground">{label}</span>
                <p className="text-xs text-muted-foreground/60">{description}</p>
              </div>
              <div className="flex gap-1">
                {actions.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(key, a)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                      getAction(key) === a
                        ? a === 'allow' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : a === 'deny' ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20'
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

          {/* Bash permission */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 border-b border-border/50">
            <div className="w-40 flex-shrink-0">
              <span className="text-sm text-foreground">Bash</span>
              <p className="text-xs text-muted-foreground/60">Allow running shell commands</p>
            </div>
            <div className="flex gap-1">
              {actions.map((a) => (
                <button
                  key={a}
                  onClick={() => onDraft('permission', { ...permission, bash: a })}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    bashIsSimple && bashAction === a
                      ? a === 'allow' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : a === 'deny' ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {!bashIsSimple && (
            <div className="ml-4 mt-2 mb-2">
              <p className="text-xs text-muted-foreground mb-2">Pattern-based bash permissions:</p>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono leading-relaxed bg-muted rounded-lg p-2">
                {JSON.stringify(bashPermission, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </SpotlightCard>
    </div>
  );
}

// ============================================================================
// Tools Tab
// ============================================================================

function ToolsTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const { data: toolIds } = useOpenCodeToolIds();
  const tools = (draft.tools ?? config.tools ?? {}) as Record<string, boolean>;

  const grouped = useMemo(() => {
    if (!toolIds) return { builtin: [] as string[], mcp: [] as string[] };
    const builtin: string[] = [];
    const mcp: string[] = [];
    for (const id of toolIds) {
      if (id.includes('_mcp_') || id.startsWith('mcp_')) {
        mcp.push(id);
      } else {
        builtin.push(id);
      }
    }
    return { builtin: builtin.sort(), mcp: mcp.sort() };
  }, [toolIds]);

  const isEnabled = (id: string) => tools[id] !== false;

  const toggleTool = (id: string) => {
    const next = { ...tools };
    if (isEnabled(id)) {
      next[id] = false;
    } else {
      delete next[id];
    }
    const hasOverrides = Object.values(next).some((v) => v === false);
    onDraft('tools', hasOverrides ? next : undefined);
  };

  if (!toolIds) {
    return (
      <div className="flex items-center justify-center h-full">
        <KortixLoader size="large" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {grouped.builtin.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Built-in Tools</h3>
          <SpotlightCard className="bg-card mb-4">
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {grouped.builtin.map((id) => (
                  <div key={id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-xs font-mono text-foreground/80 truncate">{id}</span>
                    <Toggle checked={isEnabled(id)} onChange={() => toggleTool(id)} />
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        </>
      )}

      {grouped.mcp.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">MCP Tools</h3>
          <SpotlightCard className="bg-card">
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {grouped.mcp.map((id) => (
                  <div key={id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-xs font-mono text-foreground/80 truncate">{id}</span>
                    <Toggle checked={isEnabled(id)} onChange={() => toggleTool(id)} />
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        </>
      )}

      {grouped.builtin.length === 0 && grouped.mcp.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
            <Wrench className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No tools available</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Advanced Tab
// ============================================================================

function AdvancedTab({
  draft,
  config,
  onDraft,
}: {
  draft: Partial<Config>;
  config: Config;
  onDraft: (key: string, value: unknown) => void;
}) {
  const experimental = (draft.experimental ?? config.experimental ?? {}) as Record<string, any>;
  const watcherIgnore = (draft.watcher as any)?.ignore ?? config.watcher?.ignore ?? [];
  const plugins = (draft.plugin as string[]) ?? config.plugin ?? [];
  const formatter = draft.formatter ?? config.formatter;
  const lsp = draft.lsp ?? config.lsp;

  const [rawJson, setRawJson] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (showRaw) {
      const raw: Record<string, unknown> = {};
      if (formatter !== undefined) raw.formatter = formatter;
      if (lsp !== undefined) raw.lsp = lsp;
      if (config.command) raw.command = config.command;
      setRawJson(JSON.stringify(raw, null, 2));
    }
  }, [showRaw, formatter, lsp, config.command]);

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Experimental</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Batch Tool" icon={Zap}>
            <Toggle
              checked={experimental.batch_tool ?? false}
              onChange={(v) => onDraft('experimental', { ...experimental, batch_tool: v })}
            />
          </Row>
          <Row label="OpenTelemetry" icon={Globe}>
            <Toggle
              checked={experimental.openTelemetry ?? false}
              onChange={(v) => onDraft('experimental', { ...experimental, openTelemetry: v })}
            />
          </Row>
          <Row label="Disable Paste Summary">
            <Toggle
              checked={experimental.disable_paste_summary ?? false}
              onChange={(v) => onDraft('experimental', { ...experimental, disable_paste_summary: v })}
            />
          </Row>
          <Row label="Max Retries">
            <input
              type="number"
              value={experimental.chatMaxRetries ?? ''}
              onChange={(e) => onDraft('experimental', { ...experimental, chatMaxRetries: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Default"
              min={0}
              max={10}
              className="w-20 h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Row>
        </div>
      </SpotlightCard>

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Watcher Ignore Patterns</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <ArrayEditor
            values={watcherIgnore}
            onChange={(v) => onDraft('watcher', v.length > 0 ? { ignore: v } : undefined)}
            placeholder="Glob pattern (e.g. node_modules/**)"
          />
        </div>
      </SpotlightCard>

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Plugins</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <ArrayEditor
            values={plugins}
            onChange={(v) => onDraft('plugin', v.length > 0 ? v : undefined)}
            placeholder="Plugin path or package"
          />
        </div>
      </SpotlightCard>

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">
        <button className="flex items-center gap-1.5" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Formatter / LSP / Commands (raw)
        </button>
      </h3>
      {showRaw && (
        <SpotlightCard className="bg-card">
          <div className="p-4 sm:p-5">
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono leading-relaxed">
              {rawJson || '{}'}
            </pre>
          </div>
        </SpotlightCard>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

const TABS: { id: ConfigTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'rules', label: 'Rules', icon: BookOpen },
  { id: 'providers', label: 'Providers', icon: Zap },
  { id: 'mcp', label: 'MCP Servers', icon: Server },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'advanced', label: 'Advanced', icon: Cog },
];

export default function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('general');
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const { data: config, isLoading } = useOpenCodeConfig();
  const updateMutation = useUpdateOpenCodeConfig();

  const onDraft = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasDraftChanges = Object.keys(draft).length > 0;

  const handleSave = useCallback(() => {
    if (!hasDraftChanges) return;
    updateMutation.mutate(draft as Partial<Config>, {
      onSuccess: () => setDraft({}),
    });
  }, [draft, hasDraftChanges, updateMutation]);

  const handleDiscard = useCallback(() => setDraft({}), []);

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <KortixLoader size="large" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-background px-3 sm:px-4 md:px-7 pt-4 md:pt-7">
      {/* Left nav */}
      <div className="bg-background flex w-full md:w-44 md:flex-col md:pr-4 pt-14 sm:pt-16 md:pt-0 gap-2">
        {/* Desktop nav */}
        <div className="space-y-1 hidden md:block">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <SpotlightCard
                key={tab.id}
                className={cn('transition-colors cursor-pointer', isActive ? 'bg-muted' : 'bg-transparent')}
              >
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer', isActive ? 'text-foreground' : 'text-muted-foreground')}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              </SpotlightCard>
            );
          })}
        </div>

        {/* Mobile nav */}
        <div className="flex gap-2 md:hidden overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                variant="ghost"
                size="icon"
                className={cn(
                  'h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border flex-shrink-0',
                  isActive ? 'bg-muted/60 border-[1.5px] border-border' : '',
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="!h-5 !w-5" />
              </Button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full md:w-0 md:pl-1 md:pr-1 md:min-w-0 md:px-0 relative">
        {/* Header */}
        <div className="flex items-center gap-3 pt-6 sm:pt-8 md:pt-12 pb-4 sm:pb-5 w-full flex-shrink-0">
          <div className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0">
            <Settings className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-semibold text-foreground truncate">Configuration</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {TABS.find((t) => t.id === activeTab)?.label}
            </p>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'general' && <GeneralTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}
        {activeTab === 'rules' && <RulesTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}
        {activeTab === 'providers' && <ProvidersTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}
        {activeTab === 'mcp' && <McpTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}
        {activeTab === 'permissions' && <PermissionsTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}
        {activeTab === 'tools' && <ToolsTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}
        {activeTab === 'advanced' && <AdvancedTab draft={draft as Partial<Config>} config={config} onDraft={onDraft} />}

        {/* Floating save bar */}
        {hasDraftChanges && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none z-10">
            <div className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-card border border-border shadow-lg backdrop-blur-sm">
              <span className="text-xs text-muted-foreground mr-1">Unsaved changes</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscard}
                className="h-7 px-2.5 text-xs gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                Discard
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="h-7 px-3 text-xs gap-1.5"
              >
                {updateMutation.isPending ? <KortixLoader size="small" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
