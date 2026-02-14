'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronUp,
  Check,
  X,
  Plus,
  SlidersHorizontal,
  ArrowLeft,
  Loader2,
  ExternalLink,
  AlertCircle,
  Eye,
  Brain,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ModelProviderIcon } from '@/lib/model-provider-icons';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { useModelStore } from '@/hooks/opencode/use-model-store';
import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
import type { FlatModel } from './session-chat-input';
import type { ProviderListResponse } from '@/hooks/opencode/use-opencode-sessions';

// =============================================================================
// Constants
// =============================================================================

const POPULAR_PROVIDERS = [
  'opencode',
  'anthropic',
  'github-copilot',
  'openai',
  'google',
  'openrouter',
  'vercel',
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
  moonshotai: 'Moonshot',
  'moonshotai-cn': 'Moonshot',
  opencode: 'OpenCode',
  kortix: 'Kortix',
  firmware: 'Firmware',
  bedrock: 'AWS Bedrock',
  openrouter: 'OpenRouter',
  'github-copilot': 'GitHub Copilot',
  vercel: 'Vercel',
};

// =============================================================================
// Helpers
// =============================================================================

function resolveIconModelId(providerID: string, modelID: string): string {
  const knownSubstrings = [
    'anthropic', 'claude', 'openai', 'gpt', 'google', 'gemini',
    'xai', 'grok', 'moonshot', 'kimi',
  ];
  for (const sub of knownSubstrings) {
    if (modelID.toLowerCase().includes(sub)) return modelID;
  }
  return `${providerID}/${modelID}`;
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

// =============================================================================
// Provider / Model icons
// =============================================================================

function ProviderIcon({ providerID, size }: { providerID: string; size: number }) {
  if (providerID === 'kortix') {
    return <KortixLogo size={size} variant="symbol" />;
  }
  return <ModelProviderIcon modelId={resolveIconModelId(providerID, '')} size={size} />;
}

function InlineModelIcon({ providerID, modelID, size }: { providerID: string; modelID: string; size: number }) {
  if (providerID === 'kortix') {
    return <KortixLogo size={size} variant="symbol" />;
  }
  return <ModelProviderIcon modelId={resolveIconModelId(providerID, modelID)} size={size} />;
}

// =============================================================================
// Tag (matches reference Tag component)
// =============================================================================

function Tag({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'free' | 'latest' | 'recommended' | 'custom' }) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded text-[10px] font-medium leading-none flex-shrink-0',
        variant === 'free' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        variant === 'latest' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        variant === 'recommended' && 'bg-primary/10 text-primary',
        variant === 'custom' && 'bg-muted text-muted-foreground',
        variant === 'default' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

// =============================================================================
// Model Tooltip (matches reference ModelTooltip)
// =============================================================================

function ModelTooltipContent({ model, isLatest, isFree }: { model: FlatModel; isLatest: boolean; isFree: boolean }) {
  const tags: string[] = [];
  if (isLatest) tags.push('Latest');
  if (isFree) tags.push('Free');
  const suffix = tags.length ? ` (${tags.join(', ')})` : '';

  const inputs: string[] = [];
  if (model.capabilities?.vision) inputs.push('Image');
  if (model.capabilities?.reasoning) inputs.push('Reasoning');
  if (model.capabilities?.toolcall) inputs.push('Tool Use');

  return (
    <div className="flex flex-col gap-1 py-0.5 max-w-[240px]">
      <div className="text-xs font-medium">{model.providerName} {model.modelName}{suffix}</div>
      {inputs.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Supports: {inputs.join(', ')}
        </div>
      )}
      {model.capabilities?.reasoning !== undefined && (
        <div className="text-[11px] text-muted-foreground">
          {model.capabilities.reasoning ? 'Reasoning: allowed' : 'Reasoning: none'}
        </div>
      )}
      {model.contextWindow && model.contextWindow > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Context: {model.contextWindow.toLocaleString()} tokens
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Manage Models Dialog (matches reference dialog-manage-models.tsx)
// =============================================================================

export function ManageModelsDialog({
  open,
  onOpenChange,
  models,
  modelStore,
  onConnectProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: FlatModel[];
  modelStore: ReturnType<typeof useModelStore>;
  onConnectProvider: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return models
      .filter((m) =>
        !q ||
        m.modelName.toLowerCase().includes(q) ||
        m.modelID.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q),
      )
      .sort((a, b) => a.modelName.localeCompare(b.modelName));
  }, [models, search]);

  // Group by provider, sort groups by popularity
  const grouped = useMemo(() => {
    const groups = new Map<string, FlatModel[]>();
    for (const m of filtered) {
      const list = groups.get(m.providerID) || [];
      list.push(m);
      groups.set(m.providerID, list);
    }
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
      const ai = POPULAR_PROVIDERS.indexOf(a[0]);
      const bi = POPULAR_PROVIDERS.indexOf(b[0]);
      if (ai >= 0 && bi < 0) return -1;
      if (ai < 0 && bi >= 0) return 1;
      if (ai >= 0 && bi >= 0) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col" aria-describedby="manage-models-desc">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Manage Models</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                onOpenChange(false);
                onConnectProvider();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Connect Provider
            </Button>
          </div>
          <DialogDescription id="manage-models-desc">
            Choose which models appear in the model selector.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-2 px-2 space-y-4 mt-2">
          {grouped.map(([providerID, providerModels]) => (
            <div key={providerID}>
              <div className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 pb-1.5">
                {PROVIDER_LABELS[providerID] || providerModels[0]?.providerName || providerID}
              </div>
              <div className="space-y-0.5">
                {providerModels.map((model) => {
                  const key = { providerID: model.providerID, modelID: model.modelID };
                  const visible = modelStore.isVisible(key);
                  return (
                    <div
                      key={`${model.providerID}:${model.modelID}`}
                      className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => modelStore.setVisibility(key, !visible)}
                    >
                      <span className="text-sm truncate">{model.modelName}</span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={visible}
                          onCheckedChange={(checked) => modelStore.setVisibility(key, checked)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="text-sm text-center py-6 text-muted-foreground">No models found</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Connect Provider Dialog (matches reference dialog-select-provider + dialog-connect-provider)
//
// Flow:
// 1. Provider list (ALL providers, grouped Popular/Other, custom at top)
// 2. Click any → connect flow (method select → API key or OAuth)
// 3. Back button navigates through states
// =============================================================================

export function ConnectProviderDialog({
  open,
  onOpenChange,
  providers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ProviderListResponse | undefined;
}) {
  const queryClient = useQueryClient();

  // --- Navigation state ---
  type View =
    | { type: 'list' }
    | { type: 'custom' }
    | { type: 'connect'; providerID: string }

  const [view, setView] = useState<View>({ type: 'list' });
  const [search, setSearch] = useState('');

  // --- Connect flow state ---
  const [authMethods, setAuthMethods] = useState<Array<{ type: string; label: string }>>([]);
  const [methodIndex, setMethodIndex] = useState<number | undefined>(undefined);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [oauthState, setOauthState] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle');
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthMethod, setOauthMethod] = useState<'code' | 'auto' | undefined>(undefined);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthInstructions, setOauthInstructions] = useState('');

  // --- Custom provider state ---
  const [customForm, setCustomForm] = useState({
    providerID: '',
    name: '',
    baseURL: '',
    apiKey: '',
    modelId: '',
    modelName: '',
  });

  const allProviders = useMemo(() => providers?.all || [], [providers]);

  const filteredProviders = useMemo(() => {
    const q = search.toLowerCase();
    return allProviders
      .filter((p) => !q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ai = POPULAR_PROVIDERS.indexOf(a.id);
        const bi = POPULAR_PROVIDERS.indexOf(b.id);
        if (ai >= 0 && bi < 0) return -1;
        if (ai < 0 && bi >= 0) return 1;
        if (ai >= 0 && bi >= 0) return ai - bi;
        return a.name.localeCompare(b.name);
      });
  }, [allProviders, search]);

  const popularGroup = useMemo(
    () => filteredProviders.filter((p) => POPULAR_PROVIDERS.includes(p.id)),
    [filteredProviders],
  );
  const otherGroup = useMemo(
    () => filteredProviders.filter((p) => !POPULAR_PROVIDERS.includes(p.id)),
    [filteredProviders],
  );

  const selectedProviderData = useMemo(
    () => (view.type === 'connect' ? allProviders.find((p) => p.id === view.providerID) : undefined),
    [view, allProviders],
  );

  // Reset all connect state
  const resetConnect = useCallback(() => {
    setAuthMethods([]);
    setMethodIndex(undefined);
    setApiKey('');
    setError('');
    setSaving(false);
    setOauthState('idle');
    setOauthUrl('');
    setOauthMethod(undefined);
    setOauthCode('');
    setOauthInstructions('');
  }, []);

  const handleClose = useCallback((next: boolean) => {
    if (!next) {
      setView({ type: 'list' });
      setSearch('');
      resetConnect();
      setCustomForm({ providerID: '', name: '', baseURL: '', apiKey: '', modelId: '', modelName: '' });
    }
    onOpenChange(next);
  }, [onOpenChange, resetConnect]);

  // --- Complete connection (shared by API key + OAuth) ---
  const completeConnection = useCallback(async (providerName: string) => {
    try {
      const client = getClient();
      await client.global.dispose();
    } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: opencodeKeys.providers() });
    handleClose(false);
  }, [queryClient, handleClose]);

  // --- Select a provider from the list ---
  const handleSelectProvider = useCallback(async (providerID: string) => {
    resetConnect();
    setView({ type: 'connect', providerID });

    // Fetch auth methods for this provider
    try {
      const client = getClient();
      const result = await client.provider.auth();
      const methods = (result.data as Record<string, Array<{ type: string; label: string }>>)?.[providerID];
      if (methods && methods.length > 0) {
        setAuthMethods(methods);
        // If only one method, auto-select it
        if (methods.length === 1) {
          selectMethod(providerID, methods, 0);
        }
      } else {
        // Default to API key
        setAuthMethods([{ type: 'api', label: 'API Key' }]);
        setMethodIndex(0);
      }
    } catch {
      setAuthMethods([{ type: 'api', label: 'API Key' }]);
      setMethodIndex(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetConnect]);

  // --- Select auth method ---
  const selectMethod = useCallback(async (providerID: string, methods: Array<{ type: string; label: string }>, index: number) => {
    setMethodIndex(index);
    setError('');
    const method = methods[index];

    if (method.type === 'oauth') {
      setOauthState('pending');
      try {
        const client = getClient();
        const result = await client.provider.oauth.authorize({
          providerID,
          method: index,
        });
        if (result.error) throw result.error;
        const data = result.data!;
        setOauthUrl(data.url);

        if (data.method === 'code') {
          setOauthMethod('code');
          setOauthState('complete');
          window.open(data.url, '_blank');
        } else if (data.method === 'auto') {
          setOauthMethod('auto');
          setOauthInstructions(data.instructions || '');
          setOauthState('complete');
          window.open(data.url, '_blank');

          // Start waiting for callback
          try {
            const callbackResult = await client.provider.oauth.callback({
              providerID,
              method: index,
            });
            if (callbackResult.error) throw callbackResult.error;
            await completeConnection(providerID);
          } catch (err) {
            setOauthState('error');
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      } catch (err) {
        setOauthState('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [completeConnection]);

  // --- Submit API key ---
  const handleApiKeySubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (view.type !== 'connect') return;
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const client = getClient();
      await client.auth.set({
        providerID: view.providerID,
        auth: { type: 'api', key: apiKey.trim() },
      });
      await completeConnection(view.providerID);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [view, apiKey, completeConnection]);

  // --- Submit OAuth code ---
  const handleOAuthCodeSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (view.type !== 'connect') return;
    if (!oauthCode.trim()) {
      setError('Authorization code is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const client = getClient();
      const result = await client.provider.oauth.callback({
        providerID: view.providerID,
        method: methodIndex,
        code: oauthCode,
      });
      if (result.error) throw result.error;
      await completeConnection(view.providerID);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [view, oauthCode, methodIndex, completeConnection]);

  // --- Submit custom provider ---
  const handleCustomSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!customForm.providerID.trim() || !customForm.name.trim() || !customForm.baseURL.trim()) {
      setError('Provider ID, name, and base URL are required');
      return;
    }
    if (!customForm.modelId.trim() || !customForm.modelName.trim()) {
      setError('At least one model (ID + name) is required');
      return;
    }
    if (!/^https?:\/\//.test(customForm.baseURL)) {
      setError('Base URL must start with http:// or https://');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const client = getClient();
      if (customForm.apiKey.trim()) {
        await client.auth.set({
          providerID: customForm.providerID,
          auth: { type: 'api', key: customForm.apiKey.trim() },
        });
      }
      await client.global.dispose();
      queryClient.invalidateQueries({ queryKey: opencodeKeys.providers() });
      handleClose(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [customForm, queryClient, handleClose]);

  // --- Back navigation (matches reference goBack logic) ---
  const handleBack = useCallback(() => {
    if (view.type === 'connect') {
      // If we have multiple methods and a method is selected, go back to method selection
      if (authMethods.length > 1 && methodIndex !== undefined) {
        setMethodIndex(undefined);
        setError('');
        setOauthState('idle');
        return;
      }
      // Otherwise go back to provider list
      resetConnect();
      setView({ type: 'list' });
      return;
    }
    if (view.type === 'custom') {
      setError('');
      setView({ type: 'list' });
      return;
    }
  }, [view, authMethods, methodIndex, resetConnect]);

  // Determine what to show in connect view
  const currentMethod = methodIndex !== undefined ? authMethods[methodIndex] : undefined;
  const showMethodSelect = view.type === 'connect' && authMethods.length > 1 && methodIndex === undefined;
  const showApiKeyForm = view.type === 'connect' && currentMethod?.type === 'api';
  const showOAuthCode = view.type === 'connect' && currentMethod?.type === 'oauth' && oauthMethod === 'code' && oauthState === 'complete';
  const showOAuthAuto = view.type === 'connect' && currentMethod?.type === 'oauth' && oauthMethod === 'auto' && oauthState === 'complete';
  const showOAuthPending = view.type === 'connect' && currentMethod?.type === 'oauth' && oauthState === 'pending';
  const showOAuthError = view.type === 'connect' && oauthState === 'error';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col" aria-describedby="connect-provider-desc">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {view.type !== 'list' && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <DialogTitle className="flex-1">
              {view.type === 'custom' && 'Custom Provider'}
              {view.type === 'connect' && (
                <span className="flex items-center gap-3">
                  <ProviderIcon providerID={view.providerID} size={20} />
                  Connect {selectedProviderData?.name || view.providerID}
                </span>
              )}
              {view.type === 'list' && 'Connect Provider'}
            </DialogTitle>
          </div>
          <DialogDescription id="connect-provider-desc" className="sr-only">
            {view.type === 'list' ? 'Select a provider to connect.' : 'Enter credentials.'}
          </DialogDescription>
        </DialogHeader>

        {/* ============ PROVIDER LIST ============ */}
        {view.type === 'list' && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 -mx-2 px-2 mt-1">
              {/* Custom provider */}
              {(!search || 'custom'.includes(search.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => setView({ type: 'custom' })}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-muted text-muted-foreground">
                    <Plus className="h-3 w-3" />
                  </div>
                  <span className="text-sm">Custom provider</span>
                  <Tag variant="custom">Custom</Tag>
                </button>
              )}

              {/* Popular providers */}
              {popularGroup.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1.5">
                    Popular
                  </div>
                  {popularGroup.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <ProviderIcon providerID={p.id} size={20} />
                      <span className="text-sm">{p.name}</span>
                      {p.id === 'opencode' && <Tag variant="recommended">Recommended</Tag>}
                      {p.id === 'anthropic' && (
                        <span className="text-xs text-muted-foreground/60 ml-auto">Bring your own key</span>
                      )}
                      {p.id === 'openai' && (
                        <span className="text-xs text-muted-foreground/60 ml-auto">Bring your own key</span>
                      )}
                      {p.id.startsWith('github-copilot') && (
                        <span className="text-xs text-muted-foreground/60 ml-auto">Use existing subscription</span>
                      )}
                    </button>
                  ))}
                </>
              )}

              {/* Other providers */}
              {otherGroup.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1.5">
                    Other
                  </div>
                  {otherGroup.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <ProviderIcon providerID={p.id} size={20} />
                      <span className="text-sm">{p.name}</span>
                    </button>
                  ))}
                </>
              )}

              {filteredProviders.length === 0 && !search.toLowerCase().startsWith('custom') && (
                <div className="text-sm text-center py-6 text-muted-foreground">No providers found</div>
              )}
            </div>
          </>
        )}

        {/* ============ CUSTOM PROVIDER FORM ============ */}
        {view.type === 'custom' && (
          <form onSubmit={handleCustomSubmit} className="space-y-4 mt-2 overflow-y-auto max-h-[60vh]">
            <p className="text-sm text-muted-foreground">
              Add an OpenAI-compatible provider.{' '}
              <a href="https://opencode.ai/docs/providers/#custom-provider" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                Learn more <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Provider ID</label>
                <Input
                  placeholder="my-provider"
                  value={customForm.providerID}
                  onChange={(e) => setCustomForm((f) => ({ ...f, providerID: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                <Input
                  placeholder="My Provider"
                  value={customForm.name}
                  onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Base URL</label>
                <Input
                  placeholder="https://api.example.com/v1"
                  value={customForm.baseURL}
                  onChange={(e) => setCustomForm((f) => ({ ...f, baseURL: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">API Key (optional)</label>
                <Input
                  placeholder="sk-..."
                  type="password"
                  value={customForm.apiKey}
                  onChange={(e) => setCustomForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground/60 mt-1">Use {'{env:VAR_NAME}'} to read from environment</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Models</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Model ID"
                    value={customForm.modelId}
                    onChange={(e) => setCustomForm((f) => ({ ...f, modelId: e.target.value }))}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Display Name"
                    value={customForm.modelName}
                    onChange={(e) => setCustomForm((f) => ({ ...f, modelName: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}</p>}
            <Button type="submit" disabled={saving} className="w-auto">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</> : 'Connect'}
            </Button>
          </form>
        )}

        {/* ============ CONNECT FLOW ============ */}
        {view.type === 'connect' && (
          <div className="space-y-6 mt-2">
            {/* Method selection (when multiple) */}
            {showMethodSelect && (
              <>
                <p className="text-sm text-muted-foreground">
                  Choose how to connect {selectedProviderData?.name || view.providerID}:
                </p>
                <div className="space-y-1">
                  {authMethods.map((method, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectMethod(view.providerID, authMethods, i)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 transition-colors cursor-pointer text-sm"
                    >
                      <span>{method.type === 'api' ? 'API Key' : method.label || 'OAuth'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* API Key form */}
            {showApiKeyForm && (
              <form onSubmit={handleApiKeySubmit} className="space-y-4">
                {view.providerID === 'opencode' ? (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>OpenCode Zen provides access to many AI models through a single API key.</p>
                    <p>You can get an API key by signing up at{' '}
                      <a href="https://opencode.ai/zen" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        opencode.ai/zen
                      </a>.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Enter your {selectedProviderData?.name || view.providerID} API key.
                  </p>
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {selectedProviderData?.name || view.providerID} API Key
                  </label>
                  <Input
                    placeholder="Enter API key..."
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}</p>}
                <Button type="submit" disabled={saving} className="w-auto">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</> : 'Submit'}
                </Button>
              </form>
            )}

            {/* OAuth pending */}
            {showOAuthPending && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Starting authorization...</span>
              </div>
            )}

            {/* OAuth code flow */}
            {showOAuthCode && (
              <form onSubmit={handleOAuthCodeSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Visit the{' '}
                  <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    authorization page
                  </a>
                  {' '}and paste the code below to connect {selectedProviderData?.name || view.providerID}.
                </p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Authorization code</label>
                  <Input
                    placeholder="Enter code..."
                    type="text"
                    value={oauthCode}
                    onChange={(e) => setOauthCode(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}</p>}
                <Button type="submit" disabled={saving} className="w-auto">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</> : 'Submit'}
                </Button>
              </form>
            )}

            {/* OAuth auto flow */}
            {showOAuthAuto && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Complete authorization in the{' '}
                  <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    browser window
                  </a>
                  {' '}to connect {selectedProviderData?.name || view.providerID}.
                </p>
                {oauthInstructions && (
                  <div className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40 font-mono text-sm select-all">
                    {oauthInstructions.includes(':')
                      ? oauthInstructions.split(':')[1]?.trim()
                      : oauthInstructions}
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Waiting for authorization...</span>
                </div>
              </div>
            )}

            {/* OAuth error */}
            {showOAuthError && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error || 'Authorization failed'}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOauthState('idle');
                    setMethodIndex(undefined);
                    setError('');
                  }}
                >
                  Try again
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ModelSelector Popover (matches reference ModelSelectorPopover)
//
// - w-72 h-80 popover
// - Search with + (connect) and sliders (manage) action buttons
// - Flat list of visible models, grouped by provider name
// - Groups sorted by popular providers
// - Models sorted alphabetically within group
// - Each row: model name + Free/Latest tags
// - Tooltip on hover with model details
// - Click selects and closes
// =============================================================================

export interface ModelSelectorProps {
  models: FlatModel[];
  selectedModel: { providerID: string; modelID: string } | null;
  onSelect: (model: { providerID: string; modelID: string } | null) => void;
  providers?: ProviderListResponse;
}

export function ModelSelector({ models, selectedModel, onSelect, providers }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [manageModelsOpen, setManageModelsOpen] = useState(false);
  const [connectProviderOpen, setConnectProviderOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const modelStore = useModelStore(models);

  // Current model for trigger display
  const current = models.find(
    (m) => m.providerID === selectedModel?.providerID && m.modelID === selectedModel?.modelID,
  );
  const displayName = current?.modelName || models[0]?.modelName || 'Model';

  // Visible models filtered by search, grouped by provider
  const visibleModels = useMemo(() => {
    const q = search.toLowerCase();
    return models
      .filter((m) => {
        // Always show all when searching, otherwise only visible
        if (!q && !modelStore.isVisible({ providerID: m.providerID, modelID: m.modelID })) {
          return false;
        }
        return !q ||
          m.modelName.toLowerCase().includes(q) ||
          m.modelID.toLowerCase().includes(q) ||
          m.providerName.toLowerCase().includes(q);
      })
      .sort((a, b) => a.modelName.localeCompare(b.modelName));
  }, [models, search, modelStore]);

  // Group by provider, sort groups by popularity (matches reference sortGroupsBy)
  const grouped = useMemo(() => {
    const groups = new Map<string, { providerName: string; providerID: string; models: FlatModel[] }>();
    for (const m of visibleModels) {
      const existing = groups.get(m.providerID);
      if (existing) {
        existing.models.push(m);
      } else {
        groups.set(m.providerID, {
          providerID: m.providerID,
          providerName: PROVIDER_LABELS[m.providerID] || m.providerName,
          models: [m],
        });
      }
    }
    const entries = Array.from(groups.values());
    entries.sort((a, b) => {
      const ai = POPULAR_PROVIDERS.indexOf(a.providerID);
      const bi = POPULAR_PROVIDERS.indexOf(b.providerID);
      if (ai >= 0 && bi < 0) return -1;
      if (ai < 0 && bi >= 0) return 1;
      if (ai >= 0 && bi >= 0) return ai - bi;
      return a.providerName.localeCompare(b.providerName);
    });
    return entries;
  }, [visibleModels]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => grouped.flatMap((g) => g.models), [grouped]);

  // Reset on close
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
      setHighlightedIndex(-1);
    }
  }, [open]);

  const handleSelect = useCallback(
    (model: FlatModel) => {
      onSelect({ providerID: model.providerID, modelID: model.modelID });
      setOpen(false);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const len = flatList.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i < len - 1 ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : len - 1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && flatList[highlightedIndex]) {
        e.preventDefault();
        handleSelect(flatList[highlightedIndex]);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [flatList, highlightedIndex, handleSelect],
  );

  let flatIndex = -1;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-10 px-2.5 bg-transparent border-[1.5px] border-border rounded-2xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
              >
                {current && (
                  <InlineModelIcon providerID={current.providerID} modelID={current.modelID} size={18} />
                )}
                <span className="truncate max-w-[120px]">{displayName}</span>
                <ChevronUp className={cn('size-3 transition-transform', open && 'rotate-180')} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Choose model</TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-72 p-2 overflow-hidden rounded-xl border shadow-md"
          style={{ height: '320px' }}
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* Search bar with action buttons */}
            <div className="relative flex items-center gap-1 pb-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full h-7 pl-7 pr-6 rounded-md text-xs bg-muted/50 border border-border/40 focus:outline-none focus:border-border placeholder:text-muted-foreground/50 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setConnectProviderOpen(true);
                    }}
                    className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Connect provider</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setManageModelsOpen(true);
                    }}
                    className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Manage models</TooltipContent>
              </Tooltip>
            </div>

            {/* Model list */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {grouped.length > 0 ? (
                grouped.map((group) => (
                  <div key={group.providerID}>
                    {/* Provider group header */}
                    <div className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider px-2 pt-2 pb-1">
                      {group.providerName}
                    </div>
                    {group.models.map((model) => {
                      flatIndex++;
                      const idx = flatIndex;
                      const isSelected =
                        selectedModel?.providerID === model.providerID &&
                        selectedModel?.modelID === model.modelID;
                      const isHighlighted = idx === highlightedIndex;
                      const isLatestModel = modelStore.isLatest({ providerID: model.providerID, modelID: model.modelID });
                      const isFree = model.providerID === 'opencode' && (!model.cost || model.cost.input === 0);

                      return (
                        <Tooltip key={`${model.providerID}:${model.modelID}`}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors cursor-pointer',
                                isHighlighted && !isSelected && 'bg-accent/60',
                                isSelected && 'bg-accent',
                                !isSelected && !isHighlighted && 'hover:bg-accent/40',
                              )}
                              onClick={() => handleSelect(model)}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                            >
                              <span className="truncate flex-1">{model.modelName}</span>
                              {isFree && <Tag variant="free">Free</Tag>}
                              {isLatestModel && <Tag variant="latest">Latest</Tag>}
                              {isSelected && <Check className="h-3.5 w-3.5 text-foreground flex-shrink-0" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="start" sideOffset={12} className="p-2">
                            <ModelTooltipContent model={model} isLatest={isLatestModel} isFree={isFree} />
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="text-xs text-center py-6 text-muted-foreground">
                  No models found
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Manage Models Dialog */}
      <ManageModelsDialog
        open={manageModelsOpen}
        onOpenChange={setManageModelsOpen}
        models={models}
        modelStore={modelStore}
        onConnectProvider={() => setConnectProviderOpen(true)}
      />

      {/* Connect Provider Dialog */}
      <ConnectProviderDialog
        open={connectProviderOpen}
        onOpenChange={setConnectProviderOpen}
        providers={providers}
      />
    </>
  );
}
