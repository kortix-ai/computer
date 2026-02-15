'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Check,
  X,
  Zap,
  Wrench,
  Plug,
  PlugZap,
  ExternalLink,
  Loader2,
  Key,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { isLocalMode } from '@/lib/config';
import {
  useProviders,
  useProviderSchema,
  useProviderHealth,
  useDisconnectProvider,
  type ProviderCategory,
  type ProviderStatus,
} from '@/hooks/providers/use-providers';
import { ConnectProviderDialog } from './connect-provider-dialog';

// ─── Icons ──────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  llm: <Zap className="h-4 w-4" />,
  tool: <Wrench className="h-4 w-4" />,
};

const CATEGORY_TITLES: Record<string, string> = {
  llm: 'LLM Providers',
  tool: 'Tool Providers',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  llm: 'At least one is required for the AI agent to function.',
  tool: 'Optional. Enable web search, scraping, image generation, etc.',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderSettingsProps {
  /**
   * "settings" — full view for the settings modal (header + health pills).
   * "setup"    — onboarding variant with compact header, sticky Continue footer.
   */
  variant?: 'settings' | 'setup';
  /** Only show providers of this category. */
  filter?: ProviderCategory;
  /** Callback after a provider is connected/disconnected. */
  onProviderChange?: () => void;
  /** Called when the user clicks "Continue" (setup variant only). */
  onContinue?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProviderSettings({
  variant = 'settings',
  filter,
  onProviderChange,
  onContinue,
}: ProviderSettingsProps) {
  const { data: providers, isLoading: providersLoading } = useProviders();
  const { data: schema } = useProviderSchema();
  const { data: health } = useProviderHealth();
  const disconnectMutation = useDisconnectProvider();

  const [connectDialogProvider, setConnectDialogProvider] = useState<ProviderStatus | null>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  // Get envKeys for the provider being connected (from schema)
  const connectDialogEnvKeys = useMemo(() => {
    if (!connectDialogProvider || !schema) return [];
    const def = schema.find((s) => s.id === connectDialogProvider.id);
    return def?.envKeys ?? [];
  }, [connectDialogProvider, schema]);

  const openConnect = useCallback((provider: ProviderStatus) => {
    setConnectDialogProvider(provider);
    setConnectDialogOpen(true);
  }, []);

  const handleDisconnect = useCallback(
    (provider: ProviderStatus) => {
      disconnectMutation.mutate(provider.id, {
        onSuccess: () => onProviderChange?.(),
      });
    },
    [disconnectMutation, onProviderChange],
  );

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setConnectDialogOpen(open);
      if (!open) {
        setTimeout(() => setConnectDialogProvider(null), 200);
        onProviderChange?.();
      }
    },
    [onProviderChange],
  );

  if (!isLocalMode()) {
    return (
      <div className="text-sm text-muted-foreground">
        Provider management is only available in local mode.
      </div>
    );
  }

  if (providersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const isSetup = variant === 'setup';
  const allProviders = providers ?? [];
  const effectiveFilter = isSetup ? 'llm' : filter;
  const connected = allProviders.filter((p) => p.connected && (!effectiveFilter || p.category === effectiveFilter));
  const categories = effectiveFilter ? [effectiveFilter] : (['llm', 'tool'] as ProviderCategory[]);
  const hasLLMProvider = allProviders.some((p) => p.category === 'llm' && p.connected);

  return (
    <>
      <div className="space-y-5">
        {/* Header — settings variant shows full header + health; setup variant is headless (parent provides header) */}
        {!isSetup && (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-1">Providers</h3>
              <p className="text-sm text-muted-foreground">
                Manage API keys and provider connections for your local Kortix instance.
              </p>
            </div>

            {/* Health Status */}
            {health && (
              <div className="flex flex-wrap gap-2">
                <StatusPill label="Docker" ok={health.docker?.ok ?? false} />
                <StatusPill label="API" ok={health.api?.ok ?? false} />
                <StatusPill label="Sandbox" ok={health.sandbox?.ok ?? false} />
              </div>
            )}
          </>
        )}

        {/* Connected Providers */}
        {connected.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-green-500" />
              Connected
            </h4>
            <div className="rounded-lg border divide-y">
              {connected.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  onConnect={() => openConnect(provider)}
                  onDisconnect={() => handleDisconnect(provider)}
                  isDisconnecting={disconnectMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {/* Available Providers by Category */}
        {categories.map((category) => {
          const available = allProviders.filter(
            (p) => p.category === category && !p.connected,
          );
          if (available.length === 0 && connected.some((c) => c.category === category)) return null;
          if (available.length === 0) return null;

          return (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2">
                {CATEGORY_ICONS[category]}
                <h4 className="text-sm font-semibold">{CATEGORY_TITLES[category]}</h4>
                {category === 'llm' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Required
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                {CATEGORY_DESCRIPTIONS[category]}
              </p>
              <div className="rounded-lg border divide-y">
                {available.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onConnect={() => openConnect(provider)}
                    onDisconnect={() => handleDisconnect(provider)}
                    isDisconnecting={disconnectMutation.isPending}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Setup variant: sticky Continue footer */}
      {isSetup && onContinue && (
        <div className="sticky bottom-0 flex items-center justify-end px-6 py-4 border-t bg-card shrink-0 -mx-6 -mb-2 mt-4">
          <Button
            size="sm"
            onClick={onContinue}
            disabled={!hasLLMProvider}
            className="gap-2"
          >
            {providersLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : hasLLMProvider ? (
              <>
                Continue
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            ) : (
              'Connect a provider to continue'
            )}
          </Button>
        </div>
      )}

      {/* Connect Dialog */}
      <ConnectProviderDialog
        provider={connectDialogProvider}
        envKeys={connectDialogEnvKeys}
        open={connectDialogOpen}
        onOpenChange={handleDialogOpenChange}
      />
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProviderRow({
  provider,
  onConnect,
  onDisconnect,
  isDisconnecting,
}: {
  provider: ProviderStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  return (
    <div className="group flex items-center justify-between gap-3 px-4 py-3 min-h-[52px]">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{provider.name}</span>
          {provider.recommended && (
            <Badge
              variant="outline"
              className="border-violet-500/30 bg-violet-500/10 text-[10px] px-1 py-0 text-violet-400 shrink-0"
            >
              Recommended
            </Badge>
          )}
          {provider.connected && (
            <Badge
              variant="outline"
              className="border-green-500/30 bg-green-500/10 text-[10px] px-1 py-0 text-green-400 shrink-0"
            >
              {provider.source === 'env' ? 'env' : 'connected'}
            </Badge>
          )}
        </div>
        {provider.description && !provider.connected && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            {provider.description}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {provider.connected ? (
          <>
            {/* Allow re-configuring (update key) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onConnect}
              className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Update
            </Button>
            {provider.source !== 'env' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDisconnect}
                disabled={isDisconnecting}
                className="text-xs text-destructive hover:text-destructive"
              >
                {isDisconnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Disconnect'
                )}
              </Button>
            )}
            {provider.source === 'env' && (
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                Set from environment
              </span>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            {provider.helpUrl && (
              <a
                href={provider.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Get key
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button variant="outline" size="sm" onClick={onConnect}>
              <Plug className="mr-1.5 h-3 w-3" />
              Connect
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {ok ? (
        <Check className="h-3 w-3 text-green-400" />
      ) : (
        <X className="h-3 w-3 text-red-400" />
      )}
    </div>
  );
}
