"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Trash2,
  Power,
  PowerOff,
  Save,
  MessageSquare,
  Phone,
  Users,
  Mic,
  Mail,
  Radio,
  Clock,
  ArrowUp,
  ArrowDown,
  Link,
  Unlink,
  AlertTriangle,
} from 'lucide-react';
import {
  useUpdateChannel,
  useDeleteChannel,
  useToggleChannel,
  useChannelMessages,
  useLinkChannel,
  useUnlinkChannel,
  type ChannelConfig,
  type SessionStrategy,
} from '@/hooks/channels';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { listSandboxes, type SandboxInfo } from '@/lib/platform-client';
import { SlackIcon } from '@/components/ui/icons/slack';
import { TelegramIcon } from '@/components/ui/icons/telegram';
import { DiscordIcon } from '@/components/ui/icons/discord';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp';

const getChannelIcon = (channelType: string): React.ComponentType<{ className?: string }> => {
  switch (channelType) {
    case 'telegram': return TelegramIcon;
    case 'slack': return SlackIcon;
    case 'discord': return DiscordIcon;
    case 'whatsapp': return WhatsAppIcon;
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

interface ChannelEditDialogProps {
  channel: ChannelConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChannelEditDialog({ channel, open, onOpenChange }: ChannelEditDialogProps) {
  const [tab, setTab] = useState<'settings' | 'messages'>('settings');
  const [name, setName] = useState(channel.name);
  const [sessionStrategy, setSessionStrategy] = useState<SessionStrategy>(channel.sessionStrategy);
  const [systemPrompt, setSystemPrompt] = useState(channel.systemPrompt || '');
  const [isDirty, setIsDirty] = useState(false);

  const [instances, setInstances] = useState<SandboxInfo[]>([]);
  const [showInstancePicker, setShowInstancePicker] = useState(false);

  const updateMutation = useUpdateChannel();
  const deleteMutation = useDeleteChannel();
  const toggleMutation = useToggleChannel();
  const linkMutation = useLinkChannel();
  const unlinkMutation = useUnlinkChannel();
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
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleShowLinkPicker = async () => {
    try {
      const sandboxList = await listSandboxes();
      setInstances(sandboxList);
      setShowInstancePicker(true);
    } catch (err) {
      toast.error('Failed to load instances');
    }
  };

  const handleLink = async (sandboxId: string) => {
    try {
      await linkMutation.mutateAsync({ id: channel.channelConfigId, sandboxId });
      toast.success('Instance linked');
      setShowInstancePicker(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link');
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkMutation.mutateAsync(channel.channelConfigId);
      toast.success('Instance unlinked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink');
    }
  };

  const markDirty = () => setIsDirty(true);

  const Icon = getChannelIcon(channel.channelType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <div className="bg-muted/30 border-b px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-muted border border-border/50 shrink-0">
                <Icon className="h-5 w-5" />
                {channel.enabled && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate">{channel.name}</span>
                  <Badge variant={channel.enabled ? 'highlight' : 'secondary'} className="text-xs shrink-0">
                    {channel.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <span className="text-xs font-normal text-muted-foreground">
                  {getChannelLabel(channel.channelType)}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-1 mt-4 rounded-2xl bg-muted/50 p-1 w-fit">
            <button
              onClick={() => setTab('settings')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-xl transition-colors",
                tab === 'settings'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Settings
            </button>
            <button
              onClick={() => setTab('messages')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-xl transition-colors",
                tab === 'messages'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Messages
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {tab === 'settings' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs">Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); markDirty(); }}
                  className="h-9 rounded-xl focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Session Strategy</Label>
                <Select
                  value={sessionStrategy}
                  onValueChange={(v) => { setSessionStrategy(v as SessionStrategy); markDirty(); }}
                >
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_STRATEGIES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Linked Instance</Label>
                  {channel.sandboxId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUnlink}
                      disabled={unlinkMutation.isPending}
                      className="h-7 text-xs text-muted-foreground px-2"
                    >
                      <Unlink className="h-3 w-3 mr-1" />
                      Unlink
                    </Button>
                  ) : null}
                </div>
                {channel.sandboxId ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-sm font-medium truncate">
                      {channel.sandbox?.name || channel.sandboxId.slice(0, 8)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleShowLinkPicker}
                      className="h-7 text-xs rounded-lg"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground flex-1">Not linked</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleShowLinkPicker}
                      disabled={linkMutation.isPending}
                      className="h-7 text-xs rounded-lg"
                    >
                      <Link className="h-3 w-3 mr-1" />
                      Link
                    </Button>
                  </div>
                )}
                {showInstancePicker && (
                  <div className="border rounded-xl mt-2 max-h-48 overflow-y-auto">
                    {instances.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No instances found
                      </div>
                    ) : (
                      instances.map((inst) => (
                        <button
                          key={inst.sandbox_id}
                          onClick={() => handleLink(inst.sandbox_id)}
                          disabled={linkMutation.isPending}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors text-left first:rounded-t-xl last:rounded-b-xl",
                            inst.sandbox_id === channel.sandboxId && "bg-muted"
                          )}
                        >
                          <span className="font-medium">{inst.name}</span>
                          <Badge variant="secondary" className="text-xs">{inst.status}</Badge>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
                    <p className="text-xs text-destructive mt-0.5">
                      Disable or permanently delete this channel. Deleting cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-7">
                  {/* <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggle}
                    disabled={toggleMutation.isPending}
                    className="h-8 text-xs gap-1.5 rounded-lg"
                  >
                    {channel.enabled ? (
                      <>
                        <PowerOff className="h-3.5 w-3.5" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5" />
                        Enable
                      </>
                    )}
                  </Button> */}
                  <Button
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    size="sm"
                    className="text-xs gap-1.5 rounded-lg text-white bg-destructive hover:bg-destructive/60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
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
                      "rounded-xl p-2.5 text-sm",
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
                    <p className="text-foreground whitespace-pre-wrap text-sm">
                      {msg.content || '(no content)'}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-6 py-4 border-t bg-muted/30">
          {isDirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="h-9 text-xs gap-1.5 rounded-xl"
            >
              <Save className="h-3.5 w-3.5" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs rounded-xl"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
