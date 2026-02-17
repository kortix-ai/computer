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
    // Always fetch fresh from the API to avoid stale sandbox IDs
    try {
      const result = await ensureSandbox();
      return result.sandbox.sandbox_id;
    } catch {
      // Fall back to cached values if API call fails
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
      // Redirect to backend install endpoint for OAuth flow
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

  // Step 1: Select channel type
  if (step === 'type') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Add Channel
            </DialogTitle>
            <DialogDescription>
              Choose a platform to connect to your agent
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            {CHANNEL_OPTIONS.map(({ type, label, icon: Icon, available }) => (
              <button
                key={type}
                onClick={() => available && handleSelectType(type)}
                disabled={!available}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
                  available
                    ? 'hover:bg-muted cursor-pointer border-border'
                    : 'opacity-40 cursor-not-allowed border-border/50'
                }`}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {available ? 'Available' : 'Coming soon'}
                  </div>
                </div>
                {type === 'slack' && available && (
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2: Configure
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channelType && (() => {
              const Icon = CHANNEL_OPTIONS.find((o) => o.type === channelType)?.icon || Radio;
              return <Icon className="h-5 w-5" />;
            })()}
            Configure {CHANNEL_OPTIONS.find((o) => o.type === channelType)?.label}
          </DialogTitle>
          <DialogDescription>
            Enter your bot credentials and configure behavior
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Bot"
            />
          </div>

          {/* Telegram-specific: Bot Token */}
          {channelType === 'telegram' && (
            <div className="space-y-2">
              <Label htmlFor="bot-token">Bot Token</Label>
              <Input
                id="bot-token"
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
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

          {/* Session Strategy */}
          <div className="space-y-2">
            <Label>Session Strategy</Label>
            <Select value={sessionStrategy} onValueChange={(v) => setSessionStrategy(v as SessionStrategy)}>
              <SelectTrigger>
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

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="system-prompt">System Prompt (optional)</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Prepended to every message sent to the agent
            </p>
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => setStep('type')}>
            Back
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Channel'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
