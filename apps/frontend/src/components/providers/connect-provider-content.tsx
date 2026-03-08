'use client';

/**
 * ConnectProviderContent — the canonical provider connection UI.
 *
 * Renders inline (no Dialog wrapper). Used by:
 * - Setup overlay: rendered directly in the overlay card
 * - Settings modal: rendered in the Providers tab
 * - ConnectProviderDialog (model-selector.tsx): wrapped in a Dialog
 *
 * All provider connection flows go through this one component.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  ArrowLeft,
  Loader2,
  ExternalLink,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  POPULAR_PROVIDER_IDS,
  PROVIDER_HINTS,
  PROVIDER_LABELS,
  PROVIDER_NOTES,
  ProviderLogo,
} from '@/components/providers/provider-branding';

import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
import type { ProviderListResponse } from '@/hooks/opencode/use-opencode-sessions';

// =============================================================================
// ConnectProviderContent
// =============================================================================

export function ConnectProviderContent({
  providers,
  onClose,
  onProviderConnected,
}: {
  providers: ProviderListResponse | undefined;
  onClose?: () => void;
  onProviderConnected?: () => void;
}) {
  const queryClient = useQueryClient();

  // --- Navigation state ---
  type View =
    | { type: 'list' }
    | { type: 'custom' }
    | { type: 'connect'; providerID: string }

  const [view, setView] = useState<View>({ type: 'list' });
  const [search, setSearch] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);

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
        const ai = POPULAR_PROVIDER_IDS.indexOf(a.id);
        const bi = POPULAR_PROVIDER_IDS.indexOf(b.id);
        if (ai >= 0 && bi < 0) return -1;
        if (ai < 0 && bi >= 0) return 1;
        if (ai >= 0 && bi >= 0) return ai - bi;
        return a.name.localeCompare(b.name);
      });
  }, [allProviders, search]);

  const popularGroup = useMemo(
    () => filteredProviders.filter((p) => POPULAR_PROVIDER_IDS.includes(p.id)),
    [filteredProviders],
  );
  const otherGroup = useMemo(
    () => filteredProviders.filter((p) => !POPULAR_PROVIDER_IDS.includes(p.id)),
    [filteredProviders],
  );

  useEffect(() => {
    if (search.trim()) {
      setOtherOpen(otherGroup.length > 0);
    }
  }, [search, otherGroup.length]);

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

  // --- Complete connection (shared by API key + OAuth) ---
  const completeConnection = useCallback(async (_providerName: string) => {
    try {
      const client = getClient();
      await client.global.dispose();
    } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: opencodeKeys.providers() });
    onProviderConnected?.();
    setView({ type: 'list' });
    setSearch('');
    setOtherOpen(false);
    resetConnect();
    setCustomForm({ providerID: '', name: '', baseURL: '', apiKey: '', modelId: '', modelName: '' });
    onClose?.();
  }, [queryClient, onClose, onProviderConnected, resetConnect]);

  // --- Select a provider from the list ---
  const handleSelectProvider = useCallback(async (providerID: string) => {
    resetConnect();
    setView({ type: 'connect', providerID });

    try {
      const client = getClient();
      const result = await client.provider.auth();
      const methods = (result.data as Record<string, Array<{ type: string; label: string }>>)?.[providerID];
      if (methods && methods.length > 0) {
        setAuthMethods(methods);
        if (methods.length === 1) {
          selectMethod(providerID, methods, 0);
        }
      } else {
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
      onProviderConnected?.();
      setView({ type: 'list' });
      setSearch('');
      resetConnect();
      setCustomForm({ providerID: '', name: '', baseURL: '', apiKey: '', modelId: '', modelName: '' });
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [customForm, queryClient, onClose, onProviderConnected, resetConnect]);

  // --- Back navigation ---
  const handleBack = useCallback(() => {
    if (view.type === 'connect') {
      if (authMethods.length > 1 && methodIndex !== undefined) {
        setMethodIndex(undefined);
        setError('');
        setOauthState('idle');
        return;
      }
      resetConnect();
      setView({ type: 'list' });
      setOtherOpen(false);
      return;
    }
    if (view.type === 'custom') {
      setError('');
      setView({ type: 'list' });
      setOtherOpen(false);
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
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3">
        {view.type !== 'list' && (
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h3 className="text-base font-semibold flex-1">
          {view.type === 'custom' && 'Add Custom'}
          {view.type === 'connect' && PROVIDER_LABELS[view.providerID] || selectedProviderData?.name || view.providerID}
          {view.type === 'list' && 'Add Provider'}
        </h3>
      </div>

      {/* Description for list view */}
      {view.type === 'list' && (
        <p className="text-sm text-muted-foreground pb-4">
          Choose a provider to power model access in chat.
        </p>
      )}

      {/* Selected provider summary for connect view */}
      {view.type === 'connect' && selectedProviderData && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
          <ProviderLogo providerID={selectedProviderData.id} name={selectedProviderData.name} size="large" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              {PROVIDER_LABELS[selectedProviderData.id] || selectedProviderData.name}
            </div>
            {PROVIDER_NOTES[selectedProviderData.id] && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {PROVIDER_NOTES[selectedProviderData.id]}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ============ PROVIDER LIST ============ */}
      {view.type === 'list' && (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 text-sm rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent"
              autoFocus
            />
          </div>

          {/* Provider list */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-zinc-50 dark:bg-zinc-900/30 -mx-4 px-4 py-2">
            {/* Custom provider */}
            {(!search || 'custom'.includes(search.toLowerCase())) && (
              <button
                type="button"
                onClick={() => setView({ type: 'custom' })}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-background transition-colors cursor-pointer group mb-1"
              >
                <ProviderLogo providerID="custom" name="Custom" size="default" />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium block text-foreground">Custom Provider</span>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    Add any OpenAI-compatible endpoint
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </button>
            )}

            {/* Popular providers */}
            {popularGroup.length > 0 && (
              <>
                <div className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-2">
                  Popular
                </div>
                {popularGroup.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProvider(p.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-background transition-colors cursor-pointer group mb-1"
                  >
                    <ProviderLogo providerID={p.id} name={p.name} size="default" />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium block text-foreground">{PROVIDER_LABELS[p.id] || p.name}</span>
                      {PROVIDER_NOTES[p.id] && (
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          {PROVIDER_NOTES[p.id]}
                        </span>
                      )}
                    </span>
                    {PROVIDER_HINTS[p.id] && (
                      <span className="text-[10px] text-muted-foreground/50 font-medium whitespace-nowrap">
                        {PROVIDER_HINTS[p.id]}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </button>
                ))}
              </>
            )}

            {/* Other providers */}
            {otherGroup.length > 0 && (
              <Accordion
                type="single"
                collapsible
                value={otherOpen ? 'other' : undefined}
                onValueChange={(value) => setOtherOpen(value === 'other')}
                className="mt-2"
              >
                <AccordionItem value="other" className="border-none">
                  <AccordionTrigger className="px-3 py-2.5 rounded-lg text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider hover:no-underline hover:bg-background [&>svg]:hidden">
                    <span className="flex items-center justify-between w-full gap-3">
                      <span>Other ({otherGroup.length})</span>
                      <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200', otherOpen && 'rotate-180')} />
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-0">
                    {otherGroup.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProvider(p.id)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-background transition-colors cursor-pointer group mb-1"
                      >
                        <ProviderLogo providerID={p.id} name={p.name} size="default" />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-medium block text-foreground">{PROVIDER_LABELS[p.id] || p.name}</span>
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            {p.id}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      </button>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {filteredProviders.length === 0 && !search.toLowerCase().startsWith('custom') && (
              <div className="text-sm text-center py-8 text-muted-foreground/60">No providers found</div>
            )}
          </div>
        </>
      )}

      {/* ============ CUSTOM PROVIDER FORM ============ */}
      {view.type === 'custom' && (
        <form onSubmit={handleCustomSubmit} className="flex-1 min-h-0 overflow-y-auto space-y-4">
          <p className="text-sm text-muted-foreground">
            Add an OpenAI-compatible provider.{' '}
            <a href="https://opencode.ai/docs/providers/#custom-provider" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
              Learn more <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Provider ID</label>
              <Input placeholder="my-provider" value={customForm.providerID} onChange={(e) => setCustomForm((f) => ({ ...f, providerID: e.target.value }))} className="h-9 text-sm rounded-lg" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Display Name</label>
              <Input placeholder="My Provider" value={customForm.name} onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))} className="h-9 text-sm rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Base URL</label>
              <Input placeholder="https://api.example.com/v1" value={customForm.baseURL} onChange={(e) => setCustomForm((f) => ({ ...f, baseURL: e.target.value }))} className="h-9 text-sm rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Key <span className="font-normal text-muted-foreground/50">(optional)</span></label>
              <Input placeholder="sk-..." type="password" value={customForm.apiKey} onChange={(e) => setCustomForm((f) => ({ ...f, apiKey: e.target.value }))} className="h-9 text-sm rounded-lg" />
              <p className="text-[11px] text-muted-foreground/50 mt-1.5">Use {'{env:VAR_NAME}'} to read from environment</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model</label>
              <div className="flex gap-2">
                <Input placeholder="Model ID" value={customForm.modelId} onChange={(e) => setCustomForm((f) => ({ ...f, modelId: e.target.value }))} className="flex-1 h-9 text-sm rounded-lg" />
                <Input placeholder="Display Name" value={customForm.modelName} onChange={(e) => setCustomForm((f) => ({ ...f, modelName: e.target.value }))} className="flex-1 h-9 text-sm rounded-lg" />
              </div>
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" disabled={saving} size="sm" className="h-9 px-4">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</> : 'Connect'}
          </Button>
        </form>
      )}

      {/* ============ CONNECT FLOW ============ */}
      {view.type === 'connect' && (
        <div className="space-y-4">
          {showMethodSelect && (
            <>
              <p className="text-sm text-muted-foreground">
                Choose how to connect:
              </p>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/30 p-2">
                {authMethods.map((method, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectMethod(view.providerID, authMethods, i)}
                    className="w-full flex items-center gap-2 px-3 py-3 rounded-lg text-left hover:bg-background transition-colors cursor-pointer text-sm group"
                  >
                    <span className="flex-1 font-medium">{method.type === 'api' ? 'API Key' : method.label || 'OAuth'}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </button>
                ))}
              </div>
            </>
          )}

          {showApiKeyForm && (
            <form onSubmit={handleApiKeySubmit} className="space-y-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 p-4">
              {view.providerID === 'opencode' ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>OpenCode Zen gives you one API key for many hosted models.</p>
                  <p>Get an API key at{' '}
                    <a href="https://opencode.ai/zen" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">opencode.ai/zen</a>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Enter your {selectedProviderData?.name || view.providerID} API key.
                </p>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Key</label>
                <Input placeholder="Enter API key..." type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-9 text-sm rounded-lg bg-background" autoFocus />
              </div>
              {error && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" disabled={saving} size="sm" className="h-9 px-4 rounded-lg">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</> : 'Connect'}
              </Button>
            </form>
          )}

          {showOAuthPending && (
            <div className="flex items-center gap-2.5 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Starting authorization...</span>
            </div>
          )}

          {showOAuthCode && (
            <form onSubmit={handleOAuthCodeSubmit} className="space-y-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 p-4">
              <p className="text-sm text-muted-foreground">
                Visit the{' '}
                <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">authorization page</a>
                {' '}and paste the code below.
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Authorization code</label>
                <Input placeholder="Enter code..." type="text" value={oauthCode} onChange={(e) => setOauthCode(e.target.value)} className="h-9 text-sm rounded-lg bg-background" autoFocus />
              </div>
              {error && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" disabled={saving} size="sm" className="h-9 px-4 rounded-lg">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</> : 'Connect'}
              </Button>
            </form>
          )}

          {showOAuthAuto && (
            <div className="space-y-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 p-4">
              <p className="text-sm text-muted-foreground">
                Complete authorization in the{' '}
                <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">browser window</a>.
              </p>
              {oauthInstructions && (
                <div className="px-3 py-2 rounded-lg bg-background border border-border/30 font-mono text-xs select-all break-all">
                  {oauthInstructions.includes(':') ? oauthInstructions.split(':')[1]?.trim() : oauthInstructions}
                </div>
              )}
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Waiting for authorization...</span>
              </div>
            </div>
          )}

          {showOAuthError && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 rounded-lg px-4 py-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error || 'Authorization failed'}</span>
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={() => { setOauthState('idle'); setMethodIndex(undefined); setError(''); }}>
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
