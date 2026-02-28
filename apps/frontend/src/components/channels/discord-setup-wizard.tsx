"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Check,
} from 'lucide-react';
import { useSavePlatformCredentials, useCreateChannel } from '@/hooks/channels';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DiscordSetupWizardProps {
  onSaved: () => void;
  onBack: () => void;
  sandboxId?: string | null;
}

type WizardStep = 1 | 2;

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { num: 1 as const, label: 'Create App' },
    { num: 2 as const, label: 'Credentials' },
  ];

  return (
    <div className="flex items-center justify-center gap-0 px-6 py-4">
      {steps.map((s, i) => (
        <React.Fragment key={s.num}>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors',
                current === s.num
                  ? 'bg-primary text-primary-foreground'
                  : current > s.num
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {current > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
            </div>
            <span
              className={cn(
                'text-xs font-medium hidden sm:inline',
                current === s.num ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'w-8 h-px mx-2',
                current > s.num ? 'bg-primary/40' : 'bg-border',
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DiscordSetupWizard({ onSaved, onBack, sandboxId }: DiscordSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 2 state
  const [botToken, setBotToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const saveMutation = useSavePlatformCredentials();
  const createChannel = useCreateChannel();

  const isCredsValid = botToken.trim() && publicKey.trim() && applicationId.trim();

  const handleSaveCredentials = async () => {
    if (!isCredsValid) return;
    try {
      await saveMutation.mutateAsync({
        channelType: 'discord',
        credentials: {
          botToken: botToken.trim(),
          publicKey: publicKey.trim(),
          applicationId: applicationId.trim(),
        },
        sandboxId: sandboxId ?? null,
      });

      await createChannel.mutateAsync({
        sandbox_id: sandboxId ?? null,
        channel_type: 'discord',
        name: 'Discord',
        credentials: {
          botToken: botToken.trim(),
          publicKey: publicKey.trim(),
          applicationId: applicationId.trim(),
        },
        session_strategy: 'per-user',
      });

      toast.success('Discord channel connected');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save credentials');
    }
  };

  return (
    <div>
      <StepIndicator current={step} />

      {/* Step 1: Create App Instructions */}
      {step === 1 && (
        <div className="space-y-4 px-6 pb-6">
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium">Create your Discord app:</p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>
                Open{' '}
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-0.5 text-foreground"
                >
                  discord.com/developers/applications
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Click <strong>"New Application"</strong>, give it a name, and create</li>
              <li>Go to <strong>Bot</strong> &rarr; click <strong>"Reset Token"</strong> and copy it</li>
              <li>Under Bot, enable <strong>Message Content Intent</strong></li>
              <li>Go to <strong>OAuth2</strong> &rarr; <strong>URL Generator</strong></li>
              <li>
                Select scopes: <code className="text-xs bg-muted px-1 py-0.5 rounded">bot</code>,{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">applications.commands</code>
              </li>
              <li>
                Select permissions: <strong>Send Messages</strong>, <strong>Read Message History</strong>,{' '}
                <strong>Add Reactions</strong>, <strong>Use Slash Commands</strong>
              </li>
              <li>Copy the generated URL and open it to invite the bot to your server</li>
            </ol>
          </div>

          <div className="flex justify-between items-center gap-2 pt-2">
            <Button variant="outline" onClick={onBack} className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(2)}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              >
                Skip — enter credentials directly
              </button>
              <Button onClick={() => setStep(2)} className="rounded-xl">
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Paste Credentials */}
      {step === 2 && (
        <div className="space-y-4 px-6 pb-6">
          <p className="text-sm text-muted-foreground">
            Found in your{' '}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              Discord Developer Portal
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>

          <div className="space-y-2">
            <Label htmlFor="discord-app-id">Application ID</Label>
            <Input
              id="discord-app-id"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              placeholder="123456789012345678"
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              General Information &rarr; Application ID
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discord-public-key">Public Key</Label>
            <Input
              id="discord-public-key"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="abcdef1234567890..."
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              General Information &rarr; Public Key
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discord-bot-token">Bot Token</Label>
            <Input
              id="discord-bot-token"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="MTIzNDU2Nzg5MDEyMzQ1Njc4.Gg..."
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Bot &rarr; Token (click "Reset Token" if you don't have it)
            </p>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="rounded-xl"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleSaveCredentials}
              disabled={!isCredsValid || saveMutation.isPending}
              className="rounded-xl"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save & Connect
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
