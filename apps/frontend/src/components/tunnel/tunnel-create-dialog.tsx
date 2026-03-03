'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Terminal,
  Loader2,
  Cable,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useCreateTunnelConnection,
  useGrantTunnelPermission,
  useTunnelConnection,
  type TunnelConnectionCreateResponse,
} from '@/hooks/tunnel/use-tunnel';
import { SCOPE_REGISTRY, type ScopeInfo } from './types';
import { toast } from 'sonner';

type Step = 'name' | 'permissions' | 'connect';

interface TunnelCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'connect', label: 'Connect' },
];

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-1">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div
                className={cn(
                  'h-px w-6 sm:w-8',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium transition-all',
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/20'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium hidden sm:inline',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function NameStep({
  name,
  setName,
  onNext,
}: {
  name: string;
  setName: (name: string) => void;
  onNext: () => void;
}) {
  const defaultName = getDefaultMachineName();

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <div className="mx-auto w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
          <Monitor className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold">Name your machine</h3>
        <p className="text-xs text-muted-foreground">
          A friendly label for this connection.
        </p>
      </div>

      <div className="space-y-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onNext()}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
          placeholder={defaultName}
          autoFocus
        />
        <p className="text-[11px] text-muted-foreground">
          Leave empty to use &quot;{defaultName}&quot;
        </p>
      </div>

      <Button onClick={onNext} className="w-full h-9 text-sm">
        Continue
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </div>
  );
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = fn(item);
    (result[key] ||= []).push(item);
  }
  return result;
}

const SCOPE_GROUPS = groupBy(SCOPE_REGISTRY, (s) => s.category);

function ScopeToggle({
  scope,
  enabled,
  onToggle,
}: {
  scope: ScopeInfo;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2.5 w-full rounded-md px-2.5 py-1.5 text-left transition-colors',
        enabled ? 'bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center w-4 h-4 rounded border-[1.5px] shrink-0 transition-all',
          enabled
            ? 'border-primary bg-primary'
            : 'border-muted-foreground/30',
        )}
      >
        {enabled && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <code className="text-[11px] font-mono text-foreground shrink-0">{scope.key}</code>
        <span className="text-[11px] text-muted-foreground truncate">{scope.description}</span>
      </div>
    </button>
  );
}

