'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Brain,
  Shield,
  Bot,
  Layers,
  Thermometer,
  Hash,
  Footprints,
  Info,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Palette,
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  useOpenCodeAgent,
  useUpdateOpenCodeAgent,
  useOpenCodeProviders,
} from '@/hooks/opencode/use-opencode-sessions';
import { CodeEditor } from '@/components/file-editors/code-editor';
import type { Agent, PermissionRule } from '@/hooks/opencode/use-opencode-sessions';

type ConfigView = 'overview' | 'prompt' | 'permissions';

// --- Editable field: click to edit, blur/enter to commit ---

function EditableText({
  value,
  placeholder,
  onChange,
  mono,
  multiline,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  mono?: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (local !== value) onChange(local);
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={cn(
          'cursor-pointer rounded-lg px-1.5 -mx-1.5 py-0.5 transition-colors hover:bg-muted',
          mono && 'font-mono text-[13px]',
          !value && 'text-muted-foreground/40 italic',
        )}
      >
        {value || placeholder}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') { setLocal(value); setEditing(false); } }}
        rows={2}
        autoFocus
        className={cn(
          'w-full px-2 py-1.5 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none',
          mono && 'font-mono text-[13px]',
        )}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setLocal(value); setEditing(false); }
      }}
      autoFocus
      className={cn(
        'w-full h-8 px-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/30',
        mono && 'font-mono text-[13px]',
      )}
      placeholder={placeholder}
    />
  );
}

function EditableNumber({
  value,
  placeholder,
  onChange,
  min,
  max,
  step,
}: {
  value: number | undefined;
  placeholder: string;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value != null ? String(value) : '');

  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);

  const commit = () => {
    setEditing(false);
    const parsed = local ? parseFloat(local) : undefined;
    if (parsed !== value) onChange(parsed);
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer rounded-lg px-1.5 -mx-1.5 py-0.5 transition-colors hover:bg-muted font-mono text-[13px]"
      >
        {value != null ? String(value) : (
          <span className="text-muted-foreground/40 italic font-sans text-sm">{placeholder}</span>
        )}
      </span>
    );
  }

  return (
    <input
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setLocal(value != null ? String(value) : ''); setEditing(false); }
      }}
      min={min}
      max={max}
      step={step}
      autoFocus
      className="w-28 h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
      placeholder={placeholder}
    />
  );
}

// --- Simple row ---

function Row({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground w-28 flex-shrink-0 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <div className="text-sm text-foreground flex-1 min-w-0">{children}</div>
    </div>
  );
}

// --- Overview Section ---

