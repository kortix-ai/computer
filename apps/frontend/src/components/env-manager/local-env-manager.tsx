'use client';

import { useState, useCallback } from 'react';
import {
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Loader2,
  Shield,
  Zap,
  Wrench,
  Server,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { isLocalMode } from '@/lib/config';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ──────────────────────────────────────────────────────────────────

interface KeyDef {
  key: string;
  label: string;
  recommended?: boolean;
  helpUrl?: string;
  defaultValue?: string;
}

interface KeyGroup {
  title: string;
  description: string;
  required: boolean;
  keys: KeyDef[];
}

interface Schema {
  llm: KeyGroup;
  tools: KeyGroup;
  sandbox: KeyGroup;
}

interface EnvData {
  masked: Record<string, string>;
  configured: Record<string, boolean>;
}

interface HealthData {
  api: { ok: boolean; error?: string };
  docker: { ok: boolean; error?: string };
  sandbox: { ok: boolean; error?: string };
}

// ─── Icons ──────────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, React.ReactNode> = {
  llm: <Zap className="h-4 w-4" />,
  tools: <Wrench className="h-4 w-4" />,
  sandbox: <Server className="h-4 w-4" />,
};

// ─── Help URLs (fallback if not in schema) ──────────────────────────────────

const HELP_URLS: Record<string, string> = {
  ANTHROPIC_API_KEY: 'https://console.anthropic.com/settings/keys',
  OPENAI_API_KEY: 'https://platform.openai.com/api-keys',
  OPENROUTER_API_KEY: 'https://openrouter.ai/keys',
  GEMINI_API_KEY: 'https://aistudio.google.com/apikey',
  GROQ_API_KEY: 'https://console.groq.com/keys',
  XAI_API_KEY: 'https://console.x.ai',
  TAVILY_API_KEY: 'https://tavily.com',
  SERPER_API_KEY: 'https://serper.dev',
  FIRECRAWL_API_KEY: 'https://firecrawl.dev',
  REPLICATE_API_TOKEN: 'https://replicate.com/account/api-tokens',
  ELEVENLABS_API_KEY: 'https://elevenlabs.io',
  CONTEXT7_API_KEY: 'https://context7.com',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function LocalEnvManager() {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Fetch schema
  const { data: schema, isLoading: schemaLoading } = useQuery<Schema>({
    queryKey: ['setup-schema'],
    queryFn: async () => {
      const res = await backendApi.get('/setup/schema');
      return res.data;
    },
    enabled: isLocalMode(),
  });

  // Fetch current env values
  const { data: envData, isLoading: envLoading } = useQuery<EnvData>({
    queryKey: ['setup-env'],
    queryFn: async () => {
      const res = await backendApi.get('/setup/env');
      return res.data;
    },
    enabled: isLocalMode(),
  });

  // Fetch health status
  const { data: health } = useQuery<HealthData>({
    queryKey: ['setup-health'],
    queryFn: async () => {
      const res = await backendApi.get('/setup/health');
      return res.data;
    },
    enabled: isLocalMode(),
    refetchInterval: 30000,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (keys: Record<string, string>) => {
      const res = await backendApi.post('/setup/env', { keys });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Configuration saved');
      setFormValues({});
      queryClient.invalidateQueries({ queryKey: ['setup-env'] });
      queryClient.invalidateQueries({ queryKey: ['setup-health'] });
    },
    onError: () => {
      toast.error('Failed to save configuration');
    },
  });

  const handleSave = useCallback(() => {
    const nonEmpty: Record<string, string> = {};
    for (const [k, v] of Object.entries(formValues)) {
      if (v.trim()) nonEmpty[k] = v.trim();
    }
    if (Object.keys(nonEmpty).length === 0) {
      toast.error('No changes to save');
      return;
    }
    saveMutation.mutate(nonEmpty);
  }, [formValues, saveMutation]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['setup-schema'] });
    queryClient.invalidateQueries({ queryKey: ['setup-env'] });
    queryClient.invalidateQueries({ queryKey: ['setup-health'] });
  }, [queryClient]);

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isLocalMode()) {
    return (
      <div className="text-sm text-muted-foreground">
        Env Manager is only available in local mode.
      </div>
    );
  }

  const isLoading = schemaLoading || envLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const groups = schema
    ? [
        { id: 'llm', ...schema.llm },
        { id: 'tools', ...schema.tools },
        { id: 'sandbox', ...schema.sandbox },
      ]
    : [];

  const hasChanges = Object.values(formValues).some((v) => v.trim());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Environment Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Manage API keys and sandbox settings for your local Kortix instance.
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

      {/* Key Groups */}
      {groups.map((group) => (
        <div key={group.id} className="space-y-3">
          <div className="flex items-center gap-2">
            {GROUP_ICONS[group.id]}
            <h4 className="text-sm font-semibold">{group.title}</h4>
            {group.required && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Required
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground -mt-1">{group.description}</p>

          <div className="space-y-3">
            {group.keys.map((k) => {
              const isConfigured = envData?.configured[k.key] ?? false;
              const maskedVal = envData?.masked[k.key] ?? '';
              const currentVal = formValues[k.key] ?? '';
              const isVisible = visibleKeys.has(k.key);
              const helpUrl = k.helpUrl || HELP_URLS[k.key];

              return (
                <div key={k.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`env-${k.key}`}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      {k.label}
                      {k.recommended && (
                        <Badge
                          variant="outline"
                          className="border-violet-500/30 bg-violet-500/10 text-[10px] px-1 py-0 text-violet-400"
                        >
                          Recommended
                        </Badge>
                      )}
                      {isConfigured && !currentVal && (
                        <Badge
                          variant="outline"
                          className="border-green-500/30 bg-green-500/10 text-[10px] px-1 py-0 text-green-400"
                        >
                          <Check className="mr-0.5 h-2.5 w-2.5" />
                          Set
                        </Badge>
                      )}
                    </Label>
                    {helpUrl && (
                      <a
                        href={helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Get key
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id={`env-${k.key}`}
                      type={isVisible ? 'text' : 'password'}
                      placeholder={isConfigured ? maskedVal : (k.defaultValue || 'Enter value...')}
                      value={currentVal}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          [k.key]: e.target.value,
                        }))
                      }
                      className="pr-10 font-mono text-sm shadow-none"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(k.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isVisible ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-muted-foreground">
          {hasChanges
            ? `${Object.values(formValues).filter((v) => v.trim()).length} key(s) to save`
            : 'No unsaved changes'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={saveMutation.isPending}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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
