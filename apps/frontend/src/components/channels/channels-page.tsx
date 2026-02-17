"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChannels, type ChannelConfig } from '@/hooks/channels';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  AlertCircle,
  Radio,
  Plus,
  Search,
  Phone,
  Users,
  Mic,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { PageHeader } from '@/components/ui/page-header';
import { SlackIcon } from '@/components/ui/icons/slack';
import { TelegramIcon } from '@/components/ui/icons/telegram';
import { DiscordIcon } from '@/components/ui/icons/discord';
import { WhatsAppIcon } from '@/components/ui/icons/whatsapp';
import { ChannelConfigDialog } from './channel-config-dialog';
import { ChannelEditDialog } from './channel-detail-panel';

const getChannelIcon = (channelType: string): React.ComponentType<{ className?: string }> => {
  switch (channelType) {
    case 'telegram':
      return TelegramIcon;
    case 'slack':
      return SlackIcon;
    case 'discord':
      return DiscordIcon;
    case 'whatsapp':
      return WhatsAppIcon;
    case 'teams':
      return Users;
    case 'voice':
      return Mic;
    case 'email':
      return Mail;
    case 'sms':
      return MessageSquare;
    default:
      return Radio;
  }
};

const getChannelLabel = (channelType: string) => {
  const labels: Record<string, string> = {
    telegram: 'Telegram',
    slack: 'Slack',
    discord: 'Discord',
    whatsapp: 'WhatsApp',
    teams: 'Teams',
    voice: 'Voice',
    email: 'Email',
    sms: 'SMS',
  };
  return labels[channelType] || channelType;
};

const getStrategyLabel = (strategy: string) => {
  const labels: Record<string, string> = {
    single: 'Single session',
    'per-thread': 'Per thread',
    'per-user': 'Per user',
    'per-message': 'Per message',
  };
  return labels[strategy] || strategy;
};

const ChannelListItem = ({
  channel,
  onClick,
}: {
  channel: ChannelConfig;
  onClick: () => void;
}) => {
  const Icon = getChannelIcon(channel.channelType);

  return (
    <SpotlightCard className="transition-colors cursor-pointer bg-card">
      <div onClick={onClick} className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-card border border-border/50 shrink-0">
            <Icon className="h-4.5 w-4.5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-medium text-sm text-foreground truncate">{channel.name}</h3>
              <Badge
                variant={channel.enabled ? "highlight" : "secondary"}
                className="text-xs"
              >
                {channel.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {getChannelLabel(channel.channelType)} &middot; {getStrategyLabel(channel.sessionStrategy)}
            </p>
          </div>
        </div>
        <div className="ml-4 text-xs text-muted-foreground hidden sm:block">
          {channel.sandbox?.name || 'Not linked'}
        </div>
      </div>
    </SpotlightCard>
  );
};

const EmptyState = ({ onCreateClick }: { onCreateClick: () => void }) => (
  <div className="bg-muted/20 rounded-3xl border flex flex-col items-center justify-center py-16 px-4">
    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
      <Radio className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="text-base font-semibold text-foreground mb-2">Connect a channel</h3>
    <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
      Connect Telegram, Slack, Discord, or other platforms to let people interact with your agent.
    </p>
    <Button onClick={onCreateClick} size="sm">
      <Plus className="h-4 w-4 mr-2" />
      Add Channel
    </Button>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-xl border dark:bg-card px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    ))}
  </div>
);

export function ChannelsPage() {
  const { data: channels = [], isLoading, error } = useChannels();
  const [selectedChannel, setSelectedChannel] = useState<ChannelConfig | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  // Handle Slack OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackParam = params.get('slack');
    if (!slackParam) return;

    if (slackParam === 'connected') {
      toast.success('Slack connected successfully');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    } else if (slackParam === 'error') {
      const message = params.get('message') || 'Failed to connect Slack';
      toast.error(message);
    }

    // Clear params from URL
    window.history.replaceState({}, '', '/channels');
  }, [queryClient]);

  const filteredChannels = useMemo(() => {
    let filtered = [...channels].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.channelType.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [channels, searchQuery]);

  const handleChannelClick = (channel: ChannelConfig) => {
    setSelectedChannel(channel);
    setEditDialogOpen(true);
  };

  const handleEditDialogClose = () => {
    setEditDialogOpen(false);
    setSelectedChannel(null);
  };

  const handleChannelCreated = () => {
    setShowCreateDialog(false);
  };

  // Keep selected channel in sync with refetched data
  React.useEffect(() => {
    if (selectedChannel) {
      const updated = channels.find(
        (c) => c.channelConfigId === selectedChannel.channelConfigId,
      );
      if (updated) {
        setSelectedChannel(updated);
      } else {
        setSelectedChannel(null);
        setEditDialogOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, selectedChannel?.channelConfigId]);

  if (error) {
    return (
      <div className="h-screen flex flex-col">
        <div className="max-w-4xl mx-auto w-full py-8 px-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load channels. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8">
        <PageHeader icon={Radio}>
          <div className="space-y-2 sm:space-y-4">
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
              <span className="text-primary">Channels</span>
            </div>
          </div>
        </PageHeader>
      </div>

      <div className="container mx-auto max-w-7xl px-3 sm:px-4">
        {/* Search + Create */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 pt-2 sm:pt-3">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Search channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 sm:h-10 w-full rounded-xl border border-input bg-background px-8 sm:px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <div className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl gap-1.5 sm:gap-2 text-sm"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">Add Channel</span>
            <span className="xs:hidden">Add</span>
          </Button>
        </div>

        {/* Channel List */}
        <div className="pb-6 sm:pb-8">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredChannels.length === 0 ? (
            <EmptyState onCreateClick={() => setShowCreateDialog(true)} />
          ) : (
            <div className="space-y-3">
              {filteredChannels.map((channel) => (
                <ChannelListItem
                  key={channel.channelConfigId}
                  channel={channel}
                  onClick={() => handleChannelClick(channel)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      {selectedChannel && (
        <ChannelEditDialog
          channel={selectedChannel}
          open={editDialogOpen}
          onOpenChange={(open) => {
            if (!open) handleEditDialogClose();
          }}
        />
      )}

      {/* Create Dialog */}
      <ChannelConfigDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleChannelCreated}
      />
    </div>
  );
}