function PermissionsStep({
  selectedScopes,
  onToggle,
  onToggleCategory,
  onNext,
  onBack,
}: {
  selectedScopes: Set<string>;
  onToggle: (key: string) => void;
  onToggleCategory: (category: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="mx-auto w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">Permissions</h3>
        <p className="text-xs text-muted-foreground">
          Choose what your AI agent can access on this machine.
        </p>
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto -mx-1 px-1">
        {Object.entries(SCOPE_GROUPS).map(([category, scopes]) => {
          const allEnabled = scopes.every((s) => selectedScopes.has(s.key));
          const someEnabled = scopes.some((s) => selectedScopes.has(s.key));

          return (
            <div key={category}>
              <button
                onClick={() => onToggleCategory(category)}
                className="flex items-center gap-2 w-full mb-0.5 px-0.5 group"
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-3.5 h-3.5 rounded-sm border-[1.5px] shrink-0 transition-all',
                    allEnabled
                      ? 'border-primary bg-primary'
                      : someEnabled
                        ? 'border-primary/50 bg-primary/30'
                        : 'border-muted-foreground/25 group-hover:border-muted-foreground/40',
                  )}
                >
                  {allEnabled && <Check className="h-2 w-2 text-primary-foreground" />}
                  {someEnabled && !allEnabled && (
                    <div className="w-1 h-1 rounded-[1px] bg-primary-foreground" />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {category}
                </span>
              </button>
              <div>
                {scopes.map((scope) => (
                  <ScopeToggle
                    key={scope.key}
                    scope={scope}
                    enabled={selectedScopes.has(scope.key)}
                    onToggle={() => onToggle(scope.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedScopes.size > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[11px] text-muted-foreground">
            {selectedScopes.size} scope{selectedScopes.size !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-9 text-sm">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={selectedScopes.size === 0}
          className="flex-1 h-9 text-sm"
        >
          {selectedScopes.size === 0 ? 'Select scopes' : 'Create Connection'}
          {selectedScopes.size > 0 && <ArrowRight className="h-3.5 w-3.5 ml-1.5" />}
        </Button>
      </div>
    </div>
  );
}

function ConnectStep({
  result,
  onDone,
}: {
  result: TunnelConnectionCreateResponse;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { refetch, isRefetching } = useTunnelConnection(result.tunnelId);
  const sseRef = useRef<ReturnType<typeof import('@/lib/utils/sse-stream').createSSEStream> | null>(null);

  useEffect(() => {
    if (isConnected) return;
    let cancelled = false;

    async function listen() {
      const { createClient } = await import('@/lib/supabase/client');
      const { createSSEStream } = await import('@/lib/utils/sse-stream');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;

      const apiBase = process.env.NEXT_PUBLIC_BACKEND_URL || '';
      const url = `${apiBase}/tunnel/permission-requests/stream`;
      const stream = createSSEStream({
        url,
        token: session.access_token,
      });

      stream.addEventListener('tunnel_connected', (data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.tunnelId === result.tunnelId) {
            setIsConnected(true);
            stream.close();
            sseRef.current = null;
          }
        } catch {}
      });

      sseRef.current = stream;
      stream.connect();
    }

    listen();

    return () => {
      cancelled = true;
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [isConnected, result.tunnelId]);

  const handleManualCheck = async () => {
    const { data } = await refetch();
    if (data?.isLive) {
      setIsConnected(true);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    }
  };

  const apiUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:8008/v1/tunnel`
      : 'http://localhost:8008/v1/tunnel';

  const connectCommand = `npx agent-tunnel connect --tunnel-id ${result.tunnelId} --token ${result.setupToken} --api-url ${apiUrl}`;

  const copyCommand = useCallback(() => {
    navigator.clipboard.writeText(connectCommand).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    });
  }, [connectCommand]);

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="mx-auto w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
          <Terminal className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-sm font-semibold">Run this command</h3>
        <p className="text-xs text-muted-foreground">
          Connect <span className="font-medium text-foreground">{result.name}</span> by running this in your terminal.
        </p>
      </div>
      <button
        onClick={copyCommand}
        className="group relative w-full text-left rounded-lg border bg-muted/40 hover:bg-muted/60 transition-colors p-3"
      >
        <code className="text-[11px] font-mono leading-relaxed break-all text-foreground/90 block pr-8">
          {connectCommand}
        </code>
        <div className="absolute top-2.5 right-2.5 p-1 rounded-md bg-background border opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>
      <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/15 rounded-md px-3 py-2">
        Save this command — the setup token is shown only once.
      </p>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
          isConnected
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-border bg-muted/30',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
            isConnected ? 'bg-emerald-500/10' : 'bg-muted',
          )}
        >
          {isConnected ? (
            <Wifi className="h-4 w-4 text-emerald-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-xs font-medium',
            isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
          )}>
            {isConnected ? 'Connected' : 'Waiting for connection...'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isConnected
              ? 'Your machine is online and ready.'
              : 'Listening for your machine to come online.'}
          </p>
        </div>
        {!isConnected && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] shrink-0"
            onClick={handleManualCheck}
            disabled={isRefetching}
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', isRefetching && 'animate-spin')} />
            Check
          </Button>
        )}
      </div>

      <Button onClick={onDone} className="w-full h-9 text-sm">
        {isConnected ? 'Done' : 'Close'}
      </Button>
    </div>
  );
}

function CreatingStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium">Creating connection...</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Setting up permissions</p>
      </div>
    </div>
  );
}

export function TunnelCreateDialog({ open, onOpenChange }: TunnelCreateDialogProps) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    new Set(['files:read', 'files:write', 'shell:exec']),
  );
  const [result, setResult] = useState<TunnelConnectionCreateResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createMutation = useCreateTunnelConnection();
  const grantMutation = useGrantTunnelPermission();

  const handleToggleScope = useCallback((key: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleCategory = useCallback((category: string) => {
    setSelectedScopes((prev) => {
      const scopes = SCOPE_REGISTRY.filter((s) => s.category === category);
      const allEnabled = scopes.every((s) => prev.has(s.key));
      const next = new Set(prev);
      for (const s of scopes) {
        if (allEnabled) {
          next.delete(s.key);
        } else {
          next.add(s.key);
        }
      }
      return next;
    });
  }, []);

  const handleCreate = async () => {
    const tunnelName = name.trim() || getDefaultMachineName();
    setIsCreating(true);
    try {
      const capabilities = [
        ...new Set(
          Array.from(selectedScopes)
            .map((key) => SCOPE_REGISTRY.find((s) => s.key === key)?.capability)
            .filter(Boolean) as string[],
        ),
      ];
      const res = await createMutation.mutateAsync({
        name: tunnelName,
        capabilities,
      });

      const scopeEntries = Array.from(selectedScopes)
        .map((key) => SCOPE_REGISTRY.find((s) => s.key === key))
        .filter(Boolean) as ScopeInfo[];

      await Promise.all(
        scopeEntries.map((s) =>
          grantMutation.mutateAsync({
            tunnelId: res.tunnelId,
            capability: s.capability,
            scope: { scope: s.key },
          }),
        ),
      );

      setResult(res);
      setStep('connect');
    } catch {
      toast.error('Failed to create connection');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep('name');
      setName('');
      setSelectedScopes(new Set(['files:read', 'files:write', 'shell:exec']));
      setResult(null);
      setIsCreating(false);
    }, 300);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
        onInteractOutside={(e) => {
          if (isCreating || step === 'connect') e.preventDefault();
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-0 space-y-4">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-primary" />
            <DialogTitle className="text-sm font-semibold">New Connection</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Create a new tunnel connection in three steps.
          </DialogDescription>
          <StepIndicator currentStep={step} />
        </DialogHeader>

        <div className="px-5 py-4">
          {isCreating ? (
            <CreatingStep />
          ) : step === 'name' ? (
            <NameStep
              name={name}
              setName={setName}
              onNext={() => setStep('permissions')}
            />
          ) : step === 'permissions' ? (
            <PermissionsStep
              selectedScopes={selectedScopes}
              onToggle={handleToggleScope}
              onToggleCategory={handleToggleCategory}
              onNext={handleCreate}
              onBack={() => setStep('name')}
            />
          ) : result ? (
            <ConnectStep result={result} onDone={handleClose} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultMachineName(): string {
  if (typeof navigator === 'undefined') return 'My Machine';
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'My Mac';
  if (ua.includes('Windows')) return 'My PC';
  if (ua.includes('Linux')) return 'My Linux Machine';
  return 'My Machine';
}
