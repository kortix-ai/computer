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
  Hash,
  Phone,
  Mail,
  MessageCircle,
  Users,
  Mic,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { PageHeader } from '@/components/ui/page-header';
import { ChannelConfigDialog } from './channel-config-dialog';
import { ChannelDetailPanel } from './channel-detail-panel';

const getChannelIcon = (channelType: string) => {
  switch (channelType) {
    case 'telegram':
      return Send;
    case 'slack':
      return Hash;
    case 'discord':
      return MessageCircle;
    case 'whatsapp':
      return Phone;
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
  isSelected,
}: {
  channel: ChannelConfig;
  onClick: () => void;
  isSelected: boolean;
}) => {
  const Icon = getChannelIcon(channel.channelType);

  return (
    <SpotlightCard
      className={cn(
        "transition-colors cursor-pointer",
        isSelected ? "bg-muted" : "bg-card"
      )}
    >
      <div onClick={onClick} className="flex items-center justify-between p-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-card border border-border/50 shrink-0">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-medium text-foreground truncate">{channel.name}</h3>
              <Badge
                variant={channel.enabled ? "highlight" : "secondary"}
                className="text-xs"
              >
                {channel.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {getChannelLabel(channel.channelType)} &middot; {getStrategyLabel(channel.sessionStrategy)}
            </p>
          </div>
        </div>
        <div className="ml-4 text-xs text-muted-foreground hidden sm:block">
          {channel.sandbox?.name || 'Unknown sandbox'}
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
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-xl border dark:bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
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
    if (selectedChannel?.channelConfigId === channel.channelConfigId) {
      setSelectedChannel(null);
    } else {
      setSelectedChannel(channel);
    }
  };

  const handleClosePanel = () => {
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

      <div className="h-[100dvh] 2xl:flex overflow-hidden">
        {/* Backdrop overlay */}
        {selectedChannel && (
          <div
            className="block 2xl:hidden fixed inset-0 bg-black/70 z-30"
            onClick={handleClosePanel}
          />
        )}

        {/* Main Content */}
        <div className="h-full flex flex-col overflow-hidden 2xl:flex-1 relative z-0">
          {/* Search + Create */}
          <div className="container mx-auto max-w-7xl px-3 sm:px-4">
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
          </div>

          {/* Channel List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            <div className="container mx-auto max-w-7xl px-3 sm:px-4 pb-6 sm:pb-8">
              {isLoading ? (
                <LoadingSkeleton />
              ) : filteredChannels.length === 0 ? (
                <EmptyState onCreateClick={() => setShowCreateDialog(true)} />
              ) : (
                <div className="space-y-4">
                  {filteredChannels.map((channel) => (
                    <ChannelListItem
                      key={channel.channelConfigId}
                      channel={channel}
                      isSelected={selectedChannel?.channelConfigId === channel.channelConfigId}
                      onClick={() => handleChannelClick(channel)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div
          className={cn(
            "h-screen transition-all duration-300 ease-in-out bg-background",
            "fixed 2xl:relative top-0 right-0",
            "z-40 2xl:z-auto",
            selectedChannel ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
            selectedChannel && "border-l",
            selectedChannel
              ? "w-full min-[400px]:w-[90vw] min-[500px]:w-[85vw] sm:w-[480px] md:w-[540px] lg:w-[600px] xl:w-[640px] 2xl:w-[580px]"
              : "w-0 border-none"
          )}
        >
          {selectedChannel && (
            <ChannelDetailPanel
              channel={selectedChannel}
              onClose={handleClosePanel}
            />
          )}
        </div>

        {/* Create Dialog */}
        <ChannelConfigDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreated={handleChannelCreated}
        />
      </div>
    </div>
  );
}
