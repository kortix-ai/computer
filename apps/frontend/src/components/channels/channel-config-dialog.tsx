"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getEnv } from '@/lib/env-config';
import {
  Users,
  Mic,
  Mail,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Radio,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useCreateChannel, type ChannelType } from '@/hooks/channels';
import { SlackIcon } from '@/components/ui/icons/slack';
import { TelegramIcon } from '@/components/ui/icons/telegram';
import { DiscordIcon } from '@/components/ui/icons/discord';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp';
import { SlackSetupWizard } from './slack-setup-wizard';
import { TelegramSetupWizard } from './telegram-setup-wizard';
import { usePlatformCredentialStatus } from '@/hooks/channels';
import { useSandbox } from '@/hooks/platform/use-sandbox';
import { useServerStore, isCloudMode } from '@/stores/server-store';
import { ensureSandbox } from '@/lib/platform-client';
import { toast } from 'sonner';

interface ChannelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const CHANNEL_OPTIONS: { type: ChannelType; label: string; icon: React.ComponentType<{ className?: string }>; available: boolean }[] = [
  { type: 'slack', label: 'Slack', icon: SlackIcon, available: true },
  { type: 'telegram', label: 'Telegram', icon: TelegramIcon, available: true },
  { type: 'discord', label: 'Discord', icon: DiscordIcon, available: false },
  { type: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon, available: false },
  { type: 'teams', label: 'Teams', icon: Users, available: false },
  { type: 'voice', label: 'Voice', icon: Mic, available: false },
  { type: 'email', label: 'Email', icon: Mail, available: false },
  { type: 'sms', label: 'SMS', icon: MessageSquare, available: false },
];

