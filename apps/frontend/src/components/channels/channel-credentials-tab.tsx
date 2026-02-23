"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  usePlatformCredentialsList,
  useDeletePlatformCredentials,
  type PlatformCredentialEntry,
} from '@/hooks/channels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Label } from '@/components/ui/label';
import {
  Plus,
  Trash2,
  Pencil,
  KeyRound,
  Radio,
} from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Ripple } from '@/components/ui/ripple';
import { SlackIcon } from '@/components/ui/icons/slack';
import { SlackPlatformCredentialsForm } from './slack-platform-credentials-form';
import { useServerStore } from '@/stores/server-store';
import { toast } from 'sonner';

const getChannelTypeIcon = (channelType: string): React.ComponentType<{ className?: string }> => {
  switch (channelType) {
    case 'slack':
      return SlackIcon;
    default:
      return Radio;
  }
};

const getChannelTypeLabel = (channelType: string) => {
  const labels: Record<string, string> = {
    slack: 'Slack',
    telegram: 'Telegram',
    discord: 'Discord',
    whatsapp: 'WhatsApp',
  };
  return labels[channelType] || channelType;
};

const CredentialCard = ({
  entry,
  index,
  onEdit,
  onDelete,
}: {
  entry: PlatformCredentialEntry;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const Icon = getChannelTypeIcon(entry.channelType);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.6) }}
    >
      <SpotlightCard className="bg-card border border-border/50">
        <div className="p-4 sm:p-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50 shrink-0">
              <Icon className="h-4.5 w-4.5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {getChannelTypeLabel(entry.channelType)}
                </h3>
                <Badge
                  variant={entry.configured ? 'highlight' : 'secondary'}
                  className="text-xs shrink-0"
                >
                  {entry.configured ? 'Configured' : 'Incomplete'}
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {entry.sandboxName ? `Sandbox: ${entry.sandboxName}` : 'Account default'}
          </p>
          <div className="mt-auto flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
};

const EmptyState = ({ onAddClick }: { onAddClick: () => void }) => (
  <div className="relative bg-muted/20 rounded-3xl border border-dashed border-border/50 flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
    <Ripple mainCircleSize={160} mainCircleOpacity={0.12} numCircles={6} />
    <div className="relative z-10 flex flex-col items-center">
      <div className="w-16 h-16 bg-muted border rounded-2xl flex items-center justify-center mb-4">
        <KeyRound className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">No credentials configured</h3>
      <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md mb-6">
        Add platform credentials (e.g. Slack App) to connect channels. You can scope credentials per sandbox or use account-wide defaults.
      </p>
      <Button onClick={onAddClick}>
        <Plus className="h-4 w-4" />
        Add Credentials
      </Button>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-2xl border dark:bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-32 mb-3" />
        <div className="flex justify-end gap-1.5">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    ))}
  </div>
);

export function ChannelCredentialsTab() {
  const { data: credentials = [], isLoading } = usePlatformCredentialsList();
  const deleteMutation = useDeletePlatformCredentials();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<PlatformCredentialEntry | null>(null);
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);

  const servers = useServerStore((s) => s.servers);
  const sandboxServers = servers.filter((s) => s.sandboxId);

  const handleDelete = async (entry: PlatformCredentialEntry) => {
    try {
      await deleteMutation.mutateAsync({
        channelType: entry.channelType,
        sandboxId: entry.sandboxId,
      });
      toast.success('Credentials deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete credentials');
    }
  };

  const handleEdit = (entry: PlatformCredentialEntry) => {
    setEditEntry(entry);
    setSelectedSandboxId(entry.sandboxId);
    setShowAddDialog(true);
  };

  const handleAddNew = () => {
    setEditEntry(null);
    setSelectedSandboxId(null);
    setShowAddDialog(true);
  };

  const handleDialogClose = () => {
    setShowAddDialog(false);
    setEditEntry(null);
    setSelectedSandboxId(null);
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <>
      {credentials.length === 0 ? (
        <EmptyState onAddClick={handleAddNew} />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Platform Credentials
            </span>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {credentials.length}
            </Badge>
          </div>

          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {credentials.map((entry, index) => (
                <CredentialCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onEdit={() => handleEdit(entry)}
                  onDelete={() => handleDelete(entry)}
                />
              ))}
            </div>
          </AnimatePresence>
        </>
      )}

      <Dialog open={showAddDialog} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <div className="bg-muted/30 border-b px-6 pt-6 pb-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-muted border border-border/50">
                  <SlackIcon className="h-4.5 w-4.5" />
                </div>
                {editEntry ? 'Edit Slack Credentials' : 'Add Slack Credentials'}
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                {editEntry
                  ? 'Update the Slack App credentials for this scope'
                  : 'Configure Slack App credentials. Optionally scope to a specific sandbox.'}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 pt-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={selectedSandboxId || '__account__'}
                onValueChange={(v) => setSelectedSandboxId(v === '__account__' ? null : v)}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__account__">Account default</SelectItem>
                  {sandboxServers.map((s) => (
                    <SelectItem key={s.sandboxId} value={s.sandboxId!}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sandbox-scoped credentials override the account default for that sandbox.
              </p>
            </div>
          </div>

          <SlackPlatformCredentialsForm
            sandboxId={selectedSandboxId}
            onSaved={handleDialogClose}
            onBack={handleDialogClose}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
