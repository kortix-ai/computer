'use client';

/**
 * ProviderSettings — renders ConnectProviderContent inline.
 *
 * Used in:
 * - Setup overlay (variant="setup"): shows provider list + sticky Continue footer
 * - Settings modal (variant="settings"): shows provider list, no footer
 *
 * One component. Same UI everywhere. No intermediate screens.
 */

import { ConnectProviderContent } from '@/components/providers/connect-provider-content';
import { useOpenCodeProviders } from '@/hooks/opencode/use-opencode-sessions';
import { Button } from '@/components/ui/button';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ProviderLogo,
  PROVIDER_LABELS,
} from '@/components/providers/provider-branding';
import { CheckCircle2 } from 'lucide-react';

interface ProviderSettingsProps {
  variant?: 'settings' | 'setup';
  onContinue?: () => void;
  onProviderChange?: () => void;
}

const LLM_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'groq', 'xai']);

export function ProviderSettings({
  variant = 'settings',
  onContinue,
  onProviderChange,
}: ProviderSettingsProps) {
  const { data: providersData, isLoading, isError, refetch } = useOpenCodeProviders();
  // Track whether the success banner was freshly triggered (just connected)
  const prevConnectedCountRef = useRef(0);
  const [justConnectedId, setJustConnectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!providersData || isError)) {
      const timer = setInterval(() => {
        refetch();
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [isLoading, providersData, isError, refetch]);

  const connecting = isLoading || (!providersData && !isError);
  const hasProvider = providersData?.all?.some(
    (p) => p.models && Object.keys(p.models).length > 0
  );
  const hasLLMProvider = providersData?.all?.some(
    (p) => LLM_PROVIDERS.has(p.id) && p.models && Object.keys(p.models).length > 0
  );
  const connectedProviders = useMemo(() => {
    if (!providersData) return [];
    const connectedIds = new Set(providersData.connected ?? []);
    return (providersData.all ?? []).filter((provider) => connectedIds.has(provider.id));
  }, [providersData]);

  // Detect when a new provider gets connected and flash the success banner
  useEffect(() => {
    const prev = prevConnectedCountRef.current;
    const curr = connectedProviders.length;
    if (variant === 'setup' && curr > prev && curr > 0) {
      const newest = connectedProviders[connectedProviders.length - 1];
      setJustConnectedId(newest.id);
    }
    prevConnectedCountRef.current = curr;
  }, [connectedProviders, variant]);

  const canContinue = variant === 'setup' ? hasLLMProvider : true;

  if (connecting) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <KortixLoader size="medium" />
        <p className="text-sm text-muted-foreground animate-pulse">Connecting to sandbox…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-3">
          {/* ── Setup variant: connected providers success banner ── */}
          {variant === 'setup' && connectedProviders.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-950/20 px-3.5 py-3">
              <div className="flex items-center gap-2 mb-0.5">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Connected
                </span>
              </div>
              <div className="flex flex-col gap-1.5 mt-2">
                {connectedProviders.map((provider) => {
                  const isNew = justConnectedId === provider.id;
                  return (
                    <div
                      key={provider.id}
                      className={`flex items-center gap-2.5 transition-all duration-300 ${isNew ? 'opacity-100' : 'opacity-80'}`}
                    >
                      <ProviderLogo providerID={provider.id} name={provider.name} size="default" />
                      <span className="text-[13px] font-medium text-foreground/80 flex-1">
                        {PROVIDER_LABELS[provider.id] || provider.name}
                      </span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {Object.keys(provider.models ?? {}).length} models
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Settings variant: connected providers section ── */}
          {variant === 'settings' && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">Connected Providers</h2>
                <span className="text-xs text-muted-foreground">
                  {connectedProviders.length} {connectedProviders.length === 1 ? 'provider' : 'providers'}
                </span>
              </div>
              
              {connectedProviders.length > 0 ? (
                <div className="grid gap-3">
                  {connectedProviders.map((provider) => {
                    const modelCount = Object.keys(provider.models ?? {}).length;
                    const source = (provider as { source?: string }).source;
                    return (
                      <div
                        key={provider.id}
                        className="group relative flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all duration-200"
                      >
                        <ProviderLogo providerID={provider.id} name={provider.name} size="large" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-foreground">
                            {PROVIDER_LABELS[provider.id] || provider.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>{modelCount} model{modelCount === 1 ? '' : 's'}</span>
                            {source && (
                              <>
                                <span className="text-border/50">•</span>
                                <span className="capitalize">{source}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4" />
                          <span className="text-xs font-medium">Connected</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-dashed border-border/40 bg-muted/10">
                  <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                    <CheckCircle2 className="size-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No providers connected yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Connect a provider below to get started</p>
                </div>
              )}
            </section>
          )}

          <section>
            {variant === 'settings' && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">Available Providers</h2>
              </div>
            )}
            <div className="rounded-2xl border border-border/40 bg-background/50 overflow-hidden">
              <ConnectProviderContent
                providers={providersData}
                onProviderConnected={onProviderChange}
              />
            </div>
          </section>
        </div>
      </div>

      {variant === 'setup' && (
        <div className="flex-shrink-0 pt-4 mt-2 border-t border-border/40">
          {!canContinue && !hasProvider && !connecting && (
            <p className="text-xs text-muted-foreground text-center mb-3">
              At least one LLM provider is required
            </p>
          )}
          <Button
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full h-11"
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