export function ChannelConfigDialog({ open, onOpenChange, onCreated }: ChannelConfigDialogProps) {
  const [step, setStep] = useState<'type' | 'slack-wizard' | 'telegram-wizard' | 'config'>('type');
  const [channelType, setChannelType] = useState<ChannelType | null>(null);
  const [name, setName] = useState('');

  const { sandbox } = useSandbox();
  const createMutation = useCreateChannel();
  const [checkingSlack, setCheckingSlack] = useState(false);
  const slackCredStatus = usePlatformCredentialStatus(
    !isCloudMode() ? 'slack' : null,
    sandbox?.sandbox_id,
  );
  const needsSlackWizard = !isCloudMode() && slackCredStatus.data?.source !== 'env';

  const resolveBackendOrigin = () => {
    const explicitBackend = getEnv().BACKEND_URL.replace(/\/v1\/?$/, '');
    if (explicitBackend) {
      return explicitBackend;
    }

    if (typeof window !== 'undefined') {
      const { protocol, hostname, origin } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:8008`;
      }
      return origin;
    }

    return '';
  };

  const handleClose = () => {
    setStep('type');
    setChannelType(null);
    setName('');
    onOpenChange(false);
  };

  const proceedToSlackOAuth = async (publicUrl?: string) => {
    const sandboxId = await resolveSandboxId();
    const backendUrl = resolveBackendOrigin();
    const params = new URLSearchParams();
    if (sandboxId) {
      params.set('sandboxId', sandboxId);
    } else {
      toast.error('Please create an instance first, then connect Slack.');
      return;
    }
    if (!backendUrl) {
      toast.error('Backend URL is not configured. Set NEXT_PUBLIC_BACKEND_URL and retry.');
      return;
    }
    if (publicUrl) {
      params.set('publicUrl', publicUrl);
    }
    const installUrl = `${backendUrl}/webhooks/slack/install?${params.toString()}`;
    handleClose();
    window.location.href = installUrl;
  };

  const resolveSandboxId = async (): Promise<string | null> => {
    try {
      const result = await ensureSandbox();
      return result.sandbox.sandbox_id;
    } catch {
    }
    if (sandbox?.sandbox_id) return sandbox.sandbox_id;
    const store = useServerStore.getState();
    for (const s of store.servers) {
      if (s.sandboxId) return s.sandboxId;
    }
    return null;
  };

  const handleSelectType = async (type: ChannelType) => {
    if (type === 'slack') {
      if (needsSlackWizard) {
        setChannelType('slack');
        setStep('slack-wizard');
        return;
      }
      setCheckingSlack(true);
      try {
        await proceedToSlackOAuth();
      } catch {
        toast.error('Failed to start Slack OAuth. Verify the API is running and Slack env credentials are configured.');
      } finally {
        setCheckingSlack(false);
      }
      return;
    }
    if (type === 'telegram') {
      setChannelType('telegram');
      setStep('telegram-wizard');
      return;
    }
    setChannelType(type);
    setName(`My ${CHANNEL_OPTIONS.find((o) => o.type === type)?.label} Bot`);
    setStep('config');
  };

  const handleCreate = async () => {
    if (!channelType) return;
    const sandboxId = await resolveSandboxId();
    if (!sandboxId) {
      toast.error('Could not find your sandbox — is the backend running?');
      return;
    }

    try {
      await createMutation.mutateAsync({
        sandbox_id: sandboxId,
        channel_type: channelType,
        name,
        credentials: buildCredentials(),
      });
      toast.success('Channel created successfully');
      handleClose();
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create channel');
    }
  };

  const buildCredentials = (): Record<string, unknown> => {
    switch (channelType) {
      default:
        return {};
    }
  };

  const isValid = (): boolean => {
    if (!name.trim()) return false;
    if (!sandbox) return false;
    return true;
  };

  if (!open) return null;

  if (step === 'telegram-wizard') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50">
                  <TelegramIcon className="h-4.5 w-4.5" />
                </div>
                Connect Telegram
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Connect a Telegram bot to your instance
              </DialogDescription>
            </DialogHeader>
          </div>
          <TelegramSetupWizard
            onBack={() => { setStep('type'); setChannelType(null); }}
            onCreated={() => {
              handleClose();
              onCreated?.();
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  if (step === 'slack-wizard') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50">
                  <SlackIcon className="h-4.5 w-4.5" />
                </div>
                Connect Slack
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Set up Slack credentials for local development
              </DialogDescription>
            </DialogHeader>
          </div>
          <SlackSetupWizard
            sandboxId={sandbox?.sandbox_id}
            onBack={() => { setStep('type'); setChannelType(null); }}
            onSaved={(publicUrl) => {
              proceedToSlackOAuth(publicUrl);
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  if (step === 'type') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50">
                  <Radio className="h-4.5 w-4.5" />
                </div>
                Add Channel
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                {CHANNEL_OPTIONS.filter(o => o.available).map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => handleSelectType(type)}
                    disabled={type === 'slack' && checkingSlack}
                    className="group flex items-center gap-3 rounded-xl p-4 text-left transition-all border border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-primary/70">
                        {type === 'slack' && checkingSlack ? 'Checking...' : 'Ready to connect'}
                      </div>
                    </div>
                    {type === 'slack' && checkingSlack && (
                      <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                    )}
                    {type === 'slack' && !checkingSlack && (
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary/70 transition-colors" />
                    )}
                    {type !== 'slack' && (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-primary/70 transition-all" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            {/* <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming Soon</span>
              <div className="grid grid-cols-3 gap-2">
                {CHANNEL_OPTIONS.filter(o => !o.available).map(({ type, label, icon: Icon }) => (
                  <div
                    key={type}
                    className="flex flex-col items-center gap-2 rounded-xl p-3 border border-dashed border-border/60 opacity-60"
                  >
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div> */}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
        <div className="bg-muted/30 border-b px-6 pt-6 pb-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              {channelType && (() => {
                const Icon = CHANNEL_OPTIONS.find((o) => o.type === channelType)?.icon || Radio;
                return (
                  <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                );
              })()}
              Configure {CHANNEL_OPTIONS.find((o) => o.type === channelType)?.label}
            </DialogTitle>
            <DialogDescription className="mt-1.5">
              Enter your bot credentials and configure behavior
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Bot"
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
        <div className="flex justify-between gap-2 px-6 pb-6">
          <Button variant="outline" onClick={() => setStep('type')} className="rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid() || createMutation.isPending}
            className="rounded-xl"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Channel'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
