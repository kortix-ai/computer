'use client';

/**
 * TunnelCreateDialog — multi-step dialog for creating a new tunnel connection.
 *
 * Steps:
 *  1. Name — enter a friendly name for the machine
 *  2. Permissions — toggle capabilities to grant
 *  3. Connect — copy the CLI command with one-time token
 */

import React, { useState, useCallback } from 'react';
import {
  Monitor,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Terminal,
  Loader2,
  Cable,
  Shield,
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
  type TunnelConnectionCreateResponse,
} from '@/hooks/tunnel/use-tunnel';
import { CAPABILITY_REGISTRY, type CapabilityInfo } from './types';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'name' | 'permissions' | 'connect';

interface TunnelCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string; number: number }[] = [
  { key: 'name', label: 'Name', number: 1 },
  { key: 'permissions', label: 'Permissions', number: 2 },
  { key: 'connect', label: 'Connect', number: 3 },
];

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div
                className={cn(
                  'h-px w-8 transition-colors duration-300',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-all duration-300',
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : step.number}
              </div>
              <span
                className={cn(
                  'text-xs font-medium transition-colors duration-300 hidden sm:inline',
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

// ─── Step 1: Name ────────────────────────────────────────────────────────────

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
    <div className="flex flex-col gap-6 py-2">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted border border-border/50">
          <Monitor className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Name your machine</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Give this connection a name so you can identify it later.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onNext()}
          className="w-full rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
          placeholder={defaultName}
          autoFocus
        />
        <p className="text-xs text-muted-foreground pl-1">
          Leave empty to use &quot;{defaultName}&quot;
        </p>
      </div>

      <Button onClick={onNext} className="w-full">
        Continue
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Step 2: Permissions ─────────────────────────────────────────────────────

function CapabilityToggle({
  capability,
  enabled,
  onToggle,
}: {
  capability: CapabilityInfo;
  enabled: boolean;
  onToggle: () => void;
}) {
  const Icon = capability.icon;

  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-left transition-all duration-200',
        enabled
          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-border/80 hover:bg-muted/30',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-lg border shrink-0 transition-colors',
          enabled
            ? 'bg-primary/10 border-primary/20'
            : 'bg-muted border-border/50',
        )}
      >
        <Icon
          className={cn(
            'h-4.5 w-4.5 transition-colors',
            enabled ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{capability.label}</span>
        </div>
        <p className="text-xs text-muted-foreground">{capability.description}</p>
      </div>
      <div
        className={cn(
          'flex items-center justify-center w-5 h-5 rounded-md border-2 shrink-0 transition-all duration-200',
          enabled
            ? 'border-primary bg-primary'
            : 'border-muted-foreground/30',
        )}
      >
        {enabled && <Check className="h-3 w-3 text-primary-foreground" />}
      </div>
    </button>
  );
}

function PermissionsStep({
  capabilities,
  onToggle,
  onNext,
  onBack,
}: {
  capabilities: Set<string>;
  onToggle: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 py-2">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Select permissions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose what your AI agent can access on this machine.
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {CAPABILITY_REGISTRY.map((cap) => (
          <CapabilityToggle
            key={cap.key}
            capability={cap}
            enabled={capabilities.has(cap.key)}
            onToggle={() => onToggle(cap.key)}
          />
        ))}
      </div>

      {capabilities.size > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          <span className="text-xs text-muted-foreground mr-1">Selected:</span>
          {Array.from(capabilities).map((key) => {
            const cap = CAPABILITY_REGISTRY.find((c) => c.key === key);
            return (
              <Badge key={key} variant="secondary" className="text-xs">
                {cap?.label || key}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={capabilities.size === 0}
          className="flex-1"
        >
          {capabilities.size === 0 ? 'Select at least one' : 'Create Connection'}
          {capabilities.size > 0 && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Connect ─────────────────────────────────────────────────────────

function ConnectStep({
  result,
  onDone,
}: {
  result: TunnelConnectionCreateResponse;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const apiUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:8008`
      : 'http://localhost:8008';

  const connectCommand = `npx kortix-tunnel connect --tunnel-id ${result.tunnelId} --token ${result.setupToken} --api-url ${apiUrl}`;

  const copyCommand = useCallback(() => {
    navigator.clipboard.writeText(connectCommand).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    });
  }, [connectCommand]);

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <Check className="h-6 w-6 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Connection created!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Run this command in your terminal to connect <span className="font-medium text-foreground">{result.name}</span>.
          </p>
        </div>
      </div>

      {/* Command block */}
      <div
        className="relative group rounded-xl bg-muted/60 border border-border/50 p-4 pr-12 cursor-pointer hover:bg-muted/80 transition-colors"
        onClick={copyCommand}
      >
        <div className="flex items-start gap-3">
          <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <code className="text-xs sm:text-sm font-mono break-all leading-relaxed select-all">
            {connectCommand}
          </code>
        </div>
        <div className="absolute top-3 right-3 p-1.5 rounded-md bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
          ⚠ Save this command — the setup token is shown only once and cannot be retrieved later.
        </p>
      </div>

      <Button onClick={onDone} className="w-full">
        Done
      </Button>
    </div>
  );
}

// ─── Loading Step ────────────────────────────────────────────────────────────

function CreatingStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative flex items-center justify-center w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Creating connection...</p>
        <p className="text-xs text-muted-foreground mt-1">This will only take a moment</p>
      </div>
    </div>
  );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────

export function TunnelCreateDialog({ open, onOpenChange }: TunnelCreateDialogProps) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [capabilities, setCapabilities] = useState<Set<string>>(
    new Set(['filesystem', 'shell']),
  );
  const [result, setResult] = useState<TunnelConnectionCreateResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createMutation = useCreateTunnelConnection();

  const handleToggleCapability = useCallback((key: string) => {
    setCapabilities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleCreate = async () => {
    const tunnelName = name.trim() || getDefaultMachineName();
    setIsCreating(true);
    try {
      const res = await createMutation.mutateAsync({
        name: tunnelName,
        capabilities: Array.from(capabilities),
      });
      setResult(res);
      setStep('connect');
      toast.success('Connection created');
    } catch {
      toast.error('Failed to create connection');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog animation
    setTimeout(() => {
      setStep('name');
      setName('');
      setCapabilities(new Set(['filesystem', 'shell']));
      setResult(null);
      setIsCreating(false);
    }, 300);
  };

  const handleNextFromPermissions = () => {
    handleCreate();
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
        className="sm:max-w-md p-0 gap-0 overflow-hidden"
        onInteractOutside={(e) => {
          // Prevent closing during creation or on connect step
          if (isCreating || step === 'connect') e.preventDefault();
        }}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3 space-y-3">
          <div className="flex items-center gap-2">
            <Cable className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-semibold">New Tunnel Connection</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Create a new tunnel connection in three steps: name, permissions, and connect.
          </DialogDescription>
          <StepIndicator currentStep={step} />
        </DialogHeader>

        {/* Body */}
        <div className="px-6 pb-6">
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
              capabilities={capabilities}
              onToggle={handleToggleCapability}
              onNext={handleNextFromPermissions}
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDefaultMachineName(): string {
  if (typeof navigator === 'undefined') return 'My Machine';
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'My Mac';
  if (ua.includes('Windows')) return 'My PC';
  if (ua.includes('Linux')) return 'My Linux Machine';
  return 'My Machine';
}
