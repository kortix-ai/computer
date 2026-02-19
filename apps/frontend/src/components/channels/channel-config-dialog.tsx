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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Mic,
  Mail,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { useCreateChannel, type ChannelType, type SessionStrategy } from '@/hooks/channels';
import { SlackIcon } from '@/components/ui/icons/slack';
import { TelegramIcon } from '@/components/ui/icons/telegram';
import { DiscordIcon } from '@/components/ui/icons/discord';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp';
import { useSandbox } from '@/hooks/platform/use-sandbox';
import { useServerStore } from '@/stores/server-store';
import { ensureSandbox } from '@/lib/platform-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ChannelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const CHANNEL_OPTIONS: { type: ChannelType; label: string; icon: React.ComponentType<{ className?: string }>; available: boolean }[] = [
  { type: 'telegram', label: 'Telegram', icon: TelegramIcon, available: true },
  { type: 'slack', label: 'Slack', icon: SlackIcon, available: true },
  { type: 'discord', label: 'Discord', icon: DiscordIcon, available: false },
  { type: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon, available: false },
  { type: 'teams', label: 'Teams', icon: Users, available: false },
  { type: 'voice', label: 'Voice', icon: Mic, available: false },
  { type: 'email', label: 'Email', icon: Mail, available: false },
  { type: 'sms', label: 'SMS', icon: MessageSquare, available: false },
];

const SESSION_STRATEGIES: { value: SessionStrategy; label: string; description: string }[] = [
  { value: 'per-user', label: 'Per User', description: 'Each user gets their own conversation' },
  { value: 'single', label: 'Single', description: 'All messages share one conversation' },
  { value: 'per-thread', label: 'Per Thread', description: 'Each thread/group gets its own conversation' },
  { value: 'per-message', label: 'Per Message', description: 'Every message starts a fresh conversation' },
];

export function ChannelConfigDialog({ open, onOpenChange, onCreated }: ChannelConfigDialogProps) {
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [channelType, setChannelType] = useState<ChannelType | null>(null);
  const [name, setName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [sessionStrategy, setSessionStrategy] = useState<SessionStrategy>('per-user');
  const [systemPrompt, setSystemPrompt] = useState('');

  const { sandbox } = useSandbox();
  const createMutation = useCreateChannel();

  const handleClose = () => {
    setStep('type');
    setChannelType(null);
    setName('');
    setBotToken('');
    setSessionStrategy('per-user');
    setSystemPrompt('');
    onOpenChange(false);
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
      const sandboxId = await resolveSandboxId();
      const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/v1\/?$/, '');
      const params = new URLSearchParams();
      if (sandboxId) {
        params.set('sandboxId', sandboxId);
      } else {
        toast.error('Please create an instance first, then connect Slack.');
        return;
      }
      const installUrl = `${backendUrl}/webhooks/slack/install?${params.toString()}`;
      handleClose();
      window.location.href = installUrl;
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
        session_strategy: sessionStrategy,
        system_prompt: systemPrompt || null,
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
      case 'telegram':
        return { botToken };
      default:
        return {};
    }
  };

  const isValid = (): boolean => {
    if (!name.trim()) return false;
    if (!sandbox) return false;
    switch (channelType) {
      case 'telegram':
        return !!botToken.trim();
      default:
        return true;
    }
  };

  if (!open) return null;

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
                    className="group flex items-center gap-3 rounded-xl p-4 text-left transition-all border border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 cursor-pointer"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-primary/70">Ready to connect</div>
                    </div>
                    {type === 'slack' && (
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
          {channelType === 'telegram' && (
            <div className="space-y-2">
              <Label htmlFor="bot-token">Bot Token</Label>
              <Input
                id="bot-token"
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="rounded-xl focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground">
                Get this from{' '}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  @BotFather
                </a>{' '}
                on Telegram
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Session Strategy</Label>
            <Select value={sessionStrategy} onValueChange={(v) => setSessionStrategy(v as SessionStrategy)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_STRATEGIES.map(({ value, label, description }) => (
                  <SelectItem key={value} value={value}>
                    <div>
                      <div>{label}</div>
                      <div className="text-xs text-muted-foreground">{description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="system-prompt">System Prompt (optional)</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
              className="rounded-xl focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Prepended to every message sent to the agent
            </p>
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
