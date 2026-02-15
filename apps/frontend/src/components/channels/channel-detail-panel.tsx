"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  X,
  Trash2,
  Power,
  PowerOff,
  Save,
  Send,
  Hash,
  MessageCircle,
  Phone,
  Users,
  Mic,
  Mail,
  MessageSquare,
  Radio,
  Clock,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  useUpdateChannel,
  useDeleteChannel,
  useToggleChannel,
  useChannelMessages,
  type ChannelConfig,
  type SessionStrategy,
} from '@/hooks/channels';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const getChannelIcon = (channelType: string) => {
  switch (channelType) {
    case 'telegram': return Send;
    case 'slack': return Hash;
    case 'discord': return MessageCircle;
    case 'whatsapp': return Phone;
    case 'teams': return Users;
    case 'voice': return Mic;
    case 'email': return Mail;
    case 'sms': return MessageSquare;
    default: return Radio;
  }
};

const getChannelLabel = (channelType: string) => {
  const labels: Record<string, string> = {
    telegram: 'Telegram', slack: 'Slack', discord: 'Discord',
    whatsapp: 'WhatsApp', teams: 'Teams', voice: 'Voice',
    email: 'Email', sms: 'SMS',
  };
  return labels[channelType] || channelType;
};

const SESSION_STRATEGIES: { value: SessionStrategy; label: string }[] = [
  { value: 'per-user', label: 'Per User' },
  { value: 'single', label: 'Single' },
  { value: 'per-thread', label: 'Per Thread' },
  { value: 'per-message', label: 'Per Message' },
];

interface ChannelDetailPanelProps {
  channel: ChannelConfig;
  onClose: () => void;
}

export function ChannelDetailPanel({ channel, onClose }: ChannelDetailPanelProps) {
  const [tab, setTab] = useState<'settings' | 'messages'>('settings');
  const [name, setName] = useState(channel.name);
  const [sessionStrategy, setSessionStrategy] = useState<SessionStrategy>(channel.sessionStrategy);
  const [systemPrompt, setSystemPrompt] = useState(channel.systemPrompt || '');
  const [isDirty, setIsDirty] = useState(false);

  const updateMutation = useUpdateChannel();
  const deleteMutation = useDeleteChannel();
  const toggleMutation = useToggleChannel();
  const { data: messages = [] } = useChannelMessages(
    tab === 'messages' ? channel.channelConfigId : '',
  );

  // Sync state when channel prop changes
  React.useEffect(() => {
    setName(channel.name);
    setSessionStrategy(channel.sessionStrategy);
    setSystemPrompt(channel.systemPrompt || '');
    setIsDirty(false);
  }, [channel.channelConfigId, channel.name, channel.sessionStrategy, channel.systemPrompt]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: channel.channelConfigId,
        data: {
          name,
          session_strategy: sessionStrategy,
          system_prompt: systemPrompt || null,
        },
      });
      toast.success('Channel updated');
      setIsDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleToggle = async () => {
    try {
      await toggleMutation.mutateAsync({
        id: channel.channelConfigId,
        enabled: !channel.enabled,
      });
      toast.success(channel.enabled ? 'Channel disabled' : 'Channel enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this channel? This cannot be undone.')) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(channel.channelConfigId);
      toast.success('Channel deleted');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const markDirty = () => setIsDirty(true);

  const Icon = getChannelIcon(channel.channelType);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{channel.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {getChannelLabel(channel.channelType)}
              </span>
              <Badge variant={channel.enabled ? 'highlight' : 'secondary'} className="text-xs">
                {channel.enabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setTab('settings')}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors",
            tab === 'settings'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Settings
        </button>
        <button
          onClick={() => setTab('messages')}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors",
            tab === 'messages'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Messages
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'settings' ? (
          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => { setName(e.target.value); markDirty(); }}
              />
            </div>

            {/* Session Strategy */}
            <div className="space-y-2">
              <Label>Session Strategy</Label>
              <Select
                value={sessionStrategy}
                onValueChange={(v) => { setSessionStrategy(v as SessionStrategy); markDirty(); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_STRATEGIES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="edit-prompt">System Prompt</Label>
              <Textarea
                id="edit-prompt"
                value={systemPrompt}
                onChange={(e) => { setSystemPrompt(e.target.value); markDirty(); }}
                placeholder="You are a helpful assistant..."
                rows={4}
              />
            </div>

            {/* Info */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sandbox</span>
                <span className="font-medium">{channel.sandbox?.name || channel.sandboxId.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{new Date(channel.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium">{new Date(channel.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              {isDirty && (
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="w-full"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleToggle}
                disabled={toggleMutation.isPending}
                className="w-full"
              >
                {channel.enabled ? (
                  <>
                    <PowerOff className="h-4 w-4 mr-2" />
                    Disable Channel
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4 mr-2" />
                    Enable Channel
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Channel'}
              </Button>
            </div>
          </div>
        ) : (
          /* Messages Tab */
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Messages will appear here once users start interacting
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.channelMessageId}
                  className={cn(
                    "rounded-lg p-3 text-sm",
                    msg.direction === 'inbound'
                      ? "bg-muted/50 mr-8"
                      : "bg-primary/10 ml-8"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {msg.direction === 'inbound' ? (
                      <ArrowDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ArrowUp className="h-3 w-3 text-primary" />
                    )}
                    <span className="text-xs font-medium">
                      {msg.direction === 'inbound'
                        ? msg.platformUser?.name || 'User'
                        : 'Agent'}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-foreground whitespace-pre-wrap">
                    {msg.content || '(no content)'}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