function OverviewSection({
  agent,
  draft,
  onDraft,
}: {
  agent: Agent;
  draft: Record<string, unknown>;
  onDraft: (key: string, value: unknown) => void;
}) {
  const { data: providers } = useOpenCodeProviders();

  const allModels = useMemo(() => {
    if (!providers?.all) return [];
    return providers.all.flatMap((p) =>
      Object.values(p.models).map((m) => ({
        providerID: p.id,
        modelID: m.id,
        label: `${p.id}/${m.id}`,
      }))
    );
  }, [providers]);

  const model = (draft.model as Agent['model']) ?? agent.model;
  const modelLabel = model ? `${model.providerID}/${model.modelID}` : '';

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {/* Identity */}
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Identity</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Name">{agent.name}</Row>
          <Row label="Description">
            <EditableText
              value={(draft.description as string) ?? agent.description ?? ''}
              placeholder="Add a description..."
              onChange={(v) => onDraft('description', v)}
              multiline
            />
          </Row>
          <Row label="Mode" icon={Layers}>
            <select
              value={(draft.mode as string) ?? agent.mode}
              onChange={(e) => onDraft('mode', e.target.value)}
              className="h-7 px-2 rounded-lg text-xs bg-muted border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="primary">Primary</option>
              <option value="subagent">Sub-agent</option>
              <option value="all">All</option>
            </select>
          </Row>
          <Row label="Visibility">
            <button
              onClick={() => onDraft('hidden', !(draft.hidden ?? agent.hidden))}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs border cursor-pointer transition-colors',
                (draft.hidden ?? agent.hidden)
                  ? 'bg-muted border-border text-muted-foreground'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
              )}
            >
              {(draft.hidden ?? agent.hidden) ? <><EyeOff className="h-3 w-3" /> Hidden</> : <><Eye className="h-3 w-3" /> Visible</>}
            </button>
          </Row>
          <Row label="Color" icon={Palette}>
            <div className="flex items-center gap-2">
              <EditableText
                value={(draft.color as string) ?? agent.color ?? ''}
                placeholder="e.g. #FF5733"
                onChange={(v) => onDraft('color', v || undefined)}
                mono
              />
              {((draft.color as string) ?? agent.color) && (
                <div
                  className="w-5 h-5 rounded-md border border-border flex-shrink-0"
                  style={{ backgroundColor: (draft.color as string) ?? agent.color }}
                />
              )}
            </div>
          </Row>
        </div>
      </SpotlightCard>

      {/* Model */}
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Model</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Model">
            {allModels.length > 0 ? (
              <select
                value={modelLabel}
                onChange={(e) => {
                  const sel = allModels.find((m) => m.label === e.target.value);
                  if (sel) onDraft('model', { providerID: sel.providerID, modelID: sel.modelID });
                }}
                className="w-full max-w-sm h-8 px-2 rounded-lg text-sm bg-muted border border-border font-mono cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {!model && <option value="">Default</option>}
                {allModels.map((m) => (
                  <option key={m.label} value={m.label}>{m.label}</option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[13px]">{modelLabel || <span className="text-muted-foreground/40 italic font-sans text-sm">Default</span>}</span>
            )}
          </Row>
          <Row label="Variant">
            <EditableText
              value={(draft.variant as string) ?? agent.variant ?? ''}
              placeholder="Not set"
              onChange={(v) => onDraft('variant', v || undefined)}
              mono
            />
          </Row>
        </div>
      </SpotlightCard>

      {/* Parameters */}
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Parameters</h3>
      <SpotlightCard className="bg-card">
        <div className="p-4 sm:p-5">
          <Row label="Temperature" icon={Thermometer}>
            <EditableNumber
              value={(draft.temperature as number) ?? agent.temperature}
              placeholder="Default"
              onChange={(v) => onDraft('temperature', v)}
              min={0} max={2} step={0.1}
            />
          </Row>
          <Row label="Top P" icon={Hash}>
            <EditableNumber
              value={(draft.topP as number) ?? agent.topP}
              placeholder="Default"
              onChange={(v) => onDraft('topP', v)}
              min={0} max={1} step={0.05}
            />
          </Row>
          <Row label="Max Steps" icon={Footprints}>
            <EditableNumber
              value={(draft.steps as number) ?? agent.steps}
              placeholder="Unlimited"
              onChange={(v) => onDraft('steps', v ? Math.round(v) : undefined)}
              min={1} max={500} step={1}
            />
          </Row>
        </div>
      </SpotlightCard>

      {/* Options passthrough */}
      {agent.options && Object.keys(agent.options).length > 0 && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Provider Options</h3>
          <SpotlightCard className="bg-card">
            <div className="p-4 sm:p-5">
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {JSON.stringify(agent.options, null, 2)}
              </pre>
            </div>
          </SpotlightCard>
        </>
      )}
    </div>
  );
}

// --- Prompt Section ---

function PromptSection({
  agent,
  draftPrompt,
  onDraft,
}: {
  agent: Agent;
  draftPrompt: string | undefined;
  onDraft: (key: string, value: unknown) => void;
}) {
  const prompt = draftPrompt ?? agent.prompt ?? '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden pb-24">
      {agent.prompt || draftPrompt != null ? (
        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border/50">
          <CodeEditor
            content={prompt}
            fileName="prompt.md"
            language="markdown"
            readOnly={false}
            showLineNumbers={true}
            onChange={(content) => onDraft('prompt', content)}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
            <Brain className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No custom prompt</p>
          <p className="text-xs text-muted-foreground/60 mt-1">This agent uses the built-in system prompt</p>
        </div>
      )}
    </div>
  );
}

// --- Permissions Section ---

