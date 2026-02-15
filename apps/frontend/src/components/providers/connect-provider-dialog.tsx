'use client';

import { useState, useCallback } from 'react';
import { ExternalLink, Eye, EyeOff, Loader2, Plug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useConnectProvider, type ProviderStatus } from '@/hooks/providers/use-providers';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConnectProviderDialogProps {
  provider: ProviderStatus | null;
  /** Provider's envKeys (from schema). Needed because ProviderStatus doesn't include envKeys. */
  envKeys: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Label helpers ──────────────────────────────────────────────────────────

function envKeyToLabel(envKey: string): string {
  // ANTHROPIC_API_KEY → "API Key", REPLICATE_API_TOKEN → "API Key"
  if (envKey.endsWith('_TOKEN')) return 'API Token';
  return 'API Key';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ConnectProviderDialog({
  provider,
  envKeys,
  open,
  onOpenChange,
}: ConnectProviderDialogProps) {
  const connectMutation = useConnectProvider();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!provider) return;

      const keys: Record<string, string> = {};
      for (const envKey of envKeys) {
        const val = formValues[envKey]?.trim();
        if (val) keys[envKey] = val;
      }

      if (Object.keys(keys).length === 0) return;

      connectMutation.mutate(
        { id: provider.id, keys },
        {
          onSuccess: () => {
            setFormValues({});
            setVisibleKeys(new Set());
            onOpenChange(false);
          },
        },
      );
    },
    [provider, envKeys, formValues, connectMutation, onOpenChange],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormValues({});
      setVisibleKeys(new Set());
    }
    onOpenChange(nextOpen);
  };

  if (!provider) return null;

  const hasValues = envKeys.some((k) => formValues[k]?.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Connect {provider.name}
          </DialogTitle>
          <DialogDescription>
            {provider.description
              ? `Enter your ${provider.name} credentials to enable ${provider.description.toLowerCase()}.`
              : `Enter your ${provider.name} API key to connect this provider.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {envKeys.map((envKey) => {
            const isVisible = visibleKeys.has(envKey);
            const isPassword = envKey.includes('PASSWORD') || envKey.includes('KEY') || envKey.includes('TOKEN') || envKey.includes('SECRET');
            const label = envKeys.length === 1 ? `${provider.name} API Key` : envKeyToLabel(envKey);

            return (
              <div key={envKey} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`connect-${envKey}`} className="text-sm">
                    {label}
                  </Label>
                  {provider.connected && provider.maskedKeys[envKey] && (
                    <Badge
                      variant="outline"
                      className="border-green-500/30 bg-green-500/10 text-[10px] px-1 py-0 text-green-400"
                    >
                      Currently set
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id={`connect-${envKey}`}
                    type={isPassword && !isVisible ? 'password' : 'text'}
                    placeholder={
                      provider.connected && provider.maskedKeys[envKey]
                        ? provider.maskedKeys[envKey]
                        : `Enter ${label.toLowerCase()}...`
                    }
                    value={formValues[envKey] ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [envKey]: e.target.value }))
                    }
                    className="pr-10 font-mono text-sm"
                    autoFocus={envKeys.indexOf(envKey) === 0}
                  />
                  {isPassword && (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(envKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isVisible ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            {provider.helpUrl ? (
              <a
                href={provider.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Get key
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <div />
            )}
            <Button type="submit" size="sm" disabled={!hasValues || connectMutation.isPending}>
              {connectMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              {provider.connected ? 'Update' : 'Connect'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
