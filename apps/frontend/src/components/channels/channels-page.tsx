"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
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
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Ripple } from '@/components/ui/ripple';
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
  index,
}: {
  channel: ChannelConfig;
  onClick: () => void;
  index: number;
}) => {
  const Icon = getChannelIcon(channel.channelType);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.6) }}
    >
      <SpotlightCard className="bg-card border border-border/50">
        <div onClick={onClick} className="p-4 sm:p-5 flex flex-col h-full cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50 shrink-0">
              <Icon className="h-4.5 w-4.5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{channel.name}</h3>
                <Badge
                  variant={channel.enabled ? "highlight" : "secondary"}
                  className="text-xs shrink-0"
                >
                  {channel.enabled ? "Active" : "Disabled"}
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {getChannelLabel(channel.channelType)} &middot; {getStrategyLabel(channel.sessionStrategy)}
          </p>
          <p className="text-xs text-muted-foreground/70 truncate mb-3">
            {channel.sandbox?.name || 'Not linked to instance'}
          </p>
          <div className="mt-auto flex justify-end">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
              Manage
            </Button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

const EmptyState = ({ onCreateClick }: { onCreateClick: () => void }) => (
  <div className="relative bg-muted/20 rounded-3xl border border-dashed border-border/50 flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
    <Ripple mainCircleSize={160} mainCircleOpacity={0.12} numCircles={6} />
    <div className="relative z-10 flex flex-col items-center">
      <div className="w-16 h-16 bg-muted border rounded-2xl flex items-center justify-center mb-4">
        <Radio className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">Connect a channel</h3>
      <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md mb-6">
        Connect Telegram, Slack, Discord, or other platforms to let people interact with your agent.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4" />
        Add Channel
      </Button>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
      <div key={i} className="rounded-2xl border dark:bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-32 mb-2" />
        <Skeleton className="h-3 w-20 mb-3" />
        <div className="flex justify-end">
          <Skeleton className="h-8 w-16" />
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
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
        <PageHeader icon={Radio}>
          <div className="space-y-2 sm:space-y-4">
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
              <span className="text-primary">Channels</span>
            </div>
          </div>
        </PageHeader>
      </div>

      <div className="container mx-auto max-w-7xl px-3 sm:px-4">
        <div className="flex items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 pt-2 sm:pt-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both delay-75">
          <div className="flex-1 max-w-md">
            <div className="relative group">
              <input
                type="text"
                placeholder="Search channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-2xl border border-input bg-card px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                <Search className="h-4 w-4" />
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <Button
            variant="default"
            className="px-3 sm:px-4 rounded-2xl gap-1.5 sm:gap-2 text-sm"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">Add Channel</span>
            <span className="xs:hidden">Add</span>
          </Button>
        </div>

        <div className="pb-6 sm:pb-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both delay-150">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredChannels.length === 0 && !searchQuery ? (
            <EmptyState onCreateClick={() => setShowCreateDialog(true)} />
          ) : filteredChannels.length === 0 && searchQuery ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No channels matching &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your Channels
                </span>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {filteredChannels.length}
                </Badge>
              </div>

              <AnimatePresence mode="popLayout">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredChannels.map((channel, index) => (
                    <ChannelListItem
                      key={channel.channelConfigId}
                      channel={channel}
                      onClick={() => handleChannelClick(channel)}
                      index={index}
                    />
                  ))}
                </div>
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      {selectedChannel && (
        <ChannelEditDialog
          channel={selectedChannel}
          open={editDialogOpen}
          onOpenChange={(open) => {
            if (!open) handleEditDialogClose();
          }}
        />
      )}
      <ChannelConfigDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleChannelCreated}
      />
    </div>
  );
}