function PermissionsSection({ agent }: { agent: Agent }) {
  const rules = agent.permission || [];

  const grouped = useMemo(() => {
    const map: Record<string, PermissionRule[]> = {};
    for (const rule of rules) {
      (map[rule.permission] ??= []).push(rule);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [rules]);

  if (rules.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
          <Shield className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No permission rules</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This agent uses default permissions</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      {grouped.map(([permission, permRules]) => (
        <div key={permission} className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{permission}</h4>
          <SpotlightCard className="bg-card">
            <div className="divide-y divide-border/40">
              {permRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-wide w-12 text-center py-0.5 rounded-md',
                      rule.action === 'allow' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                      rule.action === 'deny' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                      rule.action === 'ask' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {rule.action}
                  </span>
                  <span className="text-sm font-mono text-foreground/80 truncate">{rule.pattern}</span>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </div>
      ))}
    </div>
  );
}

// --- Main Page ---

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const agentName = decodeURIComponent(params.agentId as string);
  const [activeView, setActiveView] = useState<ConfigView>('overview');
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const { data: agent, isLoading } = useOpenCodeAgent(agentName);
  const updateMutation = useUpdateOpenCodeAgent();

  const onDraft = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasDraftChanges = Object.keys(draft).length > 0;

  const handleSave = useCallback(() => {
    if (!hasDraftChanges) return;
    const { permission, native, name, ...patch } = draft;
    updateMutation.mutate(
      { name: agentName, patch },
      { onSuccess: () => setDraft({}) },
    );
  }, [agentName, draft, hasDraftChanges, updateMutation]);

  const handleDiscard = useCallback(() => setDraft({}), []);

  // Reset draft when switching agents
  useEffect(() => { setDraft({}); }, [agentName]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <KortixLoader size="large" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  const menuItems = [
    { id: 'overview' as const, label: 'Overview', icon: Info },
    { id: 'prompt' as const, label: 'Prompt', icon: Brain },
    { id: 'permissions' as const, label: 'Permissions', icon: Shield },
  ];

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-background px-3 sm:px-4 md:px-7 pt-4 md:pt-7">
      {/* Left nav */}
      <div className="bg-background flex w-full md:w-44 md:flex-col md:pr-4 pt-14 sm:pt-16 md:pt-0 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="justify-start -ml-2 mb-6 text-foreground hover:bg-transparent hidden md:flex"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border md:hidden"
        >
          <ChevronLeft className="!h-5 !w-5" />
        </Button>

        {/* Desktop nav */}
        <div className="space-y-1 hidden md:block">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <SpotlightCard
                key={item.id}
                className={cn('transition-colors cursor-pointer', isActive ? 'bg-muted' : 'bg-transparent')}
              >
                <button
                  onClick={() => setActiveView(item.id)}
                  className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-sm', isActive ? 'text-foreground' : 'text-muted-foreground')}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              </SpotlightCard>
            );
          })}
        </div>

        {/* Mobile nav */}
        <div className="flex gap-2 md:hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                size="icon"
                className={cn(
                  'h-12 w-12 p-0 cursor-pointer hover:bg-muted/60 hover:border-[1.5px] hover:border-border',
                  isActive ? 'bg-muted/60 border-[1.5px] border-border' : '',
                )}
                onClick={() => setActiveView(item.id)}
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
          <div
            className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0"
            style={agent.color ? { borderColor: agent.color + '40' } : undefined}
          >
            <Bot className="h-5 w-5" style={agent.color ? { color: agent.color } : undefined} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-semibold text-foreground truncate">{agent.name}</h1>
            {agent.description && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{agent.description}</p>
            )}
          </div>
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0"
            style={agent.color ? { borderColor: agent.color + '40', color: agent.color } : undefined}
          >
            {agent.mode === 'primary' ? 'Primary' : agent.mode === 'subagent' ? 'Sub-agent' : 'All'}
          </span>
        </div>

        {/* Tab content */}
        {activeView === 'overview' && <OverviewSection agent={agent} draft={draft} onDraft={onDraft} />}
        {activeView === 'prompt' && <PromptSection agent={agent} draftPrompt={draft.prompt as string | undefined} onDraft={onDraft} />}
        {activeView === 'permissions' && <PermissionsSection agent={agent} />}

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
