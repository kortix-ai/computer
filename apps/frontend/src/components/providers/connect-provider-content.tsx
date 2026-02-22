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

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  ArrowLeft,
  Loader2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ModelProviderIcon } from '@/lib/model-provider-icons';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { getClient } from '@/lib/opencode-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { opencodeKeys } from '@/hooks/opencode/use-opencode-sessions';
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

// =============================================================================
// Helpers
// =============================================================================

function ProviderIcon({ providerID, size }: { providerID: string; size: number }) {
  if (providerID === 'kortix') {
    return <KortixLogo size={size} variant="symbol" />;
  }
  return <ModelProviderIcon modelId={providerID} size={size} />;
}

function Tag({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'recommended' | 'custom' }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium leading-none flex-shrink-0 ${
        variant === 'recommended' ? 'bg-primary/10 text-primary' :
        variant === 'custom' ? 'bg-muted text-muted-foreground' :
        'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

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

  // --- Complete connection (shared by API key + OAuth) ---
  const completeConnection = useCallback(async (_providerName: string) => {
    try {
      const client = getClient();
      await client.global.dispose();
    } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: opencodeKeys.providers() });
    onProviderConnected?.();
    // Reset to list view after connecting
    setView({ type: 'list' });
    setSearch('');
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
    <>
      {/* Header */}
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
        <h3 className="text-base font-semibold flex-1">
          {view.type === 'custom' && 'Custom Provider'}
          {view.type === 'connect' && (
            <span className="flex items-center gap-3">
              <ProviderIcon providerID={view.providerID} size={20} />
              Connect {selectedProviderData?.name || view.providerID}
            </span>
          )}
          {view.type === 'list' && 'Connect Provider'}
        </h3>
      </div>

      {/* ============ PROVIDER LIST ============ */}
      {view.type === 'list' && (
        <>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>

          <div className="flex-1 min-h-0 mt-1">
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
              <Input placeholder="my-provider" value={customForm.providerID} onChange={(e) => setCustomForm((f) => ({ ...f, providerID: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
              <Input placeholder="My Provider" value={customForm.name} onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Base URL</label>
              <Input placeholder="https://api.example.com/v1" value={customForm.baseURL} onChange={(e) => setCustomForm((f) => ({ ...f, baseURL: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">API Key (optional)</label>
              <Input placeholder="sk-..." type="password" value={customForm.apiKey} onChange={(e) => setCustomForm((f) => ({ ...f, apiKey: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground/60 mt-1">Use {'{env:VAR_NAME}'} to read from environment</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Models</label>
              <div className="flex gap-2">
                <Input placeholder="Model ID" value={customForm.modelId} onChange={(e) => setCustomForm((f) => ({ ...f, modelId: e.target.value }))} className="flex-1" />
                <Input placeholder="Display Name" value={customForm.modelName} onChange={(e) => setCustomForm((f) => ({ ...f, modelName: e.target.value }))} className="flex-1" />
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

          {showApiKeyForm && (
            <form onSubmit={handleApiKeySubmit} className="space-y-4">
              {view.providerID === 'opencode' ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>OpenCode Zen provides access to many AI models through a single API key.</p>
                  <p>You can get an API key by signing up at{' '}
                    <a href="https://opencode.ai/zen" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">opencode.ai/zen</a>.
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
                <Input placeholder="Enter API key..." type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus />
              </div>
              {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}</p>}
              <Button type="submit" disabled={saving} className="w-auto">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</> : 'Submit'}
              </Button>
            </form>
          )}

          {showOAuthPending && (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Starting authorization...</span>
            </div>
          )}

          {showOAuthCode && (
            <form onSubmit={handleOAuthCodeSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Visit the{' '}
                <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">authorization page</a>
                {' '}and paste the code below to connect {selectedProviderData?.name || view.providerID}.
              </p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Authorization code</label>
                <Input placeholder="Enter code..." type="text" value={oauthCode} onChange={(e) => setOauthCode(e.target.value)} autoFocus />
              </div>
              {error && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}</p>}
              <Button type="submit" disabled={saving} className="w-auto">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</> : 'Submit'}
              </Button>
            </form>
          )}

          {showOAuthAuto && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Complete authorization in the{' '}
                <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">browser window</a>
                {' '}to connect {selectedProviderData?.name || view.providerID}.
              </p>
              {oauthInstructions && (
                <div className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40 font-mono text-sm select-all">
                  {oauthInstructions.includes(':') ? oauthInstructions.split(':')[1]?.trim() : oauthInstructions}
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Waiting for authorization...</span>
              </div>
            </div>
          )}

          {showOAuthError && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error || 'Authorization failed'}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setOauthState('idle'); setMethodIndex(undefined); setError(''); }}>
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
